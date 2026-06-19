// commands.list RPC 方法
// 返回斜杠命令列表

/** 斜杠命令定义 */
export interface SlashCommand {
  /** 命令名（含 / 前缀） */
  name: string;
  /** 命令显示标签 */
  label: string;
  /** 命令描述 */
  description: string;
  /** 参数说明（可选） */
  args?: string;
}

/** 内置斜杠命令列表 */
const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: '/new',
    label: '新建会话',
    description: '开始一个新的对话会话',
  },
  {
    name: '/stop',
    label: '停止生成',
    description: '中止当前正在生成的 AI 回复',
  },
  {
    name: '/compact',
    label: '压缩上下文',
    description: '压缩当前会话的历史上下文，释放 token 空间',
  },
  {
    name: '/model',
    label: '切换模型',
    description: '切换当前会话使用的 LLM 模型',
    args: '[provider/model]',
  },
  {
    name: '/clear',
    label: '清空会话',
    description: '清空当前会话的所有历史消息',
  },
  {
    name: '/help',
    label: '帮助',
    description: '显示可用命令和工具列表',
  },
  {
    name: '/export',
    label: '导出会话',
    description: '导出当前会话的历史记录',
    args: '[format: json|md]',
  },
  {
    name: '/usage',
    label: '用量查询',
    description: '查询当前会话的 token 使用量和成本',
  },
];

/**
 * commands.list - 返回斜杠命令列表
 */
export function handleCommandsList(
  respond: (ok: boolean, payload: unknown) => void
): void {
  respond(true, { commands: BUILTIN_COMMANDS });
}
