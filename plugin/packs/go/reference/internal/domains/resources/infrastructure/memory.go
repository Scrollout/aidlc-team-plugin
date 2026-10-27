// Package infrastructure stores the resources domain's metadata; this reference keeps it in memory.
package infrastructure

import (
	"context"
	"sync"

	"example.com/reference/internal/domains/resources/model"
)

// Memory is a store safe for concurrent use.
type Memory struct {
	mu   sync.Mutex
	rows map[string]model.Resource
}

// Get returns the resource with the id, and whether it exists.
func (m *Memory) Get(_ context.Context, id string) (model.Resource, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.rows[id]
	return r, ok
}

// Save writes the resource.
func (m *Memory) Save(_ context.Context, r model.Resource) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rows == nil {
		m.rows = map[string]model.Resource{}
	}
	m.rows[r.ID] = r
	return nil
}

// Remove deletes the resource with the id.
func (m *Memory) Remove(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rows, id)
	return nil
}
