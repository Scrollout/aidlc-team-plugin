package model

import "testing"

func TestAnEndedOperationKeepsItsStatus(t *testing.T) {
	o := Operation{ID: "op1", Status: Running}
	if o.Terminal() {
		t.Fatal("a running operation is not terminal")
	}
	o = o.End(Succeeded).End(Failed)
	if o.Status != Succeeded || !o.Terminal() {
		t.Fatalf("status = %v, want Succeeded kept", o.Status)
	}
}
