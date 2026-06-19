// tools.catalog RPC 方法
// 返回工具目录（按分组组织，包含描述和 risk 级别）

import { getToolCatalog, type DangerLevel } from '../agent/tools.js';

/** 工具目录中的工具项 */
export interface CatalogToolItem {
  /** 工具 ID */
  id: string;
  /** 工具显示标签 */
  label: string;
  /** 工具描述 */
  description: string;
  /** 风险级别：safe / moderate / dangerous */
  risk?: DangerLevel;
}

/** 工具分组 */
export interface CatalogGroup {
  /** 分组 ID */
  id: string;
  /** 分组显示标签 */
  label: string;
  /** 该分组下的工具 */
  tools: CatalogToolItem[];
}

/**
 * tools.catalog - 返回工具目录
 * 从 tools.ts 的 ToolRegistry 获取工具列表，按分组返回
 */
export function handleToolsCatalog(
  respond: (ok: boolean, payload: unknown) => void
): void {
  const catalog = getToolCatalog();

  const groups: CatalogGroup[] = catalog.map(group => ({
    id: group.id,
    label: group.label,
    tools: group.tools.map(tool => ({
      id: tool.name,
      label: tool.label,
      description: tool.description,
      risk: tool.dangerLevel,
    })),
  }));

  respond(true, { groups });
}
