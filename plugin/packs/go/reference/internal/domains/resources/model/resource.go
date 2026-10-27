// Package model holds the resources domain's entity: the metadata of every resource, whichever provider owns it.
package model

import (
	"errors"
	"reflect"
)

// Resource is the metadata the core keeps of a resource: its id, its type, the scope it sits in and the provider
// that owns its state.
type Resource struct {
	ID         string
	Type       string
	Scope      string
	Provider   string
	Properties map[string]any
}

// ErrNoID is the rule a resource keeps: it has an id and a type.
var ErrNoID = errors.New("a resource needs an id and a type")

// New returns a resource once its rules hold.
func New(id, typ, scope, provider string, properties map[string]any) (Resource, error) {
	if id == "" || typ == "" {
		return Resource{}, ErrNoID
	}
	return Resource{ID: id, Type: typ, Scope: scope, Provider: provider, Properties: properties}, nil
}

// Same says whether another write of the resource would change nothing.
func (r Resource) Same(o Resource) bool {
	return r.Type == o.Type && r.Scope == o.Scope && r.Provider == o.Provider && reflect.DeepEqual(r.Properties, o.Properties)
}
