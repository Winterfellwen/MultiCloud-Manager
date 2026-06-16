package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
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

func (p *AlicloudProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	if region == "" {
		region = p.region
	}
	base := fmt.Sprintf("https://%s.console.aliyun.com", region)
	switch resourceType {
	case types.ResourceTypeInstance:
		return fmt.Sprintf("%s/ecs/instance/%s", base, id)
	case types.ResourceTypeVolume:
		return fmt.Sprintf("%s/ecs/disk/%s", base, id)
	case types.ResourceTypeNetwork:
		return fmt.Sprintf("%s/vpc/vpc/%s", base, id)
	case types.ResourceTypeDatabase:
		return fmt.Sprintf("%s/rds/instance/%s", base, id)
	case types.ResourceTypeLoadBalancer:
		return fmt.Sprintf("%s/slb/instance/%s", base, id)
	case types.ResourceTypeBucket:
		return fmt.Sprintf("%s/oss/bucket/%s", base, id)
	case types.ResourceTypeCluster:
		return fmt.Sprintf("%s/cs/cluster/%s", base, id)
	case types.ResourceTypeFunction:
		return fmt.Sprintf("%s/fc/service/%s", base, id)
	case types.ResourceTypeDNSZone:
		return fmt.Sprintf("%s/dns/zone/%s", base, id)
	case types.ResourceTypeCertificate:
		return fmt.Sprintf("%s/cas/certificate/%s", base, id)
	case types.ResourceTypeRedis:
		return fmt.Sprintf("%s/kvstore/shopping/%s", base, id)
	case types.ResourceTypeMQ:
		return fmt.Sprintf("%s/ons/consumer/%s", base, id)
	case types.ResourceTypeCDN:
		return fmt.Sprintf("%s/cdn/dashboard/%s", base, id)
	case types.ResourceTypeWAF:
		return fmt.Sprintf("%s/waf/s_instances/%s", base, id)
	case types.ResourceTypeNATGateway:
		return fmt.Sprintf("%s/vpc/nat/%s", base, id)
	case types.ResourceTypeImage:
		return fmt.Sprintf("%s/ecs/image/%s", base, id)
	case types.ResourceTypeAPIGateway:
		return fmt.Sprintf("%s/api-gateway/signature/%s", base, id)
	case types.ResourceTypeLogService:
		return fmt.Sprintf("%s/log/osslog/%s", base, id)
	case types.ResourceTypeSecurity:
		return fmt.Sprintf("%s/vpc/security/%s", base, id)
	case types.ResourceTypeRegistry:
		return fmt.Sprintf("%s/cr/instance/%s", base, id)
	default:
		return base
	}
}

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

// signedRequestToService is like signedRequest but targets any Alibaba Cloud RPC-style service.
func (p *AlicloudProvider) signedRequestToService(ctx context.Context, service, version string, params map[string]string) (*http.Response, error) {
	params["Format"] = "JSON"
	params["Version"] = version
	params["AccessKeyId"] = p.accessKeyID
	params["SignatureMethod"] = "HMAC-SHA1"
	params["Timestamp"] = time.Now().UTC().Format("2006-01-02T15:04:05Z")
	params["SignatureVersion"] = "1.0"
	params["SignatureNonce"] = fmt.Sprintf("%d", time.Now().UnixNano())

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

	mac := hmac.New(sha1.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	params["Signature"] = signature

	queryParts := make([]string, 0, len(params))
	for k, v := range params {
		queryParts = append(queryParts, percentEncode(k)+"="+percentEncode(v))
	}
	endpoint := fmt.Sprintf("https://%s.aliyuncs.com/?%s", service, strings.Join(queryParts, "&"))

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	return p.httpClient.Do(req)
}

// parseResponse reads a response body and checks for HTTP errors.
func (p *AlicloudProvider) parseResponse(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("alicloud: read response: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("alicloud: API error (HTTP %d): %s", resp.StatusCode, string(body))
	}
	return body, nil
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

type ecsDisk struct {
	DiskID    string `json:"DiskId"`
	DiskName  string `json:"DiskName"`
	Size      int    `json:"Size"`
	Category  string `json:"Category"`
	Status    string `json:"Status"`
	Device    string `json:"Device"`
	Encrypted bool   `json:"Encrypted"`
	IOPS      int    `json:"IOPS"`
	RegionID  string `json:"RegionId"`
	Tags      struct {
		Tag []struct {
			TagKey   string `json:"TagKey"`
			TagValue string `json:"TagValue"`
		} `json:"Tag"`
	} `json:"Tags"`
}

type ecsDescribeDisksResponse struct {
	TotalCount int      `json:"TotalCount"`
	Disks      *ecsDisksWrapper `json:"Disks"`
}

type ecsDisksWrapper struct {
	Disk []ecsDisk `json:"Disk"`
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

func (p *AlicloudProvider) StartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StartInstance")
}

func (p *AlicloudProvider) StopInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "StopInstance")
}

func (p *AlicloudProvider) RestartInstance(ctx context.Context, instanceID string) error {
	return p.instanceAction(ctx, instanceID, "RebootInstance")
}

func (p *AlicloudProvider) GetInstance(ctx context.Context, instanceID string) (*types.Instance, error) {
	params := map[string]string{
		"Action":      "DescribeInstances",
		"RegionId":    p.region,
		"InstanceIds": `["` + instanceID + `"]`,
	}
	resp, err := p.signedRequest(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: get instance failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result ecsDescribeResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse get instance response: %w", err)
	}
	if len(result.Instances) == 0 {
		return nil, fmt.Errorf("alicloud: instance %s not found", instanceID)
	}
	for _, inst := range result.Instances {
		if inst.InstanceID != instanceID {
			continue
		}
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
		return &types.Instance{
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
		}, nil
	}
	return nil, fmt.Errorf("alicloud: instance %s not found", instanceID)
}

// --- Volumes (ECS DescribeDisks) ---

func (p *AlicloudProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}
	params := map[string]string{
		"Action":   "DescribeDisks",
		"RegionId": region,
		"PageSize": "100",
	}
	resp, err := p.signedRequest(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list volumes failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result ecsDescribeDisksResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse volumes response: %w", err)
	}
	var disks []ecsDisk
	if result.Disks != nil {
		disks = result.Disks.Disk
	}
	var volumes []types.Volume
	for _, d := range disks {
		tags := make(map[string]string)
		for _, t := range d.Tags.Tag {
			tags[t.TagKey] = t.TagValue
		}
		status := "available"
		switch d.Status {
		case "In_use":
			status = "in_use"
		case "Available":
			status = "available"
		case "Attaching":
			status = "attaching"
		case "Detaching":
			status = "detaching"
		default:
			status = strings.ToLower(d.Status)
		}
		device := d.Device
		volumes = append(volumes, types.Volume{
			ID:         d.DiskID,
			Name:       d.DiskName,
			CloudType:  "alicloud",
			Region:     d.RegionID,
			Status:     status,
			VolumeType: d.Category,
			SizeGB:     d.Size,
			IOPS:       d.IOPS,
			AttachedTo: device,
			Encrypted:  d.Encrypted,
			Spec: map[string]interface{}{
				"category": d.Category,
				"device":   device,
				"iops":     d.IOPS,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud ECS: listed %d volumes in %s", len(volumes), region)
	return volumes, nil
}

func (p *AlicloudProvider) GetVolume(ctx context.Context, volumeID string) (*types.Volume, error) {
	params := map[string]string{
		"Action":   "DescribeDisks",
		"RegionId": p.region,
		"DiskIds":  `["` + volumeID + `"]`,
	}
	resp, err := p.signedRequest(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: get volume failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result ecsDescribeDisksResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse get volume response: %w", err)
	}
	var disks []ecsDisk
	if result.Disks != nil {
		disks = result.Disks.Disk
	}
	if len(disks) == 0 {
		return nil, fmt.Errorf("alicloud: volume %s not found", volumeID)
	}
	d := disks[0]
	tags := make(map[string]string)
	for _, t := range d.Tags.Tag {
		tags[t.TagKey] = t.TagValue
	}
	status := "available"
	switch d.Status {
	case "In_use":
		status = "in_use"
	case "Available":
		status = "available"
	case "Attaching":
		status = "attaching"
	case "Detaching":
		status = "detaching"
	default:
		status = strings.ToLower(d.Status)
	}
	return &types.Volume{
		ID:         d.DiskID,
		Name:       d.DiskName,
		CloudType:  "alicloud",
		Region:     d.RegionID,
		Status:     status,
		VolumeType: d.Category,
		SizeGB:     d.Size,
		IOPS:       d.IOPS,
		AttachedTo: d.Device,
		Encrypted:  d.Encrypted,
		Spec: map[string]interface{}{
			"category": d.Category,
			"device":   d.Device,
			"iops":     d.IOPS,
		},
		Tags: tags,
	}, nil
}

// --- Networks (VPC) ---

type vpcDescribeVpcsResponse struct {
	Vpcs *vpcVpcsWrapper `json:"Vpcs"`
}

type vpcVpcsWrapper struct {
	Vpc []vpcVpc `json:"Vpc"`
}

type vpcVpc struct {
	VpcID     string       `json:"VpcId"`
	VpcName   string       `json:"VpcName"`
	CidrBlock string       `json:"CidrBlock"`
	Status    string       `json:"Status"`
	RegionID  string       `json:"RegionId"`
	VSwitchIds *vpcStrList `json:"VSwitchIds"`
	Tags      *vpcTags     `json:"Tags"`
}

type vpcStrList struct {
	VSwitchId []string `json:"VSwitchId"`
}

type vpcTags struct {
	Tag []vpcTag `json:"Tag"`
}

type vpcTag struct {
	Key   string `json:"Key"`
	Value string `json:"Value"`
}

type vpcDescribeVSwitchesResponse struct {
	VSwitches *vpcVSwitchesWrapper `json:"VSwitches"`
}

type vpcVSwitchesWrapper struct {
	VSwitch []vpcVSwitch `json:"VSwitch"`
}

type vpcVSwitch struct {
	VSwitchID   string   `json:"VSwitchId"`
	VSwitchName string   `json:"VSwitchName"`
	CidrBlock   string   `json:"CidrBlock"`
	Status      string   `json:"Status"`
	ZoneID      string   `json:"ZoneId"`
	VpcID       string   `json:"VpcId"`
	Tags        *vpcTags `json:"Tags"`
}

func (p *AlicloudProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}

	// Fetch VPCs
	params := map[string]string{
		"Action":   "DescribeVpcs",
		"RegionId": region,
		"PageSize": "100",
	}
	resp, err := p.signedRequestToService(ctx, "vpc", "2016-04-28", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list vpcs failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var vpcResult vpcDescribeVpcsResponse
	if err := json.Unmarshal(body, &vpcResult); err != nil {
		return nil, fmt.Errorf("alicloud: parse vpcs response: %w", err)
	}
	var vpcs []vpcVpc
	if vpcResult.Vpcs != nil {
		vpcs = vpcResult.Vpcs.Vpc
	}

	// Fetch VSwitches for subnet info
	vswParams := map[string]string{
		"Action":   "DescribeVSwitches",
		"RegionId": region,
		"PageSize": "100",
	}
	vswResp, err := p.signedRequestToService(ctx, "vpc", "2016-04-28", vswParams)
	if err == nil {
		vswBody, vswErr := p.parseResponse(vswResp)
		if vswErr == nil {
			var vswResult vpcDescribeVSwitchesResponse
			if json.Unmarshal(vswBody, &vswResult) == nil && vswResult.VSwitches != nil {
				// Group VSwitches by VPC ID for spec enrichment
				_ = vswResult.VSwitches.VSwitch
			}
		}
	}

	var networks []types.Network
	for _, v := range vpcs {
		tags := make(map[string]string)
		if v.Tags != nil {
			for _, t := range v.Tags.Tag {
				tags[t.Key] = t.Value
			}
		}
		vswitchIDs := []string{}
		if v.VSwitchIds != nil {
			vswitchIDs = v.VSwitchIds.VSwitchId
		}
		status := "available"
		switch v.Status {
		case "Available":
			status = "available"
		case "Pending":
			status = "pending"
		default:
			status = strings.ToLower(v.Status)
		}
		name := v.VpcName
		if name == "" {
			name = v.VpcID
		}
		networks = append(networks, types.Network{
			ID:          v.VpcID,
			Name:        name,
			CloudType:   "alicloud",
			Region:      v.RegionID,
			Status:      status,
			NetworkType: "vpc",
			CIDR:        v.CidrBlock,
			Spec: map[string]interface{}{
				"vpc_id":       v.VpcID,
				"cidr_block":   v.CidrBlock,
				"vswitch_ids":  vswitchIDs,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud VPC: listed %d networks in %s", len(networks), region)
	return networks, nil
}

func (p *AlicloudProvider) GetNetwork(ctx context.Context, networkID string) (*types.Network, error) {
	params := map[string]string{
		"Action":   "DescribeVpcs",
		"RegionId": p.region,
		"VpcId":    networkID,
	}
	resp, err := p.signedRequestToService(ctx, "vpc", "2016-04-28", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: get network failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result vpcDescribeVpcsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse get network response: %w", err)
	}
	var vpcs []vpcVpc
	if result.Vpcs != nil {
		vpcs = result.Vpcs.Vpc
	}
	if len(vpcs) == 0 {
		return nil, fmt.Errorf("alicloud: network %s not found", networkID)
	}
	v := vpcs[0]
	tags := make(map[string]string)
	if v.Tags != nil {
		for _, t := range v.Tags.Tag {
			tags[t.Key] = t.Value
		}
	}
	vswitchIDs := []string{}
	if v.VSwitchIds != nil {
		vswitchIDs = v.VSwitchIds.VSwitchId
	}
	status := "available"
	switch v.Status {
	case "Available":
		status = "available"
	case "Pending":
		status = "pending"
	default:
		status = strings.ToLower(v.Status)
	}
	name := v.VpcName
	if name == "" {
		name = v.VpcID
	}
	return &types.Network{
		ID:          v.VpcID,
		Name:        name,
		CloudType:   "alicloud",
		Region:      v.RegionID,
		Status:      status,
		NetworkType: "vpc",
		CIDR:        v.CidrBlock,
		Spec: map[string]interface{}{
			"vpc_id":      v.VpcID,
			"cidr_block":  v.CidrBlock,
			"vswitch_ids": vswitchIDs,
		},
		Tags: tags,
	}, nil
}

// --- Databases (RDS) ---

type rdsDescribeDBInstancesResponse struct {
	Items *rdsDBInstancesWrapper `json:"Items"`
}

type rdsDBInstancesWrapper struct {
	DBInstance []rdsDBInstance `json:"DBInstance"`
}

type rdsDBInstance struct {
	DBInstanceID          string   `json:"DBInstanceId"`
	DBInstanceDescription string   `json:"DBInstanceDescription"`
	DBInstanceClass       string   `json:"DBInstanceClass"`
	Engine                string   `json:"Engine"`
	EngineVersion         string   `json:"EngineVersion"`
	DBInstanceStatus      string   `json:"DBInstanceStatus"`
	RegionID              string   `json:"RegionId"`
	Tags                  *rdsTags `json:"Tags"`
}

type rdsTags struct {
	Tag []rdsTag `json:"Tag"`
}

type rdsTag struct {
	TagKey   string `json:"TagKey"`
	TagValue string `json:"TagValue"`
}

func (p *AlicloudProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}
	params := map[string]string{
		"Action":   "DescribeDBInstances",
		"RegionId": region,
		"PageSize": "100",
	}
	resp, err := p.signedRequestToService(ctx, "rds", "2014-08-15", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list databases failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result rdsDescribeDBInstancesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse databases response: %w", err)
	}
	var instances []rdsDBInstance
	if result.Items != nil {
		instances = result.Items.DBInstance
	}
	var databases []types.Database
	for _, db := range instances {
		tags := make(map[string]string)
		if db.Tags != nil {
			for _, t := range db.Tags.Tag {
				tags[t.TagKey] = t.TagValue
			}
		}
		name := db.DBInstanceDescription
		if name == "" {
			name = db.DBInstanceID
		}
		status := "unknown"
		switch db.DBInstanceStatus {
		case "Running":
			status = "running"
		case "Creating":
			status = "creating"
		case "Deleting":
			status = "deleting"
		case "Rebooting":
			status = "rebooting"
		default:
			status = strings.ToLower(db.DBInstanceStatus)
		}
		databases = append(databases, types.Database{
			ID:          db.DBInstanceID,
			Name:        name,
			CloudType:   "alicloud",
			Region:      db.RegionID,
			Status:      status,
			Engine:      db.Engine,
			EngineVer:   db.EngineVersion,
			InstanceCls: db.DBInstanceClass,
			Spec: map[string]interface{}{
				"class":  db.DBInstanceClass,
				"engine": db.Engine,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud RDS: listed %d databases in %s", len(databases), region)
	return databases, nil
}

func (p *AlicloudProvider) GetDatabase(ctx context.Context, databaseID string) (*types.Database, error) {
	params := map[string]string{
		"Action":       "DescribeDBInstances",
		"RegionId":     p.region,
		"DBInstanceId": databaseID,
	}
	resp, err := p.signedRequestToService(ctx, "rds", "2014-08-15", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: get database failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result rdsDescribeDBInstancesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse get database response: %w", err)
	}
	var instances []rdsDBInstance
	if result.Items != nil {
		instances = result.Items.DBInstance
	}
	if len(instances) == 0 {
		return nil, fmt.Errorf("alicloud: database %s not found", databaseID)
	}
	db := instances[0]
	tags := make(map[string]string)
	if db.Tags != nil {
		for _, t := range db.Tags.Tag {
			tags[t.TagKey] = t.TagValue
		}
	}
	name := db.DBInstanceDescription
	if name == "" {
		name = db.DBInstanceID
	}
	status := "unknown"
	switch db.DBInstanceStatus {
	case "Running":
		status = "running"
	case "Creating":
		status = "creating"
	case "Deleting":
		status = "deleting"
	case "Rebooting":
		status = "rebooting"
	default:
		status = strings.ToLower(db.DBInstanceStatus)
	}
	return &types.Database{
		ID:          db.DBInstanceID,
		Name:        name,
		CloudType:   "alicloud",
		Region:      db.RegionID,
		Status:      status,
		Engine:      db.Engine,
		EngineVer:   db.EngineVersion,
		InstanceCls: db.DBInstanceClass,
		Spec: map[string]interface{}{
			"class":  db.DBInstanceClass,
			"engine": db.Engine,
		},
		Tags: tags,
	}, nil
}

// --- Load Balancers (SLB) ---

type slbDescribeLoadBalancersResponse struct {
	LoadBalancers *slbLoadBalancersWrapper `json:"LoadBalancers"`
}

type slbLoadBalancersWrapper struct {
	LoadBalancer []slbLoadBalancer `json:"LoadBalancer"`
}

type slbLoadBalancer struct {
	LoadBalancerID     string   `json:"LoadBalancerId"`
	LoadBalancerName   string   `json:"LoadBalancerName"`
	LoadBalancerStatus string   `json:"LoadBalancerStatus"`
	Address            string   `json:"Address"`
	AddressType        string   `json:"AddressType"`
	NetworkType        string   `json:"NetworkType"`
	RegionID           string   `json:"RegionId"`
	Tags               *slbTags `json:"Tags"`
}

type slbTags struct {
	Tag []slbTag `json:"Tag"`
}

type slbTag struct {
	TagKey   string `json:"TagKey"`
	TagValue string `json:"TagValue"`
}

func (p *AlicloudProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}
	params := map[string]string{
		"Action":   "DescribeLoadBalancers",
		"RegionId": region,
		"PageSize": "100",
	}
	resp, err := p.signedRequestToService(ctx, "slb", "2014-05-15", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list load balancers failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result slbDescribeLoadBalancersResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse load balancers response: %w", err)
	}
	var lbs []slbLoadBalancer
	if result.LoadBalancers != nil {
		lbs = result.LoadBalancers.LoadBalancer
	}
	var loadBalancers []types.LoadBalancer
	for _, lb := range lbs {
		tags := make(map[string]string)
		if lb.Tags != nil {
			for _, t := range lb.Tags.Tag {
				tags[t.TagKey] = t.TagValue
			}
		}
		name := lb.LoadBalancerName
		if name == "" {
			name = lb.LoadBalancerID
		}
		status := "active"
		switch lb.LoadBalancerStatus {
		case "active":
			status = "active"
		case "inactive":
			status = "inactive"
		default:
			status = lb.LoadBalancerStatus
		}
		loadBalancers = append(loadBalancers, types.LoadBalancer{
			ID:        lb.LoadBalancerID,
			Name:      name,
			CloudType: "alicloud",
			Region:    lb.RegionID,
			Status:    status,
			LBType:    lb.NetworkType,
			Scheme:    lb.AddressType,
			Spec: map[string]interface{}{
				"address":      lb.Address,
				"address_type": lb.AddressType,
				"network_type": lb.NetworkType,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud SLB: listed %d load balancers in %s", len(loadBalancers), region)
	return loadBalancers, nil
}

func (p *AlicloudProvider) GetLoadBalancer(ctx context.Context, lbID string) (*types.LoadBalancer, error) {
	params := map[string]string{
		"Action":          "DescribeLoadBalancers",
		"RegionId":        p.region,
		"LoadBalancerId":  lbID,
	}
	resp, err := p.signedRequestToService(ctx, "slb", "2014-05-15", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: get load balancer failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result slbDescribeLoadBalancersResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse get load balancer response: %w", err)
	}
	var lbs []slbLoadBalancer
	if result.LoadBalancers != nil {
		lbs = result.LoadBalancers.LoadBalancer
	}
	if len(lbs) == 0 {
		return nil, fmt.Errorf("alicloud: load balancer %s not found", lbID)
	}
	lb := lbs[0]
	tags := make(map[string]string)
	if lb.Tags != nil {
		for _, t := range lb.Tags.Tag {
			tags[t.TagKey] = t.TagValue
		}
	}
	name := lb.LoadBalancerName
	if name == "" {
		name = lb.LoadBalancerID
	}
	status := "active"
	switch lb.LoadBalancerStatus {
	case "active":
		status = "active"
	case "inactive":
		status = "inactive"
	default:
		status = lb.LoadBalancerStatus
	}
	return &types.LoadBalancer{
		ID:        lb.LoadBalancerID,
		Name:      name,
		CloudType: "alicloud",
		Region:    lb.RegionID,
		Status:    status,
		LBType:    lb.NetworkType,
		Scheme:    lb.AddressType,
		Spec: map[string]interface{}{
			"address":      lb.Address,
			"address_type": lb.AddressType,
			"network_type": lb.NetworkType,
		},
		Tags: tags,
	}, nil
}

// --- Buckets (OSS) ---

type ossListBucketsXML struct {
	XMLName xml.Name        `xml:"ListAllMyBucketsResult"`
	Owner   *ossOwnerXML    `xml:"Owner"`
	Buckets ossBucketsXML   `xml:"Buckets"`
}

type ossOwnerXML struct {
	ID          string `xml:"ID"`
	DisplayName string `xml:"DisplayName"`
}

type ossBucketsXML struct {
	Bucket []ossBucketXML `xml:"Bucket"`
}

type ossBucketXML struct {
	Name             string `xml:"Name"`
	Location         string `xml:"Location"`
	CreationDate     string `xml:"CreationDate"`
	ExtranetEndpoint string `xml:"ExtranetEndpoint"`
	IntranetEndpoint string `xml:"IntranetEndpoint"`
}

// ossRequest sends a signed request to the OSS REST API.
func (p *AlicloudProvider) ossRequest(ctx context.Context, method, path, region string) (*http.Response, error) {
	date := time.Now().UTC().Format(http.TimeFormat)
	canonicalizedResource := path
	stringToSign := method + "\n\n\n" + date + "\n" + canonicalizedResource

	mac := hmac.New(sha1.New, []byte(p.accessKeySecret))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	urlStr := fmt.Sprintf("https://oss-%s.aliyuncs.com%s", region, path)
	req, err := http.NewRequestWithContext(ctx, method, urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Date", date)
	req.Header.Set("Authorization", fmt.Sprintf("OSS %s:%s", p.accessKeyID, signature))
	return p.httpClient.Do(req)
}

func (p *AlicloudProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	region := opts.Region
	if region == "" {
		region = p.region
	}
	resp, err := p.ossRequest(ctx, "GET", "/", region)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list buckets failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("alicloud: read buckets response: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("alicloud: OSS list buckets error (HTTP %d): %s", resp.StatusCode, string(body))
	}
	var result ossListBucketsXML
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse buckets XML: %w", err)
	}
	var buckets []types.Bucket
	for _, b := range result.Buckets.Bucket {
		loc := b.Location
		if loc == "" {
			loc = region
		}
		buckets = append(buckets, types.Bucket{
			ID:        b.Name,
			Name:      b.Name,
			CloudType: "alicloud",
			Region:    loc,
			Status:    "active",
			Spec: map[string]interface{}{
				"location":          b.Location,
				"extranet_endpoint": b.ExtranetEndpoint,
				"intranet_endpoint": b.IntranetEndpoint,
			},
		})
	}
	log.Printf("Alicloud OSS: listed %d buckets in %s", len(buckets), region)
	return buckets, nil
}

func (p *AlicloudProvider) GetBucket(ctx context.Context, bucketID string) (*types.Bucket, error) {
	buckets, err := p.ListBuckets(ctx, types.ListOptions{Region: p.region})
	if err != nil {
		return nil, err
	}
	for _, b := range buckets {
		if b.ID == bucketID {
			return &b, nil
		}
	}
	return nil, fmt.Errorf("alicloud: bucket %s not found", bucketID)
}

// --- Clusters (ACK / Container Service) ---

type csDescribeClustersResponse struct {
	Clusters []csCluster `json:"clusters"`
}

type csCluster struct {
	ClusterID      string `json:"cluster_id"`
	Name           string `json:"name"`
	CurrentVersion string `json:"current_version"`
	State          string `json:"state"`
	RegionID       string `json:"region_id"`
	Tags           []struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	} `json:"tags"`
	NodeCount int `json:"node_count"`
}

// csRequest sends a signed REST request to the Container Service API.
func (p *AlicloudProvider) csRequest(ctx context.Context, path string) (*http.Response, error) {
	date := time.Now().UTC().Format(http.TimeFormat)
	nonce := fmt.Sprintf("%d", time.Now().UnixNano())

	acsHeaders := []string{
		"x-acs-signature-method:HMAC-SHA1",
		"x-acs-signature-nonce:" + nonce,
		"x-acs-version:2015-12-15",
	}
	sort.Strings(acsHeaders)
	canonicalizedHeaders := strings.Join(acsHeaders, "\n") + "\n"
	stringToSign := "GET\n\n\n" + date + "\n" + canonicalizedHeaders + path

	mac := hmac.New(sha1.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	urlStr := "https://cs.aliyuncs.com" + path
	req, err := http.NewRequestWithContext(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Date", date)
	req.Header.Set("x-acs-signature-method", "HMAC-SHA1")
	req.Header.Set("x-acs-signature-nonce", nonce)
	req.Header.Set("x-acs-version", "2015-12-15")
	req.Header.Set("Authorization", "acs "+p.accessKeyID+":"+signature)
	return p.httpClient.Do(req)
}

func (p *AlicloudProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	resp, err := p.csRequest(ctx, "/api/v1/clusters")
	if err != nil {
		return nil, fmt.Errorf("alicloud: list clusters failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("alicloud: read clusters response: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("alicloud: ACK list clusters error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	// The CS API may return a bare array or an object with clusters field
	var rawClusters []csCluster
	if err := json.Unmarshal(body, &rawClusters); err != nil {
		var wrapped csDescribeClustersResponse
		if err2 := json.Unmarshal(body, &wrapped); err2 != nil {
			return nil, fmt.Errorf("alicloud: parse clusters response: %w (raw: %s)", err, string(body[:min(len(body), 500)]))
		}
		rawClusters = wrapped.Clusters
	}

	var clusters []types.Cluster
	for _, c := range rawClusters {
		tags := make(map[string]string)
		for _, t := range c.Tags {
			tags[t.Key] = t.Value
		}
		status := "unknown"
		switch c.State {
		case "running":
			status = "running"
		case "stopped":
			status = "stopped"
		case "failed":
			status = "failed"
		case "initial":
			status = "creating"
		default:
			status = c.State
		}
		region := c.RegionID
		if region == "" {
			region = p.region
		}
		name := c.Name
		if name == "" {
			name = c.ClusterID
		}
		clusters = append(clusters, types.Cluster{
			ID:          c.ClusterID,
			Name:        name,
			CloudType:   "alicloud",
			Region:      region,
			Status:      status,
			ClusterType: "kubernetes",
			Version:     c.CurrentVersion,
			NodeCount:   c.NodeCount,
			Spec: map[string]interface{}{
				"node_count": c.NodeCount,
				"state":      c.State,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud ACK: listed %d clusters", len(clusters))
	return clusters, nil
}

func (p *AlicloudProvider) GetCluster(ctx context.Context, clusterID string) (*types.Cluster, error) {
	clusters, err := p.ListClusters(ctx, types.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, c := range clusters {
		if c.ID == clusterID {
			return &c, nil
		}
	}
	return nil, fmt.Errorf("alicloud: cluster %s not found", clusterID)
}

// --- Functions (FC) - stub ---

func (p *AlicloudProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	log.Printf("Alicloud FC: ListFunctions not yet implemented via Alibaba Cloud API")
	return []types.Function{}, nil
}

func (p *AlicloudProvider) GetFunction(ctx context.Context, functionID string) (*types.Function, error) {
	return nil, fmt.Errorf("alicloud: Function Compute API not yet implemented")
}

// --- DNS Zones (Alibaba Cloud DNS) ---

type dnsDescribeDomainsResponse struct {
	Domains *dnsDomainsWrapper `json:"Domains"`
}

type dnsDomainsWrapper struct {
	Domain []dnsDomain `json:"Domain"`
}

type dnsDomain struct {
	DomainID    string   `json:"DomainId"`
	DomainName  string   `json:"DomainName"`
	RecordCount int      `json:"RecordCount"`
	InstanceID  string   `json:"InstanceId"`
	CreateTime  string   `json:"CreateTime"`
	Tags        *dnsTags `json:"Tags"`
}

type dnsTags struct {
	Tag []dnsTag `json:"Tag"`
}

type dnsTag struct {
	Key   string `json:"Key"`
	Value string `json:"Value"`
}

func (p *AlicloudProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	params := map[string]string{
		"Action":   "DescribeDomains",
		"PageSize": "100",
	}
	resp, err := p.signedRequestToService(ctx, "dns", "2015-01-09", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list DNS zones failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result dnsDescribeDomainsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse DNS zones response: %w", err)
	}
	var domains []dnsDomain
	if result.Domains != nil {
		domains = result.Domains.Domain
	}
	var zones []types.DNSZone
	for _, d := range domains {
		tags := make(map[string]string)
		if d.Tags != nil {
			for _, t := range d.Tags.Tag {
				tags[t.Key] = t.Value
			}
		}
		zones = append(zones, types.DNSZone{
			ID:          d.DomainID,
			Name:        d.DomainName,
			CloudType:   "alicloud",
			Region:      p.region,
			Status:      "active",
			ZoneType:    "public",
			RecordCount: d.RecordCount,
			Spec: map[string]interface{}{
				"record_count": d.RecordCount,
				"domain_id":    d.DomainID,
				"instance_id":  d.InstanceID,
				"create_time":  d.CreateTime,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud DNS: listed %d zones", len(zones))
	return zones, nil
}

func (p *AlicloudProvider) GetDNSZone(ctx context.Context, zoneID string) (*types.DNSZone, error) {
	zones, err := p.ListDNSZones(ctx, types.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, z := range zones {
		if z.ID == zoneID {
			return &z, nil
		}
	}
	return nil, fmt.Errorf("alicloud: DNS zone %s not found", zoneID)
}

// --- Certificates (CAS) ---

type casDescribeCertificatesResponse struct {
	TotalCount      int            `json:"TotalCount"`
	CertificateList []casCertificate `json:"CertificateList"`
}

type casCertificate struct {
	ID          int    `json:"Id"`
	Name        string `json:"Name"`
	Common      string `json:"Common"`
	Issuer      string `json:"Issuer"`
	StartDate   string `json:"StartDate"`
	EndDate     string `json:"EndDate"`
	Fingerprint string `json:"Fingerprint"`
	OrgName     string `json:"OrgName"`
	Status      string `json:"Status"`
}

func (p *AlicloudProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	params := map[string]string{
		"Action":    "DescribeUserCertificateList",
		"PageSize":  "100",
	}
	resp, err := p.signedRequestToService(ctx, "cas", "2018-07-13", params)
	if err != nil {
		return nil, fmt.Errorf("alicloud: list certificates failed: %w", err)
	}
	body, err := p.parseResponse(resp)
	if err != nil {
		return nil, err
	}
	var result casDescribeCertificatesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("alicloud: parse certificates response: %w", err)
	}
	var certs []types.Certificate
	for _, c := range result.CertificateList {
		tags := make(map[string]string)
		if c.OrgName != "" {
			tags["org"] = c.OrgName
		}
		status := "active"
		if c.Status != "" {
			status = strings.ToLower(c.Status)
		}
		certs = append(certs, types.Certificate{
			ID:        fmt.Sprintf("%d", c.ID),
			Name:      c.Name,
			CloudType: "alicloud",
			Region:    p.region,
			Status:    status,
			Domain:    c.Common,
			Issuer:    c.Issuer,
			NotBefore: c.StartDate,
			NotAfter:  c.EndDate,
			Spec: map[string]interface{}{
				"common":      c.Common,
				"issuer":      c.Issuer,
				"fingerprint": c.Fingerprint,
				"org_name":    c.OrgName,
				"start_date":  c.StartDate,
				"end_date":    c.EndDate,
			},
			Tags: tags,
		})
	}
	log.Printf("Alicloud CAS: listed %d certificates", len(certs))
	return certs, nil
}

func (p *AlicloudProvider) GetCertificate(ctx context.Context, certID string) (*types.Certificate, error) {
	certs, err := p.ListCertificates(ctx, types.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, c := range certs {
		if c.ID == certID {
			return &c, nil
		}
	}
	return nil, fmt.Errorf("alicloud: certificate %s not found", certID)
}

// —— 新增：新资源类型 List 方法 ——
func (p *AlicloudProvider) ListRedis(ctx context.Context, opts types.ListOptions) ([]types.Redis, error) {
	return []types.Redis{}, nil
}

func (p *AlicloudProvider) ListMQ(ctx context.Context, opts types.ListOptions) ([]types.MQ, error) {
	return []types.MQ{}, nil
}

func (p *AlicloudProvider) ListCDN(ctx context.Context, opts types.ListOptions) ([]types.CDN, error) {
	return []types.CDN{}, nil
}

func (p *AlicloudProvider) ListWAF(ctx context.Context, opts types.ListOptions) ([]types.WAF, error) {
	return []types.WAF{}, nil
}

func (p *AlicloudProvider) ListNATGateways(ctx context.Context, opts types.ListOptions) ([]types.NATGateway, error) {
	return []types.NATGateway{}, nil
}

func (p *AlicloudProvider) ListImages(ctx context.Context, opts types.ListOptions) ([]types.Image, error) {
	return []types.Image{}, nil
}

func (p *AlicloudProvider) ListAPIGateways(ctx context.Context, opts types.ListOptions) ([]types.APIGateway, error) {
	return []types.APIGateway{}, nil
}

func (p *AlicloudProvider) ListLogServices(ctx context.Context, opts types.ListOptions) ([]types.LogService, error) {
	return []types.LogService{}, nil
}

func (p *AlicloudProvider) ListSecurityGroups(ctx context.Context, opts types.ListOptions) ([]types.SecurityGroup, error) {
	return []types.SecurityGroup{}, nil
}

func (p *AlicloudProvider) ListRegistries(ctx context.Context, opts types.ListOptions) ([]types.Registry, error) {
	return []types.Registry{}, nil
}

// —— 新增：GetResourceDetail ——
func (p *AlicloudProvider) GetResourceDetail(ctx context.Context, resourceType types.ResourceType, id, region string) (map[string]interface{}, error) {
	switch resourceType {
	case types.ResourceTypeInstance:
		if v, err := p.GetInstance(ctx, id); err == nil && v != nil {
			raw, _ := json.Marshal(v)
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
	return map[string]interface{}{"provider": "alicloud"}, nil
}

// --- Raw Request ---

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
