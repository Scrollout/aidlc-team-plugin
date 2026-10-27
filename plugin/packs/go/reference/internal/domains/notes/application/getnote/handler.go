// Package getnote is the query slice that reads one note.
package getnote

import (
	"context"
	"errors"

	"example.com/reference/internal/domains/notes/model"
)

// ErrNotFound is returned for an id no note has.
var ErrNotFound = errors.New("no such note")

// Repository is what the slice needs from storage.
type Repository interface {
	Get(ctx context.Context, id string) (model.Note, bool, error)
}

// Handler reads a note.
type Handler struct {
	Notes Repository
}

// Handle returns the note with the given id.
func (h Handler) Handle(ctx context.Context, id string) (model.Note, error) {
	n, ok, err := h.Notes.Get(ctx, id)
	if err != nil {
		return model.Note{}, err
	}
	if !ok {
		return model.Note{}, ErrNotFound
	}
	return n, nil
}
