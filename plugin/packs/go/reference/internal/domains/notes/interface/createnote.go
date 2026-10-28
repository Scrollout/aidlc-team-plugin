package iface

import (
	"encoding/json"
	"net/http"

	"example.com/reference/internal/domains/notes/application/createnote"
)

// createnoteRoute is the createnote slice's route: it decodes the call, runs the slice's handler and answers.
func createnoteRoute(create createnote.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Text string }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		n, err := create.Handle(r.Context(), r.PathValue("noteName"), body.Text)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(n)
	}
}
