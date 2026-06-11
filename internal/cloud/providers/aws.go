package providers

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/xml"
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

type AWSProvider struct {
	accessKeyID     string
	secretAccessKey string
	region          string
	httpClient      *http.Client
}

func NewAWSProvider(creds map[string]string) *AWSProvider {
	region := creds["region"]
	if region == "" {
		region = "us-east-1"
	}
	return &AWSProvider{
		accessKeyID:     creds["access_key_id"],
		secretAccessKey: creds["secret_access_key"],
		region:          region,
		httpClient:      &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *AWSProvider) GetType() string { return "aws" }

// --- SigV4 signing ---

func (p *AWSProvider) signRequest(req *http.Request, service string, body []byte) {
	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", sha256Hex(body))
	if req.Header.Get("Host") == "" {
		req.Header.Set("Host", req.URL.Host)
	}

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, p.region, service)

	// Canonical request
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalURI := req.URL.Path
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalQueryString := p.canonicalQuery(req.URL.Query())

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		req.URL.Host, sha256Hex(body), amzDate)

	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		sha256Hex(body),
	}, "\n")

	// String to sign
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	// Signing key
	signingKey := p.getSigningKey(dateStamp, service)
	signature := hmacSHA256Hex(signingKey, stringToSign)

	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		p.accessKeyID, credentialScope, signedHeaders, signature))
}

func (p *AWSProvider) canonicalQuery(params url.Values) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		vals := params[k]
		sort.Strings(vals)
		for _, v := range vals {
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

func (p *AWSProvider) getSigningKey(dateStamp, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+p.secretAccessKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(p.region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	return kSigning
}

func hmacSHA256Hex(key []byte, data string) string {
	return hex.EncodeToString(hmacSHA256(key, []byte(data)))
}

// --- EC2 API ---

type ec2DescribeResponse struct {
	ReservationSet []struct {
		InstancesSet []struct {
			InstanceID   string `xml:"instanceId"`
			Name         string // extracted from tags
			InstanceType string `xml:"instanceType"`
			Placement    struct {
				AvailabilityZone string `xml:"availabilityZone"`
			} `xml:"placement"`
			State struct {
				Code int    `xml:"code"`
				Name string `xml:"name"`
			} `xml:"instanceState"`
			TagSet []struct {
				Key   string `xml:"key"`
				Value string `xml:"value"`
			} `xml:"tagSet>item"`
		} `xml:"instancesSet>item"`
	} `xml:"reservationSet>item"`
}

func (p *AWSProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeInstances")
	params.Set("Version", "2016-11-15")
	params.Set("Filter.1.Name", "instance-state-name")
	params.Set("Filter.1.Value.1", "running")
	params.Set("Filter.1.Value.2", "stopped")
	params.Set("Filter.1.Value.3", "pending")

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "ec2", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result ec2DescribeResponse
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse response: %w", err)
	}

	var instances []types.Instance
	for _, res := range result.ReservationSet {
		for _, inst := range res.InstancesSet {
			name := ""
			for _, tag := range inst.TagSet {
				if tag.Key == "Name" {
					name = tag.Value
					break
				}
			}
			if name == "" {
				name = inst.InstanceID
			}
			status := "running"
			switch strings.ToLower(inst.State.Name) {
			case "running":
				status = "running"
			case "stopped":
				status = "stopped"
			case "pending":
				status = "pending"
			case "terminated", "shutting-down", "stopping":
				status = "terminated"
			}
			tags := make(map[string]string)
			for _, tag := range inst.TagSet {
				tags[tag.Key] = tag.Value
			}
			instances = append(instances, types.Instance{
				ID:           inst.InstanceID,
				Name:         name,
				CloudType:    "aws",
				Region:       inst.Placement.AvailabilityZone,
				Status:       status,
				InstanceType: inst.InstanceType,
				Spec: map[string]interface{}{
					"instance_type": inst.InstanceType,
					"state_code":    inst.State.Code,
				},
				Tags: tags,
			})
		}
	}
	log.Printf("AWS EC2: listed %d instances in %s", len(instances), region)
	return instances, nil
}

func (p *AWSProvider) instanceAction(ctx context.Context, instanceID, action string) error {
	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", p.region)
	params := url.Values{}
	params.Set("Action", action)
	params.Set("Version", "2016-11-15")
	params.Set("InstanceId.1", instanceID)

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "ec2", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		return fmt.Errorf("aws: %s failed (HTTP %d): %s", action, resp.StatusCode, string(body))
	}
	return nil
}

func (p *AWSProvider) GetInstance(ctx context.Context, instanceID string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
}

func (p *AWSProvider) StartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StartInstances")
}

func (p *AWSProvider) StopInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StopInstances")
}

func (p *AWSProvider) RestartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "RebootInstances")
}

func (p *AWSProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	if !strings.HasSuffix(reqURL, ".amazonaws.com") && !strings.Contains(reqURL, ".amazonaws.com/") {
		return nil, fmt.Errorf("aws: URL must be on amazonaws.com domain")
	}

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}
	p.signRequest(req, "ec2", body)
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
