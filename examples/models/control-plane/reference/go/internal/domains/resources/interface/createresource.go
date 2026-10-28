// Package interface is the resources domain's routes: each slice's own call and answer, which the front door mounts
// after the governance stages it applies to every slice.
package iface

import (
	"encoding/json"
	"net/http"

	"example.com/controlplane/internal/domains/resources/application/createresource"
	"example.com/controlplane/internal/domains/resources/model"
	"example.com/controlplane/internal/foundation/answer"
	"example.com/controlplane/internal/foundation/values"
)

var v = values.V

// ResourceOf reads the resource a createresource call names: its id from the path, its type and scope from the
// route's parameters, its properties from the body.
func ResourceOf(r *http.Request) (model.Resource, error) {
	var body struct{ Properties map[string]any }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return model.Resource{}, err
	}
	ns, typ := r.PathValue(v.Params.Namespace), r.PathValue(v.Params.Type)
	return model.Resource{ID: r.URL.Path, Type: ns + "/" + typ, Scope: v.ScopePrefix + r.PathValue(v.Params.Scope), Provider: ns, Properties: body.Properties}, nil
}

// AnswerCreate answers what the createresource slice did with the resource.
func AnswerCreate(w http.ResponseWriter, res model.Resource, outcome createresource.Outcome, err error) {
	if err != nil {
		answer.Fail(w, http.StatusBadRequest, v.Errors.BadResource)
		return
	}
	if outcome == createresource.Created {
		w.WriteHeader(http.StatusCreated)
	}
	_ = json.NewEncoder(w).Encode(res)
}
