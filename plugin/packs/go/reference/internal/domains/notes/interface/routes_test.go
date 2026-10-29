package iface

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	createnote "example.com/reference/internal/domains/notes/createnote/application"
	getnote "example.com/reference/internal/domains/notes/getnote/application"
	"example.com/reference/internal/domains/notes/events"
	"example.com/reference/internal/domains/notes/model"
)

type notes map[string]model.Note

func (n notes) Save(_ context.Context, note model.Note) error { n[note.ID] = note; return nil }
func (n notes) Get(_ context.Context, id string) (model.Note, bool, error) {
	note, ok := n[id]
	return note, ok, nil
}

type quiet struct{}

func (quiet) Publish(context.Context, events.NoteCreated) error { return nil }

// Each slice is proved through its route: a call in, the answer out.
func TestRoutes(t *testing.T) {
	store := notes{}
	mux := Routes(createnote.Handler{Notes: store, Events: quiet{}}, getnote.Handler{Notes: store})
	put := httptest.NewRecorder()
	mux.ServeHTTP(put, httptest.NewRequest(http.MethodPut, "/notes/a", strings.NewReader(`{"Text":"hi"}`)))
	if put.Code != http.StatusCreated {
		t.Fatalf("createnote answered %d", put.Code)
	}
	get := httptest.NewRecorder()
	mux.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/notes/a", nil))
	if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), "hi") {
		t.Fatalf("getnote answered %d %s", get.Code, get.Body.String())
	}
	missing := httptest.NewRecorder()
	mux.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/notes/b", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("a missing note answered %d", missing.Code)
	}
}
