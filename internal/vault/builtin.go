package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
)

// BuiltinVault is a built-in credential vault using database storage + AES encryption.
// No external Vault server required — works on any platform including Render.
type BuiltinVault struct {
	db    *sql.DB
	key   []byte
	mu    sync.RWMutex
	token string
}

// getVaultKey loads the AES-GCM encryption key from ENCRYPTION_KEY env var.
// In production, ENCRYPTION_KEY must be set. In development, a random key is generated.
func getVaultKey() ([]byte, error) {
	keyHex := os.Getenv("ENCRYPTION_KEY")
	if keyHex == "" {
		env := os.Getenv("ENVIRONMENT")
		if env == "production" {
			return nil, fmt.Errorf("ENCRYPTION_KEY must be set in production")
		}
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, fmt.Errorf("failed to generate dev encryption key: %w", err)
		}
		return key, nil
	}
	key, err := hex.DecodeString(keyHex)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_KEY must be 64 hex chars (32 bytes), got %d chars", len(keyHex))
	}
	return key, nil
}

// NewBuiltinVault creates a new built-in vault with AES encryption.
func NewBuiltinVault(db *sql.DB) (*BuiltinVault, error) {
	// Ensure vault_secrets table exists
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS vault_secrets (
			id VARCHAR(255) PRIMARY KEY,
			path VARCHAR(500) NOT NULL UNIQUE,
			encrypted_data BYTEA NOT NULL,
			nonce BYTEA NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("creating vault_secrets table: %w", err)
	}

	key, err := getVaultKey()
	if err != nil {
		return nil, fmt.Errorf("vault key init: %w", err)
	}

	return &BuiltinVault{db: db, key: key}, nil
}

func (v *BuiltinVault) encrypt(plaintext []byte) ([]byte, []byte, error) {
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return nil, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return gcm.Seal(nil, nonce, plaintext, nil), nonce, nil
}

func (v *BuiltinVault) decrypt(ciphertext, nonce []byte) ([]byte, error) {
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// GetSecret retrieves a secret by path.
func (v *BuiltinVault) GetSecret(path string) (map[string]interface{}, error) {
	var encryptedData, nonce []byte
	err := v.db.QueryRow(`SELECT encrypted_data, nonce FROM vault_secrets WHERE path = $1`, path).Scan(&encryptedData, &nonce)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("secret not found at %s", path)
	}
	if err != nil {
		return nil, err
	}
	plaintext, err := v.decrypt(encryptedData, nonce)
	if err != nil {
		return nil, fmt.Errorf("decryption failed: %w", err)
	}
	var data map[string]interface{}
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return nil, err
	}
	return data, nil
}

// SetSecret stores a secret at the given path (upsert).
func (v *BuiltinVault) SetSecret(path string, data map[string]interface{}) error {
	plaintext, err := json.Marshal(data)
	if err != nil {
		return err
	}
	encryptedData, nonce, err := v.encrypt(plaintext)
	if err != nil {
		return err
	}
	_, err = v.db.Exec(`
		INSERT INTO vault_secrets (id, path, encrypted_data, nonce)
		VALUES (gen_random_uuid()::text, $1, $2, $3)
		ON CONFLICT (path) DO UPDATE SET
			encrypted_data = EXCLUDED.encrypted_data,
			nonce = EXCLUDED.nonce,
			updated_at = CURRENT_TIMESTAMP
	`, path, encryptedData, nonce)
	return err
}

// DeleteSecret removes a secret by path.
func (v *BuiltinVault) DeleteSecret(path string) error {
	_, err := v.db.Exec(`DELETE FROM vault_secrets WHERE path = $1`, path)
	return err
}

// ListSecrets lists all secret paths under a prefix.
func (v *BuiltinVault) ListSecrets(prefix string) ([]string, error) {
	rows, err := v.db.Query(`SELECT path FROM vault_secrets WHERE path LIKE $1 ORDER BY path`, prefix+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err == nil {
			paths = append(paths, p)
		}
	}
	return paths, nil
}

// Health returns vault status.
func (v *BuiltinVault) Health() map[string]interface{} {
	var count int
	err := v.db.QueryRow(`SELECT COUNT(*) FROM vault_secrets`).Scan(&count)
	if err != nil {
		return map[string]interface{}{"status": "error", "message": err.Error()}
	}
	return map[string]interface{}{"status": "ok", "type": "builtin", "secrets": count}
}

// SetToken sets session token (interface compat).
func (v *BuiltinVault) SetToken(token string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.token = token
}

// Token returns session token (interface compat).
func (v *BuiltinVault) Token() string {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.token
}
