// Package interface is the operations domain's routes: the getoperation slice's answers, its status and its result.
package iface

import (
	"encoding/json"
	"net/http"

	"example.com/controlplane/internal/domains/operations/model"
	"example.com/controlplane/internal/foundation/answer"
	"example.com/controlplane/internal/foundation/values"
)

var v = values.V

type operationBody struct {
	ID     string       `json:"id"`
	Status model.Status `json:"status"`
}

// AnswerStatus answers where an operation stands.
func AnswerStatus(w http.ResponseWriter, op model.Operation, ok bool) {
	if !ok {
		answer.Fail(w, http.StatusNotFound, v.Errors.NoOperation)
		return
	}
	_ = json.NewEncoder(w).Encode(operationBody{ID: op.ID, Status: op.Status})
}

// AnswerResult answers an operation's result: still running, failed, or done.
func AnswerResult(w http.ResponseWriter, r *http.Request, op model.Operation, ok bool) {
	switch {
	case !ok:
		answer.Fail(w, http.StatusNotFound, v.Errors.NoOperation)
	case !op.Terminal():
		w.Header().Set("Location", r.URL.Path)
		w.Header().Set("Retry-After", v.RetryAfter)
		w.WriteHeader(http.StatusAccepted)
	case op.Status != model.Succeeded:
		answer.Fail(w, http.StatusConflict, v.Errors.OperationFailed)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
