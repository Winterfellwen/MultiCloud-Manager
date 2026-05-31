package vault

import (
	"encoding/json"
	"fmt"
)

type AuthResponse struct {
	Auth struct {
		ClientToken   string `json:"client_token"`
		LeaseDuration int    `json:"lease_duration"`
	} `json:"auth"`
}

func (c *Client) Authenticate(roleID, secretID string) (string, error) {
	payload, err := json.Marshal(map[string]string{
		"role_id":   roleID,
		"secret_id": secretID,
	})
	if err != nil {
		return "", fmt.Errorf("marshaling payload: %w", err)
	}

	body, statusCode, err := c.rawRequest("POST", "auth/approle/login", payload)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	if statusCode != 200 {
		return "", fmt.Errorf("unexpected status %d: %s", statusCode, string(body))
	}

	var resp AuthResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("decoding response: %w", err)
	}

	return resp.Auth.ClientToken, nil
}

func (c *Client) Login(roleID, secretID string) error {
	token, err := c.Authenticate(roleID, secretID)
	if err != nil {
		return err
	}
	c.SetToken(token)
	return nil
}
