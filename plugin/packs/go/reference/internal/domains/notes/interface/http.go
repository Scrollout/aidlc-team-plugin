// Package interface serves the notes domain over HTTP: the server surface its runtime hosts.
package iface

import (
	"net/http"

	createnote "example.com/reference/internal/domains/notes/createnote/application"
	createroute "example.com/reference/internal/domains/notes/createnote/interface"
	getnote "example.com/reference/internal/domains/notes/getnote/application"
	getroute "example.com/reference/internal/domains/notes/getnote/interface"
)

// Routes mounts each slice's route: the router is the domain's shared server surface, each route its slice's own.
func Routes(create createnote.Handler, get getnote.Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("PUT /notes/{noteName}", createroute.Route(create))
	mux.HandleFunc("GET /notes/{noteName}", getroute.Route(get))
	return mux
}
