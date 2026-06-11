package providers

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
)

type OracleProvider struct {
	userOCID    string
	tenancyOCID string
	fingerprint string
	region      string
	privateKey  *rsa.PrivateKey
	keyID       string
	httpClient  *http.Client
}

func NewOracleProvider(creds map[string]string) *OracleProvider {
	p := &OracleProvider{
		userOCID:    creds["user_ocid"],
		tenancyOCID: creds["tenancy_ocid"],
		fingerprint: creds["fingerprint"],
		region:      creds["region"],
		httpClient:  &http.Client{Timeout: 30 * time.Second},
		keyID:       fmt.Sprintf("%s/%s/%s", creds["tenancy_ocid"], creds["user_ocid"], creds["fingerprint"]),
	}

	if pkPEM := creds["private_key"]; pkPEM != "" {
		block, _ := pem.Decode([]byte(pkPEM))
		if block != nil {
			key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err == nil {
				if rsaKey, ok := key.(*rsa.PrivateKey); ok {
					p.privateKey = rsaKey
				}
			}
		}
	}

	return p
}

func (p *OracleProvider) GetType() string { return "oracle" }

func (p *OracleProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances?compartmentId=%s&limit=100", p.region, p.tenancyOCID)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var instances []struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		Region         string            `json:"region"`
		LifecycleState string            `json:"lifecycleState"`
		Shape          string            `json:"shape"`
		TimeCreated    string            `json:"timeCreated"`
		FreeformTags   map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &instances); err != nil {
		return nil, err
	}

	var result []types.Instance
	for _, inst := range instances {
		status := "running"
		switch inst.LifecycleState {
		case "RUNNING":
			status = "running"
		case "STOPPED":
			status = "stopped"
		case "PROVISIONING", "STARTING":
			status = "pending"
		case "TERMINATED", "TERMINATING":
			status = "terminated"
		default:
			status = "stopped"
		}

		result = append(result, types.Instance{
			ID:           inst.ID,
			Name:         inst.DisplayName,
			CloudType:    "oracle",
			Region:       inst.Region,
			Status:       status,
			InstanceType: inst.Shape,
			Spec: map[string]interface{}{
				"shape": inst.Shape,
			},
			Tags: inst.FreeformTags,
		})
	}

	return result, nil
}

func (p *OracleProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
}

func (p *OracleProvider) StartInstance(ctx context.Context, id string) error {
	body := map[string]string{"action": "START"}
	data, _ := json.Marshal(body)
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances/%s", p.region, id)
	_, err := p.ociRequest(ctx, "POST", endpoint, data)
	return err
}

func (p *OracleProvider) StopInstance(ctx context.Context, id string) error {
	body := map[string]string{"action": "STOP"}
	data, _ := json.Marshal(body)
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances/%s", p.region, id)
	_, err := p.ociRequest(ctx, "POST", endpoint, data)
	return err
}

func (p *OracleProvider) RestartInstance(ctx context.Context, id string) error {
	body := map[string]string{"action": "SOFTRESET"}
	data, _ := json.Marshal(body)
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances/%s", p.region, id)
	_, err := p.ociRequest(ctx, "POST", endpoint, data)
	return err
}

func (p *OracleProvider) ociRequest(ctx context.Context, method, reqURL string, body []byte) ([]byte, error) {
	if p.privateKey == nil {
		return nil, fmt.Errorf("oracle: private key not loaded")
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Host = req.URL.Host
	date := time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
	req.Header.Set("Date", date)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	signedHeaders := []string{"(request-target)", "date", "host"}
	signingParts := []string{
		fmt.Sprintf("(request-target): %s %s", strings.ToLower(method), req.URL.RequestURI()),
		fmt.Sprintf("date: %s", date),
		fmt.Sprintf("host: %s", req.Host),
	}

	if body != nil {
		hash := sha256.Sum256(body)
		b64 := base64.StdEncoding.EncodeToString(hash[:])
		req.Header.Set("x-content-sha256", b64)
		signedHeaders = append(signedHeaders, "x-content-sha256")
		signingParts = append(signingParts, fmt.Sprintf("x-content-sha256: %s", b64))
	}

	sigBase := strings.Join(signingParts, "\n")
	hash := sha256.Sum256([]byte(sigBase))
	sigBytes, err := rsa.SignPKCS1v15(rand.Reader, p.privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return nil, fmt.Errorf("oracle signing: %w", err)
	}
	b64Sig := base64.StdEncoding.EncodeToString(sigBytes)

	authHeader := fmt.Sprintf(
		`Signature version="1",keyId="%s",algorithm="rsa-sha256",headers="%s",signature="%s"`,
		p.keyID, strings.Join(signedHeaders, " "), b64Sig)
	req.Header.Set("Authorization", authHeader)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("oracle API error %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func (p *OracleProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	if p.privateKey == nil {
		return nil, fmt.Errorf("oracle: private key not loaded")
	}

	// Validate URL — only allow Oracle Cloud endpoints
	if !strings.HasSuffix(reqURL, ".oraclecloud.com") &&
		!strings.Contains(reqURL, ".oraclecloud.com/") &&
		!strings.Contains(reqURL, ".oraclecloud.com?") {
		return nil, fmt.Errorf("oracle: URL must be an oraclecloud.com domain")
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Host = req.URL.Host
	date := time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
	req.Header.Set("Date", date)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	signedHeaders := []string{"(request-target)", "date", "host"}
	signingParts := []string{
		fmt.Sprintf("(request-target): %s %s", strings.ToLower(method), req.URL.RequestURI()),
		fmt.Sprintf("date: %s", date),
		fmt.Sprintf("host: %s", req.Host),
	}

	if body != nil {
		hash := sha256.Sum256(body)
		b64 := base64.StdEncoding.EncodeToString(hash[:])
		req.Header.Set("x-content-sha256", b64)
		signedHeaders = append(signedHeaders, "x-content-sha256")
		signingParts = append(signingParts, fmt.Sprintf("x-content-sha256: %s", b64))
	}

	sigBase := strings.Join(signingParts, "\n")
	hash := sha256.Sum256([]byte(sigBase))
	sigBytes, err := rsa.SignPKCS1v15(rand.Reader, p.privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return nil, fmt.Errorf("oracle signing: %w", err)
	}
	b64Sig := base64.StdEncoding.EncodeToString(sigBytes)

	authHeader := fmt.Sprintf(
		`Signature version="1",keyId="%s",algorithm="rsa-sha256",headers="%s",signature="%s"`,
		p.keyID, strings.Join(signedHeaders, " "), b64Sig)
	req.Header.Set("Authorization", authHeader)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	respHeaders := map[string]string{}
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
