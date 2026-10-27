// Package client is how other domains call the notes domain: it links no internals of it.
package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Note is the client's view of a note, from the published contract.
type Note struct {
	ID   string
	Text string
}

// Client calls the notes API at BaseURL.
type Client struct {
	HTTP    *http.Client
	BaseURL string
}

// Get reads a note.
func (c Client) Get(ctx context.Context, id string) (Note, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/notes/%s", c.BaseURL, id), nil)
	if err != nil {
		return Note{}, err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return Note{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Note{}, fmt.Errorf("get note %s: %s", id, res.Status)
	}
	var n Note
	return n, json.NewDecoder(res.Body).Decode(&n)
}
