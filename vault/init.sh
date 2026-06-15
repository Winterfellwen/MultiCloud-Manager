#!/bin/sh
# Agent Vault 初始化脚本

set -e

echo "Starting Agent Vault initialization..."

# 等待 Vault 启动
sleep 2

# 如果 Vault 未初始化，则进行初始化
if [ ! -f /vault/data/initialized ]; then
    echo "Initializing Vault..."
    
    # 初始化 Vault
    vault operator init -key-shares=1 -key-threshold=1 -format=json > /vault/init.json
    
    # 提取 unseal key 和 root token
    UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' /vault/init.json)
    ROOT_TOKEN=$(jq -r '.root_token' /vault/init.json)
    
    # 解封 Vault
    vault operator unseal "$UNSEAL_KEY"
    
    # 设置环境变量供后续使用
    export VAULT_TOKEN="$ROOT_TOKEN"
    
    # 启用 KV v2 引擎
    vault secrets enable -path=cloud kv-v2
    
    # 创建策略：允许读取 cloud/ 路径
    cat > /tmp/cloud-policy.hcl <<EOF
path "cloud/data/*" {
  capabilities = ["read"]
}

path "cloud/metadata/*" {
  capabilities = ["list"]
}
EOF
    
    vault policy write cloud-reader /tmp/cloud-policy.hcl
    
    # 创建 AppRole 用于后端服务
    vault auth enable approle
    
    # 创建后端服务角色
    vault write auth/approle/role/backend \
        secret_id_ttl=10m \
        token_num_uses=10 \
        token_ttl=20m \
        token_max_ttl=30m \
        policies="cloud-reader"
    
    # 获取角色 ID 和 secret ID
    ROLE_ID=$(vault read -field=role_id auth/approle/role/backend/role-id)
    SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/backend/secret-id)
    
    # 将凭据写入文件供后端服务读取
    echo "VAULT_ROLE_ID=$ROLE_ID" > /vault/credentials.env
    echo "VAULT_SECRET_ID=$SECRET_ID" >> /vault/credentials.env
    echo "VAULT_ADDR=https://localhost:8200" >> /vault/credentials.env
    
    # 标记已初始化
    touch /vault/data/initialized
    
    echo "Vault initialization completed"
    echo "Role ID: $ROLE_ID"
    echo "Secret ID: $SECRET_ID"
else
    echo "Vault already initialized, skipping..."
    
    # 如果已初始化但未解封，则尝试解封
    vault status 2>/dev/null || {
        echo "Vault is sealed, attempting to unseal..."
        if [ -f /vault/init.json ]; then
            UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' /vault/init.json)
            vault operator unseal "$UNSEAL_KEY"
        fi
    }
fi