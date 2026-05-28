package knowledge

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// CloudPricing 云平台定价与规格信息
type CloudPricing struct {
	AzurePricing []AzureVMPricing
	FreeTierInfo string
	FetchedAt    time.Time
}

// KnowledgeService 云平台知识库服务（使用官方免费API）
type KnowledgeService struct {
	client    *http.Client
	pricing   *CloudPricing
	mu        sync.RWMutex
	cacheTTL  time.Duration
}

// New 创建知识库服务
func New() *KnowledgeService {
	return &KnowledgeService{
		client: &http.Client{Timeout: 15 * time.Second},
		cacheTTL: 6 * time.Hour,
	}
}

// GetCloudKnowledge 获取云平台知识摘要，注入LLM prompt
func (s *KnowledgeService) GetCloudKnowledge(ctx context.Context) string {
	s.mu.RLock()
	cached := s.pricing
	s.mu.RUnlock()

	if cached != nil && time.Since(cached.FetchedAt) < s.cacheTTL {
		return s.formatContext(cached)
	}

	// 异步刷新缓存
	go s.refreshCache(context.Background())

	if cached != nil {
		return s.formatContext(cached)
	}
	return ""
}

func (s *KnowledgeService) refreshCache(ctx context.Context) {
	pricing := &CloudPricing{
		FetchedAt: time.Now(),
	}

	// 获取Azure定价（使用免费Retail Prices API）
	if prices, err := s.fetchAzurePricing(ctx); err == nil {
		pricing.AzurePricing = prices
	}

	pricing.FreeTierInfo = GetFreeTierSummary()

	s.mu.Lock()
	s.pricing = pricing
	s.mu.Unlock()
}

func (s *KnowledgeService) formatContext(p *CloudPricing) string {
	var b strings.Builder
	b.WriteString("当前云平台定价与免费层信息（数据来源：各云平台官方API）：\n\n")

	// Azure定价
	if len(p.AzurePricing) > 0 {
		b.WriteString("Azure VM定价（最低价SKU）：\n")
		seen := make(map[string]bool)
		count := 0
		for _, vm := range p.AzurePricing {
			key := vm.SkuName + vm.Region
			if seen[key] {
				continue
			}
			seen[key] = true
			if vm.Region == "eastus" || vm.Region == "southeastasia" || vm.Region == "japaneast" {
				b.WriteString(fmt.Sprintf("- %s (%s): $%.4f/小时\n", vm.SkuName, vm.Region, vm.RetailPrice))
			}
			count++
			if count >= 15 {
				break
			}
		}
		b.WriteString("\n")
	}

	// 免费层信息
	if p.FreeTierInfo != "" {
		b.WriteString(p.FreeTierInfo)
	}

	return b.String()
}

// fetchAzurePricing 从Azure Retail Prices API获取VM定价
func (s *KnowledgeService) fetchAzurePricing(ctx context.Context) ([]AzureVMPricing, error) {
	// 查询虚拟机定价，过滤低规格SKU
	url := "https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and priceType eq 'Consumption' and contains(skuName, 'Standard_B')"
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("azure pricing API error: %v", err)
	}
	defer resp.Body.Close()

	var result AzurePriceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Items, nil
}
