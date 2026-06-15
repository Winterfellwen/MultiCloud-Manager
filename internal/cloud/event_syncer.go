package cloud

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"multicloud/internal/cloud/providers"
	"multicloud/internal/cloud/types"
	"multicloud/internal/vault"
)

// EventSyncer periodically fetches events from cloud providers and stores them in the DB.
type EventSyncer struct {
	db       *sql.DB
	vault    vault.Service
	mu       sync.RWMutex
	bgCtx    context.Context
	bgCancel context.CancelFunc
	started  bool
}

// NewEventSyncer creates a new EventSyncer.
func NewEventSyncer(db *sql.DB, v vault.Service) *EventSyncer {
	return &EventSyncer{db: db, vault: v}
}

// Start begins the background event sync loop.
func (es *EventSyncer) Start(ctx context.Context, interval time.Duration) {
	if es.db == nil || es.started {
		return
	}
	es.bgCtx, es.bgCancel = context.WithCancel(ctx)
	es.started = true
	go func() {
		log.Printf("event-syncer: started, interval=%v", interval)
		time.Sleep(5 * time.Second) // initial delay
		es.SyncAll(es.bgCtx)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				es.SyncAll(es.bgCtx)
			case <-es.bgCtx.Done():
				log.Println("event-syncer: stopped")
				return
			}
		}
	}()
}

// Stop stops the background event sync loop.
func (es *EventSyncer) Stop() {
	if es.bgCancel != nil {
		es.bgCancel()
	}
	es.started = false
}

// SyncAll fetches events from all active cloud accounts and stores them.
func (es *EventSyncer) SyncAll(ctx context.Context) {
	if es.db == nil {
		return
	}

	rows, err := es.db.QueryContext(ctx, `SELECT id, cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE is_active = true`)
	if err != nil {
		log.Printf("event-syncer: query accounts: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, cloudType, credJSON, vaultPath string
		if err := rows.Scan(&id, &cloudType, &credJSON, &vaultPath); err != nil {
			continue
		}

		// Prefer vault credentials over plaintext
		if vaultPath != "" && es.vault != nil {
			if secretData, err := es.vault.GetSecret(vaultPath); err == nil {
				if dataBytes, err := json.Marshal(secretData); err == nil {
					credJSON = string(dataBytes)
				}
			}
		}

		es.syncAccountEvents(ctx, id, cloudType, credJSON)
	}
}

// syncAccountEvents fetches events for a single account based on its cloud type.
func (es *EventSyncer) syncAccountEvents(ctx context.Context, accountID, cloudType, credJSON string) {
	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return
	}

	eventProvider := es.getEventProvider(cloudType, creds)
	if eventProvider == nil {
		return
	}

	for _, eventType := range eventProvider.SupportedEventTypes() {
		es.syncEventType(ctx, accountID, cloudType, eventProvider, eventType)
	}
}

func (es *EventSyncer) syncEventType(ctx context.Context, accountID, cloudType string, ep types.EventProvider, eventType string) {
	// Get last event time for incremental sync
	var lastEventAt sql.NullTime
	es.db.QueryRowContext(ctx,
		`SELECT last_event_at FROM cloud_event_sync_state WHERE account_id = $1 AND cloud_type = $2 AND event_type = $3`,
		accountID, cloudType, eventType).Scan(&lastEventAt)

	since := time.Now().Add(-24 * time.Hour) // default: last 24 hours
	if lastEventAt.Valid {
		since = lastEventAt.Time
	}

	// Mark as syncing
	es.db.ExecContext(ctx,
		`INSERT INTO cloud_event_sync_state (account_id, cloud_type, event_type, sync_status)
		 VALUES ($1, $2, $3, 'syncing')
		 ON CONFLICT (account_id, cloud_type, event_type) DO UPDATE SET sync_status = 'syncing', last_sync_at = CURRENT_TIMESTAMP`,
		accountID, cloudType, eventType)

	events, err := ep.FetchEvents(ctx, eventType, since)
	if err != nil {
		log.Printf("event-syncer: fetch %s/%s for %s: %v", cloudType, eventType, accountID, err)
		es.db.ExecContext(ctx,
			`UPDATE cloud_event_sync_state SET sync_status = 'error', error_message = $1, last_sync_at = CURRENT_TIMESTAMP
			 WHERE account_id = $2 AND cloud_type = $3 AND event_type = $4`,
			err.Error(), accountID, cloudType, eventType)
		return
	}

	count := 0
	var latestEventAt time.Time
	for _, evt := range events {
		metaJSON, _ := json.Marshal(evt.Metadata)
		if metaJSON == nil {
			metaJSON = []byte("{}")
		}

		_, err := es.db.ExecContext(ctx,
			`INSERT INTO cloud_events (account_id, cloud_type, event_type, severity, title, description, source, source_id,
				resource_id, resource_name, resource_type, region, metadata, event_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '', $12::jsonb, $13)
			 ON CONFLICT (account_id, cloud_type, source_id) DO NOTHING`,
			accountID, cloudType, evt.EventType, evt.Severity, evt.Title, evt.Description,
			evt.Source, evt.SourceID, evt.ResourceID, evt.ResourceName, evt.ResourceType,
			string(metaJSON), evt.EventAt)
		if err != nil {
			log.Printf("event-syncer: insert event: %v", err)
			continue
		}
		count++
		if evt.EventAt.After(latestEventAt) {
			latestEventAt = evt.EventAt
		}
	}

	log.Printf("event-syncer: synced %d %s/%s events for %s", count, cloudType, eventType, accountID)

	es.db.ExecContext(ctx,
		`UPDATE cloud_event_sync_state SET sync_status = 'idle', last_event_at = $1, last_sync_at = CURRENT_TIMESTAMP, error_message = NULL
		 WHERE account_id = $2 AND cloud_type = $3 AND event_type = $4`,
		latestEventAt, accountID, cloudType, eventType)
}

// getEventProvider returns an EventProvider for the given cloud type.
func (es *EventSyncer) getEventProvider(cloudType string, creds map[string]string) types.EventProvider {
	switch cloudType {
	case "render":
		apiKey, ok := creds["api_key"]
		if !ok || apiKey == "" {
			return nil
		}
		return providers.NewRenderEventProvider(apiKey)
	case "tencent":
		secretID := creds["secret_id"]
		secretKey := creds["secret_key"]
		if secretID == "" || secretKey == "" {
			return nil
		}
		return providers.NewTencentEventProvider(secretID, secretKey)
	default:
		return nil
	}
}

// GetSyncStatus returns the current sync status for all cloud types.
func (es *EventSyncer) GetSyncStatus(ctx context.Context) []map[string]interface{} {
	if es.db == nil {
		return nil
	}

	rows, err := es.db.QueryContext(ctx, `
		SELECT es.account_id, es.cloud_type, es.event_type, es.sync_status, es.last_event_at, es.last_sync_at, es.error_message, ca.name
		FROM cloud_event_sync_state es
		JOIN cloud_accounts ca ON es.account_id = ca.id
		ORDER BY es.last_sync_at DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var status []map[string]interface{}
	for rows.Next() {
		var accountID, cloudType, eventType, syncStatus, accountName string
		var lastEventAt, lastSyncAt sql.NullTime
		var errMsg sql.NullString
		if err := rows.Scan(&accountID, &cloudType, &eventType, &syncStatus, &lastEventAt, &lastSyncAt, &errMsg, &accountName); err != nil {
			continue
		}
		item := map[string]interface{}{
			"account_id":   accountID,
			"cloud_type":   cloudType,
			"event_type":   eventType,
			"sync_status":  syncStatus,
			"account_name": accountName,
		}
		if lastEventAt.Valid {
			item["last_event_at"] = lastEventAt.Time.Format(time.RFC3339)
		}
		if lastSyncAt.Valid {
			item["last_sync_at"] = lastSyncAt.Time.Format(time.RFC3339)
		}
		if errMsg.Valid {
			item["error_message"] = errMsg.String
		}
		status = append(status, item)
	}
	return status
}

// BuildEventWhereClause builds a SQL WHERE clause and args for filtering cloud events.
func BuildEventWhereClause(cloudType, eventType, severity, resourceID string, startTime, endTime *time.Time) (string, []interface{}) {
	conditions := []string{"1=1"}
	args := []interface{}{}
	idx := 1

	if cloudType != "" {
		conditions = append(conditions, fmt.Sprintf("cloud_type = $%d", idx))
		args = append(args, cloudType)
		idx++
	}
	if eventType != "" {
		conditions = append(conditions, fmt.Sprintf("event_type = $%d", idx))
		args = append(args, eventType)
		idx++
	}
	if severity != "" {
		conditions = append(conditions, fmt.Sprintf("severity = $%d", idx))
		args = append(args, severity)
		idx++
	}
	if resourceID != "" {
		conditions = append(conditions, fmt.Sprintf("resource_id = $%d", idx))
		args = append(args, resourceID)
		idx++
	}
	if startTime != nil {
		conditions = append(conditions, fmt.Sprintf("event_at >= $%d", idx))
		args = append(args, *startTime)
		idx++
	}
	if endTime != nil {
		conditions = append(conditions, fmt.Sprintf("event_at <= $%d", idx))
		args = append(args, *endTime)
		idx++
	}

	return "WHERE " + strings.Join(conditions, " AND "), args
}
