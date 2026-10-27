// Package values holds the control plane's values, read from values.json beside it: its routes, error codes,
// statuses, event types and the providers it serves. Code reads them here, so a value changes without a code change.
package values

import (
	_ "embed"
	"encoding/json"
)

//go:embed values.json
var raw []byte

// Values is values.json, by name.
type Values struct {
	Routes struct {
		Resource  string `json:"resource"`
		Operation string `json:"operation"`
		Result    string `json:"result"`
	} `json:"routes"`
	Params struct {
		Scope     string `json:"scope"`
		Namespace string `json:"namespace"`
		Type      string `json:"type"`
		ID        string `json:"id"`
	} `json:"params"`
	ScopePrefix      string `json:"scopePrefix"`
	OperationsPrefix string `json:"operationsPrefix"`
	ResultSuffix     string `json:"resultSuffix"`
	OperationID      string `json:"operationID"`
	RetryAfter       string `json:"retryAfter"`
	Errors           struct {
		BadContent      string `json:"badContent"`
		BadResource     string `json:"badResource"`
		Internal        string `json:"internal"`
		NoOperation     string `json:"noOperation"`
		OperationFailed string `json:"operationFailed"`
		NoProvider      string `json:"noProvider"`
	} `json:"errors"`
	Stages struct {
		Authenticate string `json:"authenticate"`
		Authorize    string `json:"authorize"`
		Policy       string `json:"policy"`
		Lock         string `json:"lock"`
		Throttle     string `json:"throttle"`
	} `json:"stages"`
	Statuses struct {
		Running   string `json:"running"`
		Succeeded string `json:"succeeded"`
		Failed    string `json:"failed"`
		Canceled  string `json:"canceled"`
	} `json:"statuses"`
	Events struct {
		Created string `json:"created"`
		Updated string `json:"updated"`
		Deleted string `json:"deleted"`
	} `json:"events"`
	Messages struct {
		NoID string `json:"noID"`
	} `json:"messages"`
	Providers []struct {
		Namespace   string   `json:"namespace"`
		LongRunning []string `json:"longRunning"`
	} `json:"providers"`
	Listen string `json:"listen"`
}

// V is the values, read once at start; a values.json that does not parse stops the program.
var V = func() Values {
	var v Values
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(err)
	}
	return v
}()
