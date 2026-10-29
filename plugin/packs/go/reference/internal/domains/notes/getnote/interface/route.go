// Package iface is the getnote slice's interface layer: its route, the call in and the answer out.
package iface

import (
	"encoding/json"
	"net/http"

	getnote "example.com/reference/internal/domains/notes/getnote/application"
)

// Route is the getnote slice's route: it runs the slice's handler and answers with the note.
func Route(get getnote.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		n, err := get.Handle(r.Context(), r.PathValue("noteName"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(n)
	}
}
