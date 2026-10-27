// Package deleteresource is the command operation that removes a resource's metadata; removing one that is not there
// is not an error, so the front door answers it with no content.
package deleteresource

import (
	"context"

	"example.com/reference/internal/domains/resources/events"
	"example.com/reference/internal/domains/resources/model"
)

// Repository is what the operation needs from storage.
type Repository interface {
	Get(ctx context.Context, id string) (model.Resource, bool)
	Remove(ctx context.Context, id string) error
}

// Publisher sends the domain's events.
type Publisher interface {
	Publish(ctx context.Context, e events.ResourceDeleted) error
}

// Handler removes a resource and announces it.
type Handler struct {
	Resources Repository
	Events    Publisher
}

// Handle removes the resource with the id and says whether it was there.
func (h Handler) Handle(ctx context.Context, id string) (bool, error) {
	if _, found := h.Resources.Get(ctx, id); !found {
		return false, nil
	}
	if err := h.Resources.Remove(ctx, id); err != nil {
		return false, err
	}
	return true, h.Events.Publish(ctx, events.ResourceDeleted{ID: id})
}
