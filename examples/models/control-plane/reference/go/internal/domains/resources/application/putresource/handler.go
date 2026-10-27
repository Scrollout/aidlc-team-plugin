// Package putresource is the command slice that writes a resource's metadata: idempotent, so the same write
// repeated leaves status and state unchanged.
package putresource

import (
	"context"

	"example.com/controlplane/internal/domains/resources/events"
	"example.com/controlplane/internal/domains/resources/model"
)

// Outcome is what a write did, which the front door answers with: created, changed, or nothing to change.
type Outcome int

// The outcomes.
const (
	Created Outcome = iota
	Changed
	Unchanged
)

// Repository is what the slice needs from storage.
type Repository interface {
	Get(ctx context.Context, id string) (model.Resource, bool)
	Save(ctx context.Context, r model.Resource) error
}

// Publisher sends the domain's events.
type Publisher interface {
	Publish(ctx context.Context, e events.ResourceWritten) error
}

// Handler writes a resource and announces a write that changed something.
type Handler struct {
	Resources Repository
	Events    Publisher
}

// Handle writes the resource; a write that changes nothing stores and announces nothing.
func (h Handler) Handle(ctx context.Context, r model.Resource) (Outcome, error) {
	r, err := model.New(r.ID, r.Type, r.Scope, r.Provider, r.Properties)
	if err != nil {
		return 0, err
	}
	old, found := h.Resources.Get(ctx, r.ID)
	if found && old.Same(r) {
		return Unchanged, nil
	}
	if err := h.Resources.Save(ctx, r); err != nil {
		return 0, err
	}
	outcome := Created
	if found {
		outcome = Changed
	}
	return outcome, h.Events.Publish(ctx, events.ResourceWritten{ID: r.ID, Created: !found})
}
