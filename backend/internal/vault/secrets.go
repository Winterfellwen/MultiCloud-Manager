package vault

import (
	"encoding/json"
	"fmt"
)

type SecretData struct {
	Data     map[string]interface{} `json:"data"`
	Metadata map[string]interface{} `json:"metadata"`
}

type KVResponse struct {
	Data SecretData `json:"data"`
}

type ListResponse struct {
	Data struct {
		Keys []string `json:"keys"`
	} `json:"data"`
}

func (c *Client) GetSecret(path string) (map[string]interface{}, error) {
	body, statusCode, err := c.rawRequest("GET", fmt.Sprintf("kv/%s", path), nil)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	if statusCode == 404 {
		return nil, fmt.Errorf("secret not found at %s", path)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("unexpected status %d: %s", statusCode, string(body))
	}

	var resp KVResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return resp.Data.Data, nil
}

func (c *Client) SetSecret(path string, data map[string]interface{}) error {
	payload, err := json.Marshal(map[string]interface{}{
		"data": data,
	})
	if err != nil {
		return fmt.Errorf("marshaling payload: %w", err)
	}

	body, statusCode, err := c.rawRequest("POST", fmt.Sprintf("kv/%s", path), payload)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	if statusCode != 200 {
		return fmt.Errorf("unexpected status %d: %s", statusCode, string(body))
	}

	return nil
}

func (c *Client) DeleteSecret(path string) error {
	body, statusCode, err := c.rawRequest("DELETE", fmt.Sprintf("kv/%s", path), nil)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	if statusCode != 204 && statusCode != 200 {
		return fmt.Errorf("unexpected status %d: %s", statusCode, string(body))
	}

	return nil
}

func (c *Client) ListSecrets(path string) ([]string, error) {
	body, statusCode, err := c.rawRequest("LIST", fmt.Sprintf("kv/%s", path), nil)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	if statusCode == 404 {
		return []string{}, nil
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("unexpected status %d: %s", statusCode, string(body))
	}

	var resp ListResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return resp.Data.Keys, nil
}
