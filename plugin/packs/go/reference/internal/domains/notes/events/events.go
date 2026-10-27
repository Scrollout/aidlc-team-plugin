// Package events holds the notes domain's published event types: other domains may depend on it.
package events

// NoteCreatedType is the event type, <Org>.<Service>.<Noun><PastTenseVerb> with no version.
const NoteCreatedType = "Example.Reference.NoteCreated"

// NoteCreated is published once a note is stored.
type NoteCreated struct {
	ID string
}
