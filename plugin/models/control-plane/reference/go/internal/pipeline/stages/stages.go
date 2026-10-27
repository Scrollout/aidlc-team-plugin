// Package stages is the control plane's governance pipeline: each stage lets a request through or refuses it, and
// every request crosses them in one fixed order, failing closed (the control-plane model's stage order).
package stages

import "context"

// Request is what the stages judge: the call, who makes it, and the resource as it would become.
type Request struct {
	Method string
	Path   string
	Caller string
	Scope  string
	Result map[string]any
}

// Refusal is a stage's answer to a request it stops: the status and the code the caller sees.
type Refusal struct {
	Status int
	Code   string
}

// Stage judges one request; a nil Refusal lets it through.
type Stage struct {
	Name string
	Run  func(ctx context.Context, r *Request) *Refusal
}

// The stages, by name.
const (
	StageAuthenticate = "authenticate"
	StageAuthorize    = "authorize"
	StagePolicy       = "policy"
	StageLock         = "lock"
	StageThrottle     = "throttle"
)

// Order is the order every request crosses them in.
var Order = []string{StageAuthenticate, StageAuthorize, StagePolicy, StageLock, StageThrottle}

// Chain runs the stages in the order given and stops at the first refusal.
func Chain(stages ...Stage) func(ctx context.Context, r *Request) *Refusal {
	return func(ctx context.Context, r *Request) *Refusal {
		for _, s := range stages {
			if refusal := s.Run(ctx, r); refusal != nil {
				return refusal
			}
		}
		return nil
	}
}

// Pass is a stage that lets every request through, for a stage a deployment has not filled in yet.
func Pass(name string) Stage {
	return Stage{Name: name, Run: func(context.Context, *Request) *Refusal { return nil }}
}
