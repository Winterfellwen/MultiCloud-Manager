# Oracle Cloud Infrastructure (OCI) REST API Reference

## Authentication

OCI uses RSA-SHA256 request signing. The server handles signing automatically — you only need to provide the correct URL with required parameters. Credentials (tenancy OCID, user OCID, private key, fingerprint) are stored server-side.

**Key format:** All OCIDs follow the pattern `ocid1.{resource_type}.oc1..{realm}{unique_string}`

**Common OCID types:**
- Compartment: `ocid1.compartment.oc1..aaaa...`
- Instance: `ocid1.instance.oc1..aaaa...`
- VCN: `ocid1.vcn.oc1..aaaa...`
- Subnet: `ocid1.subnet.oc1..aaaa...`
- Volume: `ocid1.volume.oc1..aaaa...`

## Base URL

```
https://iaas.{region}.oraclecloud.com/20160918
```

**Common regions:** us-ashburn-1, us-phoenix-1, eu-frankfurt-1, uk-london-1, ap-tokyo-1, ap-seoul-1, ap-mumbai-1, ap-sydney-1, sa-saopaulo-1, me-jeddah-1

**IMPORTANT:** Most OCI APIs require `compartmentId` as a mandatory query parameter. Always include it.

## Identity

### List Availability Domains
```
GET /20160918/availabilityDomains?compartmentId={compartment_ocid}
```
**Required:** compartmentId (query parameter)
**Returns:** List of availability domains in the compartment

### List Compartments
```
GET /20160918/compartmentSubscriptions?compartmentId={tenancy_ocid}
```
**Required:** compartmentId (use tenancy OCID to list root compartments)
**Returns:** List of compartments the user has access to

### List Compartments (alternative — list children)
```
GET /20160918/compartments?compartmentId={parent_compartment_ocid}
```
**Returns:** Child compartments of the specified compartment

## Compute

### List Instances
```
GET /20160918/instances?compartmentId={compartment_ocid}
```
**Required:** compartmentId

### Get Instance
```
GET /20160918/instances/{instance_ocid}
```

### Instance Action (Start / Stop / Reset)
```
POST /20160918/instances/{instance_ocid}/actions/{action}
```
**Body:** `{}` (empty JSON body)
**Actions:** START, STOP, SOFTRESET, REBOOT, RESET

### List Shapes
```
GET /20160918/shapes?compartmentId={compartment_ocid}
```
**Optional:** imageId, compartmentId

### Get Compute Capacity
```
GET /20160918/capacities?compartmentId={compartment_ocid}&ad={availability_domain}
```

## Networking

### List VCNs
```
GET /20160918/vcns?compartmentId={compartment_ocid}
```

### Get VCN
```
GET /20160918/vcns/{vcn_ocid}
```

### List Subnets
```
GET /20160918/subnets?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```
**Required:** compartmentId, vcnId

### List Security Lists
```
GET /20160918/securityLists?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```

### List Route Tables
```
GET /20160918/routeTables?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```

### List Network Security Groups (NSGs)
```
GET /20160918/networkSecurityGroups?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```

### List Internet Gateways
```
GET /20160918/internetGateways?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```

### List NAT Gateways
```
GET /20160918/natGateways?compartmentId={compartment_ocid}&vcnId={vcn_ocid}
```

## Block Storage

### List Volumes
```
GET /20160918/volumes?compartmentId={compartment_ocid}
```

### Get Volume
```
GET /20160918/volumes/{volume_ocid}
```

### Create Volume
```
POST /20160918/volumes
```
**Body:**
```json
{
  "compartmentId": "{compartment_ocid}",
  "displayName": "{volume_name}",
  "sizeInGBs": 50,
  "availabilityDomain": "{ad_name}"
}
```

### Update Volume
```
PUT /20160918/volumes/{volume_ocid}
```
**Body:** `{ "displayName": "{new_name}", "sizeInGBs": 100 }`

### Delete Volume
```
DELETE /20160918/volumes/{volume_ocid}
```

### List Volume Attachments
```
GET /20160918/volumeAttachments?compartmentId={compartment_ocid}
```

### Attach Volume
```
POST /20160918/volumeAttachments
```
**Body:**
```json
{
  "compartmentId": "{compartment_ocid}",
  "instanceId": "{instance_ocid}",
  "volumeId": "{volume_ocid}",
  "type": "paravirtualized"
}
```

### Detach Volume
```
DELETE /20160918/volumeAttachments/{attachment_ocid}
```

## Object Storage

### List Buckets (Namespace)
```
GET /20160918/b?compartmentId={compartment_ocid}&namespaceName={namespace}
```
**Required:** compartmentId, namespaceName
**Note:** Get namespace first: `GET /20160918/namespaces/{compartment_ocid}`

### List Objects
```
GET /20160918/b/{namespace}/{bucket_name}?limit=100
```

### Get Object
```
GET /20160918/b/{namespace}/{bucket_name}/objects/{object_name}
```

## Load Balancer

### List Load Balancers
```
GET /20160918/loadBalancers?compartmentId={compartment_ocid}
```

### Get Load Balancer Health
```
GET /20160918/loadBalancers/{lb_ocid}/healthStatus
```

## Database

### List DB Systems
```
GET /20160918/dbSystems?compartmentId={compartment_ocid}
```

### List Autonomous Databases
```
GET /20160918/autonomousDatabases?compartmentId={compartment_ocid}
```

## Common Errors

| Status | Code | Meaning |
|--------|------|---------|
| 401 | | Authentication failed — check credentials |
| 404 | NotAuthorizedOrNotFound | Missing required parameter (usually compartmentId) or wrong OCID |
| 409 | | Resource already exists or conflict |
| 429 | | Rate limit exceeded — retry with backoff |
| 500 | | Internal server error — retry |

## Free Tier Limits
- 2 AMD Compute instances (VM.Standard.E2.1.Micro, 1/8 OCPU, 1GB RAM each)
- 2 Block Volumes (total 200 GB)
- 10 GB Object Storage
- 10 GB Archive Storage
- 5 GB/month outbound data transfer
