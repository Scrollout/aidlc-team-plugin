package getoperation

import (
	"context"
	"testing"

	"example.com/controlplane/internal/domains/operations/infrastructure"
	"example.com/controlplane/internal/domains/operations/model"
)

func TestAnOperationReadsAsItWasLastSaved(t *testing.T) {
	ctx, store := context.Background(), &infrastructure.Memory{}
	h := Handler{Operations: store}
	if _, ok := h.Handle(ctx, "op1"); ok {
		t.Fatal("an unknown operation was found")
	}
	op := model.Operation{ID: "op1", Resource: "r1", Status: model.Running}
	_ = store.Save(ctx, op)
	_ = store.Save(ctx, op.End(model.Succeeded))
	if got, ok := h.Handle(ctx, "op1"); !ok || got.Status != model.Succeeded {
		t.Fatalf("got %v, %v; want the operation, succeeded", got, ok)
	}
}
