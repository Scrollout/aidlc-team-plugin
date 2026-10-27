// Command frontdoor is the control plane's stateless entry, hosting the governance pipeline and the resources and
// operations domains: wiring only.
package main

import (
	"context"
	"log"
	"net/http"

	opinfra "example.com/reference/internal/domains/operations/infrastructure"
	"example.com/reference/internal/domains/resources/application/deleteresource"
	"example.com/reference/internal/domains/resources/application/putresource"
	"example.com/reference/internal/domains/resources/events"
	"example.com/reference/internal/domains/resources/infrastructure"
	"example.com/reference/internal/pipeline/stages"
)

type logged struct{}

func (logged) Publish(_ context.Context, e events.ResourceWritten) error {
	log.Printf("%s %s", e.Type(), e.ID)
	return nil
}

type loggedDelete struct{}

func (loggedDelete) Publish(_ context.Context, e events.ResourceDeleted) error {
	log.Printf("%s %s", events.ResourceDeletedType, e.ID)
	return nil
}

func main() {
	store := &infrastructure.Memory{}
	door := &FrontDoor{
		Govern:    governance(stages.Pass(stages.StageAuthorize).Run),
		Put:       putresource.Handler{Resources: store, Events: logged{}},
		Delete:    deleteresource.Handler{Resources: store, Events: loggedDelete{}},
		Ops:       &opinfra.Memory{},
		Providers: map[string]Provider{"Example.Things": {Namespace: "Example.Things", LongRunning: map[string]bool{"widgets": true}}},
	}
	log.Fatal(http.ListenAndServe(":8080", door.Routes()))
}
