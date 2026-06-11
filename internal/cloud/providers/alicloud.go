package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
)

type AlicloudProvider struct {
	accessKeyID     string
	accessKeySecret string
	region          string
	httpClient      *http.Client
}

func NewAlicloudProvider(creds map[string]string) *AlicloudProvider {
	region := creds["region"]
	if region == "" {
		region = "cn-hangzhou"
	}
	return &AlicloudProvider{
		accessKeyID:     creds["access_key_id"],
		accessKeySecret: creds["access_key_secret"],
		region:          region,
		httpClient:      &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *AlicloudProvider) GetType() string { return "alicloud" }

// --- Alibaba Cloud API signing (SignatureVersion 1.0 / HMAC-SHA1) ---

func (p *AlicloudProvider) signedRequest(ctx context.Context, params map[string]string) (*http.Response, error) {
	params["Format"] = "JSON"
	params["Version"] = "2014-05-26"
	params["AccessKeyId"] = p.accessKeyID
	params["SignatureMethod"] = "HMAC-SHA1"
	params["Timestamp"] = time.Now().UTC().Format("2006-01-02T15:04:05Z")
	params["SignatureVersion"] = "1.0"
	params["SignatureNonce"] = fmt.Sprintf("%d", time.Now().UnixNano())

	// Sort params and build string to sign
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var parts []string
	for _, k := range keys {
		parts = append(parts, percentEncode(k)+"="+percentEncode(params[k]))
	}
	stringToSign := "GET&" + percentEncode("/") + "&" + percentEncode(strings.Join(parts, "&"))

	// HMAC-SHA1 sign
	mac := hmac.New(sha1.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	params["Signature"] = signature

	// Build final URL
	queryParts := make([]string, 0, len(params))
	for k, v := range params {
		queryParts = append(queryParts, percentEncode(k)+"="+percentEncode(v))
	}
	endpoint := "https://ecs.aliyuncs.com/?" + strings.Join(queryParts, "&")

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	return p.httpClient.Do(req)
}

func percentEncode(s string) string {
	encoded := url.QueryEscape(s)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	encoded = strings.ReplaceAll(encoded, "*", "%2A")
	encoded = strings.ReplaceAll(encoded, "%7E", "~")
	return encoded
}

// --- ECS API ---

type ecsInstance struct {
	InstanceID   string `json:"InstanceId"`
	InstanceName string `json:"InstanceName"`
	InstanceType string `json:"InstanceType"`
	RegionID     string `json:"RegionId"`
	Status       string `json:"Status"`
	CPU          int    `json:"Cpu"`
	Memory       int    `json:"Memory"`
	Tags         struct {
		Tag []struct {
			TagKey   string `json:"TagKey"`
			TagValue string `json:"TagValue"`
		} `json:"Tag"`
	} `json:"Tags"`
}

type ecsDescribeResponse struct {
	TotalCount int           `json:"TotalCount"`
	PageNumber int           `json:"PageNumber"`
	PageSize   int           `json:"PageSize"`
	Instances  []ecsInstance `json:"Instances"`
}

func (p *AlicloudProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	params := map[string]string{
		"Action":    "DescribeInstances",
		"RegionId":  region,
		"PageSize":  "100",
	}

	resp, err := p.signedRequest(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("alicloud: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result ecsDescribeResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse response: %w", err)
	}

	var instances []types.Instance
	for _, inst := range result.Instances {
		name := inst.InstanceName
		if name == "" {
			name = inst.InstanceID
		}
		tags := make(map[string]string)
		for _, t := range inst.Tags.Tag {
			tags[t.TagKey] = t.TagValue
		}
		status := "running"
		switch inst.Status {
		case "Running":
			status = "running"
		case "Stopped":
			status = "stopped"
		case "Starting", "Stopping":
			status = "pending"
		case "Pending":
			status = "pending"
		default:
			status = "terminated"
		}
		instances = append(instances, types.Instance{
			ID:           inst.InstanceID,
			Name:         name,
			CloudType:    "alicloud",
			Region:       inst.RegionID,
			Status:       status,
			InstanceType: inst.InstanceType,
			Spec: map[string]interface{}{
				"instance_type": inst.InstanceType,
				"cpu":           inst.CPU,
				"memory_mb":     inst.Memory,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud ECS: listed %d instances in %s", len(instances), region)
	return instances, nil
}

func (p *AlicloudProvider) instanceAction(ctx context.Context, instanceID, action string) error {
	params := map[string]string{
		"Action":     action,
		"InstanceId": instanceID,
	}
	resp, err := p.signedRequest(ctx, params)
	if err != nil {
		return fmt.Errorf("alicloud: %s failed: %w", action, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		return fmt.Errorf("alicloud: %s failed (HTTP %d): %s", action, resp.StatusCode, string(body))
	}
	return nil
}

func (p *AlicloudProvider) GetInstance(ctx context.Context, instanceID string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
}

func (p *AlicloudProvider) StartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StartInstance")
}

func (p *AlicloudProvider) StopInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StopInstance")
}

func (p *AlicloudProvider) RestartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "RebootInstance")
}

func (p *AlicloudProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	if !strings.HasSuffix(reqURL, ".aliyuncs.com") && !strings.Contains(reqURL, ".aliyuncs.com/") {
		return nil, fmt.Errorf("alicloud: URL must be on aliyuncs.com domain")
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	respHeaders := make(map[string]string)
	for k := range resp.Header {
		lower := strings.ToLower(k)
		if lower == "authorization" || lower == "set-cookie" {
			continue
		}
		respHeaders[k] = resp.Header.Get(k)
	}

	return &types.RawResponse{
		StatusCode: resp.StatusCode,
		Headers:    respHeaders,
		Body:       respBody,
	}, nil
}
