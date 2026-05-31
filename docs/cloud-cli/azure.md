# Azure CLI (az) Reference

## Description
Azure CLI for managing Azure cloud resources. Used for creating, configuring, and managing Azure services like VMs, Cognitive Services, Storage, Networking, etc.

## Authentication
```bash
# Login (interactive)
az login

# Login with service principal
az login --service-principal -u <app-id> -p <password> --tenant <tenant-id>

# Set subscription
az account set --subscription <subscription-id>
az account show
```

## Resource Groups
```bash
# List resource groups
az group list --query "[].{name:name, location:location}" -o table

# Create resource group
az group create --name <name> --location <location>

# Delete resource group
az group delete --name <name> --yes --no-wait
```

## Cognitive Services (TTS, Speech, etc.)
```bash
# Create Cognitive Services account
az cognitiveservices account create \
  --name <name> \
  --resource-group <rg> \
  --kind <type> \
  --sku <sku> \
  --location <location> \
  --yes

# Common kinds: TextTranslation, SpeechServices, ComputerVision, TextAnalytics
# Common SKUs: F0 (free), S0 (standard)

# List accounts
az cognitiveservices account list --query "[].{name:name, kind:kind, location:location}" -o table

# Get keys
az cognitiveservices account keys list --name <name> --resource-group <rg>

# Get endpoint
az cognitiveservices account show --name <name> --resource-group <rg> \
  --query "properties.endpoint" -o tsv

# Delete
az cognitiveservices account delete --name <name> --resource-group <rg>
```

## Virtual Machines
```bash
# List VMs
az vm list --query "[].{name:name, status:powerState, size:hardwareProfile.vmSize, location:location}" -o table

# Create VM
az vm create --name <name> --resource-group <rg> --image Ubuntu2204 \
  --admin-username azureuser --generate-ssh-keys

# Start/Stop/Restart
az vm start --name <name> --resource-group <rg>
az vm stop --name <name> --resource-group <rg>
az vm restart --name <name> --resource-group <rg>

# Delete
az vm delete --name <name> --resource-group <rg> --yes
```

## Storage
```bash
# List storage accounts
az storage account list --query "[].{name:name, location:location}" -o table

# Create storage account
az storage account create --name <name> --resource-group <rg> --location <location> --sku Standard_LRS
```

## Networking
```bash
# List VNets
az network vnet list --query "[].{name:name, addressSpace:addressSpace.addressPrefixes}" -o table

# List NSGs
az network nsg list --query "[].{name:name, location:location}" -o table
```

## Common Query Patterns
```bash
# List all resources in a group
az resource list --resource-group <rg> --query "[].{name:name, type:type, status:provisioningState}" -o table

# Get resource details
az resource show --ids <resource-id> --query "{name:name, properties:properties}" -o json

# List all VMs across all groups
az vm list --query "[].{name:name, rg:resourceGroup, status:powerState}" -o table

# Estimate costs (requires cost management)
az cost management query --timeframe "MonthToDate" --type ActualCost
```

## Free Tier Services
- **F0 SKU**: Cognitive Services (TextTranslation, Speech), Functions (1M executions)
- **B1 SKU**: App Service (750 hours/month)
- **Always Free**: Azure Cosmos DB (25GB), Blob Storage (5GB), Azure Functions (1M requests)
