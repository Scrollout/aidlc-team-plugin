// Package iface is the {{operation}} slice's interface layer: its route, which the domain's router mounts.
package iface

import "net/http"

// Route decodes the call, runs the slice's handler and answers.
func Route() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(http.StatusNotImplemented), http.StatusNotImplemented)
	}
}
