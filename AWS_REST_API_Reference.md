# AWS REST API Reference

> 适用于 LLM Agent 调用的 AWS 核心服务 REST API 参考文档
> 文档更新日期：2026-06-15

---

## 目录

- [1. 认证方式 (Authentication)](#1-认证方式-authentication)
- [2. 通用参数与 Endpoint](#2-通用参数与-endpoint)
- [3. EC2 - 弹性计算云](#3-ec2---弹性计算云)
- [4. S3 - 简单存储服务](#4-s3---简单存储服务)
- [5. VPC - 虚拟私有云](#5-vpc---虚拟私有云)
- [6. IAM - 身份与访问管理](#6-iam---身份与访问管理)
- [7. CloudWatch / Cost Explorer - 成本监控](#7-cloudwatch--cost-explorer---成本监控)
- [8. Free Tier - 免费套餐](#8-free-tier---免费套餐)
- [9. 常见错误码](#9-常见错误码)
- [10. 最佳实践与注意事项](#10-最佳实践与注意事项)

---

## 1. 认证方式 (Authentication)

### 1.1 AWS Signature Version 4 (SigV4)

AWS 所有 REST API 请求必须使用 **AWS Signature Version 4** 进行签名认证。

**认证要素：**

| 要素 | 说明 |
|------|------|
| `AWS_ACCESS_KEY_ID` | 访问密钥 ID（以 `AKIA` 开头，20 字符） |
| `AWS_SECRET_ACCESS_KEY` | 秘密访问密钥（40 字符） |
| `AWS_REGION` | 区域代码（如 `us-east-1`） |
| `AWS_SERVICE` | 服务代码（如 `ec2`、`s3`、`iam`） |

**签名流程（5 步）：**

```
1. 创建规范请求 (Canonical Request)
   HTTPMethod\n
   CanonicalURI\n
   CanonicalQueryString\n
   CanonicalHeaders\n
   SignedHeaders\n
   HashedPayload

2. 创建规范请求的哈希
   Hex(SHA256Hash(CanonicalRequest))

3. 创建待签名字符串 (String to Sign)
   AWS4-HMAC-SHA256\n
   Timestamp\n
   YYYYMMDD/region/service/aws4_request\n
   HashedCanonicalRequest

4. 派生签名密钥 (Signing Key)
   DateKey    = HMAC-SHA256("AWS4" + SecretKey, Date)
   DateRegionKey = HMAC-SHA256(DateKey, Region)
   DateRegionServiceKey = HMAC-SHA256(DateRegionKey, Service)
   SigningKey = HMAC-SHA256(DateRegionServiceKey, "aws4_request")

5. 计算签名
   Signature = Hex(HMAC-SHA256(SigningKey, StringToSign))
```

**Authorization Header 格式：**

```
Authorization: AWS4-HMAC-SHA256
  Credential=AKIAIOSFODNN7EXAMPLE/20260615/us-east-1/ec2/aws4_request,
  SignedHeaders=host;x-amz-date,
  Signature=fe5f80f77d5fa3beca038d5ae8b2d5c4d7e0b3e1f6a9c8b7d6e5f4a3b2c1d0e9
```

### 1.2 使用 AWS CLI 签名（推荐）

对于 LLM Agent，推荐使用 AWS CLI 代替手动签名：

```bash
# 安装 AWS CLI
pip install awscli

# 配置凭证
aws configure
# AWS Access Key ID: AKIAIOSFODNN7EXAMPLE
# AWS Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# Default region: us-east-1
# Default output: json
```

### 1.3 使用 awscurl（带签名的 curl）

```bash
# 安装 awscurl
pip install awscurl

# 等效于带签名的 curl
awscurl --service ec2 --region us-east-1 \
  "https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15"
```

### 1.4 手动签名 curl 示例（EC2 Query API）

EC2 使用 **Query API**（HTTP GET/POST + 查询参数），签名后直接通过 URL 调用：

```bash
# 使用 AWS CLI 的 curl 签名方式（通过 presigned URL 概念）
# 注意：EC2 Query API 需要对所有参数进行签名，手动构建非常复杂
# 推荐使用 AWS CLI 或 SDK

# AWS CLI 方式（最简单）
aws ec2 describe-instances --region us-east-1 --output json

# Python boto3 方式（推荐用于程序化调用）
import boto3
client = boto3.client('ec2', region_name='us-east-1')
response = client.describe_instances()
```

### 1.5 临时安全凭证 (STS)

使用临时凭证时，需额外添加 `X-Amz-Security-Token` header：

```
X-Amz-Security-Token: AQoDYXdzEJr...<session-token>
```

---

## 2. 通用参数与 Endpoint

### 2.1 Endpoint 格式

```
https://{service}.{region}.amazonaws.com
```

| 服务 | 服务代码 | Endpoint 示例 (us-east-1) |
|------|---------|--------------------------|
| EC2 | `ec2` | `https://ec2.us-east-1.amazonaws.com` |
| S3 | `s3` | `https://s3.us-east-1.amazonaws.com` |
| VPC | `ec2` | `https://ec2.us-east-1.amazonaws.com` (VPC 操作通过 EC2 API) |
| IAM | `iam` | `https://iam.amazonaws.com` (全局端点，无区域) |
| CloudWatch | `monitoring` | `https://monitoring.us-east-1.amazonaws.com` |
| Cost Explorer | `ce` | `https://ce.us-east-1.amazonaws.com` |
| STS | `sts` | `https://sts.amazonaws.com` (全局端点) |

### 2.2 常用 Region 列表

| 区域名称 | Region Code |
|---------|-------------|
| US East (N. Virginia) | `us-east-1` |
| US East (Ohio) | `us-east-2` |
| US West (N. California) | `us-west-1` |
| US West (Oregon) | `us-west-2` |
| Asia Pacific (Tokyo) | `ap-northeast-1` |
| Asia Pacific (Seoul) | `ap-northeast-2` |
| Asia Pacific (Singapore) | `ap-southeast-1` |
| Asia Pacific (Sydney) | `ap-southeast-2` |
| Asia Pacific (Mumbai) | `ap-south-1` |
| Europe (Frankfurt) | `eu-central-1` |
| Europe (Ireland) | `eu-west-1` |
| Europe (London) | `eu-west-2` |

### 2.3 EC2 Query API 通用参数

所有 EC2/VPC API 请求需要以下公共参数：

| 参数 | 必需 | 说明 |
|------|------|------|
| `Action` | 是 | API 操作名称（如 `DescribeInstances`） |
| `Version` | 是 | API 版本（当前最新：`2016-11-15`） |
| `AWSAccessKeyId` | 是* | AWS 访问密钥 ID（签名时包含） |
| `Signature` | 是* | 请求签名（签名时计算） |
| `SignatureMethod` | 是* | 签名方法：`HmacSHA256` |
| `SignatureVersion` | 是* | 签名版本：`2`（EC2 Query API 使用 SigV2 兼容或 SigV4） |
| `Timestamp` | 是* | 请求时间戳（ISO 8601 格式） |

> *注：这些参数在通过 AWS CLI/SDK 调用时自动处理。

### 2.4 IAM Query API 通用参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `Action` | 是 | API 操作名称 |
| `Version` | 是 | IAM API 版本（当前最新：`2010-05-08`） |

---

## 3. EC2 - 弹性计算云

**API 版本：** `2016-11-15`
**服务代码：** `ec2`
**Endpoint：** `https://ec2.{region}.amazonaws.com`
**协议：** HTTPS (Query API - POST/GET)

### 3.1 查询实例列表 - DescribeInstances

```bash
# AWS CLI
aws ec2 describe-instances \
  --region us-east-1 \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,PrivateIpAddress]' \
  --output table

# 指定实例 ID 查询
aws ec2 describe-instances \
  --instance-ids i-0abcd1234efgh5678 \
  --region us-east-1

# 分页查询
aws ec2 describe-instances \
  --max-items 10 \
  --starting-token <next-token> \
  --region us-east-1
```

**Query API (curl + 签名):**

```bash
# 使用 awscurl
awscurl --service ec2 --region us-east-1 \
  "https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15&Filter.1.Name=instance-state-name&Filter.1.Value.1=running"

# Python boto3
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.describe_instances(
    Filters=[
        {'Name': 'instance-state-name', 'Values': ['running']}
    ]
)
for r in resp['Reservations']:
    for i in r['Instances']:
        print(i['InstanceId'], i['InstanceType'], i['State']['Name'])
```

**常用 Filter：**

| Filter 名称 | 说明 | 示例值 |
|-------------|------|--------|
| `instance-state-name` | 实例状态 | `pending`, `running`, `stopping`, `stopped`, `terminated` |
| `instance-type` | 实例类型 | `t2.micro`, `t3.medium`, `m5.large` |
| `image-id` | AMI ID | `ami-0abcdef1234567890` |
| `availability-zone` | 可用区 | `us-east-1a` |
| `vpc-id` | VPC ID | `vpc-0123456789abcdef0` |
| `tag:key` | 标签键值 | `Name=my-server` |

**实例状态码：**

| 状态码 | 状态名称 |
|--------|---------|
| 0 | pending |
| 16 | running |
| 32 | shutting-down |
| 48 | terminated |
| 64 | stopping |
| 80 | stopped |

### 3.2 创建实例 - RunInstances

```bash
# AWS CLI - 创建单个 t2.micro 实例
aws ec2 run-instances \
  --region us-east-1 \
  --image-id ami-0abcdef1234567890 \
  --instance-type t2.micro \
  --key-name my-key-pair \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0123456789abcdef0 \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=my-instance}]" \
  --count 1

# 最简创建（使用默认 VPC 和安全组）
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t2.micro \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.run_instances(
    ImageId='ami-0abcdef1234567890',
    InstanceType='t2.micro',
    MinCount=1,
    MaxCount=1,
    KeyName='my-key-pair',
    SecurityGroupIds=['sg-0123456789abcdef0'],
    SubnetId='subnet-0123456789abcdef0',
    TagSpecifications=[
        {
            'ResourceType': 'instance',
            'Tags': [{'Key': 'Name', 'Value': 'my-instance'}]
        }
    ]
)
instance_id = resp['Instances'][0]['InstanceId']
print(f"Created instance: {instance_id}")
```

**必需参数：**

| 参数 | 说明 |
|------|------|
| `ImageId` | AMI 镜像 ID（必需） |
| `InstanceType` | 实例类型（默认 `m1.small`，推荐 `t2.micro`） |
| `MinCount` | 最小启动数量（默认 1） |
| `MaxCount` | 最大启动数量（默认 1） |

**常用可选参数：**

| 参数 | 说明 |
|------|------|
| `KeyName` | SSH 密钥对名称 |
| `SecurityGroupIds` | 安全组 ID 列表 |
| `SubnetId` | 子网 ID |
| `IamInstanceProfile` | IAM 实例配置文件 |
| `UserData` | 启动用户数据（Base64 编码） |
| `BlockDeviceMappings` | EBS 卷映射 |
| `TagSpecifications` | 资源标签 |

### 3.3 启动实例 - StartInstances

```bash
aws ec2 start-instances \
  --instance-ids i-0abcd1234efgh5678 \
  --region us-east-1
```

### 3.4 停止实例 - StopInstances

```bash
aws ec2 stop-instances \
  --instance-ids i-0abcd1234efgh5678 \
  --region us-east-1

# 强制停止
aws ec2 stop-instances \
  --instance-ids i-0abcd1234efgh5678 \
  --force \
  --region us-east-1
```

### 3.5 终止实例 - TerminateInstances

```bash
aws ec2 terminate-instances \
  --instance-ids i-0abcd1234efgh5678 \
  --region us-east-1
```

> **警告：** 终止操作不可逆，实例将被永久删除（如未启用终止保护）。

### 3.6 查询实例状态 - DescribeInstanceStatus

```bash
# 查询所有实例状态
aws ec2 describe-instance-status \
  --region us-east-1 \
  --include-all-instances

# 查询运行中实例的状态
aws ec2 describe-instance-status \
  --region us-east-1 \
  --filters "Name=instance-state-name,Values=running"

# 查询特定实例
aws ec2 describe-instance-status \
  --instance-ids i-0abcd1234efgh5678 \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.describe_instance_status(IncludeAllInstances=True)
for status in resp['InstanceStatuses']:
    print(
        status['InstanceId'],
        status['InstanceState']['Name'],
        status['InstanceStatus']['Status'],
        status['SystemStatus']['Status']
    )
```

### 3.7 常用 EC2 实例类型

| 类型系列 | 适用场景 | 免费套餐 |
|---------|---------|---------|
| `t2.micro` / `t3.micro` | 通用/开发测试 | 永久免费（750 小时/月） |
| `t3.medium` | 中等负载 Web 服务 | - |
| `m5.large` | 内存密集型应用 | - |
| `c5.large` | 计算密集型 | - |
| `r5.large` | 内存优化/数据库 | - |
| `g4dn.xlarge` | GPU/AI 推理 | - |

---

## 4. S3 - 简单存储服务

**API 版本：** `2006-03-01`
**服务代码：** `s3`
**Endpoint：** `https://s3.{region}.amazonaws.com` 或 `https://{bucket}.s3.{region}.amazonaws.com`
**协议：** REST (HTTP/HTTPS)

> **注意：** S3 使用 **REST API**（标准 HTTP 方法），而非 Query API。S3 支持 Signature Version 4 认证。

### 4.1 列出所有存储桶 - ListBuckets (GET Service)

```bash
# AWS CLI
aws s3 ls

# AWS CLI (s3api)
aws s3api list-buckets --region us-east-1

# 使用 awscurl (REST)
awscurl --service s3 --region us-east-1 \
  "https://s3.us-east-1.amazonaws.com/"
```

**Python boto3:**

```python
import boto3
s3 = boto3.client('s3', region_name='us-east-1')
resp = s3.list_buckets()
for bucket in resp['Buckets']:
    print(bucket['Name'], bucket['CreationDate'])
```

**REST 请求：**

```
GET / HTTP/1.1
Host: s3.us-east-1.amazonaws.com
Date: Mon, 15 Jun 2026 12:00:00 GMT
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260615/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=...
x-amz-content-sha256: UNSIGNED-PAYLOAD
x-amz-date: 20260615T120000Z
```

### 4.2 列出存储桶中的对象 - ListObjectsV2

```bash
# AWS CLI
aws s3 ls s3://my-bucket/

# AWS CLI (s3api)
aws s3api list-objects-v2 \
  --bucket my-bucket \
  --region us-east-1 \
  --max-items 100

# 带前缀过滤
aws s3api list-objects-v2 \
  --bucket my-bucket \
  --prefix logs/ \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
s3 = boto3.client('s3', region_name='us-east-1')
resp = s3.list_objects_v2(Bucket='my-bucket', MaxKeys=100)
for obj in resp.get('Contents', []):
    print(obj['Key'], obj['Size'], obj['LastModified'])
```

**REST 请求：**

```
GET /?list-type=2&max-keys=100&prefix=logs/ HTTP/1.1
Host: my-bucket.s3.us-east-1.amazonaws.com
Authorization: AWS4-HMAC-SHA256 Credential=...
x-amz-content-sha256: UNSIGNED-PAYLOAD
x-amz-date: 20260615T120000Z
```

### 4.3 上传对象 - PutObject

```bash
# AWS CLI
aws s3 cp ./localfile.txt s3://my-bucket/remote/path/file.txt

# AWS CLI (s3api)
aws s3api put-object \
  --bucket my-bucket \
  --key remote/path/file.txt \
  --body ./localfile.txt \
  --content-type "text/plain" \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
s3 = boto3.client('s3', region_name='us-east-1')
s3.put_object(
    Bucket='my-bucket',
    Key='remote/path/file.txt',
    Body=b'Hello, AWS S3!',
    ContentType='text/plain'
)
```

**REST 请求：**

```
PUT /remote/path/file.txt HTTP/1.1
Host: my-bucket.s3.us-east-1.amazonaws.com
Content-Type: text/plain
Content-Length: 14
Authorization: AWS4-HMAC-SHA256 Credential=...
x-amz-content-sha256: <SHA256-of-body>
x-amz-date: 20260615T120000Z

Hello, AWS S3!
```

### 4.4 下载对象 - GetObject

```bash
# AWS CLI
aws s3 cp s3://my-bucket/remote/path/file.txt ./localfile.txt

# AWS CLI (s3api)
aws s3api get-object \
  --bucket my-bucket \
  --key remote/path/file.txt \
  ./localfile.txt \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
s3 = boto3.client('s3', region_name='us-east-1')
resp = s3.get_object(Bucket='my-bucket', Key='remote/path/file.txt')
data = resp['Body'].read()
print(data.decode('utf-8'))
```

**REST 请求：**

```
GET /remote/path/file.txt HTTP/1.1
Host: my-bucket.s3.us-east-1.amazonaws.com
Authorization: AWS4-HMAC-SHA256 Credential=...
x-amz-content-sha256: UNSIGNED-PAYLOAD
x-amz-date: 20260615T120000Z
```

### 4.5 删除对象 - DeleteObject

```bash
# AWS CLI
aws s3 rm s3://my-bucket/remote/path/file.txt

# AWS CLI (s3api)
aws s3api delete-object \
  --bucket my-bucket \
  --key remote/path/file.txt \
  --region us-east-1

# 批量删除
aws s3api delete-objects \
  --bucket my-bucket \
  --delete '{"Objects":[{"Key":"file1.txt"},{"Key":"file2.txt"}]}' \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
s3 = boto3.client('s3', region_name='us-east-1')
s3.delete_object(Bucket='my-bucket', Key='remote/path/file.txt')

# 批量删除
s3.delete_objects(
    Bucket='my-bucket',
    Delete={
        'Objects': [
            {'Key': 'file1.txt'},
            {'Key': 'file2.txt'}
        ]
    }
)
```

### 4.6 创建存储桶 - CreateBucket

```bash
# AWS CLI
aws s3 mb s3://my-bucket --region us-east-1

# AWS CLI (s3api)
aws s3api create-bucket \
  --bucket my-bucket \
  --region us-east-1

# 指定区域（非 us-east-1 需要 LocationConstraint）
aws s3api create-bucket \
  --bucket my-bucket \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1
```

### 4.7 S3 存储类别

| 存储类别 | 适用场景 | 最低存储时长 |
|---------|---------|-------------|
| `STANDARD` | 频繁访问 | 无 |
| `STANDARD_IA` | 不频繁访问 | 30 天 |
| `GLACIER` | 归档 | 90 天 |
| `INTELLIGENT_TIERING` | 未知访问模式 | 无 |
| `DEEP_ARCHIVE` | 长期归档 | 180 天 |

---

## 5. VPC - 虚拟私有云

**API 版本：** `2016-11-15`（与 EC2 共享）
**服务代码：** `ec2`（VPC 操作通过 EC2 API 执行）
**Endpoint：** `https://ec2.{region}.amazonaws.com`

### 5.1 查询 VPC 列表 - DescribeVpcs

```bash
# AWS CLI
aws ec2 describe-vpcs \
  --region us-east-1

# 查询特定 VPC
aws ec2 describe-vpcs \
  --vpc-ids vpc-0123456789abcdef0 \
  --region us-east-1

# 按 CIDR 过滤
aws ec2 describe-vpcs \
  --filters "Name=cidr-block,Values=10.0.0.0/16" \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.describe_vpcs()
for vpc in resp['Vpcs']:
    print(
        vpc['VpcId'],
        vpc['CidrBlock'],
        vpc.get('IsDefault', False)
    )
```

### 5.2 查询子网列表 - DescribeSubnets

```bash
# AWS CLI
aws ec2 describe-subnets \
  --region us-east-1

# 按 VPC 过滤
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=vpc-0123456789abcdef0" \
  --region us-east-1

# 按可用区过滤
aws ec2 describe-subnets \
  --filters "Name=availability-zone,Values=us-east-1a" \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.describe_subnets(
    Filters=[
        {'Name': 'vpc-id', 'Values': ['vpc-0123456789abcdef0']}
    ]
)
for subnet in resp['Subnets']:
    print(
        subnet['SubnetId'],
        subnet['CidrBlock'],
        subnet['AvailabilityZone'],
        subnet['MapPublicIpOnLaunch']
    )
```

### 5.3 查询安全组 - DescribeSecurityGroups

```bash
# AWS CLI
aws ec2 describe-security-groups \
  --region us-east-1

# 查询特定安全组
aws ec2 describe-security-groups \
  --group-ids sg-0123456789abcdef0 \
  --region us-east-1

# 按名称过滤
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=default" \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
ec2 = boto3.client('ec2', region_name='us-east-1')
resp = ec2.describe_security_groups(
    Filters=[
        {'Name': 'vpc-id', 'Values': ['vpc-0123456789abcdef0']}
    ]
)
for sg in resp['SecurityGroups']:
    print(f"=== {sg['GroupId']}: {sg['GroupName']} ===")
    for rule in sg['IpPermissions']:
        protocol = rule.get('IpProtocol', '-1')
        from_port = rule.get('FromPort', '-1')
        to_port = rule.get('ToPort', '-1')
        for ip_range in rule.get('IpRanges', []):
            print(f"  INBOUND: {protocol} {from_port}-{to_port} {ip_range['CidrIp']}")
```

### 5.4 创建安全组 - CreateSecurityGroup

```bash
aws ec2 create-security-group \
  --group-name my-sg \
  --description "My security group" \
  --vpc-id vpc-0123456789abcdef0 \
  --region us-east-1
```

### 5.5 添加安全组规则 - AuthorizeSecurityGroupIngress

```bash
# 开放 SSH (22) 端口
aws ec2 authorize-security-group-ingress \
  --group-id sg-0123456789abcdef0 \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# 开放 HTTPS (443) 端口
aws ec2 authorize-security-group-ingress \
  --group-id sg-0123456789abcdef0 \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region us-east-1
```

---

## 6. IAM - 身份与访问管理

**API 版本：** `2010-05-08`
**服务代码：** `iam`
**Endpoint：** `https://iam.amazonaws.com` (全局端点，无区域前缀)
**协议：** HTTPS (Query API)

> **注意：** IAM 是全局服务，Endpoint 不包含区域。所有 IAM 操作使用同一个全局端点。

### 6.1 列出用户 - ListUsers

```bash
# AWS CLI
aws iam list-users

# 按路径前缀过滤
aws iam list-users --path-prefix /division_abc/

# 分页
aws iam list-users --max-items 50
```

**Python boto3:**

```python
import boto3
iam = boto3.client('iam')
resp = iam.list_users()
for user in resp['Users']:
    print(
        user['UserName'],
        user['UserId'],
        user['Arn'],
        user['CreateDate']
    )
```

**Query API 请求格式：**

```
GET /?Action=ListUsers&Version=2010-05-08 HTTP/1.1
Host: iam.amazonaws.com
Authorization: AWS4-HMAC-SHA256 Credential=...
x-amz-date: 20260615T120000Z
```

### 6.2 创建用户 - CreateUser

```bash
# AWS CLI
aws iam create-user --user-name newuser

# 指定路径
aws iam create-user --user-name newuser --path /developers/

# 带标签
aws iam create-user \
  --user-name newuser \
  --tags Key=Department,Value=Engineering Key=Environment,Value=Production
```

**Python boto3:**

```python
import boto3
iam = boto3.client('iam')
resp = iam.create_user(
    UserName='newuser',
    Path='/developers/',
    Tags=[
        {'Key': 'Department', 'Value': 'Engineering'}
    ]
)
print(resp['User']['Arn'])
```

### 6.3 删除用户 - DeleteUser

```bash
aws iam delete-user --user-name olduser
```

> **注意：** 删除用户前必须先删除该用户的所有访问密钥、登录配置文件、MFA 设备，并将用户从所有组中移除。

### 6.4 列出访问密钥 - ListAccessKeys

```bash
aws iam list-access-keys --user-name myuser
```

### 6.5 创建访问密钥 - CreateAccessKey

```bash
aws iam create-access-key --user-name myuser
```

**响应示例：**

```json
{
  "AccessKey": {
    "UserName": "myuser",
    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "Status": "Active",
    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "CreateDate": "2026-06-15T12:00:00Z"
  }
}
```

> **重要：** SecretAccessKey 只在创建时显示一次，请务必安全保存。

### 6.6 删除访问密钥 - DeleteAccessKey

```bash
aws iam delete-access-key \
  --user-name myuser \
  --access-key-id AKIAIOSFODNN7EXAMPLE
```

### 6.7 附加用户策略 - AttachUserPolicy

```bash
# 附加 AmazonS3ReadOnlyAccess 策略
aws iam attach-user-policy \
  --user-name myuser \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# 附加 AdministratorAccess 策略（谨慎使用）
aws iam attach-user-policy \
  --user-name myuser \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

### 6.8 常用托管策略 ARN

| 策略名称 | ARN | 权限范围 |
|---------|-----|---------|
| `ReadOnlyAccess` | `arn:aws:iam::aws:policy/ReadOnlyAccess` | 所有服务只读 |
| `AdministratorAccess` | `arn:aws:iam::aws:policy/AdministratorAccess` | 所有服务完全访问 |
| `AmazonEC2FullAccess` | `arn:aws:iam::aws:policy/AmazonEC2FullAccess` | EC2 完全访问 |
| `AmazonS3FullAccess` | `arn:aws:iam::aws:policy/AmazonS3FullAccess` | S3 完全访问 |
| `AmazonS3ReadOnlyAccess` | `arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess` | S3 只读 |
| `AmazonVPCFullAccess` | `arn:aws:iam::aws:policy/AmazonVPCFullAccess` | VPC 完全访问 |
| `IAMFullAccess` | `arn:aws:iam::aws:policy/IAMFullAccess` | IAM 完全访问 |
| `AWSCostExplorerReadOnlyAccess` | `arn:aws:iam::aws:policy/AWSCostExplorerReadOnlyAccess` | Cost Explorer 只读 |

---

## 7. CloudWatch / Cost Explorer - 成本监控

### 7.1 Cost Explorer - GetCostAndUsage

**服务代码：** `ce`
**Endpoint：** `https://ce.{region}.amazonaws.com`
**API 版本：** `2017-10-25`

```bash
# AWS CLI - 查询最近 30 天的总成本
aws ce get-cost-and-usage \
  --time-period Start=2026-05-15,End=2026-06-15 \
  --granularity MONTHLY \
  --metrics "BlendedCost" "UnblendedCost" "UsageQuantity" \
  --region us-east-1

# 按服务分组
aws ce get-cost-and-usage \
  --time-period Start=2026-05-15,End=2026-06-15 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-1

# 按天粒度
aws ce get-cost-and-usage \
  --time-period Start=2026-06-01,End=2026-06-15 \
  --granularity DAILY \
  --metrics "BlendedCost" "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-1

# 按标签分组
aws ce get-cost-and-usage \
  --time-period Start=2026-05-15,End=2026-06-15 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=TAG,Key=Environment \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
from datetime import datetime, timedelta

ce = boto3.client('ce', region_name='us-east-1')

end_date = datetime.today().strftime('%Y-%m-%d')
start_date = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')

resp = ce.get_cost_and_usage(
    TimePeriod={'Start': start_date, 'End': end_date},
    Granularity='MONTHLY',
    Metrics=['BlendedCost', 'UnblendedCost', 'UsageQuantity'],
    GroupBy=[
        {'Type': 'DIMENSION', 'Key': 'SERVICE'}
    ]
)

for group in resp['ResultsByTime']:
    print(f"=== Period: {group['TimePeriod']['Start']} ===")
    for g in group['Groups']:
        service = g['Keys'][0]
        cost = float(g['Metrics']['BlendedCost']['Amount'])
        print(f"  {service}: ${cost:.2f}")
```

**参数说明：**

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `TimePeriod` | 查询时间范围 | `Start` 和 `End`（YYYY-MM-DD 格式） |
| `Granularity` | 时间粒度 | `DAILY`, `MONTHLY`, `HOURLY` |
| `Metrics` | 指标 | `BlendedCost`, `UnblendedCost`, `NetUnblendedCost`, `UsageQuantity`, `AmortizedCost` |
| `GroupBy` | 分组维度 | `SERVICE`, `LINKED_ACCOUNT`, `REGION`, `AZ`, `INSTANCE_TYPE`, `TAG` |
| `Filter` | 过滤条件 | 按服务、区域、标签等过滤 |

### 7.2 查询成本预测 - GetCostForecast

```bash
aws ce get-cost-forecast \
  --time-period Start=2026-06-15,End=2026-07-15 \
  --granularity MONTHLY \
  --metric "BLENDED_COST" \
  --region us-east-1
```

### 7.3 CloudWatch - 获取指标数据

**服务代码：** `monitoring`
**Endpoint：** `https://monitoring.{region}.amazonaws.com`

```bash
# 获取 EC2 CPU 利用率
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0abcd1234efgh5678 \
  --start-time 2026-06-14T00:00:00Z \
  --end-time 2026-06-15T00:00:00Z \
  --period 3600 \
  --statistics Average Maximum Minimum \
  --region us-east-1

# 获取 S3 存储桶大小
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name BucketSizeBytes \
  --dimensions Name=BucketName,Value=my-bucket Name=StorageType,Value=StandardStorage \
  --start-time 2026-06-14T00:00:00Z \
  --end-time 2026-06-15T00:00:00Z \
  --period 86400 \
  --statistics Average \
  --region us-east-1
```

**Python boto3:**

```python
import boto3
from datetime import datetime, timedelta

cw = boto3.client('cloudwatch', region_name='us-east-1')

resp = cw.get_metric_statistics(
    Namespace='AWS/EC2',
    MetricName='CPUUtilization',
    Dimensions=[
        {'Name': 'InstanceId', 'Value': 'i-0abcd1234efgh5678'}
    ],
    StartTime=datetime.utcnow() - timedelta(days=1),
    EndTime=datetime.utcnow(),
    Period=3600,
    Statistics=['Average', 'Maximum']
)

for dp in resp['Datapoints']:
    print(f"{dp['Timestamp']}: Avg={dp['Average']:.2f}%, Max={dp['Maximum']:.2f}%")
```

---

## 8. Free Tier - 免费套餐

### 8.1 概述

AWS 新用户注册可获得 **高达 200 美元服务抵扣金**（100 美元注册 + 100 美元探索），以及多项永久免费服务。

### 8.2 永久免费服务（12 个月后仍可用）

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| **AWS Lambda** | 100 万次请求/月 + 400,000 GB-秒计算时间 | 无服务器计算 |
| **Amazon DynamoDB** | 25 GB 存储 + 足够处理 200M 次请求的写入容量 | NoSQL 数据库 |
| **Amazon S3** | 5 GB 标准存储 + 20,000 GET + 2,000 PUT 请求 | 对象存储 |
| **Amazon CloudWatch** | 10 个自定义指标 + 10 个警报 + 5 GB 日志 | 监控 |
| **Amazon SQS** | 100 万次请求/月 | 消息队列 |
| **Amazon SNS** | 100 万次发布 + 100 万次 HTTP 通知 | 通知服务 |
| **AWS IAM** | 无限制 | 身份管理 |
| **Amazon VPC** | 750 小时/月 NAT 网关（数据传输另计） | 网络 |

### 8.3 12 个月免费服务（首年免费）

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| **Amazon EC2** | 750 小时/月 t2.micro 或 t3.micro（Linux/Unix） | 弹性计算 |
| **Amazon EC2** | 750 小时/月 t2.micro 或 t3.micro（Windows） | 弹性计算 |
| **Amazon RDS** | 750 小时/月 db.t2.micro（MySQL/PostgreSQL/MariaDB） | 关系型数据库 |
| **Amazon ElastiCache** | 750 小时/月 cache.t2.micro 或 cache.t3.micro | 缓存 |
| **Amazon SES** | 62,000 封邮件/月 | 邮件服务 |
| **AWS CloudFront** | 1 TB 数据传输/月 | CDN |
| **Amazon EBS** | 30 GB 通用 SSD 存储 | 块存储 |

### 8.4 短期试用服务

| 服务 | 试用时长 | 说明 |
|------|---------|------|
| **Amazon Redshift** | 2 个月（750 小时/月 dc2.large） | 数据仓库 |
| **Amazon EMR** | 4 个月（250 小时/月 m1.large） | 大数据处理 |

### 8.5 监控免费套餐使用量

```bash
# 使用 AWS CLI 查询免费套餐使用情况
aws ce get-cost-and-usage \
  --time-period Start=2026-06-01,End=2026-06-15 \
  --granularity DAILY \
  --metrics "BlendedCost" "UsageQuantity" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-1

# 设置预算警报避免意外费用
aws budgets create-budget \
  --account-id 123456789012 \
  --budget "BudgetName=FreeTierMonitor,BudgetType=COST,BudgetLimit={Amount=1.0,Currency=USD}" \
  --notifications-with-subscribers "NotificationType=ACTUAL,ThresholdType=PERCENTAGE,Threshold=80.0,Subscribers=[{SubscriptionType=EMAIL,Address=alert@example.com}]"
```

---

## 9. 常见错误码

### 9.1 EC2 错误码

| 错误码 | HTTP 状态码 | 说明 | 解决方法 |
|--------|------------|------|---------|
| `AuthFailure` | 401 | 认证失败 | 检查 Access Key 和签名 |
| `UnauthorizedOperation` | 403 | 无权限执行操作 | 检查 IAM 策略 |
| `InvalidInstanceID.NotFound` | 400 | 实例 ID 不存在 | 确认实例 ID 正确 |
| `InstanceLimitExceeded` | 400 | 超过实例数量限制 | 请求提高限额或终止不需要的实例 |
| `InsufficientInstanceCapacity` | 500 | 区域/可用区容量不足 | 更换实例类型或可用区 |
| `IncorrectState` | 400 | 实例状态不允许此操作 | 检查实例当前状态 |
| `DryRunOperation` | 412 | DryRun 成功（仅测试权限） | 正常响应，移除 `--dry-run` 参数 |

### 9.2 S3 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `AccessDenied` | 403 | 无访问权限 |
| `NoSuchBucket` | 404 | 存储桶不存在 |
| `NoSuchKey` | 404 | 对象不存在 |
| `BucketAlreadyExists` | 409 | 存储桶名称已被占用（全局唯一） |
| `BucketAlreadyOwnedByYou` | 409 | 你已拥有此存储桶 |
| `InvalidBucketName` | 400 | 存储桶名称无效 |

### 9.3 IAM 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `NoSuchEntity` | 404 | 用户/密钥/策略不存在 |
| `EntityAlreadyExists` | 409 | 用户已存在 |
| `LimitExceeded` | 409 | 超过账户限额（如密钥数量上限 2 个/用户） |
| `InvalidInput` | 400 | 输入参数无效 |
| `ConcurrentModification` | 409 | 并发修改冲突 |
| `ServiceFailure` | 500 | IAM 服务内部错误 |

### 9.4 通用错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `IncompleteSignature` | 400 | 请求签名不完整 |
| `SignatureDoesNotMatch` | 401 | 签名不匹配 |
| `RequestExpired` | 400 | 请求已过期（超过 15 分钟） |
| `Throttling` | 400 | 请求频率超限 |
| `InternalError` | 500 | AWS 服务内部错误 |

---

## 10. 最佳实践与注意事项

### 10.1 安全最佳实践

- **不要使用 Root 账户凭证**进行日常 API 调用，始终创建 IAM 用户并遵循最小权限原则
- **启用 MFA**（多因素认证）保护 IAM 用户
- **定期轮换 Access Key**，每个用户最多 2 个 Access Key
- **不要将 Secret Key 硬编码**在代码中，使用环境变量或 AWS Secrets Manager
- **使用 IAM 角色**（Role）代替长期凭证，特别是对于 EC2 实例和 Lambda 函数

### 10.2 API 调用最佳实践

- **使用 AWS SDK 或 CLI** 而非手动签名，SDK 自动处理签名计算和重试逻辑
- **实现指数退避重试**机制处理 `Throttling` 错误
- **使用分页**（`MaxItems`/`NextToken`）避免大量数据查询超时
- **使用 `DryRun` 参数**先测试权限，再执行实际操作（EC2 支持）
- **设置合理的超时时间**，AWS API 通常在几秒内响应

### 10.3 成本控制

- **定期检查 Cost Explorer**，设置预算警报
- **使用标签（Tags）** 标记资源，便于追踪成本归属
- **启用 AWS Budgets** 设置自动警报
- **注意 Free Tier 限制**，超出免费额度会产生费用
- **使用 `aws ce get-cost-and-usage`** 定期查询成本

### 10.4 LLM Agent 调用建议

对于 LLM Agent 自动化调用 AWS API，推荐以下方式：

```python
# 推荐方式：使用 boto3 SDK
import boto3
import os

# 从环境变量读取凭证
session = boto3.Session(
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
)

# 创建服务客户端
ec2 = session.client('ec2')
s3 = session.client('s3')
iam = session.client('iam')
ce = session.client('ce')

# 或者使用 AWS CLI（适合 shell 脚本）
# aws ec2 describe-instances --region us-east-1 --output json
```

**环境变量配置：**

```bash
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export AWS_DEFAULT_REGION=us-east-1
export AWS_OUTPUT_FORMAT=json
```

---

## 附录 A：API 版本汇总

| 服务 | API 版本 | 服务代码 | Endpoint 类型 |
|------|---------|---------|-------------|
| EC2 / VPC | `2016-11-15` | `ec2` | 区域端点 |
| S3 | `2006-03-01` | `s3` | 区域端点 |
| IAM | `2010-05-08` | `iam` | 全局端点 |
| STS | `2011-06-15` | `sts` | 全局端点 |
| CloudWatch | `2010-08-01` | `monitoring` | 区域端点 |
| Cost Explorer | `2017-10-25` | `ce` | 区域端点 |

## 附录 B：官方文档链接

- EC2 API Reference: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/
- S3 API Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/
- IAM API Reference: https://docs.aws.amazon.com/IAM/latest/APIReference/
- CloudWatch API Reference: https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/
- Cost Explorer API Reference: https://docs.aws.amazon.com/cost-management/latest/APIReference/
- AWS Service Endpoints: https://docs.aws.amazon.com/general/latest/gr/rande.html
- SigV4 Signing Process: https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
- AWS Free Tier: https://aws.amazon.com/free/
