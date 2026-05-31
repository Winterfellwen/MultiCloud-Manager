# Render REST API Reference

## Authentication

### API Key
```bash
# Render uses Bearer token authentication
# Get API key from: Dashboard > Account Settings > API Keys

export RENDER_API_KEY="rnd_xxxxx"
```

### Use Token in Requests
```bash
curl -s -X GET "https://api.render.com/v1/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json"
```

## Common Endpoints

### List Services
```bash
curl -s "https://api.render.com/v1/services" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Get Service Details
```bash
curl -s "https://api.render.com/v1/services/{service_id}" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### List Deploys
```bash
curl -s "https://api.render.com/v1/services/{service_id}/deploys?limit=10" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Trigger Deploy
```bash
curl -s -X POST "https://api.render.com/v1/services/{service_id}/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}'
```

### Restart Service
```bash
curl -s -X POST "https://api.render.com/v1/services/{service_id}/restart" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

## Environment Variables

### List Env Vars
```bash
curl -s "https://api.render.com/v1/services/{service_id}/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Update Env Var
```bash
curl -s -X PUT "https://api.render.com/v1/services/{service_id}/env-vars/{key}" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key": "DATABASE_URL", "value": "postgres://..."}'
```

## Databases

### List PostgreSQL Instances
```bash
curl -s "https://api.render.com/v1/postgres" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Get PostgreSQL Connection Info
```bash
curl -s "https://api.render.com/v1/postgres/{db_id}/connection-info" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### List Redis Instances
```bash
curl -s "https://api.render.com/v1/redis" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Get Redis Connection Info
```bash
curl -s "https://api.render.com/v1/redis/{redis_id}/connection-info" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

## Logs

### List Logs
```bash
curl -s "https://api.render.com/v1/logs?ownerId={owner_id}&resource={service_id}&limit=100" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

## Owner (Workspace)

### List Workspaces
```bash
curl -s "https://api.render.com/v1/owners" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

### Get Workspace Details
```bash
curl -s "https://api.render.com/v1/owners/{owner_id}" \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

## Service Types
- `web_service`: Web applications
- `private_service`: Internal services
- `background_worker`: Background jobs
- `cron_job`: Scheduled tasks

## Service Status
- `live`: Running
- `suspended`: Suspended
- `deprovisioned`: Deleted

## Deploy Status
- `build_in_progress`: Building
- `update_in_progress`: Deploying
- `live`: Deployed
- `update_failed`: Failed
- `canceled`: Canceled

## Common Errors
- 401: Invalid API key
- 403: Insufficient permissions
- 404: Resource not found
- 429: Rate limit exceeded

## Free Tier Limits
- 750 hours/month for web services
- 1 PostgreSQL instance (free)
- 1 Redis instance (free)
- 100 GB bandwidth/month
