// Package model holds the notes domain's entities and the rules they keep; it depends on no other layer.
package model

import "errors"

// Note is the root aggregate of the notes domain.
type Note struct {
	ID   string
	Text string
}

// ErrEmpty is the rule a note keeps: it has text.
var ErrEmpty = errors.New("a note needs text")

// New returns a note once its rules hold.
func New(id, text string) (Note, error) {
	if text == "" {
		return Note{}, ErrEmpty
	}
	return Note{ID: id, Text: text}, nil
}
