// Package {{operation}} is the {{operation}} operation of the {{domain}} domain: its port, its rules and its events, end to end.
package {{operation}}

import "context"

// Handler runs {{operation}}.
type Handler struct{}

// Handle runs the operation; its acceptance test comes first.
func (h Handler) Handle(ctx context.Context) error {
	return nil
}
