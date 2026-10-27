package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"

	"example.com/controlplane/internal/domains/operations/application/getoperation"
	opmodel "example.com/controlplane/internal/domains/operations/model"
	"example.com/controlplane/internal/domains/resources/application/createresource"
	"example.com/controlplane/internal/domains/resources/application/deleteresource"
	"example.com/controlplane/internal/domains/resources/model"
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

// errorBody is the error envelope every refusal answers with.
type errorBody struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

// operationBody is what the operation's status answers.
type operationBody struct {
	ID     string         `json:"id"`
	Status opmodel.Status `json:"status"`
}

func fail(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	var body errorBody
	body.Error.Code = code
	_ = json.NewEncoder(w).Encode(body)
}

// Routes serves the resource API and the operations a long-running write leaves to follow.
func (f *FrontDoor) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	get := getoperation.Handler{Operations: f.Ops}
	mux.HandleFunc(http.MethodPut+" "+v.Routes.Resource, func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Properties map[string]any }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			fail(w, http.StatusBadRequest, v.Errors.BadContent)
			return
		}
		p, ok := f.admit(w, r, body.Properties)
		if !ok {
			return
		}
		ns, typ := r.PathValue(v.Params.Namespace), r.PathValue(v.Params.Type)
		res := model.Resource{ID: r.URL.Path, Type: ns + "/" + typ, Scope: v.ScopePrefix + r.PathValue(v.Params.Scope), Provider: ns, Properties: body.Properties}
		if p.LongRunning[typ] {
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
		if err != nil {
			fail(w, http.StatusBadRequest, v.Errors.BadResource)
			return
		}
		if outcome == createresource.Created {
			w.WriteHeader(http.StatusCreated)
		}
		_ = json.NewEncoder(w).Encode(res)
	})
	mux.HandleFunc(http.MethodDelete+" "+v.Routes.Resource, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := f.admit(w, r, nil); !ok {
			return
		}
		was, err := f.Delete.Handle(r.Context(), r.URL.Path)
		switch {
		case err != nil:
			fail(w, http.StatusInternalServerError, v.Errors.Internal)
		case !was:
			w.WriteHeader(http.StatusNoContent)
		}
	})
	mux.HandleFunc(http.MethodGet+" "+v.Routes.Operation, func(w http.ResponseWriter, r *http.Request) {
		op, ok := get.Handle(r.Context(), r.PathValue(v.Params.ID))
		if !ok {
			fail(w, http.StatusNotFound, v.Errors.NoOperation)
			return
		}
		_ = json.NewEncoder(w).Encode(operationBody{ID: op.ID, Status: op.Status})
	})
	mux.HandleFunc(http.MethodGet+" "+v.Routes.Result, func(w http.ResponseWriter, r *http.Request) {
		op, ok := get.Handle(r.Context(), r.PathValue(v.Params.ID))
		switch {
		case !ok:
			fail(w, http.StatusNotFound, v.Errors.NoOperation)
		case !op.Terminal():
			w.Header().Set("Location", r.URL.Path)
			w.Header().Set("Retry-After", v.RetryAfter)
			w.WriteHeader(http.StatusAccepted)
		case op.Status != opmodel.Succeeded:
			fail(w, http.StatusConflict, v.Errors.OperationFailed)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
	return mux
}

// admit runs governance and finds the provider that owns the namespace; it answers the caller itself when either
// refuses.
func (f *FrontDoor) admit(w http.ResponseWriter, r *http.Request, result map[string]any) (Provider, bool) {
	req := &stages.Request{Method: r.Method, Path: r.URL.Path, Caller: r.Header.Get("Authorization"), Scope: v.ScopePrefix + r.PathValue(v.Params.Scope), Result: result}
	if refusal := f.Govern(r.Context(), req); refusal != nil {
		fail(w, refusal.Status, refusal.Code)
		return Provider{}, false
	}
	p, ok := f.Providers[r.PathValue(v.Params.Namespace)]
	if !ok {
		fail(w, http.StatusNotFound, v.Errors.NoProvider)
	}
	return p, ok
}
