# MultiCloud Manager - 多云管理小程序

基于 AI Agent 编排和 Agent Vault 凭证代理的安全多云管理平台。

## 项目架构

```
multicloud-manager/
├── backend/                 # Go 后端服务
│   ├── main.go             # 入口文件
│   ├── config/             # 配置管理
│   ├── internal/           # 内部包
│   │   ├── api/           # API 路由
│   │   ├── agent/         # AI Agent 编排层
│   │   ├── vault/         # Agent Vault 客户端
│   │   ├── cloud/         # 多云适配层
│   │   ├── services/      # 业务服务
│   │   └── middleware/    # 中间件
│   ├── render.yaml        # Render 部署配置
│   └── README.md          # 后端文档
├── miniprogram/            # 微信小程序前端
│   ├── app.js             # 小程序入口
│   ├── app.json           # 小程序配置
│   ├── pages/             # 页面文件
│   ├── components/        # 组件
│   └── utils/             # 工具函数
├── vault/                  # Agent Vault 凭证代理
│   ├── Dockerfile         # Vault 容器镜像
│   ├── vault.hcl          # Vault 配置
│   └── init.sh            # 初始化脚本
└── terraform-executor/    # Terraform 执行器（待实现）
```

## 核心特性

### 1. AI Agent 编排层
- **自然语言交互**：用户通过自然语言指令管理云资源
- **意图解析**：LLM 解析用户意图，生成结构化指令
- **方案生成**：自动补全缺失参数，生成可执行方案
- **风险审查**：三级风险评估（低/中/高），高风险步骤必须用户确认
- **多步编排**：复杂任务自动拆解为有序执行序列

### 2. Agent Vault 凭证代理（核心安全层）
- **凭证零接触**：AI Agent 只看到 `credential_ref`，永不接触真实密钥
- **内存级隔离**：真实密钥仅存在于 Agent Vault 内存，执行后立即清除
- **硬编码规则引擎**：强制执行安全约束，LLM 无法绕过
- **审计追踪**：所有凭证访问记录到 `vault_audit_log`

### 3. 多云适配层
- **统一接口**：支持 Azure、Oracle Cloud、Render、腾讯云
- **资源抽象**：统一资源模型，屏蔽云平台差异
- **缓存优化**：Redis + 数据库二级缓存，提升响应速度

### 4. 四步执行流水线
```
用户输入 → 意图解析 → 方案生成 → 风险审查 → 执行反馈
```

### 5. 四种执行模式
| 模式 | 描述 | 适用场景 |
|---|---|---|
| **仅生成方案** | AI 返回 plan，用户自行执行 | 需要审批、学习型用户 |
| **分步确认** | 每一步执行前等待确认 | 生产环境操作 |
| **风险审查模式** | 自动执行低风险，高风险暂停确认 | 混合场景 |
| **全自动执行** | 一次性确认后自动执行 | 开发/测试环境 |

## 安全架构

### 凭证流转流程
```
AI Agent 请求（含 credential_ref） → 后端 API → Agent Vault（注入真实密钥） → 云 API
```

### 硬编码安全规则
- **禁止批量删除**：一次 plan 最多删除 5 个资源
- **禁止清空存储桶**：`delete_bucket` 必须二次确认
- **禁止修改 IAM 角色**：AI 可以建议，不能写入 plan
- **禁止修改计费设置**：如切换付费模式、调整预算告警

### 三级风险定级
- **🟢 低风险**：查询、启动、重启等可逆操作
- **🟡 中风险**：停止资源、创建新资源
- **🔴 高风险**：删除、格式化、修改关键配置

## 快速开始

### 1. 环境准备
```bash
# 安装 Go 1.21+
# 安装 PostgreSQL 15+
# 安装 Redis 7+
```

### 2. 启动后端
```bash
cd backend
go run main.go
```

### 3. 启动 Agent Vault
```bash
cd vault
docker build -t agent-vault .
docker run -p 8200:8200 agent-vault
```

### 4. 配置微信小程序
- 在微信公众平台创建小程序
- 配置 `app.json` 中的页面路径
- 使用微信开发者工具导入项目

## 部署到 Render

### 一键部署
```bash
# 在 Render 控制台导入 GitHub 仓库
# 或使用 Render CLI
render deploy
```

### 环境变量
```bash
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=your-secret
ENCRYPTION_KEY=your-key
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret
VAULT_URL=http://agent-vault:8200
VAULT_TOKEN=your-vault-token
LLM_API_KEY=your-llm-api-key
```

## 开发路线图

### Phase 1 (已完成)：基础框架
- [x] 后端 Go 服务骨架
- [x] 微信小程序基础页面
- [x] 微信登录集成
- [x] PostgreSQL 表结构
- [x] Agent Vault 容器镜像

### Phase 2：凭证安全 + 多云核心
- [ ] Agent Vault 部署（Render 内部网络）
- [ ] 凭证存储与注入流程实现
- [ ] 后端 API 凭证引用解析中间件
- [ ] Cloudpods SDK 提取与集成
- [ ] Azure 虚拟机列表/操作
- [ ] 统一资源列表页面

### Phase 3：AI Agent 编排层
- [ ] LLM 意图解析 Pipeline
- [ ] 方案生成 + 参数补全逻辑
- [ ] 规则引擎（安全约束强制执行）
- [ ] 风险管理（三级定级 + 确认流程）
- [ ] Agent 会话管理 + SSE 流式响应
- [ ] 小程序 AI 对话界面

### Phase 4：多云扩展 + Terraform
- [ ] 腾讯云集成
- [ ] Oracle Cloud 集成
- [ ] Render 服务管理
- [ ] Terraform 执行器 Docker 镜像
- [ ] 模板管理 + Plan/Apply 执行

### Phase 5：安全加固与审计
- [ ] Agent Vault 密钥轮换机制
- [ ] 审计日志聚合（操作 + Agent + Vault）
- [ ] 异常检测与告警
- [ ] 模板沙箱安全加固

### Phase 6：上线准备
- [ ] 小程序提审材料准备
- [ ] 用户文档编写（含 AI Agent 使用指南）
- [ ] 监控告警设置
- [ ] 生产环境部署
- [ ] 安全渗透测试

## 技术栈

### 后端
- **语言**：Go 1.21+
- **框架**：Gin + GORM
- **数据库**：PostgreSQL + Redis
- **部署**：Render Web Service
- **安全**：Agent Vault (HashiCorp Vault) + AES-GCM 加密

### 前端
- **平台**：微信原生小程序
- **UI 组件**：Vant Weapp
- **通信**：WebSocket (SSE) + REST API

### 基础设施
- **容器化**：Docker
- **多云 SDK**：Cloudpods `pkg/cloudprovider`
- **AI 集成**：LLM API (OpenAI/DeepSeek/智谱)
- **Terraform**：Docker 容器执行器

## 许可证

MIT License