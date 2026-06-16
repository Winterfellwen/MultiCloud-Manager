package analyzer

import (
	"context"
	"fmt"

	"multicloud/internal/cloud/types"
)

// ReliabilityAnalyzer provides reliability and availability recommendations.
type ReliabilityAnalyzer struct{}

// Analyze performs reliability analysis on resources.
func (a *ReliabilityAnalyzer) Analyze(ctx context.Context, resources interface{}) ([]AnalysisResult, error) {
	rg, ok := resources.(*types.ResourceGroup)
	if !ok {
		return nil, fmt.Errorf("invalid resources type")
	}

	var results []AnalysisResult

	// Analyze instances for reliability issues
	for _, instance := range rg.Instances {
		// Check for instances not in multiple AZs (if we can determine this)
		if instance.Status == "running" && instance.InstanceType != "" {
			// Single instance running - could benefit from auto-scaling or multi-AZ setup
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityInfo,
				Title:       "Single instance deployment",
				Description: fmt.Sprintf("Instance '%s' appears to be a single instance deployment without redundancy.", instance.Name),
				ResourceID:  instance.ID,
				ResourceType: "instance",
				CloudType:   instance.CloudType,
				Suggestion:  "Consider using auto-scaling groups or multi-AZ deployments for production workloads.",
			})
		}

		// Check for old instances (created long ago)
		// This would require CreationTime field
	}

	// Analyze databases for reliability issues
	for _, db := range rg.Databases {
		// Check for single-AZ deployment
		if !db.MultiAZ {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityHigh,
				Title:       "Single-AZ database deployment",
				Description: fmt.Sprintf("Database '%s' is deployed in a single availability zone. This poses availability risks during AZ failures.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Enable Multi-AZ deployment to improve availability and automatic failover capability.",
			})
		}

		// Check for low backup retention
		if db.BackupRetention > 0 && db.BackupRetention < 7 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityMedium,
				Title:       "Insufficient backup retention",
				Description: fmt.Sprintf("Database '%s' has only %d days of backup retention, which may not be sufficient for recovery needs.", db.Name, db.BackupRetention),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Increase backup retention period to at least 7 days, preferably 14-30 days for production databases.",
			})
		}

		// Check for databases without automated backups
		if db.BackupRetention == 0 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityCritical,
				Title:       "No automated backups",
				Description: fmt.Sprintf("Database '%s' has automated backups disabled. Data loss may be unrecoverable.", db.Name),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Enable automated backups immediately to protect against data loss.",
			})
		}
	}

	// Analyze buckets for reliability issues
	for _, bucket := range rg.Buckets {
		// Check for versioning disabled
		if !bucket.Versioning {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityMedium,
				Title:       "Bucket versioning disabled",
				Description: fmt.Sprintf("Bucket '%s' does not have versioning enabled. Overwritten or deleted objects cannot be recovered.", bucket.Name),
				ResourceID:  bucket.ID,
				ResourceType: "bucket",
				CloudType:   bucket.CloudType,
				Suggestion:  "Enable versioning to protect against accidental deletion and to maintain object history.",
			})
		}

		// Check for buckets without cross-region replication
		if bucket.Spec != nil {
			if _, ok := bucket.Spec["replication"]; !ok {
				results = append(results, AnalysisResult{
					Category:    CategoryReliability,
					Severity:    SeverityLow,
					Title:       "No cross-region replication",
					Description: fmt.Sprintf("Bucket '%s' does not appear to have cross-region replication configured for disaster recovery.", bucket.Name),
					ResourceID:  bucket.ID,
					ResourceType: "bucket",
					CloudType:   bucket.CloudType,
					Suggestion:  "Consider enabling cross-region replication for business-critical data.",
				})
			}
		}
	}

	// Analyze functions for reliability issues
	for _, fn := range rg.Functions {
		// Check for functions without error handling (based on timeout patterns)
		if fn.Timeout > 0 && fn.Timeout < 30 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityInfo,
				Title:       "Low function timeout",
				Description: fmt.Sprintf("Function '%s' has only a %d second timeout, which may cause failures during temporary issues.", fn.Name, fn.Timeout),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Consider increasing timeout to handle temporary delays and cold starts.",
			})
		}

		// Check for functions with trigger issues (low trigger count)
		if fn.TriggerNum == 0 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityLow,
				Title:       "Function has no triggers",
				Description: fmt.Sprintf("Function '%s' appears to have no triggers configured.", fn.Name),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Configure appropriate triggers (API Gateway, EventBridge, etc.) or consider if this function is still needed.",
			})
		}
	}

	// Analyze clusters for reliability issues
	for _, cluster := range rg.Clusters {
		// Check for single-node clusters
		if cluster.NodeCount > 0 && cluster.NodeCount < 3 {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityHigh,
				Title:       "Small cluster size",
				Description: fmt.Sprintf("Cluster '%s' has only %d node(s), which may not provide sufficient fault tolerance.", cluster.Name, cluster.NodeCount),
				ResourceID:  cluster.ID,
				ResourceType: "cluster",
				CloudType:   cluster.CloudType,
				Suggestion:  "Consider increasing the cluster to at least 3 nodes for production workloads.",
			})
		}

		// Check for clusters not running
		if cluster.Status != "running" {
			results = append(results, AnalysisResult{
				Category:    CategoryReliability,
				Severity:    SeverityHigh,
				Title:       "Cluster not in running state",
				Description: fmt.Sprintf("Cluster '%s' is in '%s' state, which may indicate issues.", cluster.Name, cluster.Status),
				ResourceID:  cluster.ID,
				ResourceType: "cluster",
				CloudType:   cluster.CloudType,
				Suggestion:  "Investigate and resolve cluster issues to ensure availability.",
			})
		}
	}

	return results, nil
}
