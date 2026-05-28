package knowledge

// GetFreeTierSummary 返回各云平台的免费层摘要（定期手动更新）
func GetFreeTierSummary() string {
	return `各云平台免费层信息：

Azure 免费层：
- 12个月免费：B1S VM (1 vCPU, 1GB RAM) 每月750小时
- 永久免费：200MB Functions、5GB Blob存储、250GB SQL Database等
- 新用户 $200 额度（30天有效）

Oracle Cloud Always Free（永久免费）：
- VM.Standard.A1.Flex：最多4 vCPU + 24GB RAM（ARM架构）
- VM.Standard.E2.1.Micro：1 vCPU + 1GB RAM（AMD架构）
- 总计200GB块存储、10TB出站流量/月
- 额外：2个 Autonomous Database、10个 Functions、5个 Load Balancer

腾讯云免费相关：
- 新用户专享：轻量应用服务器 ¥10/月起（1C2G）
- 部分基础服务有免费额度（COS 50GB 存储、CDN 10GB/月等）
- 无永久免费VM，以新用户优惠为主

Google Cloud (GCP) 免费层：
- 永久免费：e2-micro (1 vCPU, 1GB RAM) 每月750小时
- 30GB HDD存储、5GB Cloud Storage等
- $300 试用额度（90天）

注意：免费层配额和可用性随时可能变化，建议创建前查看官方最新政策。\n`
}
