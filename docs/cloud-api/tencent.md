# Tencent Cloud API Reference

## Authentication

### Signature Version 3 (TC3-HMAC-SHA256)
```bash
# Tencent Cloud uses TC3 signature for API authentication
# SecretId and SecretKey are required

# Step 1: Create canonical request
# Step 2: Create string to sign
# Step 3: Calculate signature
# Step 4: Add Authorization header
```

### Using tencentcloud-sdk-go (Recommended)
```go
// Use official SDK for authentication
import "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
```

### Using curl (Manual Signature)
```bash
# Complex signature process - use SDK when possible
# See: https://www.tencentcloud.com/document/product/1278/46099
```

## Common API Endpoints

Base URL: `https://{product}.tencentcloudapi.com`

### CVM (Cloud Virtual Machine)

#### List Instances
```bash
# Action: DescribeInstances
# POST https://cvm.tencentcloudapi.com
# Body: {"Limit": 10}
```

#### Start Instance
```bash
# Action: StartInstances
# POST https://cvm.tencentcloudapi.com
# Body: {"InstanceIds": ["ins-xxxxx"]}
```

#### Stop Instance
```bash
# Action: StopInstances
# POST https://cvm.tencentcloudapi.com
# Body: {"InstanceIds": ["ins-xxxxx"]}
```

#### Restart Instance
```bash
# Action: RestartInstances
# POST https://cvm.tencentcloudapi.com
# Body: {"InstanceIds": ["ins-xxxxx"]}
```

#### Terminate Instance
```bash
# Action: TerminateInstances
# POST https://cvm.tencentcloudapi.com
# Body: {"InstanceIds": ["ins-xxxxx"]}
```

### COS (Cloud Object Storage)

#### List Buckets
```bash
# GET https://mybucket-1250000000.cos.{region}.myqcloud.com/
# Authorization: COS {SecretId}:{Signature}
```

#### Get Bucket Objects
```bash
# GET https://mybucket-1250000000.cos.{region}.myqcloud.com/?max-keys=100
```

### CBS (Cloud Block Storage)

#### List Disks
```bash
# Action: DescribeDisks
# POST https://cbs.tencentcloudapi.com
# Body: {"Limit": 100}
```

### VPC (Virtual Private Cloud)

#### List VPCs
```bash
# Action: DescribeVpcs
# POST https://vpc.tencentcloudapi.com
# Body: {"Limit": 100}
```

#### List Subnets
```bash
# Action: DescribeSubnets
# POST https://vpc.tencentcloudapi.com
# Body: {"Limit": 100}
```

## Free Tier Resources
- 2 CVM instances (S5.SMALL1, 2 CPU, 1 GB RAM) for 1 month
- 50 GB SSD云硬盘
- 10 GB COS 标准存储
- 100 GB CDN 流量

## Common Errors
- AuthFailure: Signature verification failed
- InvalidParameter: Invalid request parameter
- ResourceNotFound: Resource does not exist
- LimitExceeded: Rate limit exceeded
- UnsupportedOperation: Operation not supported

## API Action Reference
| Product | Action | Description |
|---------|--------|-------------|
| CVM | DescribeInstances | List instances |
| CVM | StartInstances | Start instances |
| CVM | StopInstances | Stop instances |
| CVM | RestartInstances | Restart instances |
| CVM | TerminateInstances | Delete instances |
| CBS | DescribeDisks | List disks |
| VPC | DescribeVpcs | List VPCs |
| VPC | DescribeSubnets | List subnets |
