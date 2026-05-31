# Oracle Cloud Infrastructure (OCI) REST API Reference

## Authentication

### API Key Authentication
OCI uses request signing. You need:
- Tenancy OCID
- User OCID
- Private key (PEM format)
- Key fingerprint

### Generate Auth Header (using openssl)
```bash
# For curl, use oci-cli or generate headers manually
# Easiest: use oci-cli which handles signing
oci iam availability-domain list
```

### Using Instance Principal (on OCI instances)
```bash
# No credentials needed on OCI compute instances
curl -s -H "Authorization: Bearer Oracle" \
  https://iaas.{region}.oraclecloud.com/20160918/instances
```

## Common Endpoints

Base URL: `https://iaas.{region}.oraclecloud.com/20160918`

### List Availability Domains
```bash
oci iam availability-domain list
```

### List Compartments
```bash
oci iam compartment list
```

## Compute

### List Instances
```bash
oci compute instance list --compartment-id {compartment_ocid}
```

### Get Instance Status
```bash
oci compute instance get --instance-id {instance_ocid}
```

### Start/Stop/Restart Instance
```bash
# Start
oci compute instance action --instance-id {ocid} --action START

# Stop
oci compute instance action --instance-id {ocid} --action STOP

# Soft reset (restart)
oci compute instance action --instance-id {ocid} --action SOFTRESET
```

### List Instance Shapes
```bash
oci compute shape list --compartment-id {compartment_ocid}
```

### Create Instance (Complex - requires VCN, subnet, etc.)
```bash
# See OCI docs for full create instance request
# Requires: image, shape, VCN, subnet, SSH key
```

## Networking

### List VCNs
```bash
oci network vcn list --compartment-id {compartment_ocid}
```

### List Subnets
```bash
oci network subnet list --compartment-id {compartment_ocid} --vcn-id {vcn_ocid}
```

### List Security Lists
```bash
oci network security-list list --compartment-id {compartment_ocid} --vcn-id {vcn_ocid}
```

## Block Storage

### List Volumes
```bash
oci bv volume list --compartment-id {compartment_ocid}
```

### Create Volume
```bash
oci bv volume create --compartment-id {compartment_ocid} --display-name {name} --size-in-gbs 50
```

## Object Storage

### List Buckets
```bash
oci os bucket list --compartment-id {compartment_ocid}
```

### List Objects
```bash
oci os object list --bucket-name {bucket}
```

## Free Tier Resources
- 2 AMD Compute instances (1/8 OCPU each, 1 GB RAM each)
- 2 block volumes (50 GB total)
- 10 GB Object Storage
- 10 GB Archive Storage
- 5 GB outbound data transfer/month
- Always Free: VM.Standard.E2.1.Micro instances

## Common Errors
- 401: Authentication failed
- 403: Authorization denied
- 404: Resource not found
- 429: Too many requests (rate limit)
- Compartment OCID format: ocid1.compartment.oc1..aaaa...
- Instance OCID format: ocid1.instance.oc1..aaaa...
