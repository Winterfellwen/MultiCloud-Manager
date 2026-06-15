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
	"log"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/cloud/types"
)

type OracleProvider struct {
	userOCID        string
	tenancyOCID     string
	compartmentOCID string
	fingerprint     string
	region          string
	privateKey      *rsa.PrivateKey
	keyID           string
	httpClient      *http.Client
}

func NewOracleProvider(creds map[string]string) *OracleProvider {
	compartmentOCID := creds["compartment_ocid"]
	if compartmentOCID == "" {
		compartmentOCID = creds["tenancy_ocid"]
	}
	p := &OracleProvider{
		userOCID:        creds["user_ocid"],
		tenancyOCID:     creds["tenancy_ocid"],
		compartmentOCID: compartmentOCID,
		fingerprint:     creds["fingerprint"],
		region:          creds["region"],
		httpClient:      &http.Client{Timeout: 30 * time.Second},
		keyID:           fmt.Sprintf("%s/%s/%s", creds["tenancy_ocid"], creds["user_ocid"], creds["fingerprint"]),
	}

	if pkPEM := creds["private_key"]; pkPEM != "" {
		block, _ := pem.Decode([]byte(pkPEM))
		if block != nil {
			// Try PKCS#8 first (modern OCI default)
			key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				// Fallback to PKCS#1 (legacy RSA private key format)
				key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
				if err != nil {
					log.Printf("oracle: failed to parse private key (tried PKCS#8 and PKCS#1): %v", err)
				}
			}
			if err == nil {
				if rsaKey, ok := key.(*rsa.PrivateKey); ok {
					p.privateKey = rsaKey
					log.Printf("oracle: private key loaded successfully (type=%s)", block.Type)
				} else {
					log.Printf("oracle: private key is not RSA type: %T", key)
				}
			}
		} else {
			log.Printf("oracle: failed to decode PEM block from private_key")
		}
	} else {
		log.Printf("oracle: private_key is empty in credentials")
	}

	return p
}

func (p *OracleProvider) GetType() string { return "oracle" }

func (p *OracleProvider) GetConsoleURL(resourceType types.ResourceType, id, region string) string {
	base := "https://cloud.oracle.com"
	switch resourceType {
	case types.ResourceTypeInstance:
		return fmt.Sprintf("%s/compute/instances/%s", base, id)
	case types.ResourceTypeVolume:
		return fmt.Sprintf("%s/block-storage/volumes/%s", base, id)
	case types.ResourceTypeNetwork:
		return fmt.Sprintf("%s/networking/vcns/%s", base, id)
	case types.ResourceTypeDatabase:
		return fmt.Sprintf("%s/database/dbSystems/%s", base, id)
	case types.ResourceTypeLoadBalancer:
		return fmt.Sprintf("%s/networking/load-balancers/%s", base, id)
	case types.ResourceTypeBucket:
		return fmt.Sprintf("%s/object-storage/buckets/%s", base, id)
	case types.ResourceTypeCluster:
		return fmt.Sprintf("%s/containers/clusters/%s", base, id)
	case types.ResourceTypeFunction:
		return fmt.Sprintf("%s/functions/applications/%s", base, id)
	case types.ResourceTypeDNSZone:
		return fmt.Sprintf("%s/dns/zones/%s", base, id)
	case types.ResourceTypeCertificate:
		return fmt.Sprintf("%s/certificates/certificates/%s", base, id)
	default:
		return base
	}
}

func (p *OracleProvider) ListInstances(ctx context.Context, opts types.ListOptions) ([]types.Instance, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances?compartmentId=%s&compartmentIdInSubtree=true&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListInstances endpoint=%s", endpoint)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		log.Printf("oracle: ociRequest error: %v", err)
		return nil, err
	}
	log.Printf("oracle: response length=%d, first 200 chars: %s", len(resp), string(resp[:minInt(200, len(resp))]))

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
		log.Printf("oracle: unmarshal error: %v, response: %s", err, string(resp))
		return nil, err
	}
	log.Printf("oracle: parsed %d instances", len(instances))

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
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/instances/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var inst struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		Region         string            `json:"region"`
		LifecycleState string            `json:"lifecycleState"`
		Shape          string            `json:"shape"`
		TimeCreated    string            `json:"timeCreated"`
		FreeformTags   map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &inst); err != nil {
		return nil, err
	}
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
	return &types.Instance{
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
	}, nil
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

func (p *OracleProvider) ListVolumes(ctx context.Context, opts types.ListOptions) ([]types.Volume, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/volumes?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListVolumes endpoint=%s", endpoint)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var volumes []struct {
		ID                 string            `json:"id"`
		DisplayName        string            `json:"displayName"`
		SizeInGBs          int64             `json:"sizeInGBs"`
		VpusPerGB          int64             `json:"vpusPerGB"`
		LifecycleState     string            `json:"lifecycleState"`
		AvailabilityDomain string            `json:"availabilityDomain"`
		IsHydrated         bool              `json:"isHydrated"`
		FreeformTags       map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &volumes); err != nil {
		return nil, err
	}

	var result []types.Volume
	for _, v := range volumes {
		status := "available"
		switch v.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "creating"
		case "ATTACHING":
			status = "in-use"
		case "DETACHING":
			status = "detaching"
		case "TERMINATING", "TERMINATED":
			status = "deleted"
		default:
			status = "available"
		}

		result = append(result, types.Volume{
			ID:         v.ID,
			Name:       v.DisplayName,
			CloudType:  "oracle",
			Region:     p.region,
			Status:     status,
			SizeGB:     int(v.SizeInGBs),
			VolumeType: "block",
			Spec: map[string]interface{}{
				"vpusPerGB":          v.VpusPerGB,
				"availabilityDomain": v.AvailabilityDomain,
				"isHydrated":         v.IsHydrated,
			},
			Tags: v.FreeformTags,
		})
	}
	return result, nil
}

func (p *OracleProvider) ListNetworks(ctx context.Context, opts types.ListOptions) ([]types.Network, error) {
	var result []types.Network

	// List VCNs
	vcnEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/vcns?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListNetworks VCNs endpoint=%s", vcnEndpoint)

	resp, err := p.ociRequest(ctx, "GET", vcnEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var vcns []struct {
		ID                  string            `json:"id"`
		DisplayName         string            `json:"displayName"`
		CidrBlock           string            `json:"cidrBlock"`
		LifecycleState      string            `json:"lifecycleState"`
		DefaultRouteTableId string            `json:"defaultRouteTableId"`
		DefaultSecurityListId string           `json:"defaultSecurityListId"`
		FreeformTags        map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &vcns); err != nil {
		return nil, err
	}

	for _, v := range vcns {
		status := "available"
		switch v.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "provisioning"
		case "TERMINATING", "TERMINATED":
			status = "terminated"
		default:
			status = "available"
		}

		result = append(result, types.Network{
			ID:          v.ID,
			Name:        v.DisplayName,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			NetworkType: "vcn",
			CIDR:        v.CidrBlock,
			Spec: map[string]interface{}{
				"vcnId":                v.ID,
				"defaultRouteTableId":  v.DefaultRouteTableId,
				"defaultSecurityListId": v.DefaultSecurityListId,
			},
			Tags: v.FreeformTags,
		})
	}

	// List Subnets
	subnetEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/subnets?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListNetworks Subnets endpoint=%s", subnetEndpoint)

	resp, err = p.ociRequest(ctx, "GET", subnetEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var subnets []struct {
		ID               string            `json:"id"`
		DisplayName      string            `json:"displayName"`
		CidrBlock        string            `json:"cidrBlock"`
		LifecycleState   string            `json:"lifecycleState"`
		AvailabilityDomain string           `json:"availabilityDomain"`
		SubnetDomainName string            `json:"subnetDomainName"`
		VcnId            string            `json:"vcnId"`
		FreeformTags     map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &subnets); err != nil {
		return nil, err
	}

	for _, s := range subnets {
		status := "available"
		switch s.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "provisioning"
		case "TERMINATING", "TERMINATED":
			status = "terminated"
		default:
			status = "available"
		}

		result = append(result, types.Network{
			ID:          s.ID,
			Name:        s.DisplayName,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			NetworkType: "subnet",
			CIDR:        s.CidrBlock,
			Spec: map[string]interface{}{
				"vcnId":             s.VcnId,
				"availabilityDomain": s.AvailabilityDomain,
				"subnetDomainName":  s.SubnetDomainName,
			},
			Tags: s.FreeformTags,
		})
	}

	return result, nil
}

func (p *OracleProvider) ListDatabases(ctx context.Context, opts types.ListOptions) ([]types.Database, error) {
	var result []types.Database

	// List DB Systems
	dbEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/dbSystems?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListDatabases DB Systems endpoint=%s", dbEndpoint)

	resp, err := p.ociRequest(ctx, "GET", dbEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var dbSystems []struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		Shape          string            `json:"shape"`
		DbVersion      string            `json:"dbVersion"`
		LifecycleState string            `json:"lifecycleState"`
		NodeCount      int               `json:"nodeCount"`
		TimeCreated    string            `json:"timeCreated"`
		CpuCoreCount   int               `json:"cpuCoreCount"`
		FreeformTags   map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &dbSystems); err != nil {
		log.Printf("oracle: ListDatabases dbSystems unmarshal error: %v", err)
		return nil, err
	}

	for _, d := range dbSystems {
		status := "available"
		switch d.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "creating"
		case "TERMINATING", "TERMINATED":
			status = "terminated"
		case "FAILED":
			status = "failed"
		default:
			status = "available"
		}

		result = append(result, types.Database{
			ID:          d.ID,
			Name:        d.DisplayName,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			Engine:      "oracle_db",
			EngineVer:   d.DbVersion,
			InstanceCls: d.Shape,
			Spec: map[string]interface{}{
				"shape":        d.Shape,
				"nodeCount":    d.NodeCount,
				"cpuCoreCount": d.CpuCoreCount,
				"timeCreated":  d.TimeCreated,
			},
			Tags: d.FreeformTags,
		})
	}

	// List Autonomous Databases
	adbEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/autonomousDatabases?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListDatabases Autonomous endpoint=%s", adbEndpoint)

	resp, err = p.ociRequest(ctx, "GET", adbEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var adbs []struct {
		ID                string            `json:"id"`
		DisplayName       string            `json:"displayName"`
		DbName            string            `json:"dbName"`
		LifecycleState    string            `json:"lifecycleState"`
		CpuCoreCount      int               `json:"cpuCoreCount"`
		DataStorageSizeInTBs int            `json:"dataStorageSizeInTBs"`
		DbVersion         string            `json:"dbVersion"`
		FreeformTags      map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &adbs); err != nil {
		log.Printf("oracle: ListDatabases adbs unmarshal error: %v", err)
		return nil, err
	}

	for _, d := range adbs {
		status := "available"
		switch d.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "creating"
		case "STOPPED":
			status = "stopped"
		case "TERMINATING", "TERMINATED":
			status = "terminated"
		case "FAILED":
			status = "failed"
		default:
			status = "available"
		}

		result = append(result, types.Database{
			ID:          d.ID,
			Name:        d.DisplayName,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			Engine:      "autonomous",
			EngineVer:   d.DbVersion,
			InstanceCls: "autonomous",
			Spec: map[string]interface{}{
				"dbName":              d.DbName,
				"cpuCoreCount":        d.CpuCoreCount,
				"dataStorageSizeInTBs": d.DataStorageSizeInTBs,
				"dbVersion":           d.DbVersion,
			},
			Tags: d.FreeformTags,
		})
	}

	return result, nil
}

func (p *OracleProvider) ListLoadBalancers(ctx context.Context, opts types.ListOptions) ([]types.LoadBalancer, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20170115/loadBalancers?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListLoadBalancers endpoint=%s", endpoint)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var lbs []struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		LifecycleState string            `json:"lifecycleState"`
		ShapeName      string            `json:"shapeName"`
		IsPrivate      bool              `json:"isPrivate"`
		SubnetIds      []string          `json:"subnetIds"`
		FreeformTags   map[string]string `json:"freeformTags"`
		IpAddresses    []struct {
			IpAddress string `json:"ipAddress"`
			IsPublic  bool   `json:"isPublic"`
		} `json:"ipAddresses"`
	}
	if err := json.Unmarshal(resp, &lbs); err != nil {
		return nil, err
	}

	var result []types.LoadBalancer
	for _, lb := range lbs {
		status := "active"
		switch lb.LifecycleState {
		case "ACTIVE":
			status = "active"
		case "CREATING":
			status = "creating"
		case "DELETING", "DELETED":
			status = "deleted"
		case "FAILED":
			status = "failed"
		default:
			status = "active"
		}

		ips := make([]string, 0, len(lb.IpAddresses))
		for _, ip := range lb.IpAddresses {
			ips = append(ips, ip.IpAddress)
		}

		scheme := "public"
		if lb.IsPrivate {
			scheme = "private"
		}

		result = append(result, types.LoadBalancer{
			ID:        lb.ID,
			Name:      lb.DisplayName,
			CloudType: "oracle",
			Region:    p.region,
			Status:    status,
			LBType:    lb.ShapeName,
			Scheme:    scheme,
			Spec: map[string]interface{}{
				"shapeName":  lb.ShapeName,
				"isPrivate":  lb.IsPrivate,
				"subnetIds":  lb.SubnetIds,
				"ipAddresses": ips,
			},
			Tags: lb.FreeformTags,
		})
	}
	return result, nil
}

func (p *OracleProvider) ListBuckets(ctx context.Context, opts types.ListOptions) ([]types.Bucket, error) {
	// First get the namespace
	nsEndpoint := fmt.Sprintf("https://objectstorage.%s.oraclecloud.com/20160918/ns", p.region)
	log.Printf("oracle: ListBuckets get namespace endpoint=%s", nsEndpoint)

	nsResp, err := p.ociRequest(ctx, "GET", nsEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var namespace string
	if err := json.Unmarshal(nsResp, &namespace); err != nil {
		log.Printf("oracle: ListBuckets namespace unmarshal error: %v, response: %s", err, string(nsResp))
		return nil, err
	}
	log.Printf("oracle: ListBuckets namespace=%s", namespace)

	// List buckets
	bucketEndpoint := fmt.Sprintf("https://objectstorage.%s.oraclecloud.com/n/%s/b?compartmentId=%s&limit=100", p.region, namespace, p.compartmentOCID)
	log.Printf("oracle: ListBuckets endpoint=%s", bucketEndpoint)

	resp, err := p.ociRequest(ctx, "GET", bucketEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var buckets []struct {
		ID               string            `json:"id"`
		Name             string            `json:"name"`
		Namespace        string            `json:"namespace"`
		CompartmentId    string            `json:"compartmentId"`
		CreatedBy        string            `json:"createdBy"`
		TimeCreated      string            `json:"timeCreated"`
		ObjectCount      int64             `json:"objectCount"`
		StorageSizeInBytes int64           `json:"storageSizeInBytes"`
		FreeformTags     map[string]string `json:"freeformTags"`
		Etag             string            `json:"etag"`
	}
	if err := json.Unmarshal(resp, &buckets); err != nil {
		return nil, err
	}

	var result []types.Bucket
	for _, b := range buckets {
		result = append(result, types.Bucket{
			ID:        b.ID,
			Name:      b.Name,
			CloudType: "oracle",
			Region:    p.region,
			Status:    "active",
			Spec: map[string]interface{}{
				"namespace":          b.Namespace,
				"compartmentId":      b.CompartmentId,
				"createdBy":          b.CreatedBy,
				"timeCreated":        b.TimeCreated,
				"objectCount":        b.ObjectCount,
				"storageSizeInBytes": b.StorageSizeInBytes,
				"etag":               b.Etag,
			},
			Tags: b.FreeformTags,
		})
	}
	return result, nil
}

func (p *OracleProvider) ListClusters(ctx context.Context, opts types.ListOptions) ([]types.Cluster, error) {
	endpoint := fmt.Sprintf("https://oke.%s.oraclecloud.com/20180222/clusters?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListClusters endpoint=%s", endpoint)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var clusters []struct {
		ID                   string            `json:"id"`
		Name                 string            `json:"name"`
		LifecycleState       string            `json:"lifecycleState"`
		KubernetesVersion    string            `json:"kubernetesVersion"`
		ClusterPodNetworkOptions []interface{} `json:"clusterPodNetworkOptions"`
		VcnId                string            `json:"vcnId"`
		FreeformTags         map[string]string `json:"freeformTags"`
		Options              interface{}       `json:"options"`
		EndpointConfig       interface{}       `json:"endpointConfig"`
		TimeCreated          string            `json:"timeCreated"`
	}
	if err := json.Unmarshal(resp, &clusters); err != nil {
		return nil, err
	}

	var result []types.Cluster
	for _, c := range clusters {
		status := "active"
		switch c.LifecycleState {
		case "ACTIVE":
			status = "active"
		case "CREATING":
			status = "creating"
		case "DELETING", "DELETED":
			status = "deleted"
		case "FAILED":
			status = "failed"
		case "UPDATING":
			status = "updating"
		default:
			status = "active"
		}

		result = append(result, types.Cluster{
			ID:          c.ID,
			Name:        c.Name,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			ClusterType: "oke",
			Version:     c.KubernetesVersion,
			Spec: map[string]interface{}{
				"vcnId":                   c.VcnId,
				"clusterPodNetworkOptions": c.ClusterPodNetworkOptions,
				"options":                 c.Options,
				"endpointConfig":          c.EndpointConfig,
			},
			Tags: c.FreeformTags,
		})
	}
	return result, nil
}

func (p *OracleProvider) ListFunctions(ctx context.Context, opts types.ListOptions) ([]types.Function, error) {
	var result []types.Function

	// List applications first
	appEndpoint := fmt.Sprintf("https://functions.%s.oraclecloud.com/20181201/applications?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListFunctions applications endpoint=%s", appEndpoint)

	resp, err := p.ociRequest(ctx, "GET", appEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var apps []struct {
		ID           string            `json:"id"`
		DisplayName  string            `json:"displayName"`
		LifecycleState string          `json:"lifecycleState"`
		FreeformTags map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &apps); err != nil {
		return nil, err
	}

	for _, app := range apps {
		// List functions within this application
		funcEndpoint := fmt.Sprintf("https://functions.%s.oraclecloud.com/20181201/functions?applicationId=%s&limit=100", p.region, app.ID)
		log.Printf("oracle: ListFunctions functions endpoint=%s", funcEndpoint)

		fResp, err := p.ociRequest(ctx, "GET", funcEndpoint, nil)
		if err != nil {
			log.Printf("oracle: ListFunctions error listing functions for app %s: %v", app.ID, err)
			continue
		}

		var functions []struct {
			ID             string            `json:"id"`
			DisplayName    string            `json:"displayName"`
			LifecycleState string            `json:"lifecycleState"`
			Image          string            `json:"image"`
			ImageDigest    string            `json:"imageDigest"`
			MemoryInMBs    int64             `json:"memoryInMBs"`
			TimeoutInSeconds int             `json:"timeoutInSeconds"`
			FreeformTags   map[string]string `json:"freeformTags"`
			InvokeEndpoint string            `json:"invokeEndpoint"`
		}
		if err := json.Unmarshal(fResp, &functions); err != nil {
			log.Printf("oracle: ListFunctions unmarshal error for app %s: %v", app.ID, err)
			continue
		}

		for _, fn := range functions {
			status := "active"
			switch fn.LifecycleState {
			case "ACTIVE":
				status = "active"
			case "CREATING":
				status = "creating"
			case "DELETING", "DELETED":
				status = "deleted"
			case "FAILED":
				status = "failed"
			default:
				status = "active"
			}

			result = append(result, types.Function{
				ID:         fn.ID,
				Name:       fn.DisplayName,
				CloudType:  "oracle",
				Region:     p.region,
				Status:     status,
				Timeout:    fn.TimeoutInSeconds,
				MemorySize: int(fn.MemoryInMBs),
				Spec: map[string]interface{}{
					"image":          fn.Image,
					"imageDigest":    fn.ImageDigest,
					"invokeEndpoint": fn.InvokeEndpoint,
					"applicationId":  app.ID,
					"applicationName": app.DisplayName,
				},
				Tags: fn.FreeformTags,
			})
		}
	}

	return result, nil
}

func (p *OracleProvider) ListDNSZones(ctx context.Context, opts types.ListOptions) ([]types.DNSZone, error) {
	endpoint := fmt.Sprintf("https://dns.%s.oraclecloud.com/20180115/zones?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListDNSZones endpoint=%s", endpoint)

	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}

	var zones []struct {
		ID             string            `json:"id"`
		Name           string            `json:"name"`
		ZoneType       string            `json:"zoneType"`
		LifecycleState string            `json:"lifecycleState"`
		Serial         int64             `json:"serial"`
		Self           string            `json:"self"`
		FreeformTags   map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &zones); err != nil {
		return nil, err
	}

	var result []types.DNSZone
	for _, z := range zones {
		status := "active"
		switch z.LifecycleState {
		case "ACTIVE":
			status = "active"
		case "CREATING":
			status = "creating"
		case "DELETING", "DELETED":
			status = "deleted"
		case "FAILED":
			status = "failed"
		default:
			status = "active"
		}

		result = append(result, types.DNSZone{
			ID:        z.ID,
			Name:      z.Name,
			CloudType: "oracle",
			Region:    p.region,
			Status:    status,
			ZoneType:  strings.ToLower(z.ZoneType),
			Spec: map[string]interface{}{
				"serial": z.Serial,
				"self":   z.Self,
			},
			Tags: z.FreeformTags,
		})
	}
	return result, nil
}

func (p *OracleProvider) ListCertificates(ctx context.Context, opts types.ListOptions) ([]types.Certificate, error) {
	var result []types.Certificate

	// List Certificate Authorities
	caEndpoint := fmt.Sprintf("https://certs.%s.oraclecloud.com/20210224/certificateAuthorities?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListCertificates CAs endpoint=%s", caEndpoint)

	resp, err := p.ociRequest(ctx, "GET", caEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var cas []struct {
		ID                        string            `json:"id"`
		DisplayName               string            `json:"displayName"`
		LifecycleState            string            `json:"lifecycleState"`
		IssuerCertificateAuthority string           `json:"issuerCertificateAuthority"`
		CertificateRules          []interface{}     `json:"certificateRules"`
		ConfigType                string            `json:"configType"`
		FreeformTags              map[string]string `json:"freeformTags"`
		Subject                   interface{}       `json:"subject"`
		TimeOfDeletion            string            `json:"timeOfDeletion"`
	}
	if err := json.Unmarshal(resp, &cas); err != nil {
		log.Printf("oracle: ListCertificates CAs unmarshal error: %v", err)
		return nil, err
	}

	for _, ca := range cas {
		status := "active"
		switch ca.LifecycleState {
		case "ACTIVE":
			status = "active"
		case "CREATING":
			status = "creating"
		case "DELETING", "DELETED":
			status = "deleted"
		case "FAILED":
			status = "failed"
		case "UPDATING":
			status = "updating"
		case "PENDING_DELETION":
			status = "pending_deletion"
		default:
			status = "active"
		}

		result = append(result, types.Certificate{
			ID:        ca.ID,
			Name:      ca.DisplayName,
			CloudType: "oracle",
			Region:    p.region,
			Status:    status,
			Issuer:    ca.IssuerCertificateAuthority,
			Spec: map[string]interface{}{
				"configType":   ca.ConfigType,
				"certificateRules": ca.CertificateRules,
				"subject":      ca.Subject,
				"timeOfDeletion": ca.TimeOfDeletion,
				"resourceType": "certificate_authority",
			},
			Tags: ca.FreeformTags,
		})
	}

	// List Certificates
	certEndpoint := fmt.Sprintf("https://certs.%s.oraclecloud.com/20210224/certificates?compartmentId=%s&limit=100", p.region, p.compartmentOCID)
	log.Printf("oracle: ListCertificates certificates endpoint=%s", certEndpoint)

	resp, err = p.ociRequest(ctx, "GET", certEndpoint, nil)
	if err != nil {
		return nil, err
	}

	var certs []struct {
		ID                        string            `json:"id"`
		DisplayName               string            `json:"displayName"`
		LifecycleState            string            `json:"lifecycleState"`
		IssuerCertificateAuthority string           `json:"issuerCertificateAuthority"`
		CertificateRules          []interface{}     `json:"certificateRules"`
		ConfigType                string            `json:"configType"`
		FreeformTags              map[string]string `json:"freeformTags"`
		Subject                   interface{}       `json:"subject"`
		TimeOfDeletion            string            `json:"timeOfDeletion"`
	}
	if err := json.Unmarshal(resp, &certs); err != nil {
		log.Printf("oracle: ListCertificates certs unmarshal error: %v", err)
		return nil, err
	}

	for _, c := range certs {
		status := "active"
		switch c.LifecycleState {
		case "ACTIVE":
			status = "active"
		case "CREATING":
			status = "creating"
		case "DELETING", "DELETED":
			status = "deleted"
		case "FAILED":
			status = "failed"
		case "UPDATING":
			status = "updating"
		case "PENDING_DELETION":
			status = "pending_deletion"
		default:
			status = "active"
		}

		result = append(result, types.Certificate{
			ID:        c.ID,
			Name:      c.DisplayName,
			CloudType: "oracle",
			Region:    p.region,
			Status:    status,
			Issuer:    c.IssuerCertificateAuthority,
			Spec: map[string]interface{}{
				"configType":   c.ConfigType,
				"certificateRules": c.CertificateRules,
				"subject":      c.Subject,
				"timeOfDeletion": c.TimeOfDeletion,
				"resourceType": "certificate",
			},
			Tags: c.FreeformTags,
		})
	}

	return result, nil
}

func (p *OracleProvider) GetVolume(ctx context.Context, id string) (*types.Volume, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/volumes/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var v struct {
		ID                 string            `json:"id"`
		DisplayName        string            `json:"displayName"`
		SizeInGBs          int64             `json:"sizeInGBs"`
		VpusPerGB          int64             `json:"vpusPerGB"`
		LifecycleState     string            `json:"lifecycleState"`
		AvailabilityDomain string            `json:"availabilityDomain"`
		IsHydrated         bool              `json:"isHydrated"`
		FreeformTags       map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &v); err != nil {
		return nil, err
	}
	status := "available"
	switch v.LifecycleState {
	case "AVAILABLE":
		status = "available"
	case "PROVISIONING":
		status = "creating"
	case "ATTACHING":
		status = "in-use"
	case "DETACHING":
		status = "detaching"
	case "TERMINATING", "TERMINATED":
		status = "deleted"
	default:
		status = "available"
	}
	return &types.Volume{
		ID:         v.ID,
		Name:       v.DisplayName,
		CloudType:  "oracle",
		Region:     p.region,
		Status:     status,
		SizeGB:     int(v.SizeInGBs),
		VolumeType: "block",
		Spec: map[string]interface{}{
			"vpusPerGB":          v.VpusPerGB,
			"availabilityDomain": v.AvailabilityDomain,
			"isHydrated":         v.IsHydrated,
		},
		Tags: v.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetNetwork(ctx context.Context, id string) (*types.Network, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/vcns/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var v struct {
		ID                  string            `json:"id"`
		DisplayName         string            `json:"displayName"`
		CidrBlock           string            `json:"cidrBlock"`
		LifecycleState      string            `json:"lifecycleState"`
		DefaultRouteTableId string            `json:"defaultRouteTableId"`
		DefaultSecurityListId string           `json:"defaultSecurityListId"`
		FreeformTags        map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &v); err != nil {
		return nil, err
	}
	status := "available"
	switch v.LifecycleState {
	case "AVAILABLE":
		status = "available"
	case "PROVISIONING":
		status = "provisioning"
	case "TERMINATING", "TERMINATED":
		status = "terminated"
	default:
		status = "available"
	}
	return &types.Network{
		ID:          v.ID,
		Name:        v.DisplayName,
		CloudType:   "oracle",
		Region:      p.region,
		Status:      status,
		NetworkType: "vcn",
		CIDR:        v.CidrBlock,
		Spec: map[string]interface{}{
			"vcnId":                 v.ID,
			"defaultRouteTableId":   v.DefaultRouteTableId,
			"defaultSecurityListId": v.DefaultSecurityListId,
		},
		Tags: v.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetDatabase(ctx context.Context, id string) (*types.Database, error) {
	// Try DB System first
	dbEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/dbSystems/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", dbEndpoint, nil)
	if err == nil {
		var d struct {
			ID             string            `json:"id"`
			DisplayName    string            `json:"displayName"`
			Shape          string            `json:"shape"`
			DbVersion      string            `json:"dbVersion"`
			LifecycleState string            `json:"lifecycleState"`
			NodeCount      int               `json:"nodeCount"`
			TimeCreated    string            `json:"timeCreated"`
			CpuCoreCount   int               `json:"cpuCoreCount"`
			FreeformTags   map[string]string `json:"freeformTags"`
		}
		if err := json.Unmarshal(resp, &d); err != nil {
			return nil, err
		}
		status := "available"
		switch d.LifecycleState {
		case "AVAILABLE":
			status = "available"
		case "PROVISIONING":
			status = "creating"
		case "TERMINATING", "TERMINATED":
			status = "terminated"
		case "FAILED":
			status = "failed"
		default:
			status = "available"
		}
		return &types.Database{
			ID:          d.ID,
			Name:        d.DisplayName,
			CloudType:   "oracle",
			Region:      p.region,
			Status:      status,
			Engine:      "oracle_db",
			EngineVer:   d.DbVersion,
			InstanceCls: d.Shape,
			Spec: map[string]interface{}{
				"shape":        d.Shape,
				"nodeCount":    d.NodeCount,
				"cpuCoreCount": d.CpuCoreCount,
				"timeCreated":  d.TimeCreated,
			},
			Tags: d.FreeformTags,
		}, nil
	}

	// Try Autonomous Database
	adbEndpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20160918/autonomousDatabases/%s", p.region, id)
	resp, err = p.ociRequest(ctx, "GET", adbEndpoint, nil)
	if err != nil {
		return nil, err
	}
	var d struct {
		ID                  string            `json:"id"`
		DisplayName         string            `json:"displayName"`
		DbName              string            `json:"dbName"`
		LifecycleState      string            `json:"lifecycleState"`
		CpuCoreCount        int               `json:"cpuCoreCount"`
		DataStorageSizeInTBs int              `json:"dataStorageSizeInTBs"`
		DbVersion           string            `json:"dbVersion"`
		FreeformTags        map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &d); err != nil {
		return nil, err
	}
	status := "available"
	switch d.LifecycleState {
	case "AVAILABLE":
		status = "available"
	case "PROVISIONING":
		status = "creating"
	case "STOPPED":
		status = "stopped"
	case "TERMINATING", "TERMINATED":
		status = "terminated"
	case "FAILED":
		status = "failed"
	default:
		status = "available"
	}
	return &types.Database{
		ID:          d.ID,
		Name:        d.DisplayName,
		CloudType:   "oracle",
		Region:      p.region,
		Status:      status,
		Engine:      "autonomous",
		EngineVer:   d.DbVersion,
		InstanceCls: "autonomous",
		Spec: map[string]interface{}{
			"dbName":              d.DbName,
			"cpuCoreCount":        d.CpuCoreCount,
			"dataStorageSizeInTBs": d.DataStorageSizeInTBs,
			"dbVersion":           d.DbVersion,
		},
		Tags: d.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetLoadBalancer(ctx context.Context, id string) (*types.LoadBalancer, error) {
	endpoint := fmt.Sprintf("https://iaas.%s.oraclecloud.com/20170115/loadBalancers/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var lb struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		LifecycleState string            `json:"lifecycleState"`
		ShapeName      string            `json:"shapeName"`
		IsPrivate      bool              `json:"isPrivate"`
		SubnetIds      []string          `json:"subnetIds"`
		FreeformTags   map[string]string `json:"freeformTags"`
		IpAddresses    []struct {
			IpAddress string `json:"ipAddress"`
			IsPublic  bool   `json:"isPublic"`
		} `json:"ipAddresses"`
	}
	if err := json.Unmarshal(resp, &lb); err != nil {
		return nil, err
	}
	status := "active"
	switch lb.LifecycleState {
	case "ACTIVE":
		status = "active"
	case "CREATING":
		status = "creating"
	case "DELETING", "DELETED":
		status = "deleted"
	case "FAILED":
		status = "failed"
	default:
		status = "active"
	}
	ips := make([]string, 0, len(lb.IpAddresses))
	for _, ip := range lb.IpAddresses {
		ips = append(ips, ip.IpAddress)
	}
	scheme := "public"
	if lb.IsPrivate {
		scheme = "private"
	}
	return &types.LoadBalancer{
		ID:        lb.ID,
		Name:      lb.DisplayName,
		CloudType: "oracle",
		Region:    p.region,
		Status:    status,
		LBType:    lb.ShapeName,
		Scheme:    scheme,
		Spec: map[string]interface{}{
			"shapeName":   lb.ShapeName,
			"isPrivate":   lb.IsPrivate,
			"subnetIds":   lb.SubnetIds,
			"ipAddresses": ips,
		},
		Tags: lb.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetBucket(ctx context.Context, id string) (*types.Bucket, error) {
	// First get the namespace
	nsEndpoint := fmt.Sprintf("https://objectstorage.%s.oraclecloud.com/20160918/ns", p.region)
	nsResp, err := p.ociRequest(ctx, "GET", nsEndpoint, nil)
	if err != nil {
		return nil, err
	}
	var namespace string
	if err := json.Unmarshal(nsResp, &namespace); err != nil {
		return nil, err
	}

	// Get bucket by name (the ID is the bucket name in object storage)
	endpoint := fmt.Sprintf("https://objectstorage.%s.oraclecloud.com/n/%s/b/%s", p.region, namespace, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var b struct {
		ID                string            `json:"id"`
		Name              string            `json:"name"`
		Namespace         string            `json:"namespace"`
		CompartmentId     string            `json:"compartmentId"`
		CreatedBy         string            `json:"createdBy"`
		TimeCreated       string            `json:"timeCreated"`
		ObjectCount       int64             `json:"objectCount"`
		StorageSizeInBytes int64            `json:"storageSizeInBytes"`
		FreeformTags      map[string]string `json:"freeformTags"`
		Etag              string            `json:"etag"`
	}
	if err := json.Unmarshal(resp, &b); err != nil {
		return nil, err
	}
	return &types.Bucket{
		ID:        b.ID,
		Name:      b.Name,
		CloudType: "oracle",
		Region:    p.region,
		Status:    "active",
		Spec: map[string]interface{}{
			"namespace":          b.Namespace,
			"compartmentId":      b.CompartmentId,
			"createdBy":          b.CreatedBy,
			"timeCreated":        b.TimeCreated,
			"objectCount":        b.ObjectCount,
			"storageSizeInBytes": b.StorageSizeInBytes,
			"etag":               b.Etag,
		},
		Tags: b.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetCluster(ctx context.Context, id string) (*types.Cluster, error) {
	endpoint := fmt.Sprintf("https://oke.%s.oraclecloud.com/20180222/clusters/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var c struct {
		ID                   string            `json:"id"`
		Name                 string            `json:"name"`
		LifecycleState       string            `json:"lifecycleState"`
		KubernetesVersion    string            `json:"kubernetesVersion"`
		ClusterPodNetworkOptions []interface{} `json:"clusterPodNetworkOptions"`
		VcnId                string            `json:"vcnId"`
		FreeformTags         map[string]string `json:"freeformTags"`
		Options              interface{}       `json:"options"`
		EndpointConfig       interface{}       `json:"endpointConfig"`
		TimeCreated          string            `json:"timeCreated"`
	}
	if err := json.Unmarshal(resp, &c); err != nil {
		return nil, err
	}
	status := "active"
	switch c.LifecycleState {
	case "ACTIVE":
		status = "active"
	case "CREATING":
		status = "creating"
	case "DELETING", "DELETED":
		status = "deleted"
	case "FAILED":
		status = "failed"
	case "UPDATING":
		status = "updating"
	default:
		status = "active"
	}
	return &types.Cluster{
		ID:          c.ID,
		Name:        c.Name,
		CloudType:   "oracle",
		Region:      p.region,
		Status:      status,
		ClusterType: "oke",
		Version:     c.KubernetesVersion,
		Spec: map[string]interface{}{
			"vcnId":                   c.VcnId,
			"clusterPodNetworkOptions": c.ClusterPodNetworkOptions,
			"options":                 c.Options,
			"endpointConfig":          c.EndpointConfig,
		},
		Tags: c.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetFunction(ctx context.Context, id string) (*types.Function, error) {
	endpoint := fmt.Sprintf("https://functions.%s.oraclecloud.com/20181201/functions/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var fn struct {
		ID             string            `json:"id"`
		DisplayName    string            `json:"displayName"`
		LifecycleState string            `json:"lifecycleState"`
		Image          string            `json:"image"`
		ImageDigest    string            `json:"imageDigest"`
		MemoryInMBs    int64             `json:"memoryInMBs"`
		TimeoutInSeconds int             `json:"timeoutInSeconds"`
		FreeformTags   map[string]string `json:"freeformTags"`
		InvokeEndpoint string            `json:"invokeEndpoint"`
		ApplicationId  string            `json:"applicationId"`
	}
	if err := json.Unmarshal(resp, &fn); err != nil {
		return nil, err
	}
	status := "active"
	switch fn.LifecycleState {
	case "ACTIVE":
		status = "active"
	case "CREATING":
		status = "creating"
	case "DELETING", "DELETED":
		status = "deleted"
	case "FAILED":
		status = "failed"
	default:
		status = "active"
	}
	return &types.Function{
		ID:         fn.ID,
		Name:       fn.DisplayName,
		CloudType:  "oracle",
		Region:     p.region,
		Status:     status,
		Timeout:    fn.TimeoutInSeconds,
		MemorySize: int(fn.MemoryInMBs),
		Spec: map[string]interface{}{
			"image":         fn.Image,
			"imageDigest":   fn.ImageDigest,
			"invokeEndpoint": fn.InvokeEndpoint,
			"applicationId": fn.ApplicationId,
		},
		Tags: fn.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetDNSZone(ctx context.Context, id string) (*types.DNSZone, error) {
	endpoint := fmt.Sprintf("https://dns.%s.oraclecloud.com/20180115/zones/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var z struct {
		ID             string            `json:"id"`
		Name           string            `json:"name"`
		ZoneType       string            `json:"zoneType"`
		LifecycleState string            `json:"lifecycleState"`
		Serial         int64             `json:"serial"`
		Self           string            `json:"self"`
		FreeformTags   map[string]string `json:"freeformTags"`
	}
	if err := json.Unmarshal(resp, &z); err != nil {
		return nil, err
	}
	status := "active"
	switch z.LifecycleState {
	case "ACTIVE":
		status = "active"
	case "CREATING":
		status = "creating"
	case "DELETING", "DELETED":
		status = "deleted"
	case "FAILED":
		status = "failed"
	default:
		status = "active"
	}
	return &types.DNSZone{
		ID:        z.ID,
		Name:      z.Name,
		CloudType: "oracle",
		Region:    p.region,
		Status:    status,
		ZoneType:  strings.ToLower(z.ZoneType),
		Spec: map[string]interface{}{
			"serial": z.Serial,
			"self":   z.Self,
		},
		Tags: z.FreeformTags,
	}, nil
}

func (p *OracleProvider) GetCertificate(ctx context.Context, id string) (*types.Certificate, error) {
	endpoint := fmt.Sprintf("https://certs.%s.oraclecloud.com/20210224/certificates/%s", p.region, id)
	resp, err := p.ociRequest(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	var c struct {
		ID                        string            `json:"id"`
		DisplayName               string            `json:"displayName"`
		LifecycleState            string            `json:"lifecycleState"`
		IssuerCertificateAuthority string           `json:"issuerCertificateAuthority"`
		CertificateRules          []interface{}     `json:"certificateRules"`
		ConfigType                string            `json:"configType"`
		FreeformTags              map[string]string `json:"freeformTags"`
		Subject                   interface{}       `json:"subject"`
		TimeOfDeletion            string            `json:"timeOfDeletion"`
	}
	if err := json.Unmarshal(resp, &c); err != nil {
		return nil, err
	}
	status := "active"
	switch c.LifecycleState {
	case "ACTIVE":
		status = "active"
	case "CREATING":
		status = "creating"
	case "DELETING", "DELETED":
		status = "deleted"
	case "FAILED":
		status = "failed"
	case "UPDATING":
		status = "updating"
	case "PENDING_DELETION":
		status = "pending_deletion"
	default:
		status = "active"
	}
	return &types.Certificate{
		ID:        c.ID,
		Name:      c.DisplayName,
		CloudType: "oracle",
		Region:    p.region,
		Status:    status,
		Issuer:    c.IssuerCertificateAuthority,
		Spec: map[string]interface{}{
			"configType":       c.ConfigType,
			"certificateRules": c.CertificateRules,
			"subject":          c.Subject,
			"timeOfDeletion":   c.TimeOfDeletion,
		},
		Tags: c.FreeformTags,
	}, nil
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

	log.Printf("oracle DoRawRequest: method=%s url=%s keyID=%s", method, reqURL, p.keyID)

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

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
