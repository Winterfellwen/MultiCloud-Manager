package main

import (
	"encoding/json"
	"fmt"
	"os"

	"multicloud/internal/vault"
)

type Credential struct {
	Path string                 `json:"path"`
	Data map[string]interface{} `json:"data"`
}

type ConfigFile struct {
	Credentials []Credential `json:"credentials"`
}

func main() {
	addr := os.Getenv("VAULT_ADDR")
	token := os.Getenv("VAULT_TOKEN")
	credFile := os.Getenv("CRED_FILE")

	if addr == "" || token == "" || credFile == "" {
		fmt.Fprintln(os.Stderr, "VAULT_ADDR, VAULT_TOKEN, and CRED_FILE must be set")
		os.Exit(1)
	}

	data, err := os.ReadFile(credFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "reading cred file: %v\n", err)
		os.Exit(1)
	}

	var cfg ConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		fmt.Fprintf(os.Stderr, "parsing cred file: %v\n", err)
		os.Exit(1)
	}

	client := vault.NewClient(vault.Config{Addr: addr})
	client.SetToken(token)

	for _, cred := range cfg.Credentials {
		path := cred.Path
		if path == "" {
			fmt.Fprintln(os.Stderr, "skipping credential with empty path")
			continue
		}

		if err := client.SetSecret(path, cred.Data); err != nil {
			fmt.Fprintf(os.Stderr, "writing %s: %v\n", path, err)
			os.Exit(1)
		}
		fmt.Printf("wrote %s\n", path)
	}

	fmt.Printf("initialized %d credential(s)\n", len(cfg.Credentials))
}
