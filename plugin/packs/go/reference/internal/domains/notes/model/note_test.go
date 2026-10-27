package model

import "testing"

func TestNewKeepsTheRule(t *testing.T) {
	if _, err := New("n1", ""); err != ErrEmpty {
		t.Fatalf("an empty note: got %v, want ErrEmpty", err)
	}
	n, err := New("n1", "hello")
	if err != nil || n.Text != "hello" {
		t.Fatalf("a note with text: got %+v, %v", n, err)
	}
}
