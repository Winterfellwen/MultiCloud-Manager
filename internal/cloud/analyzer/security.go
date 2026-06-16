package analyzer

import (
	"context"
	"fmt"

	"multicloud/internal/cloud/types"
)

// SecurityAnalyzer provides security recommendations.
type SecurityAnalyzer struct{}

// Analyze performs security analysis on resources.
func (a *SecurityAnalyzer) Analyze(ctx context.Context, resources interface{}) ([]AnalysisResult, error) {
	rg, ok := resources.(*types.ResourceGroup)
	if !ok {
		return nil, fmt.Errorf("invalid resources type")
	}

	var results []AnalysisResult

	// Analyze instances for security issues
	for _, instance := range rg.Instances {
		spec := instance.Spec

		// Check for public IP exposure
		if pubIP, ok := spec["public_ip"].(string); ok && pubIP != "" {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Instance with public IP",
				Description: fmt.Sprintf("Instance '%s' has a public IP address (%s), which may expose it to internet threats.", instance.Name, pubIP),
				ResourceID:  instance.ID,
				ResourceType: "instance",
				CloudType:   instance.CloudType,
				Suggestion:  "Consider using a jump host or VPN for access instead of exposing services directly.",
			})
		}
	}

	// Analyze databases for security issues
	for _, db := range rg.Databases {
		// Check for publicly accessible databases
		if db.PubliclyAccessible {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityCritical,
				Title:       "Database publicly accessible",
				Description: fmt.Sprintf("Database '%s' is configured to be publicly accessible, which is a significant security risk.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Restrict database access to specific IP addresses or VPC only. Never expose databases directly to the internet.",
			})
		}

		// Check for unencrypted databases
		if !db.StorageEncrypted {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Unencrypted database storage",
				Description: fmt.Sprintf("Database '%s' does not have storage encryption enabled. Data at rest is not protected.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Enable storage encryption to protect sensitive data at rest.",
			})
		}

		// Check for missing SSL/TLS
		if db.CACertificateID == "" && db.Engine != "" {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityMedium,
				Title:       "Database SSL/TLS not configured",
				Description: fmt.Sprintf("Database '%s' may not enforce SSL/TLS connections.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Enable and enforce SSL/TLS connections to encrypt data in transit.",
			})
		}
	}

	// Analyze buckets for security issues
	for _, bucket := range rg.Buckets {
		// Check for unencrypted buckets
		if !bucket.Encrypted {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Unencrypted bucket",
				Description: fmt.Sprintf("Bucket '%s' does not have encryption enabled, leaving data at rest unprotected.", bucket.Name),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Enable server-side encryption (SSE) to protect data at rest.",
			})
		}
	}

	// Analyze functions for security issues
	for _, fn := range rg.Functions {
		// Check for functions without authentication
		if !fn.AuthEnabled && fn.APIDefinitionURL == "" {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityMedium,
				Title:       "Function authentication not detected",
				Description: fmt.Sprintf("Function '%s' may not have authentication configured.", fn.Name),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Ensure function access is properly authenticated and authorized.",
			})
		}

		// Check for functions with environment variables
		if len(fn.Environment) > 0 {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityInfo,
				Title:       "Function uses environment variables",
				Description: fmt.Sprintf("Function '%s' uses %d environment variables. Ensure no sensitive data is stored in plaintext.", fn.Name, len(fn.Environment)),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Use secrets management services (AWS Secrets Manager, Azure Key Vault, etc.) for sensitive data.",
			})
		}
	}

	return results, nil
}
