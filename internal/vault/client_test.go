package vault

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient(t *testing.T) {
	cfg := Config{Addr: "http://localhost:8200", RoleID: "test-role", SecretID: "test-secret"}
	c := NewClient(cfg)

	if c.addr != cfg.Addr {
		t.Errorf("expected addr %s, got %s", cfg.Addr, c.addr)
	}
	if c.token != "" {
		t.Errorf("expected empty token, got %s", c.token)
	}
}

func TestSetToken(t *testing.T) {
	c := NewClient(Config{Addr: "http://localhost:8200"})
	c.SetToken("my-token")

	if c.Token() != "my-token" {
		t.Errorf("expected token 'my-token', got '%s'", c.Token())
	}
}

func TestGetSecret(t *testing.T) {
	mockData := map[string]interface{}{
		"data": map[string]interface{}{
			"data": map[string]interface{}{
				"username": "admin",
				"password": "secret123",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "test-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockData)
	}))
	defer server.Close()

	c := NewClient(Config{Addr: server.URL})
	c.SetToken("test-token")

	secret, err := c.GetSecret("cloud/data/aws/credentials")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if secret["username"] != "admin" {
		t.Errorf("expected username 'admin', got '%v'", secret["username"])
	}
	if secret["password"] != "secret123" {
		t.Errorf("expected password 'secret123', got '%v'", secret["password"])
	}
}

func TestSetSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get("X-Vault-Token") != "test-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var payload map[string]interface{}
		json.NewDecoder(r.Body).Decode(&payload)
		data, ok := payload["data"].(map[string]interface{})
		if !ok {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		if data["api_key"] != "key123" {
			http.Error(w, "wrong data", http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{})
	}))
	defer server.Close()

	c := NewClient(Config{Addr: server.URL})
	c.SetToken("test-token")

	err := c.SetSecret("cloud/data/gcp/service-account", map[string]interface{}{
		"api_key": "key123",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
