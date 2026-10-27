package getnote

import (
	"context"
	"testing"

	"example.com/reference/internal/domains/notes/model"
)

type notes map[string]model.Note

func (s notes) Get(_ context.Context, id string) (model.Note, bool, error) {
	n, ok := s[id]
	return n, ok, nil
}

func TestGetReadsOrRefuses(t *testing.T) {
	h := Handler{Notes: notes{"n1": {ID: "n1", Text: "hello"}}}
	if n, err := h.Handle(context.Background(), "n1"); err != nil || n.Text != "hello" {
		t.Fatalf("got %+v, %v", n, err)
	}
	if _, err := h.Handle(context.Background(), "n9"); err != ErrNotFound {
		t.Fatalf("an unknown id: got %v", err)
	}
}
