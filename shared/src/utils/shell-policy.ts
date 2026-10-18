/**
 * Shell 命令执行安全策略（默认拒绝 / 白名单制）
 *
 * 背景：原实现为「黑名单关键词匹配 + exec(全量 env)」，存在多重绕过
 * （引号拼接、declare -p、/proc/1/environ、十进制 IP 形式的 metadata 地址等），
 * 且 ai-agent 侧直接将 process.env 全量传入子进程（泄露 JWT_SECRET/DATABASE_URL）。
 *
 * 本模块策略：
 * 1. 白名单制：只有明确登记的只读运维命令可执行，其余一律拒绝；
 * 2. 不经 shell：解析为 argv 后以 spawn 直派，彻底消除 shell 元字符注入面；
 * 3. 环境变量沙箱：仅传递 PATH/LANG/HOME 与服务间 URL，剥离全部密钥；
 * 4. 参数级校验：禁止路径穿越（..）与敏感文件（shadow/environ/.env/.ssh）；
 * 5. 显式开关：SHELL_EXECUTE_ENABLED=false 时整体禁用。
 */

import { spawn } from 'node:child_process';

/** 允许执行的二进制（只读运维诊断为主） */
export const SHELL_COMMAND_ALLOWLIST = new Set<string>([
  // 系统信息
  'uname', 'hostname', 'uptime', 'date', 'whoami', 'id', 'free', 'df', 'du',
  'ls', 'stat', 'file', 'wc', 'echo',
  // 文件读取（只读）
  'cat', 'head', 'tail', 'grep', 'find',
  // 进程
  'ps', 'top',
  // 网络诊断（不含 curl/wget/nc：避免数据外传与 metadata 访问）
  'ping', 'dig', 'nslookup', 'ss', 'netstat', 'ip',
  // 进程管理器（受限于 PM2_SUBCOMMANDS）
  'pm2',
]);

/** pm2 允许的子命令（restart 属危险操作，依赖上层 dangerLevel + 审批流兜底） */
const PM2_SUBCOMMANDS = new Set(['list', 'status', 'describe', 'logs', 'restart', 'jlist', 'prettylist']);

/** 参数中禁止出现的敏感路径模式 */
const SENSITIVE_ARG_PATTERNS: RegExp[] = [
  /\/etc\/shadow/,
  /\/etc\/gshadow/,
  /\/proc\/\d+\/environ/,
  /\/proc\/self\/environ/,
  /\/proc\/1\/environ/,
  /\.env(\.|$|\s)/i,
  /\.ssh\//,
  /id_rsa|id_ed25519/,
  /\.aws\/credentials/,
  /\.kube\/config/,
  /render\.(json|ya?ml)/i,
];

/** 未加引号时禁止出现的字符（shell 元字符 / 命令替换 / 变量展开） */
const FORBIDDEN_BARE_CHARS = new Set([';', '|', '&', '<', '>', '(', ')', '{', '}', '`', '$', '\n', '\r', '\\']);

export type ShellValidation =
  | { ok: true; bin: string; args: string[] }
  | { ok: false; reason: string };

/**
 * 将命令字符串解析为 argv。
 * 支持单/双引号包裹的参数；引号内外均禁止 shell 元字符与命令替换。
 */
function tokenizeCommand(command: string): { ok: true; argv: string[] } | { ok: false; reason: string } {
  const argv: string[] = [];
  let current = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;

  const pushToken = () => {
    if (inToken) {
      argv.push(current);
      current = '';
      inToken = false;
    }
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote === "'") {
      if (ch === "'") {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (quote === '"') {
      // 双引号内禁止命令替换与变量展开
      if (ch === '$' || ch === '`' || ch === '\\') {
        return { ok: false, reason: '命令包含禁止的字符（双引号内不允许 $ ` \\）' };
      }
      if (ch === '"') {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      inToken = true;
      quote = ch;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      pushToken();
      continue;
    }

    if (FORBIDDEN_BARE_CHARS.has(ch)) {
      return { ok: false, reason: `命令包含禁止的字符: ${ch}（不支持管道/重定向/命令替换/变量展开）` };
    }

    current += ch;
    inToken = true;
  }

  if (quote) {
    return { ok: false, reason: '命令包含未闭合的引号' };
  }
  pushToken();

  if (argv.length === 0) {
    return { ok: false, reason: '空命令' };
  }
  return { ok: true, argv };
}

/**
 * 校验并解析一条 shell 命令。白名单制：不在名单内一律拒绝。
 */
export function validateShellCommand(command: string): ShellValidation {
  const tokenized = tokenizeCommand(command);
  if (!tokenized.ok) return tokenized;

  const [bin, ...args] = tokenized.argv;

  // 取纯二进制名（拒绝 /usr/bin/xxx 绝对路径形式，统一走 PATH）
  if (bin.includes('/')) {
    return { ok: false, reason: `命令必须使用二进制名，不支持路径形式: ${bin}` };
  }

  if (!SHELL_COMMAND_ALLOWLIST.has(bin)) {
    return {
      ok: false,
      reason: `命令 "${bin}" 不在白名单中。仅允许只读运维诊断命令（${[...SHELL_COMMAND_ALLOWLIST].join(', ')}）。云操作请使用 cloud_xxx_* 工具。`,
    };
  }

  // pm2 子命令收敛
  if (bin === 'pm2') {
    const sub = args[0];
    if (!sub || !PM2_SUBCOMMANDS.has(sub)) {
      return { ok: false, reason: `pm2 仅允许子命令: ${[...PM2_SUBCOMMANDS].join(', ')}` };
    }
  }

  // 参数级校验：路径穿越与敏感文件
  for (const arg of args) {
    if (arg.includes('..')) {
      return { ok: false, reason: `参数包含路径穿越: ${arg}` };
    }
    for (const pattern of SENSITIVE_ARG_PATTERNS) {
      if (pattern.test(arg)) {
        return { ok: false, reason: `参数涉及敏感路径，已被安全策略拦截: ${arg}` };
      }
    }
  }

  return { ok: true, bin, args };
}

/** 沙箱环境变量：仅保留 PATH/LANG/HOME 与服务间 URL，剥离全部密钥 */
function buildSandboxEnv(): Record<string, string> {
  const env: Record<string, string> = {
    LANG: 'en_US.UTF-8',
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/tmp',
  };
  if (process.env.CLOUD_SERVICE_URL) env.CLOUD_SERVICE_URL = process.env.CLOUD_SERVICE_URL;
  if (process.env.MONITOR_SERVICE_URL) env.MONITOR_SERVICE_URL = process.env.MONITOR_SERVICE_URL;
  if (process.env.AUTH_SERVICE_URL) env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
  return env;
}

export interface SafeShellResult {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** 被安全策略拦截或执行异常时的错误说明 */
  error?: string;
}

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB

/**
 * 白名单制 shell 执行：校验通过后以 spawn 直派（不经 shell），沙箱环境变量。
 */
export async function runSafeShellCommand(
  command: string,
  timeoutSeconds: number = 30
): Promise<SafeShellResult> {
  // 显式开关：SHELL_EXECUTE_ENABLED=false 时整体禁用
  if (process.env.SHELL_EXECUTE_ENABLED === 'false') {
    return {
      success: false,
      command,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: 'shell_execute 已被管理员禁用（SHELL_EXECUTE_ENABLED=false）',
    };
  }

  const validation = validateShellCommand(command);
  if (!validation.ok) {
    return {
      success: false,
      command,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `命令被安全策略禁止: ${validation.reason}`,
    };
  }

  const timeout = Math.min(Math.max(timeoutSeconds, 1), 60) * 1000;

  return new Promise<SafeShellResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(validation.bin, validation.args, {
      timeout,
      env: buildSandboxEnv(),
      // 禁止子进程继承可写的文件描述符
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      resolve({
        success: exitCode === 0 && !error,
        command,
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        exitCode,
        ...(error ? { error } : {}),
      });
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
    });

    child.on('error', (err: Error) => {
      finish(null, `命令启动失败: ${err.message}`);
    });

    child.on('close', (code) => {
      finish(code);
    });
  });
}
