export interface AiInsight {
  healthScore: number;
  risks: string[];
  suggestions: string[];
  raw: string;
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
