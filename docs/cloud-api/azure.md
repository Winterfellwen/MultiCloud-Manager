# Azure REST API Reference

## Authentication

### Get Access Token (Service Principal)
```bash
curl -s -X POST "https://login.microsoftonline.com/{tenant_id}/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id={client_id}&client_secret={client_secret}&resource=https://management.azure.com"
```

Response: `{ "access_token": "eyJ0...", "expires_in": "3600" }`

### Use Token in Requests
```bash
TOKEN="eyJ0..."
curl -s -X GET "https://management.azure.com/subscriptions/{sub}/resources?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN"
```

## Common Endpoints

### List Subscriptions
```bash
curl -s "https://management.azure.com/subscriptions?api-version=2020-01-01" \
  -H "Authorization: Bearer $TOKEN"
```

### List Resources
```bash
# All resources in subscription
curl -s "https://management.azure.com/subscriptions/{sub}/resources?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN"

# Filter by resource group
curl -s "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/resources?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN"

# Filter by type
curl -s "https://management.azure.com/subscriptions/{sub}/resources?api-version=2021-04-01&\$filter=resourceType eq 'Microsoft.Compute/virtualMachines'" \
  -H "Authorization: Bearer $TOKEN"
```

### Resource Groups
```bash
# List
curl -s "https://management.azure.com/subscriptions/{sub}/resourceGroups?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN"

# Create
curl -s -X PUT "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location": "eastus"}'

# Delete
curl -s -X DELETE "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}?api-version=2021-04-01" \
  -H "Authorization: Bearer $TOKEN"
```

## Virtual Machines

### List VMs
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/providers/Microsoft.Compute/virtualMachines?api-version=2023-03-01" \
  -H "Authorization: Bearer $TOKEN"
```

### Get VM Status
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}/instanceView?api-version=2023-03-01" \
  -H "Authorization: Bearer $TOKEN"
```

### Start/Stop/Restart VM
```bash
# Start
curl -s -X POST "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}/start?api-version=2023-03-01" \
  -H "Authorization: Bearer $TOKEN"

# Stop (deallocate)
curl -s -X POST "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}/deallocate?api-version=2023-03-01" \
  -H "Authorization: Bearer $TOKEN"

# Restart
curl -s -X POST "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{vm}/restart?api-version=2023-03-01" \
  -H "Authorization: Bearer $TOKEN"
```

## Cognitive Services

### List Accounts
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Account
```bash
curl -s -X PUT "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}?api-version=2023-05-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": "eastus",
    "kind": "SpeechServices",
    "sku": {"name": "F0"},
    "properties": {}
  }'
```

### Get Keys
```bash
curl -s -X POST "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}/listKeys?api-version=2023-05-01" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete Account
```bash
curl -s -X DELETE "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}?api-version=2023-05-01" \
  -H "Authorization: Bearer $TOKEN"
```

## Storage

### List Storage Accounts
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01" \
  -H "Authorization: Bearer $TOKEN"
```

### List Containers
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{name}/listKeys?api-version=2023-01-01" \
  -H "Authorization: Bearer $TOKEN"
# Use key to access blob storage
```

## Networking

### List Virtual Networks
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/providers/Microsoft.Network/virtualNetworks?api-version=2023-04-01" \
  -H "Authorization: Bearer $TOKEN"
```

### List Public IPs
```bash
curl -s "https://management.azure.com/subscriptions/{sub}/providers/Microsoft.Network/publicIPAddresses?api-version=2023-04-01" \
  -H "Authorization: Bearer $TOKEN"
```

## Free Tier Resources
- F0 SKU for Cognitive Services (free tier)
- B1 SKU for App Service (free tier)
- 750 hours/month B1S VM (12 months free)
- 5GB Blob Storage (free tier)

## Error Handling
- 401: Token expired or invalid
- 403: Insufficient permissions
- 404: Resource not found
- 429: Rate limited (retry after delay)
