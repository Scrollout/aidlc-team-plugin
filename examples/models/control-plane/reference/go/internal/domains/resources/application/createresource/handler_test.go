package createresource

import (
	"context"
	"testing"

	"example.com/controlplane/internal/domains/resources/events"
	"example.com/controlplane/internal/domains/resources/infrastructure"
	"example.com/controlplane/internal/domains/resources/model"
)

type recorder struct{ written []string }

func (r *recorder) Publish(_ context.Context, e events.ResourceWritten) error {
	r.written = append(r.written, e.ID)
	return nil
}

func TestAWriteRepeatedLeavesStatusAndStateUnchanged(t *testing.T) {
	ctx, store, pub := context.Background(), &infrastructure.Memory{}, &recorder{}
	h := Handler{Resources: store, Events: pub}
	thing := model.Resource{ID: "/scopes/s1/providers/Example.Things/things/t1", Type: "Example.Things/things", Scope: "/scopes/s1", Provider: "Example.Things", Properties: map[string]any{"size": 1}}
	for k, want := range []Outcome{Created, Unchanged} {
		if got, err := h.Handle(ctx, thing); err != nil || got != want {
			t.Fatalf("write %d = %v, %v; want %v", k+1, got, err, want)
		}
	}
	thing.Properties = map[string]any{"size": 2}
	if got, _ := h.Handle(ctx, thing); got != Changed {
		t.Fatalf("a changed write = %v, want Changed", got)
	}
	if len(pub.written) != 2 {
		t.Fatalf("events = %v, want one per write that changed something", pub.written)
	}
}

func TestAResourceNeedsAnIDAndAType(t *testing.T) {
	h := Handler{Resources: &infrastructure.Memory{}, Events: &recorder{}}
	if _, err := h.Handle(context.Background(), model.Resource{Type: "Example.Things/things"}); err != model.ErrNoID {
		t.Fatalf("err = %v, want ErrNoID", err)
	}
}
