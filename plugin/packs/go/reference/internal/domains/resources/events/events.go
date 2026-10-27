// Package events is the resources domain's published events: one for each write and each delete.
package events

// The event types, in the contract grammar's Org.Service.NounPastTenseVerb form.
const (
	ResourceCreatedType = "Example.Resources.ResourceCreated"
	ResourceUpdatedType = "Example.Resources.ResourceUpdated"
	ResourceDeletedType = "Example.Resources.ResourceDeleted"
)

// ResourceWritten announces a resource created or changed.
type ResourceWritten struct {
	ID      string
	Created bool
}

// Type is the event type the write announces.
func (e ResourceWritten) Type() string {
	if e.Created {
		return ResourceCreatedType
	}
	return ResourceUpdatedType
}

// ResourceDeleted announces a resource removed.
type ResourceDeleted struct{ ID string }
