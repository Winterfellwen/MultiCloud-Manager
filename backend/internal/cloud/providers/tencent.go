package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"multicloud-manager/internal/cloud/types"
)

type TencentProvider struct {
	secretID   string
	secretKey  string
	httpClient *http.Client
}

func NewTencentProvider(creds map[string]string) *TencentProvider {
	return &TencentProvider{
		secretID:   creds["secret_id"],
		secretKey:  creds["secret_key"],
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *TencentProvider) GetType() string { return "tencent" }

func (p *TencentProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	action := "DescribeInstances"
	service := "cvm"
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	version := "2017-03-12"

	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, service, action, version, region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			InstanceSet []struct {
				InstanceId   string `json:"InstanceId"`
				InstanceName string `json:"InstanceName"`
				InstanceState string `json:"InstanceState"`
				Region       string `json:"Region"`
				CPU          int    `json:"CPU"`
				Memory       int    `json:"Memory"`
				InstanceType string `json:"InstanceType"`
				CreatedTime  string `json:"CreatedTime"`
			} `json:"InstanceSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var instances []types.Instance
	for _, inst := range result.Response.InstanceSet {
		status := "running"
		switch inst.InstanceState {
		case "RUNNING":
			status = "running"
		case "STOPPED":
			status = "stopped"
		default:
			status = "stopped"
		}

		var created time.Time
		if inst.CreatedTime != "" {
			created, _ = time.Parse("2006-01-02T15:04:05Z", inst.CreatedTime)
		}

		instances = append(instances, types.Instance{
			ID:           inst.InstanceId,
			Name:         inst.InstanceName,
			CloudType:    "tencent",
			Region:       inst.Region,
			Status:       status,
			InstanceType: inst.InstanceType,
			Spec: map[string]interface{}{
				"cpu":    inst.CPU,
				"memory": inst.Memory,
			},
			CreatedAt: created,
		})
	}

	return instances, nil
}

func (p *TencentProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("tencent GetInstance not implemented")
}

func (p *TencentProvider) StartInstance(ctx context.Context, id string) error {
	payload := map[string]interface{}{"InstanceIds": []string{id}}
	body, _ := json.Marshal(payload)
	_, err := p.tencentRequest(ctx, "cvm", "StartInstances", "2017-03-12", "", body)
	return err
}

func (p *TencentProvider) StopInstance(ctx context.Context, id string) error {
	payload := map[string]interface{}{"InstanceIds": []string{id}, "StoppedMode": "STOP_CHARGING"}
	body, _ := json.Marshal(payload)
	_, err := p.tencentRequest(ctx, "cvm", "StopInstances", "2017-03-12", "", body)
	return err
}

func (p *TencentProvider) RestartInstance(ctx context.Context, id string) error {
	payload := map[string]interface{}{"InstanceIds": []string{id}}
	body, _ := json.Marshal(payload)
	_, err := p.tencentRequest(ctx, "cvm", "RebootInstances", "2017-03-12", "", body)
	return err
}

func (p *TencentProvider) CreateInstance(ctx context.Context, params types.CreateInstanceParams) (string, error) {
	return "", fmt.Errorf("tencent CreateInstance not implemented")
}

func (p *TencentProvider) DeleteInstance(ctx context.Context, id string) error {
	return fmt.Errorf("tencent DeleteInstance not implemented")
}

func (p *TencentProvider) ListRegions(ctx context.Context) ([]types.Region, error) {
	return nil, fmt.Errorf("tencent ListRegions not implemented")
}

func (p *TencentProvider) tencentRequest(ctx context.Context, service, action, version, region string, body []byte) ([]byte, error) {
	timestamp := time.Now().Unix()
	date := time.Now().UTC().Format("2006-01-02")

	host := service + ".tencentcloudapi.com"
	endpoint := "https://" + host

	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-tc-action:%s\n", "application/json; charset=utf-8", strings.ToLower(host), strings.ToLower(action))
	signedHeaders := "content-type;host;x-tc-action"
	hashedPayload := sha256Hex(body)

	canonicalRequest := fmt.Sprintf("POST\n/\n\n%s\n%s\n%s", canonicalHeaders, signedHeaders, hashedPayload)

	credentialScope := fmt.Sprintf("%s/%s/tc3_request", date, service)
	stringToSign := fmt.Sprintf("TC3-HMAC-SHA256\n%d\n%s\n%s", timestamp, credentialScope, sha256Hex([]byte(canonicalRequest)))

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
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("tencent API %s error %d: %s", action, resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}


