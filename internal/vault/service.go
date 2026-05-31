package vault

import "database/sql"

// Service is the interface for credential vault operations.
type Service interface {
	GetSecret(path string) (map[string]interface{}, error)
	SetSecret(path string, data map[string]interface{}) error
	DeleteSecret(path string) error
	ListSecrets(prefix string) ([]string, error)
	Health() map[string]interface{}
}

// NewService creates a vault service.
// Uses built-in DB vault (no external dependency).
func NewService(db *sql.DB) (Service, error) {
	return NewBuiltinVault(db)
}
