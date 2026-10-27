// Package getoperation is the query slice that answers where a long-running write stands: running, or ended with
// its terminal status.
package getoperation

import (
	"context"

	"example.com/controlplane/internal/domains/operations/model"
)

// Repository is what the slice needs from storage.
type Repository interface {
	Get(ctx context.Context, id string) (model.Operation, bool)
}

// Handler reads one operation.
type Handler struct {
	Operations Repository
}

// Handle returns the operation with the id, and whether it exists.
func (h Handler) Handle(ctx context.Context, id string) (model.Operation, bool) {
	return h.Operations.Get(ctx, id)
}
