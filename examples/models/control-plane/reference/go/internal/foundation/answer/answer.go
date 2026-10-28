// Package answer writes the error envelope every refusal answers with, for the routes and the front door alike.
package answer

import (
	"encoding/json"
	"net/http"
)

type errorBody struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

// Fail answers with status and the error code in the envelope.
func Fail(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	var body errorBody
	body.Error.Code = code
	_ = json.NewEncoder(w).Encode(body)
}
