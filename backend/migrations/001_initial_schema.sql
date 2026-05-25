-- multicloud_manager_migration.sql
-- 多云管理小程序数据库迁移脚本

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openid VARCHAR(128) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    avatar_url TEXT,
    team_id UUID,
    role VARCHAR(20) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 团队表
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 云账户表
CREATE TABLE cloud_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) NOT NULL,
    cloud_type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    encrypted_credentials BYTEA NOT NULL,
    encryption_key_id VARCHAR(64),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_cloud_type CHECK (cloud_type IN ('azure', 'oracle', 'tencent', 'render'))
);

-- 4. AI Agent 会话表
CREATE TABLE ai_agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    team_id UUID REFERENCES teams(id) NOT NULL,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active',
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. AI Agent 消息表
CREATE TABLE ai_agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES ai_agent_sessions(id) NOT NULL,
    role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. AI Agent 执行计划表
CREATE TABLE ai_agent_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES ai_agent_sessions(id) NOT NULL,
    plan_id VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    steps JSONB NOT NULL,
    risk_summary JSONB,
    missing_params JSONB,
    estimated_cost DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending',
    confirmed_by UUID REFERENCES users(id),
    confirmed_at TIMESTAMP,
    execution_started_at TIMESTAMP,
    execution_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. AI Agent 执行记录表
CREATE TABLE ai_agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES ai_agent_plans(id) NOT NULL,
    step_index INTEGER NOT NULL,
    step_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    api_request JSONB,
    api_response JSONB,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. 资源缓存表
CREATE TABLE resources_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES cloud_accounts(id),
    resource_type VARCHAR(50) NOT NULL,
    cloud_resource_id VARCHAR(255) NOT NULL,
    cloud_region VARCHAR(50),
    name VARCHAR(200),
    status VARCHAR(50),
    spec JSONB,
    tags JSONB,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, cloud_resource_id)
);

-- 9. Terraform 模板表
CREATE TABLE terraform_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    variables JSONB,
    cloud_account_ids UUID[],
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Terraform 执行记录表
CREATE TABLE terraform_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES terraform_templates(id),
    run_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    plan_output TEXT,
    apply_output TEXT,
    variables JSONB,
    approved_by UUID REFERENCES users(id),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Vault 审计日志表
CREATE TABLE vault_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_ref VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    request_source INET,
    user_id UUID REFERENCES users(id),
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. 操作审计表
CREATE TABLE operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_users_openid ON users(openid);
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_cloud_accounts_team ON cloud_accounts(team_id);
CREATE INDEX idx_ai_sessions_user ON ai_agent_sessions(user_id);
CREATE INDEX idx_ai_sessions_team ON ai_agent_sessions(team_id);
CREATE INDEX idx_ai_messages_session ON ai_agent_messages(session_id);
CREATE INDEX idx_ai_plans_session ON ai_agent_plans(session_id);
CREATE INDEX idx_ai_executions_plan ON ai_agent_executions(plan_id);
CREATE INDEX idx_resources_cache_account ON resources_cache(account_id);
CREATE INDEX idx_resources_cache_synced ON resources_cache(last_synced_at);
CREATE INDEX idx_terraform_templates_team ON terraform_templates(team_id);
CREATE INDEX idx_terraform_runs_template ON terraform_runs(template_id);
CREATE INDEX idx_vault_audit_credential ON vault_audit_log(credential_ref);
CREATE INDEX idx_operation_logs_user ON operation_logs(user_id);
CREATE INDEX idx_operation_logs_created ON operation_logs(created_at);

-- 创建触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cloud_accounts_updated_at BEFORE UPDATE ON cloud_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_agent_sessions_updated_at BEFORE UPDATE ON ai_agent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_agent_plans_updated_at BEFORE UPDATE ON ai_agent_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_terraform_templates_updated_at BEFORE UPDATE ON terraform_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图：活跃会话统计
CREATE VIEW active_sessions_stats AS
SELECT 
    s.team_id,
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_sessions,
    MAX(s.last_message_at) as latest_activity
FROM ai_agent_sessions s
GROUP BY s.team_id;

-- 创建视图：云资源统计
CREATE VIEW cloud_resources_stats AS
SELECT 
    ca.team_id,
    ca.cloud_type,
    COUNT(rc.id) as total_resources,
    COUNT(CASE WHEN rc.status = 'running' THEN 1 END) as running_resources,
    COUNT(CASE WHEN rc.status = 'stopped' THEN 1 END) as stopped_resources
FROM cloud_accounts ca
LEFT JOIN resources_cache rc ON ca.id = rc.account_id
WHERE ca.is_active = true
GROUP BY ca.team_id, ca.cloud_type;

-- 创建视图：AI Agent 执行成功率
CREATE VIEW ai_agent_success_rate AS
SELECT 
    p.session_id,
    p.plan_id,
    COUNT(e.id) as total_steps,
    COUNT(CASE WHEN e.status = 'success' THEN 1 END) as successful_steps,
    ROUND(COUNT(CASE WHEN e.status = 'success' THEN 1 END) * 100.0 / COUNT(e.id), 2) as success_rate
FROM ai_agent_plans p
LEFT JOIN ai_agent_executions e ON p.id = e.plan_id
WHERE p.status = 'completed'
GROUP BY p.session_id, p.plan_id;

-- 插入初始数据（可选）
INSERT INTO teams (id, name, description) VALUES 
    (gen_random_uuid(), '默认团队', '系统创建的初始团队');

COMMENT ON TABLE users IS '用户表，存储微信登录用户信息';
COMMENT ON TABLE teams IS '团队表，支持多用户协作';
COMMENT ON TABLE cloud_accounts IS '云账户表，存储加密的云平台凭据';
COMMENT ON TABLE ai_agent_sessions IS 'AI Agent 会话表，管理对话上下文';
COMMENT ON TABLE ai_agent_messages IS 'AI Agent 消息表，存储对话历史';
COMMENT ON TABLE ai_agent_plans IS 'AI Agent 执行计划表，存储生成的计划';
COMMENT ON TABLE ai_agent_executions IS 'AI Agent 执行记录表，记录每一步的执行结果';
COMMENT ON TABLE resources_cache IS '资源缓存表，缓存云资源信息';
COMMENT ON TABLE terraform_templates IS 'Terraform 模板表，存储基础设施代码';
COMMENT ON TABLE terraform_runs IS 'Terraform 执行记录表，记录 plan/apply 结果';
COMMENT ON TABLE vault_audit_log IS 'Agent Vault 审计日志表，记录凭证访问';
COMMENT ON TABLE operation_logs IS '操作审计表，记录所有用户操作';

-- 完成迁移
SELECT 'Database migration completed successfully' as result;