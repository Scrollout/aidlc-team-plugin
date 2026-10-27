// Package createnote is the command operation that creates a note: its port, its rules and its event, end to end.
package createnote

import (
	"context"

	"example.com/reference/internal/domains/notes/events"
	"example.com/reference/internal/domains/notes/model"
)

// Repository is what the operation needs from storage; the infrastructure layer implements it.
type Repository interface {
	Save(ctx context.Context, n model.Note) error
}

// Publisher sends the domain's events.
type Publisher interface {
	Publish(ctx context.Context, e events.NoteCreated) error
}

// Handler creates a note, stores it and announces it.
type Handler struct {
	Notes  Repository
	Events Publisher
}

// Handle creates the note with the given id and text.
func (h Handler) Handle(ctx context.Context, id, text string) (model.Note, error) {
	n, err := model.New(id, text)
	if err != nil {
		return model.Note{}, err
	}
	if err := h.Notes.Save(ctx, n); err != nil {
		return model.Note{}, err
	}
	return n, h.Events.Publish(ctx, events.NoteCreated{ID: n.ID})
}
