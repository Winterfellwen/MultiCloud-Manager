package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// providerKeywords maps provider names to detection keywords.
var providerKeywords = map[string][]string{
	"azure":    {"azure", "microsoft", "aks", "app service", "blob storage"},
	"aws":      {"aws", "amazon", "ec2", "s3", "lambda", "rds", "cloudwatch"},
	"alicloud": {"alicloud", "alibaba", "aliyun", "ecs ", "oss ", "slb"},
	"tencent":  {"tencent", "qcloud", "cvm", "cos ", "tencentcloud"},
	"oracle":   {"oracle", "oci ", "oracle cloud"},
	"render":   {"render", "render.com", "render service"},
}

// providerDisplayNames maps internal provider names to display names.
var providerDisplayNames = map[string]string{
	"azure":    "Microsoft Azure",
	"aws":      "Amazon AWS",
	"alicloud": "Alibaba Cloud (AliCloud)",
	"tencent":  "Tencent Cloud",
	"oracle":   "Oracle Cloud (OCI)",
	"render":   "Render",
}

// DocIndex scans, indexes, and caches cloud API documentation files.
type DocIndex struct {
	mu        sync.RWMutex
	docsDir   string
	summaries map[string]string // provider -> summary text
	fullDocs  map[string]string // provider -> full doc text
}

// NewDocIndex creates a DocIndex that scans the given directory for .md files.
func NewDocIndex(docsDir string) *DocIndex {
	di := &DocIndex{
		docsDir:   docsDir,
		summaries: make(map[string]string),
		fullDocs:  make(map[string]string),
	}
	di.load()
	return di
}

// load scans docsDir for .md files and builds summaries.
func (di *DocIndex) load() {
	entries, err := os.ReadDir(di.docsDir)
	if err != nil {
		fmt.Printf("[DocIndex] warning: cannot read docs dir %s: %v\n", di.docsDir, err)
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		provider := strings.TrimSuffix(entry.Name(), ".md")
		filePath := filepath.Join(di.docsDir, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Printf("[DocIndex] warning: cannot read %s: %v\n", filePath, err)
			continue
		}
		content := string(data)
		di.fullDocs[provider] = content
		di.summaries[provider] = di.extractSummary(content, provider)
		fmt.Printf("[DocIndex] loaded %s (%d bytes, summary %d chars)\n",
			provider, len(content), len(di.summaries[provider]))
	}
}

// extractSummary extracts a concise summary from a markdown document.
// It targets the Authentication and Common Endpoints sections, plus the first description.
func (di *DocIndex) extractSummary(content, provider string) string {
	var sections []string

	// Extract title / first description line
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "---") {
			continue
		}
		if strings.HasPrefix(line, ">") {
			line = strings.TrimPrefix(line, ">")
			line = strings.TrimSpace(line)
		}
		if len(line) > 20 && !strings.HasPrefix(line, "|") && !strings.HasPrefix(line, "-") {
			sections = append(sections, line)
			if len(sections) >= 2 {
				break
			}
		}
	}

	// Extract Authentication section
	auth := extractSection(content, "Authentication")
	if auth != "" {
		// Keep only the first ~800 chars of auth section
		if len(auth) > 800 {
			auth = auth[:800] + "\n... (use lookup_cloud_api_doc for full details)"
		}
		sections = append(sections, "### Authentication\n"+auth)
	}

	// Extract Common Endpoints / Base URL / first endpoint section
	endpoints := extractSection(content, "Common Endpoints")
	if endpoints == "" {
		endpoints = extractSection(content, "Common API Endpoints")
	}
	if endpoints == "" {
		endpoints = extractSection(content, "Base URL")
	}
	if endpoints == "" {
		endpoints = extractSection(content, "通用参数")
	}
	if endpoints != "" {
		if len(endpoints) > 600 {
			endpoints = endpoints[:600] + "\n... (use lookup_cloud_api_doc for full details)"
		}
		sections = append(sections, "### Key Endpoints\n"+endpoints)
	}

	result := strings.Join(sections, "\n\n")
	if len(result) > 1200 {
		result = result[:1200] + "\n..."
	}
	return result
}

// extractSection extracts content between "## SectionName" and the next "## " heading.
func extractSection(content, sectionName string) string {
	// Try both "## SectionName" and "## N. SectionName" patterns
	patterns := []string{
		"## " + sectionName + "\n",
		"## " + sectionName + " ",
	}
	for _, pattern := range patterns {
		idx := strings.Index(content, pattern)
		if idx == -1 {
			continue
		}
		start := idx + len(pattern)
		// Find next "## " heading
		end := strings.Index(content[start:], "\n## ")
		if end == -1 {
			end = len(content) - start
		}
		section := strings.TrimSpace(content[start : start+end])
		if section == "" {
			continue
		}
		return section
	}
	return ""
}

// DetectProviders scans text for cloud provider keywords, returns matched provider names.
func (di *DocIndex) DetectProviders(text string) []string {
	di.mu.RLock()
	defer di.mu.RUnlock()

	lower := strings.ToLower(text)
	var found []string
	for provider, keywords := range providerKeywords {
		if _, ok := di.fullDocs[provider]; !ok {
			continue
		}
		for _, kw := range keywords {
			if strings.Contains(lower, kw) {
				found = append(found, provider)
				break
			}
		}
	}
	return found
}

// GetSummary returns the summary for a provider (for system prompt injection).
func (di *DocIndex) GetSummary(provider string) string {
	di.mu.RLock()
	defer di.mu.RUnlock()
	return di.summaries[provider]
}

// GetFullDoc returns the complete document for a provider.
func (di *DocIndex) GetFullDoc(provider string) string {
	di.mu.RLock()
	defer di.mu.RUnlock()
	return di.fullDocs[provider]
}

// GetSection returns a specific section from a provider's document.
func (di *DocIndex) GetSection(provider, section string) string {
	di.mu.RLock()
	defer di.mu.RUnlock()
	doc, ok := di.fullDocs[provider]
	if !ok {
		return ""
	}
	return extractSection(doc, section)
}

// ListProviders returns all available provider names.
func (di *DocIndex) ListProviders() []string {
	di.mu.RLock()
	defer di.mu.RUnlock()
	var providers []string
	for p := range di.fullDocs {
		providers = append(providers, p)
	}
	return providers
}

// ListSections returns all section headings in a provider's document.
func (di *DocIndex) ListSections(provider string) []string {
	di.mu.RLock()
	defer di.mu.RUnlock()
	doc, ok := di.fullDocs[provider]
	if !ok {
		return nil
	}
	re := regexp.MustCompile(`^##\s+(.+)`)
	var sections []string
	for _, line := range strings.Split(doc, "\n") {
		m := re.FindStringSubmatch(line)
		if m != nil {
			sections = append(sections, strings.TrimSpace(m[1]))
		}
	}
	return sections
}

// GetDisplayName returns the display name for a provider.
func GetProviderDisplayName(provider string) string {
	if name, ok := providerDisplayNames[provider]; ok {
		return name
	}
	return provider
}
