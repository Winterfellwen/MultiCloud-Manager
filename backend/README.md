# MultiCloud Manager - 后端服务

## 项目结构
```
backend/
├── main.go                 # 入口文件
├── go.mod                  # Go 模块定义
├── config/                 # 配置管理
│   └── config.go
├── internal/               # 内部包
│   ├── api/               # API 路由和处理器
│   │   └── routes.go
│   ├── models/            # 数据模型
│   ├── services/          # 业务服务
│   │   └── database.go
│   ├── middleware/        # 中间件
│   ├── agent/             # AI Agent 编排层
│   │   ├── orchestrator.go
│   │   └── executor.go
│   ├── vault/             # Agent Vault 客户端
│   │   └── client.go
│   └── cloud/             # 多云适配层
│       └── provider.go
└── render.yaml            # Render 部署配置
```

## 环境变量
```bash
# 数据库
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Redis（可选）
REDIS_URL=redis://localhost:6379

# JWT 密钥
JWT_SECRET=your-jwt-secret

# 加密密钥（用于加密云凭据）
ENCRYPTION_KEY=your-encryption-key

# 微信小程序
WECHAT_APP_ID=your-app-id
WECHAT_APP_SECRET=your-app-secret

# Agent Vault
VAULT_URL=http://agent-vault:8200
VAULT_TOKEN=your-vault-token

# LLM API（AI Agent）
LLM_API_KEY=your-llm-api-key
LLM_API_ENDPOINT=https://api.openai.com/v1

# 环境标识
ENVIRONMENT=development
```

## 运行
```bash
# 开发环境
go run main.go

# 构建
go build -o multicloud-manager

# 运行
./multicloud-manager
```

## 数据库迁移
项目启动时会自动运行数据库迁移，创建所有必要的表。

## 安全架构
1. **AI Agent 凭证隔离**：AI 只看到 `credential_ref`，真实密钥由 Agent Vault 注入
2. **硬编码规则引擎**：禁止批量删除、禁止修改 IAM 等安全约束
3. **三级风险审查**：低风险自动执行，中风险展示摘要，高风险必须用户确认
4. **凭据内存清理**：执行后立即清除内存中的真实密钥

## API 文档
启动后访问 `/api/health` 检查服务状态。

主要 API 端点：
- `POST /api/agent/chat` - AI Agent 对话
- `POST /api/agent/execute` - 执行 AI 生成的计划
- `GET /api/accounts` - 云账户列表
- `GET /api/resources` - 跨云资源查询
- `POST /api/terraform/templates` - 上传 Terraform 模板