---
name: cloud-cost-optimize
description: 分析云成本并给出优化建议，帮助用户降低云支出
triggers:
  - keywords: ["成本", "费用", "优化", "省钱", "账单"]
    priority: 1
  - keywords: ["支出", "开销", "降低"]
    priority: 2
tools:
  - getCostOverview
  - getCostTrend
  - getCostBreakdown
  - getOptimizationSuggestions
  - applyOptimization
  - forecastCost
config:
  - name: threshold
    type: number
    default: 100
    description: 成本异常阈值（美元），超过此值视为异常
  - name: period
    type: string
    default: "30d"
    description: 分析周期
---

## 使用流程

1. **概览**: 调用 `getCostOverview` 获取本月成本概览
2. **趋势**: 调用 `getCostTrend` 分析成本趋势
3. **明细**: 调用 `getCostBreakdown` 查看按资源维度的成本明细
4. **建议**: 调用 `getOptimizationSuggestions` 获取优化建议
5. **预测**: 调用 `forecastCost` 预测未来成本
6. **执行**: 如需执行优化，调用 `applyOptimization`

## 注意事项

- 仅对 admin 角色开放 `applyOptimization` 执行权限
- 优化前建议先查看趋势确认异常
- 阈值可通过配置参数调整
