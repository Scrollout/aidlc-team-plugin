package main

import (
	"context"
	"fmt"
	"net/http"
	"sync/atomic"

	getoperation "example.com/controlplane/internal/domains/operations/getoperation/application"
	opiface "example.com/controlplane/internal/domains/operations/getoperation/interface"
	opmodel "example.com/controlplane/internal/domains/operations/model"
	createresource "example.com/controlplane/internal/domains/resources/createresource/application"
	createroute "example.com/controlplane/internal/domains/resources/createresource/interface"
	deleteresource "example.com/controlplane/internal/domains/resources/deleteresource/application"
	deleteroute "example.com/controlplane/internal/domains/resources/deleteresource/interface"
	"example.com/controlplane/internal/foundation/answer"
	"example.com/controlplane/internal/foundation/values"
	"example.com/controlplane/internal/pipeline/stages"
)

// v is the control plane's values: its routes, error codes and statuses (internal/foundation/values).
var v = values.V

// Provider is an extension: the namespace it serves, and its resource types whose writes are long-running.
type Provider struct {
	Namespace   string
	LongRunning map[string]bool
}

// Operations is what the front door needs to follow a long-running write.
type Operations interface {
	Get(ctx context.Context, id string) (opmodel.Operation, bool)
	Save(ctx context.Context, o opmodel.Operation) error
}

// FrontDoor is the stateless entry: every request crosses the governance stages, then reaches the provider that
// owns its namespace.
type FrontDoor struct {
	Govern    func(ctx context.Context, r *stages.Request) *stages.Refusal
	Put       createresource.Handler
	Delete    deleteresource.Handler
	Ops       Operations
	Providers map[string]Provider
	ids       atomic.Int64
}

// governance wires the stages in the model's order, each named where it is wired; a deployment replaces each Pass
// with its real stage.
func governance(authorize func(context.Context, *stages.Request) *stages.Refusal) func(context.Context, *stages.Request) *stages.Refusal {
	return stages.Chain(
		stages.Pass(stages.StageAuthenticate),
		stages.Stage{Name: stages.StageAuthorize, Run: authorize},
		stages.Pass(stages.StagePolicy),
		stages.Pass(stages.StageLock),
		stages.Pass(stages.StageThrottle),
	)
}

// Routes mounts each slice's route behind the governance stages, and runs a long-running type's write as an
// operation to follow: what the front door applies to every slice it serves.
func (f *FrontDoor) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	get := getoperation.Handler{Operations: f.Ops}
	mux.HandleFunc(http.MethodPut+" "+v.Routes.Resource, func(w http.ResponseWriter, r *http.Request) {
		res, err := createroute.ResourceOf(r)
		if err != nil {
			answer.Fail(w, http.StatusBadRequest, v.Errors.BadContent)
			return
		}
		p, ok := f.admit(w, r, res.Properties)
		if !ok {
			return
		}
		if p.LongRunning[r.PathValue(v.Params.Type)] {
			op := opmodel.Operation{ID: fmt.Sprintf(v.OperationID, f.ids.Add(1)), Resource: res.ID, Status: opmodel.Running}
			_ = f.Ops.Save(r.Context(), op)
			status := opmodel.Succeeded
			if _, err := f.Put.Handle(r.Context(), res); err != nil {
				status = opmodel.Failed
			}
			_ = f.Ops.Save(r.Context(), op.End(status))
			w.Header().Set("Location", v.OperationsPrefix+op.ID+v.ResultSuffix)
			w.Header().Set("Retry-After", v.RetryAfter)
			w.WriteHeader(http.StatusAccepted)
			return
		}
		outcome, err := f.Put.Handle(r.Context(), res)
		createroute.AnswerCreate(w, res, outcome, err)
	})
	mux.HandleFunc(http.MethodDelete+" "+v.Routes.Resource, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := f.admit(w, r, nil); !ok {
			return
		}
		was, err := f.Delete.Handle(r.Context(), r.URL.Path)
		deleteroute.AnswerDelete(w, was, err)
	})
	mux.HandleFunc(http.MethodGet+" "+v.Routes.Operation, func(w http.ResponseWriter, r *http.Request) {
		op, ok := get.Handle(r.Context(), r.PathValue(v.Params.ID))
		opiface.AnswerStatus(w, op, ok)
	})
	mux.HandleFunc(http.MethodGet+" "+v.Routes.Result, func(w http.ResponseWriter, r *http.Request) {
		op, ok := get.Handle(r.Context(), r.PathValue(v.Params.ID))
		opiface.AnswerResult(w, r, op, ok)
	})
	return mux
}

// admit runs governance and finds the provider that owns the namespace; it answers the caller itself when either
// refuses.
func (f *FrontDoor) admit(w http.ResponseWriter, r *http.Request, result map[string]any) (Provider, bool) {
	req := &stages.Request{Method: r.Method, Path: r.URL.Path, Caller: r.Header.Get("Authorization"), Scope: v.ScopePrefix + r.PathValue(v.Params.Scope), Result: result}
	if refusal := f.Govern(r.Context(), req); refusal != nil {
		answer.Fail(w, refusal.Status, refusal.Code)
		return Provider{}, false
	}
	p, ok := f.Providers[r.PathValue(v.Params.Namespace)]
	if !ok {
		answer.Fail(w, http.StatusNotFound, v.Errors.NoProvider)
	}
	return p, ok
}
