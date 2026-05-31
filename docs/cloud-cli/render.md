# Render CLI Reference

## Description
Render CLI for managing Render cloud services. Used for deploying, managing, and monitoring Web Services, PostgreSQL databases, Redis, and static sites on Render platform.

## Authentication
```bash
# Login
render login

# Set API key
export RENDER_API_KEY=<your-api-key>
```

## Services
```bash
# List all services
render services list

# Get service details
render services get <service-id>

# Create a web service
render services create --name <name> --type web --repo <repo-url> --branch main

# Deploy (trigger build)
render services deploy <service-id>

# Restart
render services restart <service-id>

# Suspend
render services suspend <service-id>

# Delete
render services delete <service-id>
```

## Databases (PostgreSQL)
```bash
# List databases
render databases list

# Get database connection details
render databases get <db-id>

# Create a database
render databases create --name <name> --db-name <db-name> --user <user> --plan free

# Database connection string format:
# postgres://<user>:<password>@<host>:<port>/<db-name>
```

## Redis
```bash
# List Redis instances
render redis list

# Get Redis connection details
render redis get <redis-id>
```

## Environment Variables
```bash
# List env vars for a service
render services env list <service-id>

# Set env var
render services env set <service-id> KEY=VALUE

# Delete env var
render services env delete <service-id> KEY
```

## Logs
```bash
# Stream logs
render logs <service-id>

# Get recent logs
render logs <service-id> --limit 100
```

## Deploy Hooks
```bash
# Trigger a deploy hook
render deploy-hooks trigger <service-id> <hook-id>
```

## Common Patterns
```bash
# Check service status
render services get <service-id> --query "status"

# Get service URL
render services get <service-id> --query "service.details.url"

# List all services with status
render services list --query "[].{name:name, status:status, type:type}"
```

## Service Types
- **web**: Web services (Go, Node.js, Python, etc.)
- **postgres**: PostgreSQL databases
- **redis**: Redis instances
- **static**: Static sites
- **background**: Background workers
- **cron**: Cron jobs

## Free Tier Limits
- Web Service: 750 hours/month, spins down after inactivity
- PostgreSQL: 90 days free trial, then paid
- Redis: 30 days free trial, then paid
- Bandwidth: 100GB/month
