// Package iface is the deleteresource slice's interface layer: its answer, which the front door mounts.
package iface

import (
	"net/http"

	"example.com/controlplane/internal/foundation/answer"
	"example.com/controlplane/internal/foundation/values"
)

var v = values.V

// AnswerDelete answers what the deleteresource slice did: removed, or nothing there to remove.
func AnswerDelete(w http.ResponseWriter, was bool, err error) {
	switch {
	case err != nil:
		answer.Fail(w, http.StatusInternalServerError, v.Errors.Internal)
	case !was:
		w.WriteHeader(http.StatusNoContent)
	}
}
