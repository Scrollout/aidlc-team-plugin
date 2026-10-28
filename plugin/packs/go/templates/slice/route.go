package iface

import "net/http"

// {{operation}}Route is the {{operation}} slice's route: it decodes the call, runs the slice's handler and answers;
// the domain's router mounts it.
func {{operation}}Route() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, http.StatusText(http.StatusNotImplemented), http.StatusNotImplemented)
	}
}
