# Vault 配置文件
# 用于 Agent Vault 凭证代理层

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"
}

# 禁用 UI（仅 API）
ui = false

# 启用审计日志
audit "file" {
  type = "file"
  options = {
    file_path = "/vault/logs/audit.log"
  }
}

# 启用性能指标
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# 默认租约配置
default_lease_ttl = "1h"
max_lease_ttl     = "24h"

# API 地址
api_addr = "http://0.0.0.0:8200"