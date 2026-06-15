package providers

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
)

// TencentEventProvider fetches audit events from Tencent CloudAudit.
type TencentEventProvider struct {
	secretID   string
	secretKey  string
	httpClient *http.Client
}

// NewTencentEventProvider creates a new TencentEventProvider.
func NewTencentEventProvider(secretID, secretKey string) *TencentEventProvider {
	return &TencentEventProvider{
		secretID:   secretID,
		secretKey:  secretKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// SupportedEventTypes returns the event types this provider can fetch.
func (p *TencentEventProvider) SupportedEventTypes() []string {
	return []string{"audit"}
}

// FetchEvents fetches events of the given type since the specified time.
func (p *TencentEventProvider) FetchEvents(ctx context.Context, eventType string, since time.Time) ([]types.CloudEvent, error) {
	switch eventType {
	case "audit":
		return p.fetchAuditEvents(ctx, since)
	default:
		return nil, fmt.Errorf("tencent: unsupported event type: %s", eventType)
	}
}

// fetchAuditEvents calls CloudAudit LookupEvents API and converts results to CloudEvents.
func (p *TencentEventProvider) fetchAuditEvents(ctx context.Context, since time.Time) ([]types.CloudEvent, error) {
	endTime := time.Now()
	startTime := since

	payload := map[string]interface{}{
		"StartTime": startTime.Unix(),
		"EndTime":   endTime.Unix(),
		"Limit":     50,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentEventRequest(ctx, "cloudaudit", "LookUpEvents", "2019-03-19", "ap-guangzhou", bodyBytes)
	if err != nil {
		return nil, fmt.Errorf("tencent audit: %w", err)
	}

	var result struct {
		Response struct {
			Events []struct {
				EventID      string `json:"EventId"`
				EventName    string `json:"EventName"`
				EventType    string `json:"EventType"`
				EventTime    string `json:"EventTime"`
				Username     string `json:"Username"`
				SourceIP     string `json:"SourceIPAddress"`
				ResourceType string `json:"ResourceType"`
				ResourceName string `json:"ResourceName"`
				Region       string `json:"Region"`
				RequestID    string `json:"RequestId"`
				ErrorCode    string `json:"ErrorCode"`
				ErrorMessage string `json:"ErrorMessage"`
			} `json:"Events"`
			TotalCount int64 `json:"TotalCount"`
			RequestID  string `json:"RequestId"`
			Error      struct {
				Code    string `json:"Code"`
				Message string `json:"Message"`
			} `json:"Error"`
		} `json:"Response"`
	}

	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, fmt.Errorf("tencent audit: unmarshal: %w", err)
	}

	if result.Response.Error.Code != "" {
		return nil, fmt.Errorf("tencent audit: %s: %s", result.Response.Error.Code, result.Response.Error.Message)
	}

	var events []types.CloudEvent
	for _, e := range result.Response.Events {
		eventTime, _ := time.Parse("2006-01-02T15:04:05Z07:00", e.EventTime)
		if eventTime.IsZero() {
			eventTime, _ = time.Parse(time.RFC3339, e.EventTime)
		}

		severity := "info"
		if e.EventType == "Write" {
			severity = "warning"
		}
		if e.ErrorCode != "" {
			severity = "critical"
		}

		title := e.EventName
		if e.ErrorCode != "" {
			title = fmt.Sprintf("%s (failed: %s)", e.EventName, e.ErrorCode)
		}

		desc := e.ErrorMessage
		if desc == "" {
			desc = fmt.Sprintf("User: %s, IP: %s", e.Username, e.SourceIP)
		}

		events = append(events, types.CloudEvent{
			SourceID:     e.EventID,
			EventType:    "audit",
			Severity:     severity,
			Title:        title,
			Description:  desc,
			Source:       "tencent.cloudaudit",
			ResourceID:   e.ResourceName,
			ResourceName: e.ResourceName,
			ResourceType: e.ResourceType,
			EventAt:      eventTime,
			Metadata: map[string]interface{}{
				"username":    e.Username,
				"source_ip":   e.SourceIP,
				"event_type":  e.EventType,
				"request_id":  e.RequestID,
				"region":      e.Region,
			},
		})
	}

	log.Printf("tencent audit: fetched %d events (total: %d)", len(events), result.Response.TotalCount)
	return events, nil
}

// tencentEventRequest performs a Tencent Cloud API 3.0 (TC3-HMAC-SHA256) signed POST request.
// This is a standalone implementation for the event provider since TencentProvider.tencentRequest
// is unexported.
func (p *TencentEventProvider) tencentEventRequest(ctx context.Context, service, action, version, region string, body []byte) ([]byte, error) {
	timestamp := time.Now().Unix()
	date := time.Now().UTC().Format("2006-01-02")

	host := service + ".tencentcloudapi.com"
	endpoint := "https://" + host

	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-tc-action:%s\n",
		"application/json; charset=utf-8", strings.ToLower(host), strings.ToLower(action))
	signedHeaders := "content-type;host;x-tc-action"
	hashedPayload := sha256Hex(body)

	canonicalRequest := fmt.Sprintf("POST\n/\n\n%s\n%s\n%s",
		canonicalHeaders, signedHeaders, hashedPayload)

	credentialScope := fmt.Sprintf("%s/%s/tc3_request", date, service)
	stringToSign := fmt.Sprintf("TC3-HMAC-SHA256\n%d\n%s\n%s",
		timestamp, credentialScope, sha256Hex([]byte(canonicalRequest)))

	secretDate := hmacSHA256([]byte("TC3"+p.secretKey), []byte(date))
	secretService := hmacSHA256(secretDate, []byte(service))
	secretSigning := hmacSHA256(secretService, []byte("tc3_request"))
	signature := hex.EncodeToString(hmacSHA256(secretSigning, []byte(stringToSign)))

	auth := fmt.Sprintf("TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		p.secretID, credentialScope, signedHeaders, signature)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", strings.ToLower(host))
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Timestamp", fmt.Sprintf("%d", timestamp))
	req.Header.Set("X-TC-Version", version)
	req.Header.Set("X-TC-Region", region)
	req.Header.Set("Authorization", auth)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tencent API %s error %d: %s", action, resp.StatusCode, string(respBody))
	}
	return respBody, nil
}
