package analyzer

import (
	"context"
	"fmt"

	"multicloud/internal/cloud/types"
)

// AnalysisCategory represents the category of an analysis result.
type AnalysisCategory string

const (
	CategoryCost        AnalysisCategory = "cost"        // 成本优化
	CategorySecurity    AnalysisCategory = "security"    // 安全建议
	CategoryPerformance AnalysisCategory = "performance" // 性能优化
	CategoryReliability AnalysisCategory = "reliability" // 可靠性建议
)

// Severity represents the severity level of an analysis result.
type Severity string

const (
	SeverityCritical Severity = "critical" // 严重问题
	SeverityHigh     Severity = "high"     // 高优先级
	SeverityMedium   Severity = "medium"   // 中优先级
	SeverityLow      Severity = "low"      // 低优先级
	SeverityInfo     Severity = "info"     // 信息性建议
)

// AnalysisResult represents a single analysis result.
type AnalysisResult struct {
	Category    AnalysisCategory `json:"category"`
	Severity    Severity         `json:"severity"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	ResourceID  string           `json:"resource_id,omitempty"`
	ResourceType string         `json:"resource_type,omitempty"`
	CloudType   string           `json:"cloud_type,omitempty"`
	Suggestion  string           `json:"suggestion,omitempty"`
}

// Analyzer is the interface for resource analyzers.
type Analyzer interface {
	Analyze(ctx context.Context, resources interface{}) ([]AnalysisResult, error)
}

// ResourceAnalyzer provides AI-powered resource analysis.
type ResourceAnalyzer struct {
	analyzers []Analyzer
}

// NewResourceAnalyzer creates a new resource analyzer.
func NewResourceAnalyzer() *ResourceAnalyzer {
	return &ResourceAnalyzer{
		analyzers: []Analyzer{
			&CostAnalyzer{},
			&SecurityAnalyzer{},
			&PerformanceAnalyzer{},
			&ReliabilityAnalyzer{},
		},
	}
}

// Analyze performs analysis on all resource types.
func (a *ResourceAnalyzer) Analyze(ctx context.Context, resources *types.ResourceGroup) ([]AnalysisResult, error) {
	var allResults []AnalysisResult

	for _, analyzer := range a.analyzers {
		results, err := analyzer.Analyze(ctx, resources)
		if err != nil {
			return nil, fmt.Errorf("analyzer %T failed: %w", analyzer, err)
		}
		allResults = append(allResults, results...)
	}

	return allResults, nil
}

// AnalyzeInstances analyzes compute instances for optimization opportunities.
func (a *ResourceAnalyzer) AnalyzeInstances(ctx context.Context, instances []types.Instance) ([]AnalysisResult, error) {
	var results []AnalysisResult

	for _, instance := range instances {
		// Check for stopped instances that could be costs savings
		if instance.Status == "stopped" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityMedium,
				Title:       "Stopped instance may incur costs",
				Description: fmt.Sprintf("Instance '%s' is stopped but may still be billed if using certain storage-backed instance types.", instance.Name),
				ResourceID:  instance.ID,
				ResourceType: "instance",
				CloudType:   instance.CloudType,
				Suggestion:  "Consider terminating or starting the instance to avoid unnecessary costs.",
			})
		}

		// Check for small instance types that might benefit from scaling
		if instance.InstanceType != "" {
			spec := instance.Spec
			if cpu, ok := spec["cpu"].(int); ok && cpu <= 1 {
				results = append(results, AnalysisResult{
					Category:    CategoryPerformance,
					Severity:    SeverityLow,
					Title:       "Small instance type detected",
					Description: fmt.Sprintf("Instance '%s' has only %d CPU(s), which may limit performance for demanding workloads.", instance.Name, cpu),
					ResourceID:  instance.ID,
					ResourceType: "instance",
					CloudType:   instance.CloudType,
					Suggestion:  "Consider upgrading to a larger instance type if experiencing performance issues.",
				})
			}
		}
	}

	return results, nil
}

// AnalyzeDatabases analyzes database instances for optimization opportunities.
func (a *ResourceAnalyzer) AnalyzeDatabases(ctx context.Context, databases []types.Database) ([]AnalysisResult, error) {
	var results []AnalysisResult

	for _, db := range databases {
		// Check for publicly accessible databases
		if db.PubliclyAccessible {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Publicly accessible database",
				Description: fmt.Sprintf("Database '%s' is publicly accessible, which may expose it to unauthorized access.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Consider restricting access to specific IP addresses or VPC only.",
			})
		}

		// Check for databases without encryption
		if !db.StorageEncrypted {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Unencrypted database",
				Description: fmt.Sprintf("Database '%s' does not have storage encryption enabled.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Enable storage encryption to protect data at rest.",
			})
		}

		// Check for single-AZ deployments
		if !db.MultiAZ {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityMedium,
				Title:       "Single-AZ deployment",
				Description: fmt.Sprintf("Database '%s' is deployed in a single availability zone, which may pose availability risks.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Consider enabling Multi-AZ deployment for high availability.",
			})
		}

		// Check for low backup retention
		if db.BackupRetention > 0 && db.BackupRetention < 7 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityMedium,
				Title:       "Low backup retention",
				Description: fmt.Sprintf("Database '%s' has only %d days of backup retention.", db.Name, db.BackupRetention),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Consider increasing backup retention to at least 7 days for better data protection.",
			})
		}
	}

	return results, nil
}

// AnalyzeBuckets analyzes object storage buckets for optimization opportunities.
func (a *ResourceAnalyzer) AnalyzeBuckets(ctx context.Context, buckets []types.Bucket) ([]AnalysisResult, error) {
	var results []AnalysisResult

	for _, bucket := range buckets {
		// Check for unencrypted buckets
		if !bucket.Encrypted {
			results = append(results, AnalysisResult{
				Category:    CategorySecurity,
				Severity:    SeverityHigh,
				Title:       "Unencrypted bucket",
				Description: fmt.Sprintf("Bucket '%s' does not have encryption enabled.", bucket.Name),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Enable bucket encryption to protect data at rest.",
			})
		}

		// Check for versioning disabled
		if !bucket.Versioning {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityLow,
				Title:       "Versioning disabled",
				Description: fmt.Sprintf("Bucket '%s' does not have versioning enabled, which means deleted or overwritten objects cannot be recovered.", bucket.Name),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Consider enabling versioning for data protection.",
			})
		}

		// Check for inappropriate storage class
		if bucket.StorageCls == "Standard" {
			// This is actually good, no issue
		} else if bucket.StorageCls == "Glacier" || bucket.StorageCls == "Archive" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityInfo,
				Title:       "Archive storage class",
				Description: fmt.Sprintf("Bucket '%s' uses '%s' storage class, which may have higher retrieval costs.", bucket.Name, bucket.StorageCls),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Ensure this storage class is appropriate for your access patterns.",
			})
		}
	}

	return results, nil
}

// AnalyzeFunctions analyzes serverless functions for optimization opportunities.
func (a *ResourceAnalyzer) AnalyzeFunctions(ctx context.Context, functions []types.Function) ([]AnalysisResult, error) {
	var results []AnalysisResult

	for _, fn := range functions {
		// Check for long timeout values
		if fn.Timeout > 300 {
			results = append(results, AnalysisResult{
				Category:    CategoryPerformance,
				Severity:    SeverityLow,
				Title:       "High function timeout",
				Description: fmt.Sprintf("Function '%s' has a timeout of %d seconds, which may indicate inefficient execution.", fn.Name, fn.Timeout),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Consider optimizing function code to reduce execution time.",
			})
		}

		// Check for high memory allocation
		if fn.MemorySize > 1024 {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityMedium,
				Title:       "High memory allocation",
				Description: fmt.Sprintf("Function '%s' is allocated %d MB of memory, which may be more than needed.", fn.Name, fn.MemorySize),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Consider reducing memory allocation if the function doesn't use all allocated memory.",
			})
		}
	}

	return results, nil
}
