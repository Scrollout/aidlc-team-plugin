// Package model holds the operations domain's entity: a long-running write, followed until a terminal state.
package model

import "example.com/controlplane/internal/foundation/values"

// Status is where an operation stands.
type Status string

// The statuses; the last three are terminal.
var (
	Running   = Status(values.V.Statuses.Running)
	Succeeded = Status(values.V.Statuses.Succeeded)
	Failed    = Status(values.V.Statuses.Failed)
	Canceled  = Status(values.V.Statuses.Canceled)
)

// Operation is a long-running write: what it acts on, where it stands, and its result once it ends.
type Operation struct {
	ID       string
	Resource string
	Status   Status
}

// Terminal says whether the operation has ended.
func (o Operation) Terminal() bool {
	return o.Status == Succeeded || o.Status == Failed || o.Status == Canceled
}

// End moves a running operation to a terminal status; one that has ended keeps its status.
func (o Operation) End(s Status) Operation {
	if !o.Terminal() {
		o.Status = s
	}
	return o
}
