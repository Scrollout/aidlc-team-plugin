// Package interface serves the notes domain over HTTP: the server surface its runtime hosts.
package iface

import (
	"net/http"

	"example.com/reference/internal/domains/notes/application/createnote"
	"example.com/reference/internal/domains/notes/application/getnote"
)

// Routes mounts each slice's route: the router is the layer's shared code, each route its slice's own.
func Routes(create createnote.Handler, get getnote.Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("PUT /notes/{noteName}", createnoteRoute(create))
	mux.HandleFunc("GET /notes/{noteName}", getnoteRoute(get))
	return mux
}
