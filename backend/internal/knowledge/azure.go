package knowledge

// AzurePriceResponse Azure Retail Prices API 响应
type AzurePriceResponse struct {
	Items        []AzureVMPricing `json:"Items"`
	NextPageLink string           `json:"NextPageLink,omitempty"`
}

// AzureVMPricing Azure VM 定价条目
type AzureVMPricing struct {
	SkuName      string  `json:"skuName"`
	RetailPrice  float64 `json:"retailPrice"`
	UnitPrice    float64 `json:"unitPrice"`
	Region       string  `json:"armRegionName"`
	ServiceName  string  `json:"serviceName"`
	ProductName  string  `json:"productName"`
	MeterName    string  `json:"meterName"`
}
