package deleteresource

import (
	"context"
	"testing"

	"example.com/controlplane/internal/domains/resources/events"
	"example.com/controlplane/internal/domains/resources/infrastructure"
	"example.com/controlplane/internal/domains/resources/model"
)

type recorder struct{ deleted []string }

func (r *recorder) Publish(_ context.Context, e events.ResourceDeleted) error {
	r.deleted = append(r.deleted, e.ID)
	return nil
}

func TestDeletingAnAbsentResourceIsNoError(t *testing.T) {
	ctx, store, pub := context.Background(), &infrastructure.Memory{}, &recorder{}
	_ = store.Save(ctx, model.Resource{ID: "r1", Type: "Example.Things/things"})
	h := Handler{Resources: store, Events: pub}
	if was, err := h.Handle(ctx, "r1"); !was || err != nil {
		t.Fatalf("first delete = %v, %v; want it was there", was, err)
	}
	if was, err := h.Handle(ctx, "r1"); was || err != nil {
		t.Fatalf("second delete = %v, %v; want absent, no error", was, err)
	}
	if len(pub.deleted) != 1 {
		t.Fatalf("events = %v, want one delete", pub.deleted)
	}
}
