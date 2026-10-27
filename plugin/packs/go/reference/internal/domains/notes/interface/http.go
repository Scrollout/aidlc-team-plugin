// Package interface serves the notes domain over HTTP: the server surface its runtime hosts.
package iface

import (
	"encoding/json"
	"net/http"

	"example.com/reference/internal/domains/notes/application/createnote"
	"example.com/reference/internal/domains/notes/application/getnote"
)

// Routes wires the slices to their HTTP operations.
func Routes(create createnote.Handler, get getnote.Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("PUT /notes/{noteName}", func(w http.ResponseWriter, r *http.Request) {
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
	})
	mux.HandleFunc("GET /notes/{noteName}", func(w http.ResponseWriter, r *http.Request) {
		n, err := get.Handle(r.Context(), r.PathValue("noteName"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(n)
	})
	return mux
}
