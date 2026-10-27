// Package infrastructure implements the slices' ports; it depends on the model only.
package infrastructure

import (
	"context"
	"sync"

	"example.com/reference/internal/domains/notes/model"
)

// Memory keeps notes in memory; a database adapter has the same two methods.
type Memory struct {
	mu    sync.Mutex
	notes map[string]model.Note
}

// Save stores a note.
func (m *Memory) Save(_ context.Context, n model.Note) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.notes == nil {
		m.notes = map[string]model.Note{}
	}
	m.notes[n.ID] = n
	return nil
}

// Get reads a note.
func (m *Memory) Get(_ context.Context, id string) (model.Note, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, ok := m.notes[id]
	return n, ok, nil
}
