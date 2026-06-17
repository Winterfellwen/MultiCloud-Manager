---
name: cloud-resource-query
description: 查询和管理云资源，支持跨云厂商资源检索
triggers:
  - keywords: ["资源", "查询", "列表", "查看"]
    priority: 1
  - keywords: ["服务器", "实例", "数据库", "存储"]
    priority: 2
tools:
  - list_cloud_resources
  - get_cloud_stats
  - syncResources
  - instanceAction
config:
  - name: default_limit
    type: number
    default: 50
    description: 默认返回资源数量限制
---

## 使用流程

1. **列表**: 调用 `list_cloud_resources` 获取资源列表
2. **统计**: 调用 `get_cloud_stats` 获取全局统计
3. **同步**: 如需最新数据，调用 `syncResources`
4. **操作**: 如需启停资源，调用 `instanceAction`

## 注意事项

- viewer 角色只能查看，不能执行操作
- 支持按 Provider、类型、区域筛选
