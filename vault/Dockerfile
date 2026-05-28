# Agent Vault - 凭证代理层 Dockerfile
# 基于 HashiCorp Vault 构建，用于安全存储和注入云凭据

FROM vault:1.15

# 创建配置目录
RUN mkdir -p /vault/config /vault/data /vault/logs

# 复制 Vault 配置文件
COPY vault.hcl /vault/config/vault.hcl

# 创建初始化脚本
COPY init.sh /usr/local/bin/init-vault.sh
RUN chmod +x /usr/local/bin/init-vault.sh

# 创建启动脚本
RUN echo '#!/bin/sh\n/usr/local/bin/init-vault.sh\nexec vault server -config=/vault/config/vault.hcl' > /usr/local/bin/start-vault.sh && \
    chmod +x /usr/local/bin/start-vault.sh

# 设置非 root 用户运行
RUN addgroup -g 1000 vaultgroup && \
    adduser -u 1000 -G vaultgroup -D vaultuser

# 设置目录权限
RUN chown -R vaultuser:vaultgroup /vault

# 切换到非 root 用户
USER vaultuser

# 暴露 Vault 端口
EXPOSE 8200

# 启动 Vault
ENTRYPOINT ["/usr/local/bin/start-vault.sh"]