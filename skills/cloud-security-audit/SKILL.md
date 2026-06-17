---
name: cloud-security-audit
description: 执行云安全审计，发现潜在安全风险
triggers:
  - keywords: ["安全", "审计", "风险", "漏洞"]
    priority: 1
  - keywords: ["合规", "检查", "扫描"]
    priority: 2
tools:
  - list_cloud_resources
  - get_cloud_stats
  - cloudAPIRequest
config:
  - name: severity_threshold
    type: string
    default: "medium"
    description: 风险等级阈值（low/medium/high/critical）
---

## 使用流程

1. **资源扫描**: 调用 `list_cloud_resources` 获取所有资源
2. **安全检测**: 调用 `cloudAPIRequest` 执行各云厂商安全检测 API
3. **报告**: 汇总发现的安全问题并给出修复建议

## 注意事项

- 安全审计需要 admin 角色
- 仅执行只读安全检测，不修改任何配置
