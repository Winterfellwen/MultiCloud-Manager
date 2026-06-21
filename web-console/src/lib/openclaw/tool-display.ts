// CloudOps 工具显示元数据（精简版，硬编码 CloudOps 工具映射）。

/** 工具显示元数据。 */
export type ToolDisplay = {
  name: string;
  icon: string;
  title: string;
  label: string;
};

/** CloudOps 工具显示映射表。 */
const TOOL_DISPLAY_MAP: Record<string, Omit<ToolDisplay, "name">> = {
  cloud_list_instances: { label: "列出实例", icon: "list", title: "列出实例" },
  cloud_get_instance: { label: "查看实例", icon: "eye", title: "查看实例" },
  cloud_start_instance: { label: "启动实例", icon: "play", title: "启动实例" },
  cloud_stop_instance: { label: "停止实例", icon: "square", title: "停止实例" },
  cloud_reboot_instance: { label: "重启实例", icon: "rotate", title: "重启实例" },
  cloud_create_instance: { label: "创建实例", icon: "plus", title: "创建实例" },
  cloud_delete_instance: { label: "删除实例", icon: "trash", title: "删除实例" },
  cloud_list_resources: { label: "列出资源", icon: "list", title: "列出资源" },
  cloud_get_resource: { label: "查看资源", icon: "eye", title: "查看资源" },
  cloud_delete_resource: { label: "删除资源", icon: "trash", title: "删除资源" },
  cloud_sync_resources: { label: "同步资源", icon: "rotate", title: "同步资源" },
  monitor_get_metrics: { label: "查询指标", icon: "activity", title: "查询指标" },
  monitor_list_alerts: { label: "列出告警", icon: "alert", title: "列出告警" },
  monitor_get_cost: { label: "查询成本", icon: "dollar", title: "查询成本" },
  shell_execute: { label: "执行命令", icon: "play", title: "执行命令" },
};

/** 默认显示元数据（未命中映射表时使用）。 */
const FALLBACK_DISPLAY: Omit<ToolDisplay, "name"> = {
  label: "工具",
  icon: "wrench",
  title: "工具",
};

/**
 * 根据工具名解析显示元数据。
 * @param name 工具名
 * @returns 工具显示元数据
 */
export function resolveToolDisplay(name: string): ToolDisplay {
  const spec = TOOL_DISPLAY_MAP[name];
  if (spec) {
    return { name, ...spec };
  }
  return { name, ...FALLBACK_DISPLAY };
}
