# Alibaba Cloud (AliCloud) REST API Reference

> 面向 LLM Agent 的阿里云 API 快速参考文档
> 更新日期: 2026-06-15 | 数据来源: 阿里云官方文档

---

## 目录

- [1. 概述](#1-概述)
- [2. 认证方式](#2-认证方式)
  - [2.1 RPC 签名 (ECS/VPC/BSS/RAM 等产品)](#21-rpc-签名-ecsvpcbssram-等产品)
  - [2.2 OSS V4 签名 (OSS 产品)](#22-oss-v4-签名-oss-产品)
- [3. 通用请求结构 (RPC 风格)](#3-通用请求结构-rpc-风格)
- [4. ECS - 弹性计算服务](#4-ecs---弹性计算服务)
  - [4.1 DescribeInstances - 查询实例列表](#41-describeinstances---查询实例列表)
  - [4.2 CreateInstance - 创建实例](#42-createinstance---创建实例)
  - [4.3 StartInstance / StopInstance / DeleteInstance](#43-startinstance--stopinstance--deleteinstance)
  - [4.4 DescribeInstanceStatus - 查询实例状态](#44-describeinstancestatus---查询实例状态)
  - [4.5 DescribeSecurityGroups - 查询安全组](#45-describesecuritygroups---查询安全组)
- [5. OSS - 对象存储服务](#5-oss---对象存储服务)
  - [5.1 ListBuckets (GetService)](#51-listbuckets-getservice)
  - [5.2 PutObject - 上传文件](#52-putobject---上传文件)
  - [5.3 GetObject - 下载文件](#53-getobject---下载文件)
  - [5.4 DeleteObject - 删除文件](#54-deleteobject---删除文件)
  - [5.5 ListObjects (GetBucket) - 列出对象](#55-listobjects-getbucket---列出对象)
- [6. VPC - 专有网络](#6-vpc---专有网络)
  - [6.1 DescribeVpcs - 查询 VPC 列表](#61-describevpcs---查询-vpc-列表)
  - [6.2 DescribeVSwitches - 查询交换机列表](#62-describevswitches---查询交换机列表)
- [7. BSS - 费用中心](#7-bss---费用中心)
  - [7.1 QueryBillOverview - 账单总览](#71-querybilloverview---账单总览)
  - [7.2 QueryAccountBalance - 查询账户余额](#72-queryaccountbalance---查询账户余额)
- [8. RAM - 访问控制](#8-ram---访问控制)
  - [8.1 ListUsers - 查询 RAM 用户列表](#81-listusers---查询-ram-用户列表)
  - [8.2 CreateUser - 创建 RAM 用户](#82-createuser---创建-ram-用户)
- [9. Region 与 Endpoint 速查](#9-region-与-endpoint-速查)
- [10. Free Tier (免费试用)](#10-free-tier-免费试用)
- [11. 常见错误码](#11-常见错误码)
- [12. 最佳实践与注意事项](#12-最佳实践与注意事项)

---

## 1. 概述

阿里云 (Alibaba Cloud) 提供两种 API 风格:

| API 风格 | 适用产品 | 签名方式 | 请求格式 |
|---|---|---|---|
| **RPC** | ECS, VPC, BSS, RAM, RDS 等 | HMAC-SHA1 (V1) / ACS3-HMAC-SHA256 (V3) | HTTP GET/POST, 参数在 Query String |
| **RESTful (ROA)** | OSS | OSS4-HMAC-SHA256 (V4, 推荐) | 标准 HTTP 方法 (GET/PUT/DELETE), 资源在 URI |

### 国际版 vs 中国版域名差异

| 项目 | 中国版 (aliyun.com) | 国际版 (alibabacloud.com) |
|---|---|---|
| 控制台 | `https://ecs.console.aliyun.com` | `https://ecs-intl.console.alibabacloud.com` |
| API 域名 | `ecs.cn-hangzhou.aliyuncs.com` | `ecs.ap-southeast-1.aliyuncs.com` |
| OSS 域名 | `oss-cn-hangzhou.aliyuncs.com` | `oss-ap-southeast-1.aliyuncs.com` |
| 文档 | `help.aliyun.com` | `www.alibabacloud.com/help` |
| Region 前缀 | `cn-` (如 cn-hangzhou) | 标准区域 (如 ap-southeast-1) |

---

## 2. 认证方式

### 2.1 RPC 签名 (ECS/VPC/BSS/RAM 等产品)

所有 RPC 风格 API 使用 **AccessKey ID + AccessKey Secret** 进行 HMAC-SHA1 签名认证。

#### 签名计算步骤

```
1. 构造规范化请求字符串 (Canonicalized Query String):
   - 按参数名字典序排列所有请求参数 (不含 Signature)
   - 对参数名和值进行 URL 编码 (空格编码为 %20, 不是 +)
   - 用 = 连接名值, 用 & 连接参数对

2. 构造待签名字符串 (StringToSign):
   StringToSign = HTTPMethod + "&" + percentEncode("/") + "&" + percentEncode(CanonicalizedQueryString)

3. 计算签名:
   Signature = Base64( HMAC-SHA1( AccessKeySecret + "&", UTF-8-Encoding-Of(StringToSign)) )
```

#### 签名算法伪代码

```python
import hmac, hashlib, base64, urllib.parse, uuid

def percent_encode(s):
    """阿里云专用 URL 编码"""
    return urllib.parse.quote(str(s), safe='').replace('+', '%20').replace('*', '%2A').replace('%7E', '~')

def sign_rpc(params, access_key_secret, method='GET'):
    """计算 RPC API 签名"""
    # 1. 添加公共参数
    params['SignatureNonce'] = str(uuid.uuid4())
    params['SignatureMethod'] = 'HMAC-SHA1'
    params['SignatureVersion'] = '1.0'
    params['Timestamp'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    params['Format'] = 'JSON'

    # 2. 排序并构造规范化请求字符串
    sorted_params = sorted(params.items())
    canonical_qs = '&'.join(f'{percent_encode(k)}={percent_encode(v)}' for k, v in sorted_params)

    # 3. 构造待签名字符串
    string_to_sign = f'{method}&{percent_encode("/")}&{percent_encode(canonical_qs)}'

    # 4. 计算 HMAC-SHA1 签名
    key = (access_key_secret + '&').encode('utf-8')
    signature = base64.b64encode(
        hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha1).digest()
    ).decode('utf-8')

    params['Signature'] = signature
    return params
```

#### curl 示例 (ECS DescribeInstances)

```bash
# 注意: 实际使用时需要用代码计算签名, 此处展示请求结构
# 中国版 endpoint
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DescribeInstances&RegionId=cn-hangzhou&Version=2014-05-26&Format=JSON&AccessKeyId=<your-access-key-id>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<computed-signature>"

# 国际版 endpoint
curl -X GET "https://ecs.ap-southeast-1.aliyuncs.com/?Action=DescribeInstances&RegionId=ap-southeast-1&Version=2014-05-26&Format=JSON&AccessKeyId=<your-access-key-id>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<computed-signature>"
```

#### Python 完整调用示例

```python
import urllib.request, json, hmac, hashlib, base64, urllib.parse, uuid
from datetime import datetime

def call_alibaba_cloud_api(access_key_id, access_key_secret, endpoint, api_params):
    """
    调用阿里云 RPC API 的通用函数
    """
    params = {
        'AccessKeyId': access_key_id,
        'Format': 'JSON',
        'Version': api_params.pop('Version', '2014-05-26'),
        'SignatureMethod': 'HMAC-SHA1',
        'SignatureVersion': '1.0',
        'SignatureNonce': str(uuid.uuid4()),
        'Timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        **api_params
    }

    # 排序并编码
    def percent_encode(s):
        return urllib.parse.quote(str(s), safe='').replace('+', '%20').replace('*', '%2A').replace('%7E', '~')

    sorted_params = sorted(params.items())
    canonical_qs = '&'.join(f'{percent_encode(k)}={percent_encode(v)}' for k, v in sorted_params)
    string_to_sign = f'GET&{percent_encode("/")}&{percent_encode(canonical_qs)}'

    key = (access_key_secret + '&').encode('utf-8')
    signature = base64.b64encode(hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha1).digest()).decode()
    params['Signature'] = signature

    url = f'https://{endpoint}/?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# === 使用示例: 查询 ECS 实例列表 ===
result = call_alibaba_cloud_api(
    access_key_id='<your-ak-id>',
    access_key_secret='<your-ak-secret>',
    endpoint='ecs.cn-hangzhou.aliyuncs.com',
    api_params={
        'Action': 'DescribeInstances',
        'RegionId': 'cn-hangzhou',
        'Version': '2014-05-26',
        'MaxResults': '10'
    }
)
print(json.dumps(result, indent=2, ensure_ascii=False))
```

---

### 2.2 OSS V4 签名 (OSS 产品)

OSS 使用独立的签名体系, 当前推荐 **OSS4-HMAC-SHA256 (V4)** 签名。

#### Authorization 请求头格式

```
Authorization: OSS4-HMAC-SHA256 Credential=<AccessKeyId>/<SignDate>/<SignRegion>/oss/aliyun_v4_request, AdditionalHeaders=<AdditionalHeadersVal>, Signature=<SignatureVal>
```

#### 签名计算步骤

```python
import hmac, hashlib

def sign_oss_v4(method, bucket, object_key, headers, access_key_id, access_key_secret, region='cn-hangzhou'):
    """
    计算 OSS V4 签名
    """
    date = headers.get('x-oss-date')  # ISO8601 格式, 如 20250411T064124Z
    date_short = date[:8]  # YYYYMMDD

    # 1. 构造规范化请求
    canonical_uri = f'/{bucket}/{object_key}' if object_key else f'/{bucket}/'
    canonical_qs = ''  # 简化, 实际需排序编码

    # 参与签名的 headers (小写, 字典序)
    signed_headers = []
    canonical_headers = ''
    for h in ['content-type', 'content-md5', 'x-oss-content-sha256', 'x-oss-date']:
        if h in headers:
            canonical_headers += f'{h}:{headers[h]}\n'
            signed_headers.append(h)
    additional_headers = ';'.join(signed_headers)

    canonical_request = f'{method}\n{canonical_uri}\n{canonical_qs}\n{canonical_headers}\n{additional_headers}\nUNSIGNED-PAYLOAD'

    # 2. 构造待签名字符串
    scope = f'{date_short}/{region}/oss/aliyun_v4_request'
    string_to_sign = f'OSS4-HMAC-SHA256\n{date}\n{scope}\n{hashlib.sha256(canonical_request.encode()).hexdigest()}'

    # 3. 计算派生密钥
    k_date = hmac.new(f'aliyun_v4{access_key_secret}'.encode(), date_short.encode(), hashlib.sha256).digest()
    k_region = hmac.new(k_date, region.encode(), hashlib.sha256).digest()
    k_service = hmac.new(k_region, b'oss', hashlib.sha256).digest()
    signing_key = hmac.new(k_service, b'aliyun_v4_request', hashlib.sha256).digest()

    # 4. 计算签名
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    credential = f'{access_key_id}/{date_short}/{region}/oss/aliyun_v4_request'
    auth_header = f'OSS4-HMAC-SHA256 Credential={credential}, AdditionalHeaders={additional_headers}, Signature={signature}'
    return auth_header
```

#### curl 示例 (OSS PutObject)

```bash
# OSS V4 签名需要代码计算, 以下展示请求结构
curl -X PUT "https://mybucket.oss-cn-hangzhou.aliyuncs.com/test.txt" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "Date: Sun, 15 Jun 2026 08:00:00 GMT" \
  -H "Content-Type: text/plain" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AccessKeyId>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=content-type;x-oss-content-sha256;x-oss-date, Signature=<computed-signature>" \
  -d "Hello Alibaba Cloud OSS"
```

---

## 3. 通用请求结构 (RPC 风格)

所有 RPC 风格 API 共享以下公共参数:

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| Action | String | 是 | API 操作名称, 如 `DescribeInstances` |
| Version | String | 是 | API 版本号, 如 `2014-05-26` (ECS) |
| RegionId | String | 是* | 地域 ID (部分全局 API 不需要) |
| AccessKeyId | String | 是 | 访问密钥 ID |
| SignatureMethod | String | 是 | 签名方法, 固定 `HMAC-SHA1` |
| SignatureVersion | String | 是 | 签名版本, 固定 `1.0` |
| SignatureNonce | String | 是 | 唯一随机数 (建议 UUID) |
| Timestamp | String | 是 | UTC 时间, 格式 `YYYY-MM-DDThh:mm:ssZ` |
| Format | String | 否 | 返回格式, `JSON` (默认) 或 `XML` |

---

## 4. ECS - 弹性计算服务

**产品代码**: `Ecs`
**API 版本**: `2014-05-26`
**签名风格**: RPC (HMAC-SHA1)
**Endpoint 格式**: `ecs.{region-id}.aliyuncs.com`

### 4.1 DescribeInstances - 查询实例列表

查询指定地域下的 ECS 实例详细信息。

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID, 如 `cn-hangzhou` |
| InstanceIds | String | 否 | 实例 ID 列表, JSON 数组格式, 最多 100 个 |
| Status | String | 否 | 实例状态: `Pending`/`Running`/`Starting`/`Stopping`/`Stopped` |
| InstanceType | String | 否 | 实例规格, 如 `ecs.g5.large` |
| VpcId | String | 否 | VPC ID |
| SecurityGroupId | String | 否 | 安全组 ID |
| MaxResults | Integer | 否 | 每页最大条数 (1-100, 默认 10) |
| NextToken | String | 否 | 分页 Token (上次返回的 NextToken) |
| PageNumber | Integer | 否 | 页码 (即将下线, 推荐用 NextToken) |
| PageSize | Integer | 否 | 每页条数 (即将下线, 推荐用 MaxResults) |

**curl 示例**

```bash
# 查询 cn-hangzhou 地域下所有 Running 状态的实例
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DescribeInstances&RegionId=cn-hangzhou&Status=Running&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"

# 按实例 ID 查询
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DescribeInstances&RegionId=cn-hangzhou&InstanceIds=%5B%22i-bp67acfmxazb4p****%22%5D&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

**返回示例 (JSON)**

```json
{
  "RequestId": "473469C7-AA6F-4DC5-B3DB-A3DC0DE3C83E",
  "TotalCount": 1,
  "PageNumber": 1,
  "PageSize": 10,
  "Instances": {
    "Instance": [
      {
        "InstanceId": "i-bp67acfmxazb4p****",
        "InstanceName": "test-instance",
        "Status": "Running",
        "RegionId": "cn-hangzhou",
        "ZoneId": "cn-hangzhou-g",
        "InstanceType": "ecs.g5.large",
        "Cpu": 8,
        "Memory": 16384,
        "ImageId": "m-bp67acfmxazb4p****",
        "VpcId": "vpc-bp67acfmxazb4p****",
        "InstanceChargeType": "PostPaid",
        "InternetChargeType": "PayByTraffic",
        "InternetMaxBandwidthOut": 5,
        "CreationTime": "2024-01-15T04:04Z",
        "StartTime": "2024-01-15T04:10Z",
        "PublicIpAddress": ["47.xx.xx.xx"],
        "InnerIpAddress": ["172.16.xx.xx"],
        "OSName": "CentOS 7.9 64 位"
      }
    ]
  }
}
```

---

### 4.2 CreateInstance - 创建实例

创建一台 ECS 实例 (单台创建, 批量创建用 `RunInstances`)。

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID |
| ZoneId | String | 否 | 可用区 ID |
| ImageId | String | 是 | 镜像 ID |
| InstanceType | String | 是 | 实例规格 |
| SecurityGroupId | String | 否 | 安全组 ID |
| VSwitchId | String | 否 | 交换机 ID (VPC 网络必填) |
| InstanceName | String | 否 | 实例名称 |
| InstanceChargeType | String | 否 | `PrePaid` (包年包月) / `PostPaid` (按量) |
| InternetChargeType | String | 否 | `PayByBandwidth` / `PayByTraffic` |
| InternetMaxBandwidthOut | Integer | 否 | 公网出带宽上限 (Mbps) |
| KeyPairName | String | 否 | SSH 密钥对名称 |
| Password | String | 否 | 登录密码 (8-30 位, 含大小写字母和数字) |
| DataDisk.n.Size | Integer | 否 | 数据盘大小 (GB) |
| DataDisk.n.Category | String | 否 | 数据盘类型: `cloud_essd` / `cloud_efficiency` |
| Tag.n.Key | String | 否 | 标签键 |
| Tag.n.Value | String | 否 | 标签值 |

**curl 示例**

```bash
# 创建一台按量付费的 ECS 实例
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=CreateInstance&RegionId=cn-hangzhou&ImageId=ubuntu_22_04_x64_20G_alibase_20240228.vhd&InstanceType=ecs.g5.large&VSwitchId=vsw-bp1a2b3c4d5e6f&SecurityGroupId=sg-bp1a2b3c4d5e6f&InstanceName=my-llm-agent&InstanceChargeType=PostPaid&InternetChargeType=PayByTraffic&InternetMaxBandwidthOut=5&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

### 4.3 StartInstance / StopInstance / DeleteInstance

| API | Action | 说明 | 关键参数 |
|---|---|---|---|
| 启动实例 | `StartInstance` | 启动已停止的实例 | `InstanceId`, `RegionId` |
| 批量启动 | `StartInstances` | 批量启动, 支持 `BatchOptimization` | `InstanceIds` (JSON 数组) |
| 停止实例 | `StopInstance` | 停止运行中的实例 | `InstanceId`, `RegionId`, `StoppedMode` (`KeepCharging`/`StopCharging`) |
| 批量停止 | `StopInstances` | 批量停止 | `InstanceIds` (JSON 数组) |
| 删除实例 | `DeleteInstance` | 释放按量付费实例 | `InstanceId`, `RegionId`, `Force` (true 强制释放) |
| 批量删除 | `DeleteInstances` | 批量释放 | `InstanceIds` (JSON 数组) |

**curl 示例**

```bash
# 启动实例
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=StartInstance&InstanceId=i-bp67acfmxazb4p****&RegionId=cn-hangzhou&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"

# 停止实例 (停止后不收费)
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=StopInstance&InstanceId=i-bp67acfmxazb4p****&RegionId=cn-hangzhou&StoppedMode=StopCharging&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"

# 删除 (释放) 按量付费实例
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DeleteInstance&InstanceId=i-bp67acfmxazb4p****&RegionId=cn-hangzhou&Force=true&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

### 4.4 DescribeInstanceStatus - 查询实例状态

查询一台或多台实例的状态信息。

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID |
| InstanceId | String | 否 | 实例 ID (与 ZoneId 二选一) |
| ZoneId | String | 否 | 可用区 ID (查询该可用区所有实例) |
| PageNumber | Integer | 否 | 页码 (默认 1) |
| PageSize | Integer | 否 | 每页条数 (默认 10, 最大 100) |

**curl 示例**

```bash
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DescribeInstanceStatus&RegionId=cn-hangzhou&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

**返回示例**

```json
{
  "RequestId": "4B450CA1-36E8-4AA2-8461-86B42BF4CC4E",
  "TotalCount": 2,
  "PageNumber": 1,
  "PageSize": 10,
  "InstanceStatuses": {
    "InstanceStatus": [
      {
        "InstanceId": "i-bp67acfmxazb4p****",
        "Status": "Running",
        "CreationTime": "2024-01-15T04:04Z"
      }
    ]
  }
}
```

---

### 4.5 DescribeSecurityGroups - 查询安全组

查询安全组基本信息列表。

**产品代码**: `Ecs` (安全组 API 归属 ECS)
**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID |
| SecurityGroupId | String | 否 | 安全组 ID |
| SecurityGroupIds | String | 否 | 多个安全组 ID, JSON 数组 |
| VpcId | String | 否 | VPC ID |
| SecurityGroupName | String | 否 | 安全组名称 |
| SecurityGroupType | String | 否 | `normal` (普通) / `enterprise` (企业) |
| NetworkType | String | 否 | `vpc` / `classic` |
| MaxResults | Integer | 否 | 每页最大条数 (1-100) |
| NextToken | String | 否 | 分页 Token |

**curl 示例**

```bash
curl -X GET "https://ecs.cn-hangzhou.aliyuncs.com/?Action=DescribeSecurityGroups&RegionId=cn-hangzhou&VpcId=vpc-bp67acfmxazb4p****&Version=2014-05-26&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

## 5. OSS - 对象存储服务

**签名风格**: RESTful (OSS4-HMAC-SHA256, 推荐)
**域名格式**: `<BucketName>.oss-{region}.aliyuncs.com`
**请求风格**: 仅支持虚拟托管 (Virtual Hosted) 风格, 不支持 Path 风格

### OSS 域名规则

```
# 标准 Bucket 操作
https://<BucketName>.oss-cn-hangzhou.aliyuncs.com/<ObjectName>

# ListBuckets (GetService) 使用全局域名
https://oss-cn-hangzhou.aliyuncs.com/

# 国际版
https://<BucketName>.oss-ap-southeast-1.aliyuncs.com/<ObjectName>
```

### 5.1 ListBuckets (GetService)

列出当前用户所有的 Bucket。

**请求语法**

```http
GET / HTTP/1.1
Host: oss-cn-hangzhou.aliyuncs.com
Date: Sun, 15 Jun 2026 08:00:00 GMT
Authorization: OSS4-HMAC-SHA256 Credential=<AK>/<Date>/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-date, Signature=<sig>
```

**curl 示例**

```bash
curl -X GET "https://oss-cn-hangzhou.aliyuncs.com/" \
  -H "Host: oss-cn-hangzhou.aliyuncs.com" \
  -H "Date: Sun, 15 Jun 2026 08:00:00 GMT" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-content-sha256;x-oss-date, Signature=<sig>"
```

---

### 5.2 PutObject - 上传文件

上传文件到 OSS Bucket, 单次上传限制 5GB。

**请求语法**

```http
PUT /<ObjectName> HTTP/1.1
Content-Length: <ContentLength>
Content-Type: <ContentType>
Host: <BucketName>.oss-cn-hangzhou.aliyuncs.com
Date: <GMT Date>
Authorization: OSS4-HMAC-SHA256 Credential=<AK>/<Date>/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=content-type;x-oss-content-sha256;x-oss-date, Signature=<sig>

<Object Data>
```

**常用请求头**

| 请求头 | 说明 |
|---|---|
| `Content-Type` | 文件 MIME 类型 |
| `Content-Length` | 文件大小 (字节) |
| `Content-MD5` | 文件 MD5 校验值 (Base64) |
| `x-oss-storage-class` | 存储类型: `Standard` / `IA` / `Archive` |
| `x-oss-object-acl` | 访问权限: `private` / `public-read` / `public-read-write` |
| `x-oss-server-side-encryption` | 服务端加密: `AES256` / `KMS` |

**curl 示例**

```bash
# 上传文本文件
curl -X PUT "https://mybucket.oss-cn-hangzhou.aliyuncs.com/hello.txt" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "Content-Type: text/plain" \
  -H "Content-Length: 5" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=content-type;x-oss-content-sha256;x-oss-date, Signature=<sig>" \
  -d "Hello"

# 上传本地文件
curl -X PUT "https://mybucket.oss-cn-hangzhou.aliyuncs.com/data.json" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "Content-Type: application/json" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=content-type;x-oss-content-sha256;x-oss-date, Signature=<sig>" \
  --data-binary @local_file.json
```

**成功响应**: `200 OK` (覆盖) 或 `201 Created` (新建)

---

### 5.3 GetObject - 下载文件

从 OSS Bucket 下载文件。

**请求语法**

```http
GET /<ObjectName> HTTP/1.1
Host: <BucketName>.oss-cn-hangzhou.aliyuncs.com
Date: <GMT Date>
Authorization: OSS4-HMAC-SHA256 Credential=<AK>/<Date>/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-date, Signature=<sig>
```

**curl 示例**

```bash
# 下载文件
curl -X GET "https://mybucket.oss-cn-hangzhou.aliyuncs.com/data.json" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-content-sha256;x-oss-date, Signature=<sig>" \
  -o downloaded_file.json

# 范围下载 (断点续传)
curl -X GET "https://mybucket.oss-cn-hangzhou.aliyuncs.com/large-file.zip" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "Range: bytes=0-1048575" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;range;x-oss-content-sha256;x-oss-date, Signature=<sig>" \
  -o part1.bin
```

**成功响应**: `200 OK` (完整下载) / `206 Partial Content` (范围下载)

---

### 5.4 DeleteObject - 删除文件

删除 OSS Bucket 中的单个文件。

**请求语法**

```http
DELETE /<ObjectName> HTTP/1.1
Host: <BucketName>.oss-cn-hangzhou.aliyuncs.com
Date: <GMT Date>
Authorization: OSS4-HMAC-SHA256 Credential=<AK>/<Date>/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-date, Signature=<sig>
```

**curl 示例**

```bash
curl -X DELETE "https://mybucket.oss-cn-hangzhou.aliyuncs.com/old-file.txt" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-content-sha256;x-oss-date, Signature=<sig>"
```

**成功响应**: `204 No Content` (无论文件是否存在均返回 204)

---

### 5.5 ListObjects (GetBucket) - 列出对象

列出 Bucket 中的对象。

**请求语法**

```http
GET /?list-type=2&prefix=<prefix>&max-keys=100 HTTP/1.1
Host: <BucketName>.oss-cn-hangzhou.aliyuncs.com
Date: <GMT Date>
Authorization: OSS4-HMAC-SHA256 Credential=<AK>/<Date>/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-date, Signature=<sig>
```

**查询参数**

| 参数 | 说明 |
|---|---|
| `prefix` | 只列出以该前缀开头的对象 |
| `max-keys` | 最大返回数量 (默认 100, 最大 1000) |
| `marker` | 分页标记 (从该 key 之后开始列出) |
| `delimiter` | 分隔符, 用于模拟目录结构 |
| `encoding-type` | 编码类型, 支持 `url` |

**curl 示例**

```bash
curl -X GET "https://mybucket.oss-cn-hangzhou.aliyuncs.com/?max-keys=20&prefix=logs/" \
  -H "Host: mybucket.oss-cn-hangzhou.aliyuncs.com" \
  -H "x-oss-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-oss-date: 20260615T080000Z" \
  -H "Authorization: OSS4-HMAC-SHA256 Credential=<AK>/20260615/cn-hangzhou/oss/aliyun_v4_request, AdditionalHeaders=host;x-oss-content-sha256;x-oss-date, Signature=<sig>"
```

---

## 6. VPC - 专有网络

**产品代码**: `Vpc`
**API 版本**: `2016-04-28`
**签名风格**: RPC (HMAC-SHA1)
**Endpoint 格式**: `vpc.{region-id}.aliyuncs.com`

### 6.1 DescribeVpcs - 查询 VPC 列表

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID |
| VpcId | String | 否 | VPC ID (最多 20 个, 逗号分隔) |
| VpcName | String | 否 | VPC 名称 |
| IsDefault | Boolean | 否 | 是否查询默认 VPC |
| PageNumber | Integer | 否 | 页码 (默认 1) |
| PageSize | Integer | 否 | 每页条数 (默认 10, 最大 50) |

**curl 示例**

```bash
curl -X GET "https://vpc.cn-hangzhou.aliyuncs.com/?Action=DescribeVpcs&RegionId=cn-hangzhou&Version=2016-04-28&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

**返回示例**

```json
{
  "RequestId": "C6532AA8-D0F7-497F-A8EE-094126D441F5",
  "TotalCount": 1,
  "PageNumber": 1,
  "PageSize": 10,
  "Vpcs": {
    "Vpc": [
      {
        "VpcId": "vpc-bp1qpo0kug3a20qqe****",
        "VpcName": "my-vpc",
        "RegionId": "cn-hangzhou",
        "CidrBlock": "192.168.0.0/16",
        "Status": "Available",
        "CreationTime": "2024-01-15T15:02:37Z",
        "IsDefault": false,
        "VRouterId": "vrt-bp1jcg5cmxjbl9xgc****"
      }
    ]
  }
}
```

---

### 6.2 DescribeVSwitches - 查询交换机列表

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| RegionId | String | 是 | 地域 ID |
| VpcId | String | 否 | VPC ID |
| VSwitchId | String | 否 | 交换机 ID |
| ZoneId | String | 否 | 可用区 ID |
| PageNumber | Integer | 否 | 页码 (默认 1) |
| PageSize | Integer | 否 | 每页条数 (默认 10, 最大 50) |

**curl 示例**

```bash
curl -X GET "https://vpc.cn-hangzhou.aliyuncs.com/?Action=DescribeVSwitches&RegionId=cn-hangzhou&VpcId=vpc-bp1qpo0kug3a20qqe****&Version=2016-04-28&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

## 7. BSS - 费用中心

**产品代码**: `BssOpenApi`
**API 版本**: `2017-12-14`
**签名风格**: RPC (HMAC-SHA1)
**Endpoint**: `business.aliyuncs.com` (全局, 不区分 Region)

### 7.1 QueryBillOverview - 账单总览

查询用户某个账期内的账单总览信息。

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| BillingCycle | String | 是 | 账期, 格式 `YYYY-MM`, 如 `2026-05` |

**curl 示例**

```bash
curl -X GET "https://business.aliyuncs.com/?Action=QueryBillOverview&BillingCycle=2026-05&Version=2017-12-14&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

### 7.2 QueryAccountBalance - 查询账户余额

查询用户账户余额信息。

**请求参数**: 无需额外参数 (仅需公共参数)

**curl 示例**

```bash
curl -X GET "https://business.aliyuncs.com/?Action=QueryAccountBalance&Version=2017-12-14&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

**返回示例**

```json
{
  "RequestId": "E7A63DAF-F9E4-4BC0-B25A-0B1B5D2E3F4A",
  "Data": {
    "Currency": "CNY",
    "CreditAmount": "0.00",
    "MybankCreditAmount": "0.00",
    "VoucherAmount": "0.00",
    "AvailableCashAmount": "1234.56",
    "AvailableAmount": "1234.56"
  }
}
```

---

## 8. RAM - 访问控制

**产品代码**: `Ram`
**API 版本**: `2015-05-01`
**签名风格**: RPC (HMAC-SHA1)
**Endpoint**: `ram.aliyuncs.com` (全局, 不区分 Region)

### 8.1 ListUsers - 查询 RAM 用户列表

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| Marker | String | 否 | 分页标记 |
| MaxItems | Integer | 否 | 返回条数 (1-1000, 默认 100) |

**curl 示例**

```bash
curl -X GET "https://ram.aliyuncs.com/?Action=ListUsers&Version=2015-05-01&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

**返回示例**

```json
{
  "RequestId": "4B450CA1-36E8-4AA2-8461-86B42BF4CC4E",
  "IsTruncated": false,
  "Marker": "EXAMPLE",
  "Users": {
    "User": [
      {
        "UserId": "20732900249392****",
        "UserName": "dev-user",
        "DisplayName": "Developer",
        "CreateDate": "2024-01-15T12:33:18Z",
        "UpdateDate": "2026-06-01T12:33:18Z"
      }
    ]
  }
}
```

---

### 8.2 CreateUser - 创建 RAM 用户

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| UserName | String | 是 | 用户名 (6-32 位, 字母数字和特殊字符) |
| DisplayName | String | 否 | 显示名称 |
| MobilePhone | String | 否 | 手机号 |
| Email | String | 否 | 邮箱 |
| Comments | String | 否 | 备注 |

**curl 示例**

```bash
curl -X GET "https://ram.aliyuncs.com/?Action=CreateUser&UserName=llm-agent-user&DisplayName=LLM Agent Service Account&Version=2015-05-01&Format=JSON&AccessKeyId=<AK-ID>&SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=<uuid>&Timestamp=2026-06-15T08%3A00%3A00Z&Signature=<sig>"
```

---

## 9. Region 与 Endpoint 速查

### 中国版 (aliyun.com) 常用 Region

| Region ID | 名称 | Endpoint 后缀 |
|---|---|---|
| cn-hangzhou | 华东 1 (杭州) | `.cn-hangzhou.aliyuncs.com` |
| cn-shanghai | 华东 2 (上海) | `.cn-shanghai.aliyuncs.com` |
| cn-beijing | 华北 2 (北京) | `.cn-beijing.aliyuncs.com` |
| cn-shenzhen | 华南 1 (深圳) | `.cn-shenzhen.aliyuncs.com` |
| cn-hongkong | 中国 (香港) | `.cn-hongkong.aliyuncs.com` |
| cn-chengdu | 西南 1 (成都) | `.cn-chengdu.aliyuncs.com` |

### 国际版 (alibabacloud.com) 常用 Region

| Region ID | 名称 | Endpoint 后缀 |
|---|---|---|
| ap-southeast-1 | 新加坡 | `.ap-southeast-1.aliyuncs.com` |
| ap-southeast-2 | 澳大利亚 (悉尼) | `.ap-southeast-2.aliyuncs.com` |
| ap-southeast-3 | 马来西亚 (吉隆坡) | `.ap-southeast-3.aliyuncs.com` |
| ap-southeast-5 | 印尼 (雅加达) | `.ap-southeast-5.aliyuncs.com` |
| ap-northeast-1 | 日本 (东京) | `.ap-northeast-1.aliyuncs.com` |
| ap-south-1 | 印度 (孟买) | `.ap-south-1.aliyuncs.com` |
| eu-central-1 | 德国 (法兰克福) | `.eu-central-1.aliyuncs.com` |
| eu-west-1 | 英国 (伦敦) | `.eu-west-1.aliyuncs.com` |
| us-west-1 | 美国 (硅谷) | `.us-west-1.aliyuncs.com` |
| us-east-1 | 美国 (弗吉尼亚) | `.us-east-1.aliyuncs.com` |
| me-east-1 | 阿联酋 (迪拜) | `.me-east-1.aliyuncs.com` |

### 各产品 Endpoint 汇总

| 产品 | Endpoint 格式 | 示例 |
|---|---|---|
| ECS | `ecs.{region}.aliyuncs.com` | `ecs.cn-hangzhou.aliyuncs.com` |
| OSS | `{bucket}.oss-{region}.aliyuncs.com` | `mybucket.oss-cn-hangzhou.aliyuncs.com` |
| VPC | `vpc.{region}.aliyuncs.com` | `vpc.cn-hangzhou.aliyuncs.com` |
| BSS | `business.aliyuncs.com` (全局) | `business.aliyuncs.com` |
| RAM | `ram.aliyuncs.com` (全局) | `ram.aliyuncs.com` |

---

## 10. Free Tier (免费试用)

阿里云提供 **160+ 云产品免费试用**, 面向新注册用户。

### 免费试用规则

- **适用人群**: 完成实名认证 (个人或企业) 的新注册用户
- **试用方式**: 每款产品独立试用, 互不影响资格
- **试用期限**: 产品特定, 通常为 1-3 个月
- **限制**: 每个阿里云账号每个产品仅可试用一次
- **到期处理**: 数据保留 1-15 天, 到期后不续费则释放

### 主要免费产品

| 产品 | 免费额度 | 试用时长 |
|---|---|---|
| ECS 云服务器 | 长效普惠实例 (如 ecs.t1.xsmall) | 1-3 个月 |
| OSS 对象存储 | 标准存储 5GB + 外网流出流量 | 3 个月 |
| SLB 负载均衡 | 公网实例 | 1 个月 |
| CDN 内容分发 | 流量包 | 1 个月 |

### 国际版免费试用 (Alibaba Cloud International)

- 入口: `https://www.alibabacloud.com/free`
- 提供 50+ 产品和服务的免费试用
- 需要国际账号 (非中国大陆注册)
- 包含 ECS, OSS, RDS, SLB 等核心产品

### 相关链接

- 中国版试用中心: `https://free.aliyun.com/`
- 国际版免费试用: `https://www.alibabacloud.com/free`
- 试用规则文档: `https://help.aliyun.com/document_detail/612761.html`

---

## 11. 常见错误码

### 通用 RPC API 错误码

| HTTP 状态码 | 错误码 | 说明 | 解决方案 |
|---|---|---|---|
| 400 | MissingParameter | 缺少必填参数 | 检查请求参数是否完整 |
| 400 | InvalidParameter | 参数值无效 | 检查参数格式和取值范围 |
| 403 | AuthFailure | 认证失败 | 检查 AccessKey 是否正确 |
| 403 | Forbidden | 无权限 | 检查 RAM 用户权限策略 |
| 404 | InvalidAction.NotFound | API 不存在 | 检查 Action 和 Version 是否正确 |
| 404 | NoSuchResource | 资源不存在 | 检查资源 ID 是否正确 |
| 500 | InternalError | 服务内部错误 | 稍后重试或提交工单 |
| 503 | ServiceUnavailable | 服务不可用 | 稍后重试 |

### ECS 特有错误码

| 错误码 | 说明 |
|---|---|
| InvalidInstanceId.NotFound | 实例 ID 不存在 |
| IncorrectInstanceStatus | 实例状态不允许此操作 (如对 Running 实例执行 StartInstance) |
| InvalidAccount.NotFound | 账号无效 |
| OperationDenied | 操作被拒绝 (如实例被锁定) |
| QuotaExceeded | 资源配额超限 |
| DryRunOperation | DryRun 预检通过 (非错误, 表示参数有效) |

### OSS 特有错误码

| HTTP 状态码 | 错误码 | 说明 |
|---|---|---|
| 403 | AccessDenied | 访问被拒绝 (权限不足) |
| 403 | RequestTimeTooSkewed | 请求时间与服务器时间差超过 15 分钟 |
| 404 | NoSuchBucket | Bucket 不存在 |
| 404 | NoSuchKey | Object 不存在 |
| 409 | FileAlreadyExists | 禁止覆盖时文件已存在 |
| 409 | FileImmutable | 对象处于保护状态 |
| 411 | MissingContentLength | 缺少 Content-Length |

### BSS 特有错误码

| 错误码 | 说明 |
|---|---|
| UnknownAccount | 账号不存在 |
| NotAuthorized | 无 BSS API 调用权限 |

---

## 12. 最佳实践与注意事项

### 安全建议

1. **使用 RAM 用户而非主账号**: 为 API 调用创建专用的 RAM 用户, 遵循最小权限原则
2. **定期轮换 AccessKey**: 建议每 90 天更换一次 AccessKey
3. **不要硬编码 AccessKey**: 使用环境变量或配置文件存储凭证
4. **开启 MFA**: 为 RAM 用户启用多因素认证

### API 调用建议

1. **使用 SDK 优先**: 阿里云提供 Java/Python/Go/Node.js/PHP/C#/C++ 等多语言 SDK, 自动处理签名
2. **分页查询**: 使用 `MaxResults` + `NextToken` 分页, 避免一次返回过多数据
3. **DryRun 预检**: 支持 `DryRun` 参数的 API, 建议先发送预检请求
4. **幂等性**: 大部分写操作 API 支持幂等, 可安全重试

### OSS 特定建议

1. **使用 V4 签名**: OSS V4 签名更安全, 是当前推荐版本
2. **时间同步**: 确保客户端时间准确, OSS 请求时间与服务器差不超过 15 分钟
3. **大文件上传**: 超过 5GB 的文件使用分片上传 (MultipartUpload)
4. **仅支持 Virtual Hosted 风格**: OSS 不支持 Path 风格 URL, Bucket 名必须在域名中

### 国际版注意事项

1. **Region 差异**: 国际版 Region 使用标准 AWS 风格命名 (如 `ap-southeast-1`), 中国版使用 `cn-` 前缀
2. **合规要求**: 国际版和中国版的数据合规政策不同
3. **账号体系**: 国际版和中国版使用独立的账号体系, AccessKey 不通用

---

## 参考链接

- 阿里云 OpenAPI Explorer: `https://api.aliyun.com`
- ECS API 文档: `https://help.aliyun.com/zh/ecs/developer-reference/api-ecs-2014-05-26-overview`
- OSS API 文档: `https://help.aliyun.com/zh/oss/developer-reference/api-reference/`
- VPC API 文档: `https://help.aliyun.com/zh/vpc/developer-reference/api-reference-new/`
- BSS API 文档: `https://help.aliyun.com/zh/user-center/developer-reference/api-bssopenapi-2017-12-14-overview`
- RAM API 文档: `https://help.aliyun.com/zh/ram/developer-reference/api-reference-4/`
- OSS V4 签名机制: `https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4`
- RPC 签名机制: `https://help.aliyun.com/zh/actiontrail/developer-reference/request-signatures`
- 国际版文档: `https://www.alibabacloud.com/help`
