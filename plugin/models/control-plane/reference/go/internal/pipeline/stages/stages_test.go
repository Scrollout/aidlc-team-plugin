package stages

import (
	"context"
	"reflect"
	"testing"
)

func TestChainRunsInOrderAndStopsAtTheFirstRefusal(t *testing.T) {
	var ran []string
	stage := func(name string, refuse bool) Stage {
		return Stage{Name: name, Run: func(context.Context, *Request) *Refusal {
			ran = append(ran, name)
			if refuse {
				return &Refusal{Status: 403, Code: "AuthorizationFailed"}
			}
			return nil
		}}
	}
	chain := Chain(stage(StageAuthenticate, false), stage(StageAuthorize, true), stage(StagePolicy, false))
	got := chain(context.Background(), &Request{Method: "PUT"})
	if got == nil || got.Status != 403 {
		t.Fatalf("refusal = %v, want the authorize stage's 403", got)
	}
	if want := []string{StageAuthenticate, StageAuthorize}; !reflect.DeepEqual(ran, want) {
		t.Fatalf("ran %v, want %v: policy never runs after a refusal", ran, want)
	}
}

func TestOrderIsTheModelsOrder(t *testing.T) {
	want := []string{"authenticate", "authorize", "policy", "lock", "throttle"}
	if !reflect.DeepEqual(Order, want) {
		t.Fatalf("Order = %v, want %v", Order, want)
	}
}
