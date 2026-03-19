export interface TimeRange {
  mode: 'all' | 'custom' | 'last_7' | 'last_15' | 'last_30' | 'this_month' | 'last_month' | 'this_year';
  start?: string;
  end?: string;
}

export interface Comparison {
  type: 'none' | 'previous_period';
}

export interface PlannerJSON {
  intent: string;
  analysisType: 'summary' | 'trend' | 'ranking' | 'comparison' | 'metadata';
  metrics: string[];
  dimensions: string[];
  filters: Record<string, string | string[]>;
  timeRange: TimeRange;
  granularity: 'day' | 'week' | 'month' | 'none';
  comparison: Comparison;
  limit?: number | null;
  warnings?: string[];
}
