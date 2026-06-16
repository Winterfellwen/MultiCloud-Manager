package analyzer

import (
	"context"
	"fmt"

	"multicloud/internal/cloud/types"
)

// CostAnalyzer provides cost optimization analysis.
type CostAnalyzer struct{}

// Analyze performs cost analysis on resources.
func (a *CostAnalyzer) Analyze(ctx context.Context, resources interface{}) ([]AnalysisResult, error) {
	rg, ok := resources.(*types.ResourceGroup)
	if !ok {
		return nil, fmt.Errorf("invalid resources type")
	}

	var results []AnalysisResult

	// Analyze instances for cost savings
	for _, instance := range rg.Instances {
		if instance.Status == "stopped" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityMedium,
				Title:       "Stopped instance still running",
				Description: fmt.Sprintf("Instance '%s' (ID: %s) is stopped but may still incur storage costs.", instance.Name, instance.ID),
				ResourceID:  instance.ID,
				ResourceType: "instance",
				CloudType:   instance.CloudType,
				Suggestion:  "Terminate the instance if no longer needed, or start it regularly to avoid data loss.",
			})
		}

		// Check for unused volumes attached to stopped instances
		if instance.Status == "stopped" && instance.InstanceType == "" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityLow,
				Title:       "Idle resource detected",
				Description: fmt.Sprintf("Instance '%s' appears to be idle or not properly configured.", instance.Name),
				ResourceID:  instance.ID,
				ResourceType: "instance",
				CloudType:   instance.CloudType,
				Suggestion:  "Review if this instance is still needed.",
			})
		}
	}

	// Analyze databases for cost optimization
	for _, db := range rg.Databases {
		// Check for inactive databases
		if db.Status == "stopped" || db.Status == "stopped" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityHigh,
				Title:       "Stopped database incurring costs",
				Description: fmt.Sprintf("Database '%s' is stopped but still incurs storage costs.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Consider taking a snapshot and deleting the database if it's no longer needed.",
			})
		}

		// Check for large storage allocations
		if db.StorageGB > 500 {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityLow,
				Title:       "Large database storage",
				Description: fmt.Sprintf("Database '%s' has %d GB of storage, which may be more than needed.", db.Name, db.StorageGB),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Review actual storage usage and consider downsizing if there's significant unused space.",
			})
		}

		// Check for expensive instance classes
		if db.InstanceCls != "" {
			// This is a simplified check - in reality would compare against known pricing tiers
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityInfo,
				Title:       "Database instance class review",
				Description: fmt.Sprintf("Database '%s' uses instance class '%s'.", db.Name, db.InstanceCls),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Periodically review if the instance class matches your actual workload needs.",
			})
		}
	}

	// Analyze buckets for cost optimization
	for _, bucket := range rg.Buckets {
		// Check for incorrect storage class
		if bucket.StorageCls == "Standard" {
			// Standard is fine, no warning needed
		} else if bucket.StorageCls == "Glacier" || bucket.StorageCls == "Archive" {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityInfo,
				Title:       "Archive storage in use",
				Description: fmt.Sprintf("Bucket '%s' uses '%s' storage class which has higher retrieval costs.", bucket.Name, bucket.StorageCls),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Ensure access patterns justify the storage class choice.",
			})
		}
	}

	// Analyze functions for cost optimization
	for _, fn := range rg.Functions {
		// Check for high memory allocation
		if fn.MemorySize > 512 {
			results = append(results, AnalysisResult{
				Category:    CategoryCost,
				Severity:    SeverityMedium,
				Title:       "High memory allocation",
				Description: fmt.Sprintf("Function '%s' has %d MB memory allocated.", fn.Name, fn.MemorySize),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Profile the function to determine optimal memory allocation. You only pay for memory used.",
			})
		}
	}

	return results, nil
}
