# Oracle Cloud CLI (oci) Reference

## Description
Oracle Cloud Infrastructure CLI for managing OCI resources. Used for creating, configuring, and managing OCI services like Compute instances, Networking, Storage, etc.

## Authentication
```bash
# Setup CLI config
oci setup config

# Config file location: ~/.oci/config
# Fields: user, fingerprint, tenancy, region, key_file

# List profiles
oci iam availability-domain list --query "data[].name"

# Test connection
oci iam user list --query "data[0].{name:name,email:email}"
```

## Compute Instances
```bash
# List instances
oci compute instance list --compartment-id <compartment-ocid>

# Get instance details
oci compute instance get --instance-id <instance-ocid>

# Start instance
oci compute instance action --instance-id <ocid> --action START

# Stop instance
oci compute instance action --instance-id <ocid> --action STOP

# Reboot instance
oci compute instance action --instance-id <ocid> --action SOFTRESET

# Create instance (via CLI or console - complex)
oci compute instance launch \
  --compartment-id <compartment> \
  --availability-domain <ad> \
  --shape VM.Standard.E4.Flex \
  --image-id <image-ocid> \
  --subnet-id <subnet-ocid> \
  --display-name <name>

# Delete instance
oci compute instance terminate --instance-id <ocid> --preserve-boot-volume false
```

## Networking
```bash
# List VCNs
oci network vcn list --compartment-id <compartment>

# List subnets
oci network subnet list --compartment-id <compartment>

# List security lists
oci network security-list list --compartment-id <compartment>

# List internet gateways
oci network internet-gateway list --compartment-id <compartment>

# Get VCN details
oci network vcn get --vcn-id <vcn-ocid>
```

## Storage
```bash
# List block volumes
oci bv volume list --compartment-id <compartment>

# List boot volumes
oci bv boot-volume list --compartment-id <compartment>

# Create block volume
oci bv volume create \
  --compartment-id <compartment> \
  --availability-domain <ad> \
  --display-name <name> \
  --size-in-gbs 50

# Attach volume to instance
oci bv volume-attachment attach \
  --instance-id <instance-ocid> \
  --volume-id <volume-ocid> \
  --type paravirtualized

# Delete volume
oci bv volume delete --volume-id <ocid> --force
```

## Images
```bash
# List platform images
oci compute image list --compartment-id <compartment> --shape VM.Standard.E4.Flex

# Get image details
oci compute image get --image-id <image-ocid>

# List custom images
oci compute image list --compartment-id <compartment> --source boot-volume
```

## Load Balancers
```bash
# List load balancers
oci lb load-balancer list --compartment-id <compartment>

# Get health status
oci lb backend-set-health get --load-balancer-id <lb-ocid> --backend-set-name <name>
```

## Common Query Patterns
```bash
# List all instances in compartment
oci compute instance list --compartment-id <compartment> \
  --query "data[].{Name:display-name,State:lifecycle-state,Shape:shape}"

# Get public IP of instance
oci compute instance list-vnics --instance-id <ocid> \
  --query "data[0].{PublicIP:public-ip,PrivateIP:private-ip}"

# List all compartments
oci iam compartment list --query "data[].{Name:name,ID:id}"

# Get availability domains
oci iam availability-domain list --query "data[].name"
```

## Key Concepts
- **Compartment**: Resource isolation boundary (like AWS VPC)
- **Availability Domain**: Data center within a region
- **VCN**: Virtual Cloud Network (like AWS VPC)
- **Security List**: Network firewall rules (like AWS Security Groups)

## Free Tier Services
- Compute: 2 VM.Standard.E4.Flex (1/8 OCPU, 1GB RAM) always free
- Storage: 200GB block volume, 10GB object storage always free
- Networking: 10GB/month outbound data transfer always free
- Load Balancer: 1 always free instance (10 Mbps)
