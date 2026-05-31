# Tencent Cloud CLI (tccli) Reference

## Description
Tencent Cloud CLI for managing Tencent Cloud resources. Used for creating, configuring, and managing Tencent Cloud services like CVM, COS, CDB, etc.

## Authentication
```bash
# Configure credentials
tccli configure set --secretId <secret-id> --secretKey <secret-key> --region ap-guangzhou

# View configuration
tccli configure get

# List available regions
.tencentcloud region list
```

## CVM (Cloud Virtual Machine)
```bash
# List instances
tccli cvm DescribeInstances

# List instances with filters
tccli cvm DescribeInstances --Filters "[{\"Name\":\"instance-state\",\"Values\":[\"RUNNING\"]}]"

# Get instance details
tccli cvm DescribeInstanceStatus --InstanceIds "[\"ins-xxx\"]"

# Start instance
tccli cvm StartInstances --InstanceIds "[\"ins-xxx\"]"

# Stop instance
tccli cvm StopInstances --InstanceIds "[\"ins-xxx\"]"

# Reboot instance
tccli cvm RebootInstances --InstanceIds "[\"ins-xxx\"]"

# Create instance
tccli cvm RunInstances \
  --InstanceType S5.MEDIUM2 \
  --ImageId img-xxx \
  --InstanceName <name> \
  --VpcId vpc-xxx \
  --SubnetId subnet-xxx

# Delete instance
tccli cvm TerminateInstances --InstanceIds "[\"ins-xxx\"]"
```

## COS (Cloud Object Storage)
```bash
# List buckets
coscli ls

# Upload file
coscli cp <local-file> cos://<bucket>/<path>

# Download file
coscli cp cos://<bucket>/<path> <local-path>

# List objects
coscli ls cos://<bucket>/<path>

# Delete object
coscli rm cos://<bucket>/<path>
```

## CDB (Cloud Database MySQL)
```bash
# List instances
tccli cdb DescribeDBInstances

# Get instance details
tccli cdb DescribeDBInstances --InstanceIds "[\"cdb-xxx\"]"

# Create instance
tccli cdb CreateDBInstance \
  --DBVersion 5.7 \
  --Memory 1000 \
  --Volume 50 \
  --InstanceName <name>

# Start instance
tccli cdb StartDBInstance --InstanceId cdb-xxx

# Stop instance
tccli cdb StopDBInstance --InstanceId cdb-xxx
```

## CLB (Cloud Load Balancer)
```bash
# List load balancers
tccli clb DescribeLoadBalancers

# Get listener details
tccli clb DescribeListeners --LoadBalancerId lb-xxx
```

## VPC (Virtual Private Cloud)
```bash
# List VPCs
tccli vpc DescribeVpcs

# List subnets
tccli vpc DescribeSubnets --VpcId vpc-xxx

# List security groups
tccli vpc DescribeSecurityGroups
```

## Common Query Patterns
```bash
# List all instances across regions
tccli cvm DescribeInstances --region ap-guangzhou
tccli cvm DescribeInstances --region ap-beijing
tccli cvm DescribeInstances --region ap-shanghai

# Filter by status
tccli cvm DescribeInstances --Filters "[{\"Name\":\"instance-state\",\"Values\":[\"RUNNING\"]}]"

# Get public IP
tccli cvm DescribeInstances --InstanceIds "[\"ins-xxx\"]" --query "Instances[0].PublicAddresses"

# List all resources (custom)
for region in ap-guangzhou ap-beijing ap-shanghai; do
  echo "=== $region ==="
  tccli cvm DescribeInstances --region $region --query "Instances[].{Name:InstanceName,Status:InstanceState,IP:PublicAddresses}"
done
```

## TC3-HMAC-SHA256 Authentication
Tencent Cloud API uses TC3-HMAC-SHA256 signature for authentication. The `tccli` tool handles this automatically. For programmatic access:
1. Sign requests with SecretId + SecretKey
2. Use HMAC-SHA256 for signing
3. Include authorization header in API calls

## Free Tier Services
- CVM: 1 free instance (S5.LARGE8, 1 month trial)
- COS: 5GB storage, 10GB/month download, 12 months free
- CDB: 1 free instance (MySQL 5.7, 1 month trial)
- CDN: 50GB/month free traffic (12 months)
