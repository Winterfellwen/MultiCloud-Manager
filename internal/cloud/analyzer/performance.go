package analyzer

import (
	"context"
	"fmt"

	"multicloud/internal/cloud/types"
)

// PerformanceAnalyzer provides performance optimization recommendations.
type PerformanceAnalyzer struct{}

// Analyze performs performance analysis on resources.
func (a *PerformanceAnalyzer) Analyze(ctx context.Context, resources interface{}) ([]AnalysisResult, error) {
	rg, ok := resources.(*types.ResourceGroup)
	if !ok {
		return nil, fmt.Errorf("invalid resources type")
	}

	var results []AnalysisResult

	// Analyze instances for performance issues
	for _, instance := range rg.Instances {
		spec := instance.Spec

		// Check for small instance sizes
		if cpu, ok := spec["cpu"].(int); ok {
			if cpu <= 1 {
				results = append(results, AnalysisResult{
					Category:    CategoryPerformance,
					Severity:    SeverityLow,
					Title:       "Small instance size",
					Description: fmt.Sprintf("Instance '%s' has only %d CPU(s), which may limit performance for compute-intensive workloads.", instance.Name, cpu),
					ResourceID:  instance.ID,
					ResourceType: "instance",
					CloudType:   instance.CloudType,
					Suggestion:  "Consider upgrading to a larger instance type if experiencing performance bottlenecks.",
				})
			}
		}

		// Check for low memory
		if mem, ok := spec["memory"].(int); ok {
			if mem <= 512 {
				results = append(results, AnalysisResult{
					Category:    CategoryPerformance,
					Severity:    SeverityLow,
					Title:       "Low memory allocation",
					Description: fmt.Sprintf("Instance '%s' has only %d MB of memory, which may cause swapping or OOM issues.", instance.Name, mem),
					ResourceID:  instance.ID,
					ResourceType: "instance",
					CloudType:   instance.CloudType,
					Suggestion:  "Consider upgrading to an instance type with more memory.",
				})
			}
		}
	}

	// Analyze databases for performance issues
	for _, db := range rg.Databases {
		// Check for small instance classes
		if db.InstanceCls != "" {
			// Check if it's a small/t2 class
			results = append(results, AnalysisResult{
				Category:    CategoryPerformance,
				Severity:    SeverityInfo,
				Title:       "Database instance class review",
				Description: fmt.Sprintf("Database '%s' uses instance class '%s'.", db.Name, db.InstanceCls),
				ResourceID:  db.ID,
				ResourceType: "database",
				CloudType:   db.CloudType,
				Suggestion:  "Monitor database performance and upgrade instance class if experiencing bottlenecks.",
			})
		}

		// Check for missing read replicas
		if db.MultiAZ {
			// Multi-AZ is good for reliability, but doesn't help with read performance
		}

		// Check for database in wrong region (via endpoint)
		if db.Endpoint != "" {
			// Could add logic to detect cross-region access patterns
		}
	}

	// Analyze functions for performance issues
	for _, fn := range rg.Functions {
		// Check for long timeout values
		if fn.Timeout > 300 {
			results = append(results, AnalysisResult{
				Category:    CategoryPerformance,
				Severity:    SeverityLow,
				Title:       "High function timeout",
				Description: fmt.Sprintf("Function '%s' has a %d second timeout, which may indicate inefficient execution or design issues.", fn.Name, fn.Timeout),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Optimize function code and consider breaking long-running tasks into smaller functions.",
			})
		}

		// Check for low timeout values
		if fn.Timeout > 0 && fn.Timeout < 10 {
			results = append(results, AnalysisResult{
				Category:    CategoryPerformance,
				Severity:    SeverityInfo,
				Title:       "Low function timeout",
				Description: fmt.Sprintf("Function '%s' has only a %d second timeout, which may cause premature failures.", fn.Name, fn.Timeout),
				ResourceID:  fn.ID,
				ResourceType: "function",
				CloudType:   fn.CloudType,
				Suggestion:  "Set an appropriate timeout that accommodates expected execution time plus buffer.",
			})
		}

		// Check for missing VPC configuration (for functions accessing private resources)
		if fn.VPCConfig == "" && fn.InternetAccess == "" {
			// This might be fine or might need to be adjusted
		}
	}

	// Analyze load balancers for performance issues
	for _, lb := range rg.LoadBalancers {
		// Check for misconfigured load balancers
		if lb.LBType != "" {
			results = append(results, AnalysisResult{
				Category:    CategoryPerformance,
				Severity:    SeverityInfo,
				Title:       "Load balancer type review",
				Description: fmt.Sprintf("Load balancer '%s' uses type '%s'.", lb.Name, lb.LBType),
				ResourceID:  lb.ID,
				ResourceType: "loadbalancer",
				CloudType:   lb.CloudType,
				Suggestion:  "Ensure the load balancer type matches your application requirements (e.g., Application vs Network LB).",
			})
		}
	}

	return results, nil
}
