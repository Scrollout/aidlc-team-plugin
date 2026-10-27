package infrastructure

import (
	"context"
	"testing"

	"example.com/reference/internal/domains/notes/model"
)

func TestMemorySavesAndReads(t *testing.T) {
	m := &Memory{}
	if err := m.Save(context.Background(), model.Note{ID: "n1", Text: "hello"}); err != nil {
		t.Fatal(err)
	}
	if n, ok, _ := m.Get(context.Background(), "n1"); !ok || n.Text != "hello" {
		t.Fatalf("got %+v, %v", n, ok)
	}
}
