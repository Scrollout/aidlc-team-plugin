package createnote

import (
	"context"
	"testing"

	"example.com/reference/internal/domains/notes/events"
	"example.com/reference/internal/domains/notes/model"
)

type notes map[string]model.Note

func (s notes) Save(_ context.Context, n model.Note) error { s[n.ID] = n; return nil }

type sent []events.NoteCreated

func (p *sent) Publish(_ context.Context, e events.NoteCreated) error { *p = append(*p, e); return nil }

func TestCreateStoresAndAnnounces(t *testing.T) {
	store, out := notes{}, &sent{}
	h := Handler{Notes: store, Events: out}
	if _, err := h.Handle(context.Background(), "n1", "hello"); err != nil {
		t.Fatal(err)
	}
	if store["n1"].Text != "hello" || len(*out) != 1 || (*out)[0].ID != "n1" {
		t.Fatalf("stored %v, sent %v", store, *out)
	}
	if _, err := h.Handle(context.Background(), "n2", ""); err != model.ErrEmpty {
		t.Fatalf("an empty note: got %v", err)
	}
	if _, ok := store["n2"]; ok || len(*out) != 1 {
		t.Fatal("a refused note is neither stored nor announced")
	}
}
