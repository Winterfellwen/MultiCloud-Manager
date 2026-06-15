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
aws ec2 run-instances \
  --region us-east-1 \
  --image-id ami-0abcdef1234567890 \
  --instance-type t2.micro \
  --key-name my-key-pair \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0123456789abcdef0 \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=my-instance}]" \
  --count 1
```

**必需参数：** `ImageId`, `MinCount`(默认1), `MaxCount`(默认1)

### 3.3 启动/停止/终止实例

```bash
# 启动
aws ec2 start-instances --instance-ids i-0abcd1234efgh5678 --region us-east-1

# 停止
aws ec2 stop-instances --instance-ids i-0abcd1234efgh5678 --region us-east-1

# 终止（不可逆）
aws ec2 terminate-instances --instance-ids i-0abcd1234efgh5678 --region us-east-1
```

### 3.4 查询实例状态 - DescribeInstanceStatus

```bash
aws ec2 describe-instance-status --region us-east-1 --include-all-instances
```

### 3.5 常用 EC2 实例类型

| 类型系列 | 适用场景 | 免费套餐 |
|---------|---------|---------|
| `t2.micro` / `t3.micro` | 通用/开发测试 | 永久免费（750 小时/月） |
| `t3.medium` | 中等负载 Web 服务 | - |
| `m5.large` | 内存密集型应用 | - |
| `c5.large` | 计算密集型 | - |
| `g4dn.xlarge` | GPU/AI 推理 | - |

---

## 4. S3 - 简单存储服务

**API 版本：** `2006-03-01`
**Endpoint：** `https://s3.{region}.amazonaws.com` 或 `https://{bucket}.s3.{region}.amazonaws.com`
**协议：** REST (HTTP/HTTPS)

### 4.1 列出所有存储桶 - ListBuckets

```bash
aws s3 ls
aws s3api list-buckets --region us-east-1
```

### 4.2 列出对象 - ListObjectsV2

```bash
aws s3 ls s3://my-bucket/
aws s3api list-objects-v2 --bucket my-bucket --region us-east-1 --max-items 100
```

### 4.3 上传/下载/删除对象

```bash
# 上传
aws s3 cp ./localfile.txt s3://my-bucket/remote/path/file.txt

# 下载
aws s3 cp s3://my-bucket/remote/path/file.txt ./localfile.txt

# 删除
aws s3 rm s3://my-bucket/remote/path/file.txt

# 批量删除
aws s3api delete-objects --bucket my-bucket --delete '{"Objects":[{"Key":"file1.txt"},{"Key":"file2.txt"}]}'
```

### 4.4 创建存储桶

```bash
aws s3 mb s3://my-bucket --region us-east-1
```

### 4.5 S3 存储类别

| 存储类别 | 适用场景 | 最低存储时长 |
|---------|---------|-------------|
| `STANDARD` | 频繁访问 | 无 |
| `STANDARD_IA` | 不频繁访问 | 30 天 |
| `GLACIER` | 归档 | 90 天 |
| `INTELLIGENT_TIERING` | 未知访问模式 | 无 |

---

## 5. VPC - 虚拟私有云

**API 版本：** `2016-11-15`（与 EC2 共享）
**Endpoint：** `https://ec2.{region}.amazonaws.com`

### 5.1 查询 VPC / 子网 / 安全组

```bash
# VPC 列表
aws ec2 describe-vpcs --region us-east-1

# 子网列表
aws ec2 describe-subnets --region us-east-1 --filters "Name=vpc-id,Values=vpc-0123456789abcdef0"

# 安全组列表
aws ec2 describe-security-groups --region us-east-1
```

### 5.2 创建安全组并添加规则

```bash
# 创建安全组
aws ec2 create-security-group --group-name my-sg --description "My security group" --vpc-id vpc-0123456789abcdef0 --region us-east-1

# 开放 SSH (22) 端口
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 --protocol tcp --port 22 --cidr 0.0.0.0/0 --region us-east-1

# 开放 HTTPS (443) 端口
aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 --protocol tcp --port 443 --cidr 0.0.0.0/0 --region us-east-1
```

---

## 6. IAM - 身份与访问管理

**API 版本：** `2010-05-08`
**Endpoint：** `https://iam.amazonaws.com` (全局端点，无区域)

### 6.1 用户管理

```bash
# 列出用户
aws iam list-users

# 创建用户
aws iam create-user --user-name newuser

# 删除用户（需先删除所有访问密钥和登录配置）
aws iam delete-user --user-name olduser
```

### 6.2 访问密钥管理

```bash
# 列出密钥
aws iam list-access-keys --user-name myuser

# 创建密钥（SecretAccessKey 只显示一次）
aws iam create-access-key --user-name myuser

# 删除密钥
aws iam delete-access-key --user-name myuser --access-key-id AKIAIOSFODNN7EXAMPLE
```

### 6.3 常用托管策略 ARN

| 策略名称 | ARN |
|---------|-----|
| `ReadOnlyAccess` | `arn:aws:iam::aws:policy/ReadOnlyAccess` |
| `AdministratorAccess` | `arn:aws:iam::aws:policy/AdministratorAccess` |
| `AmazonEC2FullAccess` | `arn:aws:iam::aws:policy/AmazonEC2FullAccess` |
| `AmazonS3FullAccess` | `arn:aws:iam::aws:policy/AmazonS3FullAccess` |
| `AmazonS3ReadOnlyAccess` | `arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess` |
| `AmazonVPCFullAccess` | `arn:aws:iam::aws:policy/AmazonVPCFullAccess` |

---

## 7. CloudWatch / Cost Explorer - 成本监控

### 7.1 Cost Explorer - GetCostAndUsage

```bash
# 查询最近 30 天总成本（按服务分组）
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
```

### 7.2 CloudWatch - 获取指标数据

```bash
# EC2 CPU 利用率
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0abcd1234efgh5678 \
  --start-time 2026-06-14T00:00:00Z \
  --end-time 2026-06-15T00:00:00Z \
  --period 3600 \
  --statistics Average Maximum Minimum \
  --region us-east-1
```

---

## 8. Free Tier - 免费套餐

### 永久免费服务

| 服务 | 免费额度 |
|------|---------|
| **AWS Lambda** | 100 万次请求/月 + 400,000 GB-秒计算时间 |
| **Amazon DynamoDB** | 25 GB 存储 + 200M 次写入容量 |
| **Amazon S3** | 5 GB 标准存储 + 20,000 GET + 2,000 PUT |
| **Amazon CloudWatch** | 10 个自定义指标 + 10 个警报 |
| **AWS IAM** | 无限制 |

### 12 个月免费服务

| 服务 | 免费额度 |
|------|---------|
| **Amazon EC2** | 750 小时/月 t2.micro 或 t3.micro |
| **Amazon RDS** | 750 小时/月 db.t2.micro |
| **Amazon SES** | 62,000 封邮件/月 |
| **AWS CloudFront** | 1 TB 数据传输/月 |
| **Amazon EBS** | 30 GB 通用 SSD |

---

## 9. 常见错误码

### EC2 错误码

| 错误码 | HTTP | 说明 | 解决方法 |
|--------|------|------|---------|
| `AuthFailure` | 401 | 认证失败 | 检查 Access Key 和签名 |
| `UnauthorizedOperation` | 403 | 无权限 | 检查 IAM 策略 |
| `InvalidInstanceID.NotFound` | 400 | 实例不存在 | 确认实例 ID |
| `InstanceLimitExceeded` | 400 | 超过限额 | 请求提高限额或终止实例 |
| `IncorrectState` | 400 | 状态不允许 | 检查实例当前状态 |

### S3 错误码

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `AccessDenied` | 403 | 无访问权限 |
| `NoSuchBucket` | 404 | 存储桶不存在 |
| `NoSuchKey` | 404 | 对象不存在 |
| `BucketAlreadyExists` | 409 | 名称已被占用（全局唯一） |

### IAM 错误码

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `NoSuchEntity` | 404 | 用户/密钥/策略不存在 |
| `EntityAlreadyExists` | 409 | 用户已存在 |
| `LimitExceeded` | 409 | 超过密钥数量上限（2个/用户） |

---

## 10. 最佳实践与注意事项

### 安全

- 不要使用 Root 账户凭证，创建 IAM 用户遵循最小权限原则
- 定期轮换 Access Key，每个用户最多 2 个
- 不要将 Secret Key 硬编码，使用环境变量或 Secrets Manager

### API 调用

- 使用 AWS SDK/CLI 而非手动签名，自动处理签名和重试
- 实现指数退避重试处理 `Throttling` 错误
- 使用 `DryRun` 参数先测试权限（EC2 支持）

### LLM Agent 调用建议

```python
import boto3, os

session = boto3.Session(
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
)
ec2 = session.client('ec2')
s3 = session.client('s3')
```

---

## 附录：API 版本汇总

| 服务 | API 版本 | 服务代码 | Endpoint 类型 |
|------|---------|---------|-------------|
| EC2 / VPC | `2016-11-15` | `ec2` | 区域端点 |
| S3 | `2006-03-01` | `s3` | 区域端点 |
| IAM | `2010-05-08` | `iam` | 全局端点 |
| CloudWatch | `2010-08-01` | `monitoring` | 区域端点 |
| Cost Explorer | `2017-10-25` | `ce` | 区域端点 |
