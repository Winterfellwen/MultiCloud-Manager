import { api } from './client';

export interface CapacityRecommendation {
  id: string;
  symptom: string;
  metricName: string;
  instanceProvider: string | null;
  rootCause: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface CapacitySummary {
  urgent: number;
  recommend: number;
  total: number;
  urgentPredictions: number;
  predictions: Array<{
    instanceId: string;
    metricName: string;
    currentValue: string;
    predictedValue: string;
    hoursToThreshold: string;
    confidence: string;
  }>;
}

export const capacityApi = {
  getRecommendations: () => api.get<CapacityRecommendation[]>('/monitor/capacity/recommendations'),
  getSummary: () => api.get<CapacitySummary>('/monitor/capacity/summary'),
};
