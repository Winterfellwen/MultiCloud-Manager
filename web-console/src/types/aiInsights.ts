export interface AiInsight {
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
}

export interface DiagnosticEntry {
  step: string;
  status: 'ok' | 'fail' | 'skip';
  detail: string;
  suggestion?: string;
  duration?: number;
}

export interface AiInsightResponse {
  ok: boolean;
  healthScore?: number;
  risks?: Array<{ title: string; severity: string; suggestion: string }>;
  suggestions?: string[];
  raw?: string;
  lastSuccessAt?: string;
  diagnostics: DiagnosticEntry[];
}

export interface TokenStats {
  today: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    calls: number;
  };
  week: {
    totalTokens: number;
    calls: number;
  };
  trend: { date: string; tokens: number }[];
}

export interface InsightHistoryItem {
  id: number;
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
  createdAt: string;
}
