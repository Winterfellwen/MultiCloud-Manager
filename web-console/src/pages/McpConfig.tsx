// MCP 配置页：展示已配置的 MCP 服务器列表，支持添加/删除/启用禁用
// 注意：MCP 配置目前通过环境变量读取，前端展示为主。
// 添加/删除功能为 UI 层操作，后端保存接口后续补充。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Plug, Server, Globe, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

type McpTransport = 'stdio' | 'http';

interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio 模式下的启动命令 */
  command?: string;
  /** http 模式下的服务地址 */
  url?: string;
  /** 额外参数 */
  args?: string;
  enabled: boolean;
}

// 默认 MCP 服务器列表（占位数据，实际从后端环境变量读取）
const DEFAULT_SERVERS: McpServer[] = [
  {
    id: 'mcp-filesystem',
    name: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    args: '@modelcontextprotocol/server-filesystem /tmp',
    enabled: true,
  },
  {
    id: 'mcp-fetch',
    name: 'fetch',
    transport: 'http',
    url: 'http://localhost:3100/mcp',
    enabled: false,
  },
];

const STORAGE_KEY = 'mcp-servers';

function loadServers(): McpServer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_SERVERS;
}

function saveServers(servers: McpServer[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export default function McpConfig() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServer[]>(loadServers);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);

  // 切换服务器启用/禁用状态
  const handleToggle = (id: string) => {
    setServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      saveServers(next);
      return next;
    });
  };

  // 删除服务器
  const handleDelete = () => {
    if (!deleteTarget) return;
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== deleteTarget.id);
      saveServers(next);
      return next;
    });
    setDeleteTarget(null);
  };

  // 添加新服务器
  const handleAdd = (server: Omit<McpServer, 'id' | 'enabled'>) => {
    const newServer: McpServer = {
      ...server,
      id: `mcp-${Date.now()}`,
      enabled: true,
    };
    setServers((prev) => {
      const next = [...prev, newServer];
      saveServers(next);
      return next;
    });
    setAddDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('mcp.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('mcp.subtitle')}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('mcp.addServer')}
        </Button>
      </div>

      {/* 提示信息 */}
      <div className="flex items-start gap-2 rounded-md border border-blue-500/50 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
        <Plug className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          {t('mcp.hint')}
        </div>
      </div>

      {/* 服务器列表 */}
      <Card>
        <CardContent className="pt-6">
          {servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Plug className="h-10 w-10 mb-2 opacity-50" />
              <p>{t('mcp.empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">{t('mcp.name')}</TableHead>
                  <TableHead className="w-[120px]">{t('mcp.transport')}</TableHead>
                  <TableHead>{t('mcp.command')}</TableHead>
                  <TableHead className="w-[100px]">{t('mcp.status')}</TableHead>
                  <TableHead className="w-[140px]">{t('mcp.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {server.transport === 'stdio' ? (
                          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {server.transport}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {server.transport === 'stdio'
                        ? `${server.command || ''} ${server.args || ''}`.trim()
                        : server.url || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={server.enabled ? 'success' : 'secondary'}>
                        {server.enabled ? t('common.enabled') : t('common.disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(server.id)}
                        >
                          {server.enabled ? t('mcp.disable') : t('mcp.enable')}
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(server)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tooltip.delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 添加服务器对话框 */}
      <AddServerDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} onAdd={handleAdd} />

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('mcp.confirmDeleteTitle')}
        description={t('mcp.confirmDeleteDesc', { name: deleteTarget?.name })}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** 添加 MCP 服务器对话框 */
function AddServerDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (server: Omit<McpServer, 'id' | 'enabled'>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [args, setArgs] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      transport,
      command: transport === 'stdio' ? command.trim() : undefined,
      url: transport === 'http' ? url.trim() : undefined,
      args: transport === 'stdio' ? args.trim() : undefined,
    });
    // 重置表单
    setName('');
    setTransport('stdio');
    setCommand('');
    setUrl('');
    setArgs('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('mcp.addTitle')}
      description={t('mcp.addDesc')}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mcp-name">{t('mcp.serverName')}</Label>
          <Input
            id="mcp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('mcp.serverNamePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mcp-transport">{t('mcp.transportType')}</Label>
          <Select
            id="mcp-transport"
            value={transport}
            onChange={(e) => setTransport(e.target.value as McpTransport)}
          >
            <option value="stdio">{t('mcp.transportStdio')}</option>
            <option value="http">{t('mcp.transportHttp')}</option>
          </Select>
        </div>

        {transport === 'stdio' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="mcp-command">{t('mcp.startCommand')}</Label>
              <Input
                id="mcp-command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('mcp.startCommandPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-args">{t('mcp.args')}</Label>
              <Input
                id="mcp-args"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={t('mcp.argsPlaceholder')}
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="mcp-url">{t('mcp.serviceUrl')}</Label>
            <Input
              id="mcp-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('mcp.serviceUrlPlaceholder')}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            <Server className="mr-1.5 h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
