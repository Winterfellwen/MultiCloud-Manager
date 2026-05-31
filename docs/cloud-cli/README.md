# Cloud CLI Knowledge Base

## Description
API documentation for cloud provider CLIs. The AI agent can read these docs to understand how to use each cloud CLI tool.

## Available Documents

### azure.md
**Provider**: Azure (Microsoft)
**Commands**: az
**Use for**: VM management, Cognitive Services (TTS/Speech), Storage, Networking, Resource Groups, Azure CLI operations
**Key topics**: az login, az cognitiveservices, az vm, az group, az account

### render.md
**Provider**: Render
**Commands**: render
**Use for**: Web service deployment, PostgreSQL databases, Redis instances, environment variables, logs, service management
**Key topics**: render services, render databases, render redis, deploy, env vars

### tencent.md
**Provider**: Tencent Cloud
**Commands**: tccli
**Use for**: CVM instances, COS storage, CDB databases, CLB load balancers, VPC networking
**Key topics**: tccli cvm, tccli cos, tccli cdb, TC3-HMAC-SHA256 auth

### oracle.md
**Provider**: Oracle Cloud Infrastructure (OCI)
**Commands**: oci
**Use for**: Compute instances, VCN networking, block volumes, images, load balancers
**Key topics**: oci compute, oci network, oci bv, compartments, availability domains

## How to Use

1. **Check if a CLI is installed**: `which <cli>` (az, render, tccli, oci)
2. **Read the relevant doc**: Use `cat` or `head` to read the markdown file
3. **Follow the examples**: Each doc has ready-to-use command examples
4. **Check free tier**: Each doc lists free tier offerings

## File Locations
```
docs/cloud-cli/azure.md     - Azure CLI reference
docs/cloud-cli/render.md    - Render CLI reference
docs/cloud-cli/tencent.md   - Tencent Cloud CLI reference
docs/cloud-cli/oracle.md    - Oracle Cloud CLI reference
```
