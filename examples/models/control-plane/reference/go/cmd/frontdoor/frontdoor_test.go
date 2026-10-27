package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	opinfra "example.com/controlplane/internal/domains/operations/infrastructure"
	"example.com/controlplane/internal/domains/resources/application/createresource"
	"example.com/controlplane/internal/domains/resources/application/deleteresource"
	"example.com/controlplane/internal/domains/resources/events"
	"example.com/controlplane/internal/domains/resources/infrastructure"
	"example.com/controlplane/internal/pipeline/stages"
)

type quiet struct{}

func (quiet) Publish(context.Context, events.ResourceWritten) error { return nil }

type quietDelete struct{}

func (quietDelete) Publish(context.Context, events.ResourceDeleted) error { return nil }

// A front door whose authorize stage refuses an anonymous caller, with one provider whose widgets are long-running.
func door(t *testing.T) *httptest.Server {
	t.Helper()
	store := &infrastructure.Memory{}
	authorize := func(_ context.Context, r *stages.Request) *stages.Refusal {
		if r.Caller == "" {
			return &stages.Refusal{Status: http.StatusForbidden, Code: "AuthorizationFailed"}
		}
		return nil
	}
	fd := &FrontDoor{
		Govern:    governance(authorize),
		Put:       createresource.Handler{Resources: store, Events: quiet{}},
		Delete:    deleteresource.Handler{Resources: store, Events: quietDelete{}},
		Ops:       &opinfra.Memory{},
		Providers: map[string]Provider{"Example.Things": {Namespace: "Example.Things", LongRunning: map[string]bool{"widgets": true}}},
	}
	srv := httptest.NewServer(fd.Routes())
	t.Cleanup(srv.Close)
	return srv
}

func call(t *testing.T, srv *httptest.Server, method, path, body string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	req.Header.Set("Authorization", "caller-1")
	if strings.HasPrefix(path, "/anon") {
		req, _ = http.NewRequest(method, srv.URL+strings.TrimPrefix(path, "/anon"), strings.NewReader(body))
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

const thing = "/scopes/s1/providers/Example.Things/things/t1"

func TestGovernanceRefusesBeforeAnyProviderAndAnUnknownNamespaceIsNotFound(t *testing.T) {
	srv := door(t)
	if res := call(t, srv, "PUT", "/anon"+thing, `{"properties":{}}`); res.StatusCode != http.StatusForbidden {
		t.Fatalf("anonymous PUT = %d, want 403 from the authorize stage", res.StatusCode)
	}
	if res := call(t, srv, "PUT", "/scopes/s1/providers/Example.Nothing/things/t1", `{"properties":{}}`); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown namespace = %d, want 404 from the front door", res.StatusCode)
	}
}

func TestAPutRepeatedIsCreatedThenUnchanged(t *testing.T) {
	srv := door(t)
	for k, want := range []int{http.StatusCreated, http.StatusOK} {
		if res := call(t, srv, "PUT", thing, `{"properties":{"size":1}}`); res.StatusCode != want {
			t.Fatalf("PUT %d = %d, want %d", k+1, res.StatusCode, want)
		}
	}
}

func TestALongRunningWriteAnswersWithAResultLinkAndARetryHint(t *testing.T) {
	srv := door(t)
	res := call(t, srv, "PUT", "/scopes/s1/providers/Example.Things/widgets/w1", `{"properties":{}}`)
	if res.StatusCode != http.StatusAccepted || res.Header.Get("Retry-After") == "" || !strings.HasPrefix(res.Header.Get("Location"), "/operations/") {
		t.Fatalf("PUT = %d %v, want 202 with Location and Retry-After", res.StatusCode, res.Header)
	}
	if result := call(t, srv, "GET", res.Header.Get("Location"), ""); result.StatusCode != http.StatusNoContent {
		t.Fatalf("result = %d, want 204 once Succeeded", result.StatusCode)
	}
	var op struct{ Status string }
	_ = json.NewDecoder(call(t, srv, "GET", strings.TrimSuffix(res.Header.Get("Location"), "/result"), "").Body).Decode(&op)
	if op.Status != "Succeeded" {
		t.Fatalf("status = %q, want Succeeded", op.Status)
	}
}

func TestDeletingAnAbsentResourceAnswersNoContent(t *testing.T) {
	srv := door(t)
	if res := call(t, srv, "DELETE", thing, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE absent = %d, want 204", res.StatusCode)
	}
}
