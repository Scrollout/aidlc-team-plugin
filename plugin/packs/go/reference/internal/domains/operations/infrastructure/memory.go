// Package infrastructure stores the operations domain's operations; this reference keeps them in memory.
package infrastructure

import (
	"context"
	"sync"

	"example.com/reference/internal/domains/operations/model"
)

// Memory is a store safe for concurrent use.
type Memory struct {
	mu  sync.Mutex
	ops map[string]model.Operation
}

// Get returns the operation with the id, and whether it exists.
func (m *Memory) Get(_ context.Context, id string) (model.Operation, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o, ok := m.ops[id]
	return o, ok
}

// Save writes the operation.
func (m *Memory) Save(_ context.Context, o model.Operation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ops == nil {
		m.ops = map[string]model.Operation{}
	}
	m.ops[o.ID] = o
	return nil
}
