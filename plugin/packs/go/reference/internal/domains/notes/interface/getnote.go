package iface

import (
	"encoding/json"
	"net/http"

	"example.com/reference/internal/domains/notes/application/getnote"
)

// getnoteRoute is the getnote slice's route: it runs the slice's handler and answers with the note.
func getnoteRoute(get getnote.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		n, err := get.Handle(r.Context(), r.PathValue("noteName"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(n)
	}
}
