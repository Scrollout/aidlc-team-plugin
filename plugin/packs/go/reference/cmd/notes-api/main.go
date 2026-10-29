// Command notes-api is the runtime that hosts the notes domain: wiring only.
package main

import (
	"context"
	"log"
	"net/http"

	createnote "example.com/reference/internal/domains/notes/createnote/application"
	getnote "example.com/reference/internal/domains/notes/getnote/application"
	"example.com/reference/internal/domains/notes/events"
	"example.com/reference/internal/domains/notes/infrastructure"
	iface "example.com/reference/internal/domains/notes/interface"
)

type logged struct{}

func (logged) Publish(_ context.Context, e events.NoteCreated) error {
	log.Printf("%s %s", events.NoteCreatedType, e.ID)
	return nil
}

func main() {
	store := &infrastructure.Memory{}
	mux := iface.Routes(createnote.Handler{Notes: store, Events: logged{}}, getnote.Handler{Notes: store})
	log.Fatal(http.ListenAndServe(":8080", mux))
}
