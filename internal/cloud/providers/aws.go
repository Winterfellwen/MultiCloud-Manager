package providers

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
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

func (p *AWSProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	if region == "" {
		region = p.region
	}
	switch resourceType {
	case types.ResourceTypeInstance:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#InstanceDetails:instanceId=%s", region, region, id)
	case types.ResourceTypeVolume:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#VolumeDetails:volumeId=%s", region, region, id)
	case types.ResourceTypeNetwork:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/vpcconsole/home?region=%s#VpcDetails:vpcId=%s", region, region, id)
	case types.ResourceTypeDatabase:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/rds/home?region=%s#database:id=%s", region, region, id)
	case types.ResourceTypeLoadBalancer:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#LoadBalancer:loadBalancerArn=%s", region, region, url.QueryEscape(id))
	case types.ResourceTypeBucket:
		return fmt.Sprintf("https://s3.console.aws.amazon.com/s3/buckets/%s", id)
	case types.ResourceTypeCluster:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ecs/home?region=%s#/clusters/%s", region, region, id)
	case types.ResourceTypeFunction:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/lambda/home?region=%s#/functions/%s", region, region, id)
	case types.ResourceTypeDNSZone:
		return fmt.Sprintf("https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/%s", id)
	case types.ResourceTypeCertificate:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/acm/home?region=%s#/certificates/%s", region, region, id)
	case types.ResourceTypeRedis:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/elasticache/home?region=%s#/redis/%s", region, region, id)
	case types.ResourceTypeMQ:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/mq/home?region=%s#/brokers/%s", region, region, id)
	case types.ResourceTypeCDN:
		return fmt.Sprintf("https://console.aws.amazon.com/cloudfront/v3/home#/distributions/%s", id)
	case types.ResourceTypeWAF:
		return fmt.Sprintf("https://console.aws.amazon.com/wafv2/homev2/web-acl/details/%s?region=%s", id, region)
	case types.ResourceTypeNATGateway:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/vpcconsole/home?region=%s#NatGatewayDetails:natGatewayId=%s", region, region, id)
	case types.ResourceTypeImage:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#ImageDetails:imageId=%s", region, region, id)
	case types.ResourceTypeAPIGateway:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/apigateway/home?region=%s#/restapis/%s", region, region, id)
	case types.ResourceTypeLogService:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#logsV2:log-groups/log-group/%s", region, region, url.QueryEscape(id))
	case types.ResourceTypeSecurity:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/vpcconsole/home?region=%s#SecurityGroup:groupId=%s", region, region, id)
	case types.ResourceTypeRegistry:
		return fmt.Sprintf("https://%s.console.aws.amazon.com/ecr/home?region=%s#/repositories/%s", region, region, id)
	default:
		return fmt.Sprintf("https://%s.console.aws.amazon.com", region)
	}
}

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

func (p *AWSProvider) GetInstance(ctx context.Context, instanceID string) (*types.Instance, error) {
	region := p.region

	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeInstances")
	params.Set("Version", "2016-11-15")
	params.Set("InstanceId.1", instanceID)

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
			log.Printf("AWS EC2: got instance %s in %s", instanceID, region)
			return &types.Instance{
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
			}, nil
		}
	}
	return nil, fmt.Errorf("aws: instance %s not found", instanceID)
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

func (p *AWSProvider) StartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StartInstances")
}

func (p *AWSProvider) StopInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StopInstances")
}

func (p *AWSProvider) RestartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "RebootInstances")
}

// --- Volumes (EC2 DescribeVolumes) ---

func (p *AWSProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeVolumes")
	params.Set("Version", "2016-11-15")

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

	var result struct {
		VolumeSet []struct {
			VolumeID   string `xml:"volumeId"`
			Size       int    `xml:"size"`
			VolumeType string `xml:"volumeType"`
			Iops       int    `xml:"iops"`
			Status     string `xml:"status"`
			Encrypted  bool   `xml:"encrypted"`
			CreateTime string `xml:"createTime"`
			AttachmentSet []struct {
				InstanceID string `xml:"instanceId"`
			} `xml:"attachmentSet>item"`
			TagSet []struct {
				Key   string `xml:"key"`
				Value string `xml:"value"`
			} `xml:"tagSet>item"`
		} `xml:"volumeSet>item"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse volumes response: %w", err)
	}

	var volumes []types.Volume
	for _, vol := range result.VolumeSet {
		name := ""
		tags := make(map[string]string)
		for _, tag := range vol.TagSet {
			tags[tag.Key] = tag.Value
			if tag.Key == "Name" {
				name = tag.Value
			}
		}
		if name == "" {
			name = vol.VolumeID
		}
		attachedTo := ""
		if len(vol.AttachmentSet) > 0 {
			attachedTo = vol.AttachmentSet[0].InstanceID
		}
		volumes = append(volumes, types.Volume{
			ID:         vol.VolumeID,
			Name:       name,
			CloudType:  "aws",
			Region:     region,
			Status:     vol.Status,
			VolumeType: vol.VolumeType,
			SizeGB:     vol.Size,
			IOPS:       vol.Iops,
			AttachedTo: attachedTo,
			Encrypted:  vol.Encrypted,
			Spec: map[string]interface{}{
				"volume_type": vol.VolumeType,
				"iops":        vol.Iops,
				"encrypted":   vol.Encrypted,
				"create_time": vol.CreateTime,
			},
			Tags: tags,
		})
	}
	log.Printf("AWS EC2: listed %d volumes in %s", len(volumes), region)
	return volumes, nil
}

func (p *AWSProvider) GetVolume(ctx context.Context, volumeID string) (*types.Volume, error) {
	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", p.region)
	params := url.Values{}
	params.Set("Action", "DescribeVolumes")
	params.Set("Version", "2016-11-15")
	params.Set("VolumeId.1", volumeID)

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

	var result struct {
		VolumeSet []struct {
			VolumeID   string `xml:"volumeId"`
			Size       int    `xml:"size"`
			VolumeType string `xml:"volumeType"`
			Iops       int    `xml:"iops"`
			Status     string `xml:"status"`
			Encrypted  bool   `xml:"encrypted"`
			CreateTime string `xml:"createTime"`
			AttachmentSet []struct {
				InstanceID string `xml:"instanceId"`
			} `xml:"attachmentSet>item"`
			TagSet []struct {
				Key   string `xml:"key"`
				Value string `xml:"value"`
			} `xml:"tagSet>item"`
		} `xml:"volumeSet>item"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse volumes response: %w", err)
	}

	if len(result.VolumeSet) == 0 {
		return nil, fmt.Errorf("aws: volume %s not found", volumeID)
	}

	vol := result.VolumeSet[0]
	name := ""
	tags := make(map[string]string)
	for _, tag := range vol.TagSet {
		tags[tag.Key] = tag.Value
		if tag.Key == "Name" {
			name = tag.Value
		}
	}
	if name == "" {
		name = vol.VolumeID
	}
	attachedTo := ""
	if len(vol.AttachmentSet) > 0 {
		attachedTo = vol.AttachmentSet[0].InstanceID
	}
	log.Printf("AWS EC2: got volume %s", volumeID)
	return &types.Volume{
		ID:         vol.VolumeID,
		Name:       name,
		CloudType:  "aws",
		Region:     p.region,
		Status:     vol.Status,
		VolumeType: vol.VolumeType,
		SizeGB:     vol.Size,
		IOPS:       vol.Iops,
		AttachedTo: attachedTo,
		Encrypted:  vol.Encrypted,
		Spec: map[string]interface{}{
			"volume_type": vol.VolumeType,
			"iops":        vol.Iops,
			"encrypted":   vol.Encrypted,
			"create_time": vol.CreateTime,
		},
		Tags: tags,
	}, nil
}

// --- Networks (EC2 DescribeVpcs) ---

func (p *AWSProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeVpcs")
	params.Set("Version", "2016-11-15")

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

	var result struct {
		VpcSet []struct {
			VpcID     string `xml:"vpcId"`
			CidrBlock string `xml:"cidrBlock"`
			State     string `xml:"state"`
			IsDefault bool   `xml:"isDefault"`
			TagSet    []struct {
				Key   string `xml:"key"`
				Value string `xml:"value"`
			} `xml:"tagSet>item"`
		} `xml:"vpcSet>item"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse vpcs response: %w", err)
	}

	var networks []types.Network
	for _, vpc := range result.VpcSet {
		name := ""
		tags := make(map[string]string)
		for _, tag := range vpc.TagSet {
			tags[tag.Key] = tag.Value
			if tag.Key == "Name" {
				name = tag.Value
			}
		}
		if name == "" {
			name = vpc.VpcID
		}
		networkType := "vpc"
		if vpc.IsDefault {
			networkType = "default_vpc"
		}
		networks = append(networks, types.Network{
			ID:          vpc.VpcID,
			Name:        name,
			CloudType:   "aws",
			Region:      region,
			Status:      vpc.State,
			NetworkType: networkType,
			CIDR:        vpc.CidrBlock,
			Spec: map[string]interface{}{
				"cidr_block": vpc.CidrBlock,
				"is_default": vpc.IsDefault,
			},
			Tags: tags,
		})
	}
	log.Printf("AWS EC2: listed %d VPCs in %s", len(networks), region)
	return networks, nil
}

func (p *AWSProvider) GetNetwork(ctx context.Context, networkID string) (*types.Network, error) {
	endpoint := fmt.Sprintf("https://ec2.%s.amazonaws.com", p.region)
	params := url.Values{}
	params.Set("Action", "DescribeVpcs")
	params.Set("Version", "2016-11-15")
	params.Set("VpcId.1", networkID)

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

	var result struct {
		VpcSet []struct {
			VpcID     string `xml:"vpcId"`
			CidrBlock string `xml:"cidrBlock"`
			State     string `xml:"state"`
			IsDefault bool   `xml:"isDefault"`
			TagSet    []struct {
				Key   string `xml:"key"`
				Value string `xml:"value"`
			} `xml:"tagSet>item"`
		} `xml:"vpcSet>item"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse vpcs response: %w", err)
	}

	if len(result.VpcSet) == 0 {
		return nil, fmt.Errorf("aws: network %s not found", networkID)
	}

	vpc := result.VpcSet[0]
	name := ""
	tags := make(map[string]string)
	for _, tag := range vpc.TagSet {
		tags[tag.Key] = tag.Value
		if tag.Key == "Name" {
			name = tag.Value
		}
	}
	if name == "" {
		name = vpc.VpcID
	}
	networkType := "vpc"
	if vpc.IsDefault {
		networkType = "default_vpc"
	}
	log.Printf("AWS EC2: got VPC %s", networkID)
	return &types.Network{
		ID:          vpc.VpcID,
		Name:        name,
		CloudType:   "aws",
		Region:      p.region,
		Status:      vpc.State,
		NetworkType: networkType,
		CIDR:        vpc.CidrBlock,
		Spec: map[string]interface{}{
			"cidr_block": vpc.CidrBlock,
			"is_default": vpc.IsDefault,
		},
		Tags: tags,
	}, nil
}

// --- Databases (RDS DescribeDBInstances) ---

func (p *AWSProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://rds.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeDBInstances")
	params.Set("Version", "2014-10-31")

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "rds", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		DescribeDBInstancesResult struct {
			DBInstances []struct {
				DBInstanceIdentifier string `xml:"DBInstanceIdentifier"`
				DBInstanceClass      string `xml:"DBInstanceClass"`
				Engine               string `xml:"Engine"`
				EngineVersion        string `xml:"EngineVersion"`
				DBInstanceStatus     string `xml:"DBInstanceStatus"`
				Endpoint             struct {
					Address string `xml:"Address"`
					Port    int    `xml:"Port"`
				} `xml:"Endpoint"`
				DBInstanceArn string `xml:"DBInstanceArn"`
			} `xml:"DBInstance"`
		} `xml:"DescribeDBInstancesResult"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse rds response: %w", err)
	}

	var databases []types.Database
	for _, db := range result.DescribeDBInstancesResult.DBInstances {
		endpointStr := ""
		if db.Endpoint.Address != "" {
			endpointStr = fmt.Sprintf("%s:%d", db.Endpoint.Address, db.Endpoint.Port)
		}
		databases = append(databases, types.Database{
			ID:          db.DBInstanceIdentifier,
			Name:        db.DBInstanceIdentifier,
			CloudType:   "aws",
			Region:      region,
			Status:      db.DBInstanceStatus,
			Engine:      db.Engine,
			EngineVer:   db.EngineVersion,
			InstanceCls: db.DBInstanceClass,
			Spec: map[string]interface{}{
				"endpoint":    endpointStr,
				"engine":      db.Engine,
				"engine_ver":  db.EngineVersion,
				"instance_cls": db.DBInstanceClass,
				"db_arn":      db.DBInstanceArn,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS RDS: listed %d databases in %s", len(databases), region)
	return databases, nil
}

func (p *AWSProvider) GetDatabase(ctx context.Context, databaseID string) (*types.Database, error) {
	endpoint := fmt.Sprintf("https://rds.%s.amazonaws.com", p.region)
	params := url.Values{}
	params.Set("Action", "DescribeDBInstances")
	params.Set("Version", "2014-10-31")
	params.Set("DBInstanceIdentifier", databaseID)

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "rds", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		DescribeDBInstancesResult struct {
			DBInstances []struct {
				DBInstanceIdentifier     string `xml:"DBInstanceIdentifier"`
				DBInstanceClass          string `xml:"DBInstanceClass"`
				DBName                   string `xml:"DBName"`
				Engine                   string `xml:"Engine"`
				EngineVersion            string `xml:"EngineVersion"`
				DBInstanceStatus         string `xml:"DBInstanceStatus"`
				MasterUsername           string `xml:"MasterUsername"`
				Endpoint                 struct {
					Address string `xml:"Address"`
					Port    int    `xml:"Port"`
				} `xml:"Endpoint"`
				DBInstanceArn            string            `xml:"DBInstanceArn"`
				InstanceCreateTime       string            `xml:"InstanceCreateTime"`
				MultiAZ                  bool              `xml:"MultiAZ"`
				PubliclyAccessible       bool              `xml:"PubliclyAccessible"`
				StorageEncrypted         bool              `xml:"StorageEncrypted"`
				KmsKeyId                 string            `xml:"KmsKeyId"`
				BackupRetentionPeriod    int               `xml:"BackupRetentionPeriod"`
				PreferredBackupWindow    string            `xml:"PreferredBackupWindow"`
				PreferredMaintenanceWindow string          `xml:"PreferredMaintenanceWindow"`
				AutoMinorVersionUpgrade   bool             `xml:"AutoMinorVersionUpgrade"`
				CACertificateId           string           `xml:"CACertificateId"`
				DBSubnetGroup             string           `xml:"DBSubnetGroup"`
				AllocatedStorage          int              `xml:"AllocatedStorage"`
			} `xml:"DBInstance"`
		} `xml:"DescribeDBInstancesResult"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse rds response: %w", err)
	}

	if len(result.DescribeDBInstancesResult.DBInstances) == 0 {
		return nil, fmt.Errorf("aws: database %s not found", databaseID)
	}

	db := result.DescribeDBInstancesResult.DBInstances[0]
	endpointStr := ""
	if db.Endpoint.Address != "" {
		endpointStr = fmt.Sprintf("%s:%d", db.Endpoint.Address, db.Endpoint.Port)
	}
	log.Printf("AWS RDS: got database %s", databaseID)
	return &types.Database{
		ID:           db.DBInstanceIdentifier,
		Name:         db.DBInstanceIdentifier,
		CloudType:    "aws",
		Region:       p.region,
		Status:       db.DBInstanceStatus,
		Engine:       db.Engine,
		EngineVer:    db.EngineVersion,
		InstanceCls:  db.DBInstanceClass,
		StorageGB:    db.AllocatedStorage,
		Endpoint:     db.Endpoint.Address,
		Port:         db.Endpoint.Port,
		MasterUser:   db.MasterUsername,
		MultiAZ:      db.MultiAZ,
		PubliclyAccessible: db.PubliclyAccessible,
		StorageEncrypted:    db.StorageEncrypted,
		BackupRetention:    db.BackupRetentionPeriod,
		PreferredBackup:     db.PreferredBackupWindow,
		LastModified:   db.InstanceCreateTime,
		DBName:        db.DBName,
		AutoMinorVersionUpgrade: db.AutoMinorVersionUpgrade,
		CACertificateID:        db.CACertificateId,
		DBSubnetGroup:           db.DBSubnetGroup,
		Spec: map[string]interface{}{
			"endpoint":                endpointStr,
			"engine":                  db.Engine,
			"engine_ver":              db.EngineVersion,
			"instance_cls":            db.DBInstanceClass,
			"db_arn":                  db.DBInstanceArn,
			"multi_az":                db.MultiAZ,
			"publicly_accessible":     db.PubliclyAccessible,
			"storage_encrypted":       db.StorageEncrypted,
			"kms_key_id":              db.KmsKeyId,
			"backup_retention_period": db.BackupRetentionPeriod,
			"preferred_backup_window": db.PreferredBackupWindow,
			"preferred_maintenance_window": db.PreferredMaintenanceWindow,
			"auto_minor_version_upgrade":  db.AutoMinorVersionUpgrade,
			"ca_certificate_id":           db.CACertificateId,
			"db_subnet_group":            db.DBSubnetGroup,
			"allocated_storage":          db.AllocatedStorage,
		},
		Tags: map[string]string{},
	}, nil
}

// --- Load Balancers (ELBv2 DescribeLoadBalancers) ---

func (p *AWSProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://elasticloadbalancing.%s.amazonaws.com", region)
	params := url.Values{}
	params.Set("Action", "DescribeLoadBalancers")
	params.Set("Version", "2015-12-01")

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "elasticloadbalancing", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		DescribeLoadBalancersResult struct {
			LoadBalancers []struct {
				LoadBalancerArn  string `xml:"LoadBalancerArn"`
				LoadBalancerName string `xml:"LoadBalancerName"`
				Scheme           string `xml:"Scheme"`
				State            struct {
					Code string `xml:"Code"`
				} `xml:"State"`
				Type  string `xml:"Type"`
				VpcID string `xml:"VpcId"`
			} `xml:"member"`
		} `xml:"DescribeLoadBalancersResult"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse elb response: %w", err)
	}

	var lbs []types.LoadBalancer
	for _, lb := range result.DescribeLoadBalancersResult.LoadBalancers {
		lbs = append(lbs, types.LoadBalancer{
			ID:        lb.LoadBalancerArn,
			Name:      lb.LoadBalancerName,
			CloudType: "aws",
			Region:    region,
			Status:    lb.State.Code,
			LBType:    lb.Type,
			Scheme:    lb.Scheme,
			Spec: map[string]interface{}{
				"scheme":        lb.Scheme,
				"type":          lb.Type,
				"vpc_id":        lb.VpcID,
				"load_balancer_arn": lb.LoadBalancerArn,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS ELB: listed %d load balancers in %s", len(lbs), region)
	return lbs, nil
}

func (p *AWSProvider) GetLoadBalancer(ctx context.Context, lbID string) (*types.LoadBalancer, error) {
	endpoint := fmt.Sprintf("https://elasticloadbalancing.%s.amazonaws.com", p.region)
	params := url.Values{}
	params.Set("Action", "DescribeLoadBalancers")
	params.Set("Version", "2015-12-01")
	params.Set("LoadBalancerArns.member.1", lbID)

	reqURL := endpoint + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "elasticloadbalancing", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		DescribeLoadBalancersResult struct {
			LoadBalancers []struct {
				LoadBalancerArn  string `xml:"LoadBalancerArn"`
				LoadBalancerName string `xml:"LoadBalancerName"`
				Scheme           string `xml:"Scheme"`
				State            struct {
					Code string `xml:"Code"`
				} `xml:"State"`
				Type  string `xml:"Type"`
				VpcID string `xml:"VpcId"`
			} `xml:"member"`
		} `xml:"DescribeLoadBalancersResult"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse elb response: %w", err)
	}

	if len(result.DescribeLoadBalancersResult.LoadBalancers) == 0 {
		return nil, fmt.Errorf("aws: load balancer %s not found", lbID)
	}

	lb := result.DescribeLoadBalancersResult.LoadBalancers[0]
	log.Printf("AWS ELB: got load balancer %s", lbID)
	return &types.LoadBalancer{
		ID:        lb.LoadBalancerArn,
		Name:      lb.LoadBalancerName,
		CloudType: "aws",
		Region:    p.region,
		Status:    lb.State.Code,
		LBType:    lb.Type,
		Scheme:    lb.Scheme,
		Spec: map[string]interface{}{
			"scheme":           lb.Scheme,
			"type":             lb.Type,
			"vpc_id":           lb.VpcID,
			"load_balancer_arn": lb.LoadBalancerArn,
		},
		Tags: map[string]string{},
	}, nil
}

// --- Buckets (S3 ListBuckets / HeadBucket) ---

func (p *AWSProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	reqURL := "https://s3.amazonaws.com/"
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "s3", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Buckets []struct {
			Name         string `xml:"Name"`
			CreationDate string `xml:"CreationDate"`
		} `xml:"Buckets>Bucket"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse s3 response: %w", err)
	}

	var buckets []types.Bucket
	for _, b := range result.Buckets {
		buckets = append(buckets, types.Bucket{
			ID:        b.Name,
			Name:      b.Name,
			CloudType: "aws",
			Region:    "us-east-1",
			Status:    "available",
			Spec: map[string]interface{}{
				"creation_date": b.CreationDate,
				"global":        true,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS S3: listed %d buckets", len(buckets))
	return buckets, nil
}

func (p *AWSProvider) GetBucket(ctx context.Context, bucketID string) (*types.Bucket, error) {
	// S3 HeadBucket to check existence and get region
	reqURL := fmt.Sprintf("https://%s.s3.amazonaws.com/", bucketID)
	req, err := http.NewRequestWithContext(ctx, "HEAD", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "s3", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return nil, fmt.Errorf("aws: bucket %s not found (HTTP %d): %s", bucketID, resp.StatusCode, string(body))
	}

	bucketRegion := resp.Header.Get("x-amz-bucket-region")
	if bucketRegion == "" {
		bucketRegion = "us-east-1"
	}
	log.Printf("AWS S3: got bucket %s", bucketID)
	return &types.Bucket{
		ID:        bucketID,
		Name:      bucketID,
		CloudType: "aws",
		Region:    bucketRegion,
		Status:    "available",
		Spec: map[string]interface{}{
			"region": bucketRegion,
		},
		Tags: map[string]string{},
	}, nil
}

// --- Clusters (ECS ListClusters + DescribeClusters) ---

func (p *AWSProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://ecs.%s.amazonaws.com", region)

	// Step 1: ListClusters
	listReq, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/", bytes.NewReader([]byte("{}")))
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	listReq.Header.Set("Content-Type", "application/x-amz-json-1.1")
	listReq.Header.Set("X-Amz-Target", "AmazonEC2ContainerServiceV20141113.ListClusters")
	p.signRequest(listReq, "ecs", []byte("{}"))

	resp, err := p.httpClient.Do(listReq)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var listResult struct {
		ClusterArns []string `json:"clusterArns"`
	}
	if err := json.Unmarshal(body, &listResult); err != nil {
		return nil, fmt.Errorf("aws: parse ecs list response: %w", err)
	}

	if len(listResult.ClusterArns) == 0 {
		log.Printf("AWS ECS: listed 0 clusters in %s", region)
		return nil, nil
	}

	// Step 2: DescribeClusters
	describeBody := map[string]interface{}{
		"clusters": listResult.ClusterArns,
	}
	describeJSON, _ := json.Marshal(describeBody)

	descReq, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/", bytes.NewReader(describeJSON))
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	descReq.Header.Set("Content-Type", "application/x-amz-json-1.1")
	descReq.Header.Set("X-Amz-Target", "AmazonEC2ContainerServiceV20141113.DescribeClusters")
	p.signRequest(descReq, "ecs", describeJSON)

	resp2, err := p.httpClient.Do(descReq)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp2.Body.Close()
	body2, _ := io.ReadAll(io.LimitReader(resp2.Body, 1<<20))

	if resp2.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp2.StatusCode, string(body2))
	}

	var descResult struct {
		Clusters []struct {
			ClusterArn                     string `json:"clusterArn"`
			ClusterName                    string `json:"clusterName"`
			Status                         string `json:"status"`
			RunningTasksCount              int    `json:"runningTasksCount"`
			PendingTasksCount              int    `json:"pendingTasksCount"`
			ActiveServicesCount            int    `json:"activeServicesCount"`
			RegisteredContainerInstancesCount int    `json:"registeredContainerInstancesCount"`
		} `json:"clusters"`
	}
	if err := json.Unmarshal(body2, &descResult); err != nil {
		return nil, fmt.Errorf("aws: parse ecs describe response: %w", err)
	}

	var clusters []types.Cluster
	for _, c := range descResult.Clusters {
		clusters = append(clusters, types.Cluster{
			ID:         c.ClusterArn,
			Name:       c.ClusterName,
			CloudType:  "aws",
			Region:     region,
			Status:     strings.ToLower(c.Status),
			ClusterType: "ecs",
			NodeCount:  c.RegisteredContainerInstancesCount,
			Spec: map[string]interface{}{
				"cluster_arn":          c.ClusterArn,
				"running_tasks":        c.RunningTasksCount,
				"pending_tasks":        c.PendingTasksCount,
				"active_services":      c.ActiveServicesCount,
				"registered_instances": c.RegisteredContainerInstancesCount,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS ECS: listed %d clusters in %s", len(clusters), region)
	return clusters, nil
}

func (p *AWSProvider) GetCluster(ctx context.Context, clusterID string) (*types.Cluster, error) {
	endpoint := fmt.Sprintf("https://ecs.%s.amazonaws.com", p.region)

	describeBody := map[string]interface{}{
		"clusters": []string{clusterID},
	}
	describeJSON, _ := json.Marshal(describeBody)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/", bytes.NewReader(describeJSON))
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-amz-json-1.1")
	req.Header.Set("X-Amz-Target", "AmazonEC2ContainerServiceV20141113.DescribeClusters")
	p.signRequest(req, "ecs", describeJSON)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var descResult struct {
		Clusters []struct {
			ClusterArn                     string `json:"clusterArn"`
			ClusterName                    string `json:"clusterName"`
			Status                         string `json:"status"`
			RunningTasksCount              int    `json:"runningTasksCount"`
			PendingTasksCount              int    `json:"pendingTasksCount"`
			ActiveServicesCount            int    `json:"activeServicesCount"`
			RegisteredContainerInstancesCount int    `json:"registeredContainerInstancesCount"`
		} `json:"clusters"`
	}
	if err := json.Unmarshal(body, &descResult); err != nil {
		return nil, fmt.Errorf("aws: parse ecs describe response: %w", err)
	}

	if len(descResult.Clusters) == 0 {
		return nil, fmt.Errorf("aws: cluster %s not found", clusterID)
	}

	c := descResult.Clusters[0]
	log.Printf("AWS ECS: got cluster %s", clusterID)
	return &types.Cluster{
		ID:          c.ClusterArn,
		Name:        c.ClusterName,
		CloudType:   "aws",
		Region:      p.region,
		Status:      strings.ToLower(c.Status),
		ClusterType: "ecs",
		NodeCount:   c.RegisteredContainerInstancesCount,
		Spec: map[string]interface{}{
			"cluster_arn":          c.ClusterArn,
			"running_tasks":        c.RunningTasksCount,
			"pending_tasks":        c.PendingTasksCount,
			"active_services":      c.ActiveServicesCount,
			"registered_instances": c.RegisteredContainerInstancesCount,
		},
		Tags: map[string]string{},
	}, nil
}

// --- Functions (Lambda ListFunctions / GetFunction) ---

func (p *AWSProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://lambda.%s.amazonaws.com", region)
	reqURL := endpoint + "/2015-03-31/functions/"
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "lambda", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Functions []struct {
			FunctionName string `json:"FunctionName"`
			FunctionArn  string `json:"FunctionArn"`
			Runtime      string `json:"Runtime"`
			Handler      string `json:"Handler"`
			Timeout      int    `json:"Timeout"`
			MemorySize   int    `json:"MemorySize"`
			CodeSize     int64  `json:"CodeSize"`
		} `json:"Functions"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse lambda response: %w", err)
	}

	var functions []types.Function
	for _, fn := range result.Functions {
		status := "active"
		functions = append(functions, types.Function{
			ID:         fn.FunctionArn,
			Name:       fn.FunctionName,
			CloudType:  "aws",
			Region:     region,
			Status:     status,
			Runtime:    fn.Runtime,
			Handler:    fn.Handler,
			Timeout:    fn.Timeout,
			MemorySize: fn.MemorySize,
			Spec: map[string]interface{}{
				"function_arn": fn.FunctionArn,
				"runtime":      fn.Runtime,
				"handler":      fn.Handler,
				"timeout":      fn.Timeout,
				"memory_size":  fn.MemorySize,
				"code_size":    fn.CodeSize,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS Lambda: listed %d functions in %s", len(functions), region)
	return functions, nil
}

func (p *AWSProvider) GetFunction(ctx context.Context, functionID string) (*types.Function, error) {
	endpoint := fmt.Sprintf("https://lambda.%s.amazonaws.com", p.region)
	reqURL := endpoint + "/2015-03-31/functions/" + url.PathEscape(functionID)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "lambda", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Configuration struct {
			FunctionName         string            `json:"FunctionName"`
			FunctionArn          string            `json:"FunctionArn"`
			Runtime              string            `json:"Runtime"`
			Handler             string            `json:"Handler"`
			Timeout              int               `json:"Timeout"`
			MemorySize          int               `json:"MemorySize"`
			CodeSize            int64             `json:"CodeSize"`
			LastModified        string            `json:"LastModified"`
			Description         string            `json:"Description"`
			Version             string            `json:"Version"`
			Architectures       []string          `json:"Architectures"`
			EphemeralStorage    struct {
				Size int `json:"Size"`
			} `json:"EphemeralStorage"`
			TracingConfig struct {
				Mode string `json:"Mode"`
			} `json:"TracingConfig"`
			PackageType string `json:"PackageType"`
			Environment struct {
				Variables map[string]string `json:"Variables"`
			} `json:"Environment"`
		} `json:"Configuration"`
		Tags map[string]string `json:"Tags"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse lambda response: %w", err)
	}

	cfg := result.Configuration
	log.Printf("AWS Lambda: got function %s", functionID)

	fn := &types.Function{
		ID:            cfg.FunctionArn,
		Name:          cfg.FunctionName,
		CloudType:     "aws",
		Region:        p.region,
		Status:        "active",
		Runtime:       cfg.Runtime,
		Handler:       cfg.Handler,
		Timeout:       cfg.Timeout,
		MemorySize:    cfg.MemorySize,
		LastModified:  cfg.LastModified,
		Description:   cfg.Description,
		Version:       cfg.Version,
	}
	if cfg.Architectures != nil {
		fn.Architectures = cfg.Architectures
	}
	fn.EphemeralStorage = cfg.EphemeralStorage.Size
	fn.TracingConfig = cfg.TracingConfig.Mode
	fn.PackageType = cfg.PackageType
	if cfg.Environment.Variables != nil {
		fn.Environment = cfg.Environment.Variables
	}
	if result.Tags != nil {
		fn.Tags = result.Tags
	} else {
		fn.Tags = map[string]string{}
	}
	fn.Spec = map[string]interface{}{
		"function_arn":      cfg.FunctionArn,
		"runtime":           cfg.Runtime,
		"handler":           cfg.Handler,
		"timeout":           cfg.Timeout,
		"memory_size":       cfg.MemorySize,
		"code_size":         cfg.CodeSize,
		"last_modified":     cfg.LastModified,
		"description":       cfg.Description,
		"version":          cfg.Version,
		"architectures":     cfg.Architectures,
		"ephemeral_storage": cfg.EphemeralStorage.Size,
		"tracing_config":   cfg.TracingConfig.Mode,
		"package_type":     cfg.PackageType,
		"environment":       cfg.Environment.Variables,
	}
	return fn, nil
}

// --- DNS Zones (Route53 ListHostedZones / GetHostedZone) ---

func (p *AWSProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	reqURL := "https://route53.amazonaws.com/2013-04-01/hostedzone"
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "route53", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		HostedZones []struct {
			ID                    string `xml:"Id"`
			Name                  string `xml:"Name"`
			CallerReference       string `xml:"CallerReference"`
			Config                struct {
				PrivateZone bool `xml:"PrivateZone"`
			} `xml:"Config"`
			ResourceRecordSetCount int `xml:"ResourceRecordSetCount"`
		} `xml:"HostedZones>HostedZone"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse route53 response: %w", err)
	}

	var zones []types.DNSZone
	for _, z := range result.HostedZones {
		zoneID := strings.TrimPrefix(z.ID, "/hostedzone/")
		zoneType := "public"
		if z.Config.PrivateZone {
			zoneType = "private"
		}
		zones = append(zones, types.DNSZone{
			ID:          zoneID,
			Name:        strings.TrimSuffix(z.Name, "."),
			CloudType:   "aws",
			Region:      "global",
			Status:      "active",
			ZoneType:    zoneType,
			RecordCount: z.ResourceRecordSetCount,
			Spec: map[string]interface{}{
				"hosted_zone_id":    zoneID,
				"caller_reference":  z.CallerReference,
				"private_zone":      z.Config.PrivateZone,
				"record_set_count":  z.ResourceRecordSetCount,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS Route53: listed %d hosted zones", len(zones))
	return zones, nil
}

func (p *AWSProvider) GetDNSZone(ctx context.Context, zoneID string) (*types.DNSZone, error) {
	reqURL := "https://route53.amazonaws.com/2013-04-01/hostedzone/" + zoneID
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	p.signRequest(req, "route53", nil)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		HostedZone struct {
			ID                    string `xml:"Id"`
			Name                  string `xml:"Name"`
			CallerReference       string `xml:"CallerReference"`
			Config                struct {
				PrivateZone bool `xml:"PrivateZone"`
			} `xml:"Config"`
			ResourceRecordSetCount int `xml:"ResourceRecordSetCount"`
		} `xml:"HostedZone"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse route53 response: %w", err)
	}

	z := result.HostedZone
	zoneIDClean := strings.TrimPrefix(z.ID, "/hostedzone/")
	zoneType := "public"
	if z.Config.PrivateZone {
		zoneType = "private"
	}
	log.Printf("AWS Route53: got hosted zone %s", zoneID)
	return &types.DNSZone{
		ID:          zoneIDClean,
		Name:        strings.TrimSuffix(z.Name, "."),
		CloudType:   "aws",
		Region:      "global",
		Status:      "active",
		ZoneType:    zoneType,
		RecordCount: z.ResourceRecordSetCount,
		Spec: map[string]interface{}{
			"hosted_zone_id":   zoneIDClean,
			"caller_reference": z.CallerReference,
			"private_zone":     z.Config.PrivateZone,
			"record_set_count": z.ResourceRecordSetCount,
		},
		Tags: map[string]string{},
	}, nil
}

// --- Certificates (ACM ListCertificates / DescribeCertificate) ---

func (p *AWSProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	endpoint := fmt.Sprintf("https://acm.%s.amazonaws.com", region)
	listBody := []byte("{}")

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/", bytes.NewReader(listBody))
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-amz-json-1.1")
	req.Header.Set("X-Amz-Target", "AWSCertificateManager.ListCertificates")
	p.signRequest(req, "acm", listBody)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		CertificateSummaryList []struct {
			CertificateArn string `json:"CertificateArn"`
			DomainName     string `json:"DomainName"`
		} `json:"CertificateSummaryList"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse acm list response: %w", err)
	}

	var certs []types.Certificate
	for _, c := range result.CertificateSummaryList {
		certs = append(certs, types.Certificate{
			ID:        c.CertificateArn,
			Name:      c.DomainName,
			CloudType: "aws",
			Region:    region,
			Status:    "unknown",
			Domain:    c.DomainName,
			Spec: map[string]interface{}{
				"certificate_arn": c.CertificateArn,
				"domain_name":     c.DomainName,
			},
			Tags: map[string]string{},
		})
	}
	log.Printf("AWS ACM: listed %d certificates in %s", len(certs), region)
	return certs, nil
}

func (p *AWSProvider) GetCertificate(ctx context.Context, certID string) (*types.Certificate, error) {
	region := p.region
	endpoint := fmt.Sprintf("https://acm.%s.amazonaws.com", region)

	descBody := map[string]string{
		"CertificateArn": certID,
	}
	descJSON, _ := json.Marshal(descBody)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint+"/", bytes.NewReader(descJSON))
	if err != nil {
		return nil, fmt.Errorf("aws: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-amz-json-1.1")
	req.Header.Set("X-Amz-Target", "AWSCertificateManager.DescribeCertificate")
	p.signRequest(req, "acm", descJSON)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aws: request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("aws: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Certificate struct {
			CertificateArn string   `json:"CertificateArn"`
			DomainName     string   `json:"DomainName"`
			Subject        string   `json:"Subject"`
			Issuer         string   `json:"Issuer"`
			Status         string   `json:"Status"`
			Type           string   `json:"Type"`
			NotBefore      string   `json:"NotBefore"`
			NotAfter       string   `json:"NotAfter"`
			InUseBy        []string `json:"InUseBy"`
		} `json:"Certificate"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("aws: parse acm describe response: %w", err)
	}

	c := result.Certificate
	log.Printf("AWS ACM: got certificate %s", certID)
	return &types.Certificate{
		ID:        c.CertificateArn,
		Name:      c.DomainName,
		CloudType: "aws",
		Region:    region,
		Status:    strings.ToLower(c.Status),
		Domain:    c.DomainName,
		Issuer:    c.Issuer,
		NotBefore: c.NotBefore,
		NotAfter:  c.NotAfter,
		Spec: map[string]interface{}{
			"certificate_arn": c.CertificateArn,
			"domain_name":     c.DomainName,
			"subject":         c.Subject,
			"issuer":          c.Issuer,
			"type":            c.Type,
			"in_use_by":       c.InUseBy,
		},
		Tags: map[string]string{},
	}, nil
}

// —— 新增：新资源类型 List 方法 ——
func (p *AWSProvider) ListRedis(ctx context.Context, opts types.ListOptions) ([]types.Redis, error) {
	return []types.Redis{}, nil
}

func (p *AWSProvider) ListMQ(ctx context.Context, opts types.ListOptions) ([]types.MQ, error) {
	return []types.MQ{}, nil
}

func (p *AWSProvider) ListCDN(ctx context.Context, opts types.ListOptions) ([]types.CDN, error) {
	return []types.CDN{}, nil
}

func (p *AWSProvider) ListWAF(ctx context.Context, opts types.ListOptions) ([]types.WAF, error) {
	return []types.WAF{}, nil
}

func (p *AWSProvider) ListNATGateways(ctx context.Context, opts types.ListOptions) ([]types.NATGateway, error) {
	return []types.NATGateway{}, nil
}

func (p *AWSProvider) ListImages(ctx context.Context, opts types.ListOptions) ([]types.Image, error) {
	return []types.Image{}, nil
}

func (p *AWSProvider) ListAPIGateways(ctx context.Context, opts types.ListOptions) ([]types.APIGateway, error) {
	return []types.APIGateway{}, nil
}

func (p *AWSProvider) ListLogServices(ctx context.Context, opts types.ListOptions) ([]types.LogService, error) {
	return []types.LogService{}, nil
}

func (p *AWSProvider) ListSecurityGroups(ctx context.Context, opts types.ListOptions) ([]types.SecurityGroup, error) {
	return []types.SecurityGroup{}, nil
}

func (p *AWSProvider) ListRegistries(ctx context.Context, opts types.ListOptions) ([]types.Registry, error) {
	return []types.Registry{}, nil
}

// —— 新增：GetResourceDetail ——
func (p *AWSProvider) GetResourceDetail(ctx context.Context, resourceType types.ResourceType, id, region string) (map[string]interface{}, error) {
	switch resourceType {
	case types.ResourceTypeInstance:
		if inst, err := p.GetInstance(ctx, id); err == nil && inst != nil {
			raw, _ := json.Marshal(inst)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeVolume:
		if v, err := p.GetVolume(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeNetwork:
		if v, err := p.GetNetwork(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeDatabase:
		if v, err := p.GetDatabase(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeLoadBalancer:
		if v, err := p.GetLoadBalancer(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeBucket:
		if v, err := p.GetBucket(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeCluster:
		if v, err := p.GetCluster(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeFunction:
		if v, err := p.GetFunction(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeDNSZone:
		if v, err := p.GetDNSZone(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	case types.ResourceTypeCertificate:
		if v, err := p.GetCertificate(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
			var m map[string]interface{}
			json.Unmarshal(raw, &m)
			return m, nil
		}
	}
	return map[string]interface{}{"provider": p.GetType()}, nil
}

// --- Raw Request ---

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
