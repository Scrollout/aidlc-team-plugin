// Command frontdoor is the control plane's stateless entry, hosting the governance pipeline and the resources and
// operations domains: wiring only.
package main

import (
	"context"
	"log"
	"net/http"

	opinfra "example.com/controlplane/internal/domains/operations/infrastructure"
	createresource "example.com/controlplane/internal/domains/resources/createresource/application"
	deleteresource "example.com/controlplane/internal/domains/resources/deleteresource/application"
	"example.com/controlplane/internal/domains/resources/events"
	"example.com/controlplane/internal/domains/resources/infrastructure"
	"example.com/controlplane/internal/foundation/values"
	"example.com/controlplane/internal/pipeline/stages"
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
	providers := map[string]Provider{}
	for _, p := range values.V.Providers { // the providers this front door serves, from values.json
		long := map[string]bool{}
		for _, t := range p.LongRunning {
			long[t] = true
		}
		providers[p.Namespace] = Provider{Namespace: p.Namespace, LongRunning: long}
	}
	door := &FrontDoor{
		Govern:    governance(stages.Pass(stages.StageAuthorize).Run),
		Put:       createresource.Handler{Resources: store, Events: logged{}},
		Delete:    deleteresource.Handler{Resources: store, Events: loggedDelete{}},
		Ops:       &opinfra.Memory{},
		Providers: providers,
	}
	log.Fatal(http.ListenAndServe(values.V.Listen, door.Routes()))
}
