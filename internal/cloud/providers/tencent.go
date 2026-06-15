package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
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

func (p *TencentProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	switch resourceType {
	case types.ResourceTypeInstance:
		// Lighthouse instances have IDs starting with "lhins-"
		if strings.HasPrefix(id, "lhins-") {
			return fmt.Sprintf("https://console.cloud.tencent.com/lighthouse/instance/index")
		}
		return fmt.Sprintf("https://console.cloud.tencent.com/cvm/instance/detail?Id=%s", id)
	case types.ResourceTypeDatabase:
		return fmt.Sprintf("https://console.cloud.tencent.com/cdb/instance/%s/detail", id)
	case types.ResourceTypeNetwork:
		return "https://console.cloud.tencent.com/vpc"
	case types.ResourceTypeLoadBalancer:
		return "https://console.cloud.tencent.com/clb"
	case types.ResourceTypeBucket:
		return "https://console.cloud.tencent.com/cos"
	case types.ResourceTypeCluster:
		return "https://console.cloud.tencent.com/tke2"
	case types.ResourceTypeVolume:
		return "https://console.cloud.tencent.com/cvm/cbs"
	case types.ResourceTypeFunction:
		return "https://console.cloud.tencent.com/scf"
	default:
		return "https://console.cloud.tencent.com"
	}
}

func (p *TencentProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}

	var allInstances []types.Instance

	// 1. Query standard CVM instances
	cvmInstances, err := p.listCVMInstances(ctx, region)
	if err != nil {
		log.Printf("Tencent CVM: request failed in %s: %v", region, err)
	} else {
		allInstances = append(allInstances, cvmInstances...)
	}

	// 2. Query Lighthouse instances (轻量应用服务器)
	lhInstances, err := p.listLighthouseInstances(ctx, region)
	if err != nil {
		log.Printf("Tencent Lighthouse: request failed in %s: %v", region, err)
	} else {
		allInstances = append(allInstances, lhInstances...)
	}

	log.Printf("Tencent CVM+Lighthouse: listed %d instances in %s", len(allInstances), region)
	return allInstances, nil
}

func (p *TencentProvider) listCVMInstances(ctx context.Context, region string) ([]types.Instance, error) {
	action := "DescribeInstances"
	service := "cvm"
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
			TotalCount  int `json:"TotalCount"`
			InstanceSet []struct {
				InstanceId    string `json:"InstanceId"`
				InstanceName  string `json:"InstanceName"`
				InstanceState string `json:"InstanceState"`
				Region        string `json:"Region"`
				CPU           int    `json:"CPU"`
				Memory        int    `json:"Memory"`
				InstanceType  string `json:"InstanceType"`
				CreatedTime   string `json:"CreatedTime"`
				PublicIpAddresses []string `json:"PublicIpAddresses"`
				PrivateIpAddresses []string `json:"PrivateIpAddresses"`
				OsName        string `json:"OsName"`
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
		case "PENDING", "STARTING", "LAUNCH_FAILED":
			status = "pending"
		default:
			status = "stopped"
		}

		spec := map[string]interface{}{
			"cpu":    inst.CPU,
			"memory": inst.Memory,
		}
		if len(inst.PublicIpAddresses) > 0 {
			spec["public_ip"] = inst.PublicIpAddresses[0]
		}
		if len(inst.PrivateIpAddresses) > 0 {
			spec["private_ip"] = inst.PrivateIpAddresses[0]
		}
		if inst.OsName != "" {
			spec["os_name"] = inst.OsName
			spec["os_type"] = detectOSType(inst.OsName)
		}

		instances = append(instances, types.Instance{
			ID:           inst.InstanceId,
			Name:         inst.InstanceName,
			CloudType:    "tencent",
			Region:       inst.Region,
			Status:       status,
			InstanceType: inst.InstanceType,
			Spec:         spec,
		})
	}

	return instances, nil
}

func (p *TencentProvider) listLighthouseInstances(ctx context.Context, region string) ([]types.Instance, error) {
	action := "DescribeInstances"
	service := "lighthouse"
	version := "2020-03-24"

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
			TotalCount     int `json:"TotalCount"`
			InstanceSet    []struct {
				InstanceId    string   `json:"InstanceId"`
				InstanceName  string   `json:"InstanceName"`
				InstanceState string   `json:"InstanceState"`
				Zone          string   `json:"Zone"`
				CPU           int      `json:"CPU"`
				Memory        int      `json:"Memory"`
				BundleId      string   `json:"BundleId"`
				PublicAddresses  []string `json:"PublicAddresses"`
				PrivateAddresses []string `json:"PrivateAddresses"`
				OsName        string   `json:"OsName"`
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

		spec := map[string]interface{}{
			"cpu":         inst.CPU,
			"memory":      inst.Memory,
			"instance_type": inst.BundleId,
		}
		if len(inst.PublicAddresses) > 0 {
			spec["public_ip"] = inst.PublicAddresses[0]
		}
		if len(inst.PrivateAddresses) > 0 {
			spec["private_ip"] = inst.PrivateAddresses[0]
		}
		if inst.OsName != "" {
			spec["os_name"] = inst.OsName
			spec["os_type"] = detectOSType(inst.OsName)
		}

		instances = append(instances, types.Instance{
			ID:           inst.InstanceId,
			Name:         inst.InstanceName,
			CloudType:    "tencent",
			Region:       inst.Zone,
			Status:       status,
			InstanceType: inst.BundleId,
			Spec:         spec,
		})
	}

	return instances, nil
}

// detectOSType guesses OS type from OS name
func detectOSType(osName string) string {
	lower := strings.ToLower(osName)
	if strings.Contains(lower, "windows") {
		return "Windows"
	}
	if strings.Contains(lower, "centos") {
		return "CentOS"
	}
	if strings.Contains(lower, "ubuntu") {
		return "Ubuntu"
	}
	if strings.Contains(lower, "debian") {
		return "Debian"
	}
	if strings.Contains(lower, "alpine") {
		return "Alpine"
	}
	return "Linux"
}

func (p *TencentProvider) GetInstance(ctx context.Context, id string) (*types.Instance, error) {
	return nil, fmt.Errorf("not implemented")
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

// ---- CBS (Cloud Block Storage) ----

func (p *TencentProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "cbs", "DescribeDisks", "2017-03-12", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			DiskSet    []struct {
				DiskId     string `json:"DiskId"`
				DiskName   string `json:"DiskName"`
				DiskSize   int    `json:"DiskSize"`
				DiskType   string `json:"DiskType"`
				DiskState  string `json:"DiskState"`
				Attached   bool   `json:"Attached"`
				Placement  struct {
					Zone string `json:"Zone"`
				} `json:"Placement"`
				Encrypt    bool   `json:"Encrypt"`
				InstanceId string `json:"InstanceId"`
				Tags       []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
			} `json:"DiskSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var volumes []types.Volume
	for _, d := range result.Response.DiskSet {
		status := "available"
		switch d.DiskState {
		case "ATTACHED":
			status = "in-use"
		case "UNATTACHED":
			status = "available"
		case "CREATING":
			status = "creating"
		case "EXPIRED":
			status = "expired"
		default:
			status = strings.ToLower(d.DiskState)
		}
		tags := make(map[string]string)
		for _, t := range d.Tags {
			tags[t.Key] = t.Value
		}
		volumes = append(volumes, types.Volume{
			ID:         d.DiskId,
			Name:       d.DiskName,
			CloudType:  "tencent",
			Region:     region,
			Status:     status,
			VolumeType: d.DiskType,
			SizeGB:     d.DiskSize,
			AttachedTo: d.InstanceId,
			Encrypted:  d.Encrypt,
			Spec: map[string]interface{}{
				"disk_type": d.DiskType,
				"disk_size": d.DiskSize,
				"zone":      d.Placement.Zone,
				"attached":  d.Attached,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent CBS: listed %d volumes in %s", len(volumes), region)
	return volumes, nil
}

func (p *TencentProvider) GetVolume(ctx context.Context, volumeID string) (*types.Volume, error) {
	payload := map[string]interface{}{
		"DiskIds": []string{volumeID},
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "cbs", "DescribeDisks", "2017-03-12", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			DiskSet []struct {
				DiskId     string `json:"DiskId"`
				DiskName   string `json:"DiskName"`
				DiskSize   int    `json:"DiskSize"`
				DiskType   string `json:"DiskType"`
				DiskState  string `json:"DiskState"`
				Attached   bool   `json:"Attached"`
				Placement  struct {
					Zone string `json:"Zone"`
				} `json:"Placement"`
				Encrypt    bool   `json:"Encrypt"`
				InstanceId string `json:"InstanceId"`
				Tags       []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
			} `json:"DiskSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	if len(result.Response.DiskSet) == 0 {
		return nil, fmt.Errorf("tencent: volume %s not found", volumeID)
	}
	d := result.Response.DiskSet[0]
	status := "available"
	switch d.DiskState {
	case "ATTACHED":
		status = "in-use"
	case "UNATTACHED":
		status = "available"
	case "CREATING":
		status = "creating"
	default:
		status = strings.ToLower(d.DiskState)
	}
	tags := make(map[string]string)
	for _, t := range d.Tags {
		tags[t.Key] = t.Value
	}
	return &types.Volume{
		ID:         d.DiskId,
		Name:       d.DiskName,
		CloudType:  "tencent",
		Status:     status,
		VolumeType: d.DiskType,
		SizeGB:     d.DiskSize,
		AttachedTo: d.InstanceId,
		Encrypted:  d.Encrypt,
		Spec: map[string]interface{}{
			"disk_type": d.DiskType,
			"disk_size": d.DiskSize,
			"zone":      d.Placement.Zone,
			"attached":  d.Attached,
		},
		Tags: tags,
	}, nil
}

// ---- VPC (Virtual Private Cloud) ----

func (p *TencentProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}

	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	vpcResp, err := p.tencentRequest(ctx, "vpc", "DescribeVpcs", "2017-03-12", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var vpcResult struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			VpcSet     []struct {
				VpcId      string `json:"VpcId"`
				VpcName    string `json:"VpcName"`
				CidrBlock  string `json:"CidrBlock"`
				State      string `json:"State"`
				IsDefault  bool   `json:"IsDefault"`
				CreateTime string `json:"CreateTime"`
				Tags       []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
			} `json:"VpcSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(vpcResp, &vpcResult); err != nil {
		return nil, err
	}

	subnetResp, err := p.tencentRequest(ctx, "vpc", "DescribeSubnets", "2017-03-12", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var subnetResult struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			SubnetSet  []struct {
				SubnetId   string `json:"SubnetId"`
				SubnetName string `json:"SubnetName"`
				CidrBlock  string `json:"CidrBlock"`
				Zone       string `json:"Zone"`
				State      string `json:"State"`
				Tags       []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
				VpcId string `json:"VpcId"`
			} `json:"SubnetSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(subnetResp, &subnetResult); err != nil {
		return nil, err
	}

	var networks []types.Network

	for _, v := range vpcResult.Response.VpcSet {
		status := "available"
		switch v.State {
		case "AVAILABLE":
			status = "available"
		case "PENDING":
			status = "pending"
		default:
			status = strings.ToLower(v.State)
		}
		tags := make(map[string]string)
		for _, t := range v.Tags {
			tags[t.Key] = t.Value
		}
		networks = append(networks, types.Network{
			ID:          v.VpcId,
			Name:        v.VpcName,
			CloudType:   "tencent",
			Region:      region,
			Status:      status,
			NetworkType: "vpc",
			CIDR:        v.CidrBlock,
			Spec: map[string]interface{}{
				"is_default":  v.IsDefault,
				"create_time": v.CreateTime,
				"type":        "vpc",
			},
			Tags: tags,
		})
	}

	for _, s := range subnetResult.Response.SubnetSet {
		status := "available"
		switch s.State {
		case "AVAILABLE":
			status = "available"
		case "PENDING":
			status = "pending"
		default:
			status = strings.ToLower(s.State)
		}
		tags := make(map[string]string)
		for _, t := range s.Tags {
			tags[t.Key] = t.Value
		}
		networks = append(networks, types.Network{
			ID:          s.SubnetId,
			Name:        s.SubnetName,
			CloudType:   "tencent",
			Region:      region,
			Status:      status,
			NetworkType: "subnet",
			CIDR:        s.CidrBlock,
			Spec: map[string]interface{}{
				"zone":   s.Zone,
				"vpc_id": s.VpcId,
				"type":   "subnet",
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent VPC: listed %d networks (%d VPCs, %d subnets) in %s", len(networks), len(vpcResult.Response.VpcSet), len(subnetResult.Response.SubnetSet), region)
	return networks, nil
}

func (p *TencentProvider) GetNetwork(ctx context.Context, networkID string) (*types.Network, error) {
	vpcPayload := map[string]interface{}{
		"VpcIds": []string{networkID},
	}
	bodyBytes, _ := json.Marshal(vpcPayload)

	vpcResp, err := p.tencentRequest(ctx, "vpc", "DescribeVpcs", "2017-03-12", "", bodyBytes)
	if err == nil {
		var vpcResult struct {
			Response struct {
				VpcSet []struct {
					VpcId      string `json:"VpcId"`
					VpcName    string `json:"VpcName"`
					CidrBlock  string `json:"CidrBlock"`
					State      string `json:"State"`
					IsDefault  bool   `json:"IsDefault"`
					CreateTime string `json:"CreateTime"`
					Tags       []struct {
						Key   string `json:"Key"`
						Value string `json:"Value"`
					} `json:"Tags"`
				} `json:"VpcSet"`
			} `json:"Response"`
		}
		if err := json.Unmarshal(vpcResp, &vpcResult); err == nil && len(vpcResult.Response.VpcSet) > 0 {
			v := vpcResult.Response.VpcSet[0]
			status := "available"
			switch v.State {
			case "AVAILABLE":
				status = "available"
			case "PENDING":
				status = "pending"
			default:
				status = strings.ToLower(v.State)
			}
			tags := make(map[string]string)
			for _, t := range v.Tags {
				tags[t.Key] = t.Value
			}
			return &types.Network{
				ID:          v.VpcId,
				Name:        v.VpcName,
				CloudType:   "tencent",
				Status:      status,
				NetworkType: "vpc",
				CIDR:        v.CidrBlock,
				Spec: map[string]interface{}{
					"is_default":  v.IsDefault,
					"create_time": v.CreateTime,
					"type":        "vpc",
				},
				Tags: tags,
			}, nil
		}
	}

	subnetPayload := map[string]interface{}{
		"SubnetIds": []string{networkID},
	}
	bodyBytes, _ = json.Marshal(subnetPayload)

	subnetResp, err := p.tencentRequest(ctx, "vpc", "DescribeSubnets", "2017-03-12", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var subnetResult struct {
		Response struct {
			SubnetSet []struct {
				SubnetId   string `json:"SubnetId"`
				SubnetName string `json:"SubnetName"`
				CidrBlock  string `json:"CidrBlock"`
				Zone       string `json:"Zone"`
				State      string `json:"State"`
				Tags       []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
				VpcId string `json:"VpcId"`
			} `json:"SubnetSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(subnetResp, &subnetResult); err != nil {
		return nil, err
	}
	if len(subnetResult.Response.SubnetSet) == 0 {
		return nil, fmt.Errorf("tencent: network %s not found", networkID)
	}
	s := subnetResult.Response.SubnetSet[0]
	status := "available"
	switch s.State {
	case "AVAILABLE":
		status = "available"
	case "PENDING":
		status = "pending"
	default:
		status = strings.ToLower(s.State)
	}
	tags := make(map[string]string)
	for _, t := range s.Tags {
		tags[t.Key] = t.Value
	}
	return &types.Network{
		ID:          s.SubnetId,
		Name:        s.SubnetName,
		CloudType:   "tencent",
		Status:      status,
		NetworkType: "subnet",
		CIDR:        s.CidrBlock,
		Spec: map[string]interface{}{
			"zone":   s.Zone,
			"vpc_id": s.VpcId,
			"type":   "subnet",
		},
		Tags: tags,
	}, nil
}

// ---- CDB (Cloud Database) ----

func (p *TencentProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "cdb", "DescribeDBInstances", "2017-03-20", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			Items      []struct {
				InstanceId    string `json:"InstanceId"`
				InstanceName  string `json:"InstanceName"`
				Cpu           int    `json:"Cpu"`
				Memory        int    `json:"Memory"`
				EngineVersion string `json:"EngineVersion"`
				Status        int    `json:"Status"`
				DeviceType    string `json:"DeviceType"`
				ResourceTags  []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"ResourceTags"`
			} `json:"Items"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var databases []types.Database
	for _, db := range result.Response.Items {
		status := "running"
		switch db.Status {
		case 0:
			status = "creating"
		case 1:
			status = "running"
		case 4:
			status = "isolated"
		case 5:
			status = "deleting"
		case -2:
			status = "stopped"
		default:
			status = fmt.Sprintf("unknown-%d", db.Status)
		}
		tags := make(map[string]string)
		for _, t := range db.ResourceTags {
			tags[t.TagKey] = t.TagValue
		}
		databases = append(databases, types.Database{
			ID:          db.InstanceId,
			Name:        db.InstanceName,
			CloudType:   "tencent",
			Region:      region,
			Status:      status,
			Engine:      "MySQL",
			EngineVer:   db.EngineVersion,
			InstanceCls: db.DeviceType,
			Spec: map[string]interface{}{
				"cpu":         db.Cpu,
				"memory_mb":   db.Memory,
				"device_type": db.DeviceType,
				"engine":      "MySQL",
				"engine_ver":  db.EngineVersion,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent CDB: listed %d databases in %s", len(databases), region)
	return databases, nil
}

func (p *TencentProvider) GetDatabase(ctx context.Context, databaseID string) (*types.Database, error) {
	payload := map[string]interface{}{
		"InstanceIds": []string{databaseID},
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "cdb", "DescribeDBInstances", "2017-03-20", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			Items []struct {
				InstanceId    string `json:"InstanceId"`
				InstanceName  string `json:"InstanceName"`
				Cpu           int    `json:"Cpu"`
				Memory        int    `json:"Memory"`
				EngineVersion string `json:"EngineVersion"`
				Status        int    `json:"Status"`
				DeviceType    string `json:"DeviceType"`
				ResourceTags  []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"ResourceTags"`
			} `json:"Items"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	if len(result.Response.Items) == 0 {
		return nil, fmt.Errorf("tencent: database %s not found", databaseID)
	}
	db := result.Response.Items[0]
	status := "running"
	switch db.Status {
	case 0:
		status = "creating"
	case 1:
		status = "running"
	case 4:
		status = "isolated"
	case -2:
		status = "stopped"
	default:
		status = fmt.Sprintf("unknown-%d", db.Status)
	}
	tags := make(map[string]string)
	for _, t := range db.ResourceTags {
		tags[t.TagKey] = t.TagValue
	}
	return &types.Database{
		ID:          db.InstanceId,
		Name:        db.InstanceName,
		CloudType:   "tencent",
		Status:      status,
		Engine:      "MySQL",
		EngineVer:   db.EngineVersion,
		InstanceCls: db.DeviceType,
		Spec: map[string]interface{}{
			"cpu":         db.Cpu,
			"memory_mb":   db.Memory,
			"device_type": db.DeviceType,
			"engine":      "MySQL",
			"engine_ver":  db.EngineVersion,
		},
		Tags: tags,
	}, nil
}

// ---- CLB (Cloud Load Balancer) ----

func (p *TencentProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "clb", "DescribeLoadBalancers", "2017-03-12", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount      int `json:"TotalCount"`
			LoadBalancerSet []struct {
				LoadBalancerId   string   `json:"LoadBalancerId"`
				LoadBalancerName string   `json:"LoadBalancerName"`
				LoadBalancerType string   `json:"LoadBalancerType"`
				LoadBalancerVips []string `json:"LoadBalancerVips"`
				Status           int      `json:"Status"`
				Region           string   `json:"Region"`
				CreateTime       string   `json:"CreateTime"`
				Tags             []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"Tags"`
			} `json:"LoadBalancerSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var lbs []types.LoadBalancer
	for _, lb := range result.Response.LoadBalancerSet {
		status := "running"
		switch lb.Status {
		case 0:
			status = "creating"
		case 1:
			status = "running"
		case 3:
			status = "stopped"
		default:
			status = fmt.Sprintf("unknown-%d", lb.Status)
		}
		tags := make(map[string]string)
		for _, t := range lb.Tags {
			tags[t.TagKey] = t.TagValue
		}
		lbs = append(lbs, types.LoadBalancer{
			ID:        lb.LoadBalancerId,
			Name:      lb.LoadBalancerName,
			CloudType: "tencent",
			Region:    lb.Region,
			Status:    status,
			LBType:    lb.LoadBalancerType,
			Spec: map[string]interface{}{
				"lb_type":    lb.LoadBalancerType,
				"vips":       lb.LoadBalancerVips,
				"create_time": lb.CreateTime,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent CLB: listed %d load balancers in %s", len(lbs), region)
	return lbs, nil
}

func (p *TencentProvider) GetLoadBalancer(ctx context.Context, lbID string) (*types.LoadBalancer, error) {
	payload := map[string]interface{}{
		"LoadBalancerIds": []string{lbID},
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "clb", "DescribeLoadBalancers", "2017-03-12", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			LoadBalancerSet []struct {
				LoadBalancerId   string   `json:"LoadBalancerId"`
				LoadBalancerName string   `json:"LoadBalancerName"`
				LoadBalancerType string   `json:"LoadBalancerType"`
				LoadBalancerVips []string `json:"LoadBalancerVips"`
				Status           int      `json:"Status"`
				Region           string   `json:"Region"`
				CreateTime       string   `json:"CreateTime"`
				Tags             []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"Tags"`
			} `json:"LoadBalancerSet"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	if len(result.Response.LoadBalancerSet) == 0 {
		return nil, fmt.Errorf("tencent: load balancer %s not found", lbID)
	}
	lb := result.Response.LoadBalancerSet[0]
	status := "running"
	switch lb.Status {
	case 0:
		status = "creating"
	case 1:
		status = "running"
	case 3:
		status = "stopped"
	default:
		status = fmt.Sprintf("unknown-%d", lb.Status)
	}
	tags := make(map[string]string)
	for _, t := range lb.Tags {
		tags[t.TagKey] = t.TagValue
	}
	return &types.LoadBalancer{
		ID:        lb.LoadBalancerId,
		Name:      lb.LoadBalancerName,
		CloudType: "tencent",
		Region:    lb.Region,
		Status:    status,
		LBType:    lb.LoadBalancerType,
		Spec: map[string]interface{}{
			"lb_type":    lb.LoadBalancerType,
			"vips":       lb.LoadBalancerVips,
			"create_time": lb.CreateTime,
		},
		Tags: tags,
	}, nil
}

// ---- COS (Cloud Object Storage) ----

type cosListBucketsResult struct {
	Buckets struct {
		Bucket []struct {
			Name         string `xml:"Name"`
			Location     string `xml:"Location"`
			CreationDate string `xml:"CreationDate"`
		} `xml:"Bucket"`
	} `xml:"Buckets"`
}

func (p *TencentProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}

	respBody, err := p.cosRequest(ctx, "GET", fmt.Sprintf("https://cos.%s.myqcloud.com/", region), nil)
	if err != nil {
		return nil, err
	}

	var result cosListBucketsResult
	if err := xml.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	var buckets []types.Bucket
	for _, b := range result.Buckets.Bucket {
		buckets = append(buckets, types.Bucket{
			ID:        b.Name,
			Name:      b.Name,
			CloudType: "tencent",
			Region:    b.Location,
			Status:    "active",
			Spec: map[string]interface{}{
				"location":       b.Location,
				"creation_date":  b.CreationDate,
			},
		})
	}

	log.Printf("Tencent COS: listed %d buckets", len(buckets))
	return buckets, nil
}

func (p *TencentProvider) GetBucket(ctx context.Context, bucketID string) (*types.Bucket, error) {
	buckets, err := p.ListBuckets(ctx, types.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, b := range buckets {
		if b.ID == bucketID || b.Name == bucketID {
			return &b, nil
		}
	}
	return nil, fmt.Errorf("tencent: bucket %s not found", bucketID)
}

// ---- TKE (Tencent Kubernetes Engine) ----

func (p *TencentProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "tke", "DescribeClusters", "2018-05-25", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			Clusters   []struct {
				ClusterId          string `json:"ClusterId"`
				ClusterName        string `json:"ClusterName"`
				ClusterStatus      string `json:"ClusterStatus"`
				ClusterVersion     string `json:"ClusterVersion"`
				ClusterNodeNum     int    `json:"ClusterNodeNum"`
				ClusterDescription string `json:"ClusterDescription"`
				TagSpecification   []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"TagSpecification"`
			} `json:"Clusters"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var clusters []types.Cluster
	for _, c := range result.Response.Clusters {
		status := "running"
		switch c.ClusterStatus {
		case "Running":
			status = "running"
		case "Creating":
			status = "creating"
		case "Idling":
			status = "idling"
		case "Scaling":
			status = "scaling"
		case "Upgrading":
			status = "upgrading"
		case "Abnormal":
			status = "abnormal"
		default:
			status = strings.ToLower(c.ClusterStatus)
		}
		tags := make(map[string]string)
		for _, t := range c.TagSpecification {
			tags[t.TagKey] = t.TagValue
		}
		clusters = append(clusters, types.Cluster{
			ID:          c.ClusterId,
			Name:        c.ClusterName,
			CloudType:   "tencent",
			Region:      region,
			Status:      status,
			ClusterType: "tke",
			Version:     c.ClusterVersion,
			NodeCount:   c.ClusterNodeNum,
			Spec: map[string]interface{}{
				"cluster_version": c.ClusterVersion,
				"node_count":      c.ClusterNodeNum,
				"description":     c.ClusterDescription,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent TKE: listed %d clusters in %s", len(clusters), region)
	return clusters, nil
}

func (p *TencentProvider) GetCluster(ctx context.Context, clusterID string) (*types.Cluster, error) {
	payload := map[string]interface{}{
		"ClusterIds": []string{clusterID},
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "tke", "DescribeClusters", "2018-05-25", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			Clusters []struct {
				ClusterId          string `json:"ClusterId"`
				ClusterName        string `json:"ClusterName"`
				ClusterStatus      string `json:"ClusterStatus"`
				ClusterVersion     string `json:"ClusterVersion"`
				ClusterNodeNum     int    `json:"ClusterNodeNum"`
				ClusterDescription string `json:"ClusterDescription"`
				TagSpecification   []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"TagSpecification"`
			} `json:"Clusters"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}
	if len(result.Response.Clusters) == 0 {
		return nil, fmt.Errorf("tencent: cluster %s not found", clusterID)
	}
	c := result.Response.Clusters[0]
	status := "running"
	switch c.ClusterStatus {
	case "Running":
		status = "running"
	case "Creating":
		status = "creating"
	case "Idling":
		status = "idling"
	default:
		status = strings.ToLower(c.ClusterStatus)
	}
	tags := make(map[string]string)
	for _, t := range c.TagSpecification {
		tags[t.TagKey] = t.TagValue
	}
	return &types.Cluster{
		ID:          c.ClusterId,
		Name:        c.ClusterName,
		CloudType:   "tencent",
		Status:      status,
		ClusterType: "tke",
		Version:     c.ClusterVersion,
		NodeCount:   c.ClusterNodeNum,
		Spec: map[string]interface{}{
			"cluster_version": c.ClusterVersion,
			"node_count":      c.ClusterNodeNum,
			"description":     c.ClusterDescription,
		},
		Tags: tags,
	}, nil
}

// ---- SCF (Serverless Cloud Function) ----

func (p *TencentProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	region := opts.Region
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "scf", "ListFunctions", "2018-04-16", region, bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			Functions  []struct {
				FunctionId   string `json:"FunctionId"`
				FunctionName string `json:"FunctionName"`
				Runtime      string `json:"Runtime"`
				Handler      string `json:"Handler"`
				Timeout      int    `json:"Timeout"`
				MemorySize   int    `json:"MemorySize"`
				Status       string `json:"Status"`
				AddTime      string `json:"AddTime"`
				ModTime      string `json:"ModTime"`
				Tags         []struct {
					Key   string `json:"Key"`
					Value string `json:"Value"`
				} `json:"Tags"`
			} `json:"Functions"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var functions []types.Function
	for _, fn := range result.Response.Functions {
		status := "active"
		switch fn.Status {
		case "Active":
			status = "active"
		case "Creating":
			status = "creating"
		case "Updating":
			status = "updating"
		case "UpdateFailed", "CreateFailed":
			status = "error"
		default:
			status = strings.ToLower(fn.Status)
		}
		tags := make(map[string]string)
		for _, t := range fn.Tags {
			tags[t.Key] = t.Value
		}
		functions = append(functions, types.Function{
			ID:         fn.FunctionId,
			Name:       fn.FunctionName,
			CloudType:  "tencent",
			Region:     region,
			Status:     status,
			Runtime:    fn.Runtime,
			Handler:    fn.Handler,
			Timeout:    fn.Timeout,
			MemorySize: fn.MemorySize,
			Spec: map[string]interface{}{
				"runtime":     fn.Runtime,
				"handler":     fn.Handler,
				"timeout":     fn.Timeout,
				"memory_size": fn.MemorySize,
				"add_time":    fn.AddTime,
				"mod_time":    fn.ModTime,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent SCF: listed %d functions in %s", len(functions), region)
	return functions, nil
}

func (p *TencentProvider) GetFunction(ctx context.Context, functionID string) (*types.Function, error) {
	payload := map[string]interface{}{
		"FunctionName": functionID,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "scf", "GetFunction", "2018-04-16", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			FunctionId   string `json:"FunctionId"`
			FunctionName string `json:"FunctionName"`
			Runtime      string `json:"Runtime"`
			Handler      string `json:"Handler"`
			Timeout      int    `json:"Timeout"`
			MemorySize   int    `json:"MemorySize"`
			Status       string `json:"Status"`
			AddTime      string `json:"AddTime"`
			ModTime      string `json:"ModTime"`
			Tags         []struct {
				Key   string `json:"Key"`
				Value string `json:"Value"`
			} `json:"Tags"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	fn := result.Response
	status := "active"
	switch fn.Status {
	case "Active":
		status = "active"
	case "Creating":
		status = "creating"
	default:
		status = strings.ToLower(fn.Status)
	}
	tags := make(map[string]string)
	for _, t := range fn.Tags {
		tags[t.Key] = t.Value
	}
	return &types.Function{
		ID:         fn.FunctionId,
		Name:       fn.FunctionName,
		CloudType:  "tencent",
		Status:     status,
		Runtime:    fn.Runtime,
		Handler:    fn.Handler,
		Timeout:    fn.Timeout,
		MemorySize: fn.MemorySize,
		Spec: map[string]interface{}{
			"runtime":     fn.Runtime,
			"handler":     fn.Handler,
			"timeout":     fn.Timeout,
			"memory_size": fn.MemorySize,
			"add_time":    fn.AddTime,
			"mod_time":    fn.ModTime,
		},
		Tags: tags,
	}, nil
}

// ---- DNSPod ----

func (p *TencentProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "dnspod", "DescribeDomainList", "2021-03-23", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount int `json:"TotalCount"`
			DomainList []struct {
				DomainId    int    `json:"DomainId"`
				Domain      string `json:"Domain"`
				Status      string `json:"Status"`
				RecordCount int    `json:"RecordCount"`
				CreatedOn   string `json:"CreatedOn"`
				GroupId     int    `json:"GroupId"`
			} `json:"DomainList"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var zones []types.DNSZone
	for _, z := range result.Response.DomainList {
		status := "active"
		switch z.Status {
		case "ENABLE":
			status = "active"
		case "DISABLE":
			status = "disabled"
		case "SPAM":
			status = "spam"
		case "LOCK":
			status = "locked"
		default:
			status = strings.ToLower(z.Status)
		}
		zones = append(zones, types.DNSZone{
			ID:          fmt.Sprintf("%d", z.DomainId),
			Name:        z.Domain,
			CloudType:   "tencent",
			Status:      status,
			ZoneType:    "public",
			RecordCount: z.RecordCount,
			Spec: map[string]interface{}{
				"domain_id":   z.DomainId,
				"domain":      z.Domain,
				"group_id":    z.GroupId,
				"created_on":  z.CreatedOn,
			},
		})
	}

	log.Printf("Tencent DNSPod: listed %d zones", len(zones))
	return zones, nil
}

func (p *TencentProvider) GetDNSZone(ctx context.Context, zoneID string) (*types.DNSZone, error) {
	zones, err := p.ListDNSZones(ctx, types.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, z := range zones {
		if z.ID == zoneID || z.Name == zoneID {
			return &z, nil
		}
	}
	return nil, fmt.Errorf("tencent: DNS zone %s not found", zoneID)
}

// ---- SSL Certificates ----

func (p *TencentProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	payload := map[string]interface{}{
		"Offset": 0,
		"Limit":  100,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "ssl", "DescribeCertificates", "2019-12-05", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			TotalCount   int `json:"TotalCount"`
			Certificates []struct {
				CertificateId    string `json:"CertificateId"`
				CertificateAlias string `json:"CertificateAlias"`
				Domain           string `json:"Domain"`
				CertBeginTime    string `json:"CertBeginTime"`
				CertEndTime      string `json:"CertEndTime"`
				Status           int    `json:"Status"`
				Tags             []struct {
					TagKey   string `json:"TagKey"`
					TagValue string `json:"TagValue"`
				} `json:"Tags"`
			} `json:"Certificates"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	var certs []types.Certificate
	for _, c := range result.Response.Certificates {
		status := "active"
		switch c.Status {
		case 1:
			status = "pending"
		case 2:
			status = "active"
		case 3:
			status = "expired"
		case 4:
			status = "revoked"
		case 5:
			status = "deleted"
		default:
			status = fmt.Sprintf("unknown-%d", c.Status)
		}
		tags := make(map[string]string)
		for _, t := range c.Tags {
			tags[t.TagKey] = t.TagValue
		}
		certs = append(certs, types.Certificate{
			ID:        c.CertificateId,
			Name:      c.CertificateAlias,
			CloudType: "tencent",
			Status:    status,
			Domain:    c.Domain,
			NotBefore: c.CertBeginTime,
			NotAfter:  c.CertEndTime,
			Spec: map[string]interface{}{
				"domain":          c.Domain,
				"cert_begin_time": c.CertBeginTime,
				"cert_end_time":   c.CertEndTime,
			},
			Tags: tags,
		})
	}

	log.Printf("Tencent SSL: listed %d certificates", len(certs))
	return certs, nil
}

func (p *TencentProvider) GetCertificate(ctx context.Context, certID string) (*types.Certificate, error) {
	payload := map[string]interface{}{
		"CertificateId": certID,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := p.tencentRequest(ctx, "ssl", "DescribeCertificate", "2019-12-05", "", bodyBytes)
	if err != nil {
		return nil, err
	}

	var result struct {
		Response struct {
			CertificateId    string `json:"CertificateId"`
			CertificateAlias string `json:"CertificateAlias"`
			Domain           string `json:"Domain"`
			CertBeginTime    string `json:"CertBeginTime"`
			CertEndTime      string `json:"CertEndTime"`
			Status           int    `json:"Status"`
			Tags             []struct {
				TagKey   string `json:"TagKey"`
				TagValue string `json:"TagValue"`
			} `json:"Tags"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return nil, err
	}

	status := "active"
	switch result.Response.Status {
	case 1:
		status = "pending"
	case 2:
		status = "active"
	case 3:
		status = "expired"
	case 4:
		status = "revoked"
	default:
		status = fmt.Sprintf("unknown-%d", result.Response.Status)
	}
	tags := make(map[string]string)
	for _, t := range result.Response.Tags {
		tags[t.TagKey] = t.TagValue
	}
	return &types.Certificate{
		ID:        result.Response.CertificateId,
		Name:      result.Response.CertificateAlias,
		CloudType: "tencent",
		Status:    status,
		Domain:    result.Response.Domain,
		NotBefore: result.Response.CertBeginTime,
		NotAfter:  result.Response.CertEndTime,
		Spec: map[string]interface{}{
			"domain":          result.Response.Domain,
			"cert_begin_time": result.Response.CertBeginTime,
			"cert_end_time":   result.Response.CertEndTime,
		},
		Tags: tags,
	}, nil
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
	// Log response for debugging (truncate if too large)
	bodyPreview := string(respBody)
	if len(bodyPreview) > 500 {
		bodyPreview = bodyPreview[:500] + "..."
	}
	log.Printf("tencent API %s response: %s", action, bodyPreview)
	return respBody, nil
}

// —— 新增：新资源类型 List 方法 ——
func (p *TencentProvider) ListRedis(ctx context.Context, opts types.ListOptions) ([]types.Redis, error) {
	return []types.Redis{}, nil
}

func (p *TencentProvider) ListMQ(ctx context.Context, opts types.ListOptions) ([]types.MQ, error) {
	return []types.MQ{}, nil
}

func (p *TencentProvider) ListCDN(ctx context.Context, opts types.ListOptions) ([]types.CDN, error) {
	return []types.CDN{}, nil
}

func (p *TencentProvider) ListWAF(ctx context.Context, opts types.ListOptions) ([]types.WAF, error) {
	return []types.WAF{}, nil
}

func (p *TencentProvider) ListNATGateways(ctx context.Context, opts types.ListOptions) ([]types.NATGateway, error) {
	return []types.NATGateway{}, nil
}

func (p *TencentProvider) ListImages(ctx context.Context, opts types.ListOptions) ([]types.Image, error) {
	return []types.Image{}, nil
}

func (p *TencentProvider) ListAPIGateways(ctx context.Context, opts types.ListOptions) ([]types.APIGateway, error) {
	return []types.APIGateway{}, nil
}

func (p *TencentProvider) ListLogServices(ctx context.Context, opts types.ListOptions) ([]types.LogService, error) {
	return []types.LogService{}, nil
}

func (p *TencentProvider) ListSecurityGroups(ctx context.Context, opts types.ListOptions) ([]types.SecurityGroup, error) {
	return []types.SecurityGroup{}, nil
}

func (p *TencentProvider) ListRegistries(ctx context.Context, opts types.ListOptions) ([]types.Registry, error) {
	return []types.Registry{}, nil
}

// —— 新增：GetResourceDetail ——
func (p *TencentProvider) GetResourceDetail(ctx context.Context, resourceType types.ResourceType, id, region string) (map[string]interface{}, error) {
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
	return map[string]interface{}{"provider": "tencent"}, nil
}

func (p *TencentProvider) DoRawRequest(ctx context.Context, method, reqURL string, headers map[string]string, body []byte) (*types.RawResponse, error) {
	// Extract service from URL: https://<service>.tencentcloudapi.com/
	if !strings.HasSuffix(reqURL, ".tencentcloudapi.com/") &&
		!strings.Contains(reqURL, ".tencentcloudapi.com?") {
		return nil, fmt.Errorf("tencent: URL must be <service>.tencentcloudapi.com")
	}

	action := headers["X-TC-Action"]
	if action == "" {
		return nil, fmt.Errorf("tencent: X-TC-Action header is required")
	}
	version := headers["X-TC-Version"]
	if version == "" {
		version = "2017-03-12"
	}
	region := headers["X-TC-Region"]
	if region == "" {
		region = "ap-guangzhou"
	}

	// Extract host from URL for signing
	host := strings.TrimPrefix(reqURL, "https://")
	host = strings.TrimSuffix(host, "/")
	host = strings.Split(host, "?")[0]
	service := strings.TrimSuffix(host, ".tencentcloudapi.com")

	timestamp := time.Now().Unix()
	date := time.Now().UTC().Format("2006-01-02")

	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-tc-action:%s\n", "application/json; charset=utf-8", strings.ToLower(host), strings.ToLower(action))
	signedHeaders := "content-type;host;x-tc-action"
	hashedPayload := sha256Hex(body)
	canonicalRequest := fmt.Sprintf("%s\n/\n\n%s\n%s\n%s", method, canonicalHeaders, signedHeaders, hashedPayload)

	credentialScope := fmt.Sprintf("%s/%s/tc3_request", date, service)
	stringToSign := fmt.Sprintf("TC3-HMAC-SHA256\n%d\n%s\n%s", timestamp, credentialScope, sha256Hex([]byte(canonicalRequest)))

	secretDate := hmacSHA256([]byte("TC3"+p.secretKey), []byte(date))
	secretService := hmacSHA256(secretDate, []byte(service))
	secretSigning := hmacSHA256(secretService, []byte("tc3_request"))
	signature := hex.EncodeToString(hmacSHA256(secretSigning, []byte(stringToSign)))

	auth := fmt.Sprintf("TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		p.secretID, credentialScope, signedHeaders, signature)

	endpoint := "https://" + host
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, bodyReader)
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
	for k, v := range headers {
		if k != "X-TC-Action" && k != "X-TC-Version" && k != "X-TC-Region" {
			req.Header.Set(k, v)
		}
	}

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

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func hmacSHA1(key, data []byte) []byte {
	h := hmac.New(sha1.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func (p *TencentProvider) cosRequest(ctx context.Context, method, endpoint string, body []byte) ([]byte, error) {
	host := strings.TrimPrefix(endpoint, "https://")
	host = strings.Split(host, "/")[0]

	startTime := time.Now().Unix()
	endTime := startTime + 3600
	keyTime := fmt.Sprintf("%d;%d", startTime, endTime)

	httpMethod := strings.ToLower(method)
	canonicalURI := "/"
	canonicalQueryString := ""
	canonicalHeaders := fmt.Sprintf("host=%s\n", strings.ToLower(host))
	signedHeaders := "host"

	signKey := hmacSHA1([]byte(p.secretKey), []byte(keyTime))

	stringToSign := fmt.Sprintf("sha1\n%s\n%s\n%s\n%s\n%s\n%s",
		keyTime, httpMethod, canonicalURI, canonicalQueryString, canonicalHeaders, signedHeaders)

	signature := hex.EncodeToString(hmacSHA1(signKey, []byte(stringToSign)))

	auth := fmt.Sprintf("q-sign-algorithm=sha1&q-ak=%s&q-sign-time=%s&q-key-time=%s&q-header-list=%s&q-url-param-list=&q-signature=%s",
		p.secretID, keyTime, keyTime, signedHeaders, signature)

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Host", strings.ToLower(host))

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
		return nil, fmt.Errorf("tencent COS error %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}
