interface ExecutionResult {
  metadata: Record<string, any>;
  results: any[];
  allResults?: any[];
}

function roundValue(value: any) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (Math.abs(value) >= 10000) return Math.round(value);
  if (Math.abs(value) >= 1000)  return Math.round(value * 10) / 10;
  if (Math.abs(value) >= 10)    return Math.round(value * 100) / 100;
  return Math.round(value * 10000) / 10000;
}

function normalizeRow(row: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, roundValue(value)])
  );
}

function summarizeMetric(results: any[], metric: string) {
  const values = results
    .map(r => r[metric])
    .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum    = values.reduce((acc, v) => acc + v, 0);
  const avg    = sum / values.length;
  const mid    = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  const p25idx = Math.floor(sorted.length * 0.25);
  const p75idx = Math.floor(sorted.length * 0.75);

  return {
    metric,
    count : values.length,
    min   : roundValue(sorted[0]),
    p25   : roundValue(sorted[p25idx]),
    p50   : roundValue(median),
    avg   : roundValue(avg),
    p75   : roundValue(sorted[p75idx]),
    max   : roundValue(sorted[sorted.length - 1]),
    total : roundValue(sum),
  };
}

/**
 * Build dynamic benchmarks from the FULL dataset (not the filtered subset)
 * so the analyst always has context about what "normal" looks like.
 */
export function buildBenchmarks(allData: any[]): string {
  if (!allData || allData.length < 10) return '';

  const keys = Object.keys(allData[0] ?? {});
  const find  = (...c: string[]) => c.map(n => keys.find(k => k.toLowerCase() === n)).find(Boolean);

  const invKey = find('investimento', 'investment', 'custo');
  const mqlKey = find('mql', 'mqls');
  const salKey = find('tickets', 'ticket');
  const matKey = find('matriculas', 'matricula');

  const safeN = (v: any) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const totalInv = allData.reduce((s, d) => s + safeN(d[invKey!]), 0);
  const totalMql = allData.reduce((s, d) => s + safeN(d[mqlKey!]), 0);
  const totalSal = allData.reduce((s, d) => s + safeN(d[salKey!]), 0);
  const totalMat = allData.reduce((s, d) => s + safeN(d[matKey!]), 0);

  const cpmql          = totalMql > 0 ? totalInv / totalMql        : null;
  const cac            = totalMat > 0 ? totalInv / totalMat        : null;
  const cpsal          = totalSal > 0 ? totalInv / totalSal        : null;
  const convMqlMat     = totalMql > 0 ? (totalMat / totalMql)*100  : null;
  const convMqlSal     = totalMql > 0 ? (totalSal / totalMql)*100  : null;
  const convSalMat     = totalSal > 0 ? (totalMat / totalSal)*100  : null;

  const fmt = (v: number | null, prefix = 'R$') =>
    v === null ? 'N/A' : `${prefix}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number | null) =>
    v === null ? 'N/A' : `${v.toFixed(1)}%`;

  return `
## Benchmarks da base completa (referência para sua análise)
- Total linhas na base: ${allData.length.toLocaleString('pt-BR')}
- Investimento total: ${fmt(totalInv)}
- Total MQLs: ${totalMql.toLocaleString('pt-BR')} | Total SALs (tickets): ${totalSal.toLocaleString('pt-BR')} | Total Matrículas: ${totalMat.toLocaleString('pt-BR')}
- CPMql global: ${fmt(cpmql)} | CAC global: ${fmt(cac)} | CPSal global: ${fmt(cpsal)}
- Conv MQL→Matrícula global: ${fmtPct(convMqlMat)} | Conv MQL→SAL: ${fmtPct(convMqlSal)} | Conv SAL→Matrícula: ${fmtPct(convSalMat)}

Use esses números como linha de base ao julgar se um resultado específico está acima ou abaixo da média histórica.
`.trim();
}

export function buildAnalystContext(params: {
  userMessage: string;
  plan: Record<string, any>;
  executionResult: ExecutionResult;
  conversationHistory?: Array<{ role: 'user' | 'ai'; intent: string }>;
  benchmarks?: string;
}) {
  const { userMessage, plan, executionResult, conversationHistory, benchmarks } = params;
  const allResults = executionResult.allResults || executionResult.results || [];
  const metrics: string[] = Array.isArray(plan.metrics) ? plan.metrics : [];
  const primaryMetric = metrics[0];

  const hasTemporalGrouping = allResults.some(r =>
    String(r._group ?? r.group ?? '').match(/^\d{4}-\d{2}(-\d{2})?/)
  );

  const metricSummaries = metrics
    .map(metric => summarizeMetric(allResults, metric))
    .filter(Boolean);

  const topRows = primaryMetric
    ? [...allResults]
        .sort((a, b) => (Number(b[primaryMetric]) || 0) - (Number(a[primaryMetric]) || 0))
        .slice(0, 50)
        .map(normalizeRow)
    : allResults.slice(0, 50).map(normalizeRow);

  const bottomRows = primaryMetric
    ? [...allResults]
        .sort((a, b) => (Number(a[primaryMetric]) || 0) - (Number(b[primaryMetric]) || 0))
        .slice(0, 30)
        .map(normalizeRow)
    : [];

  const temporalRows = hasTemporalGrouping
    ? allResults.slice(0, 120).map(normalizeRow)
    : [];

  const compactAllRows = allResults.length <= 200
    ? allResults.map(normalizeRow)
    : undefined;

  const payload: Record<string, any> = {
    pergunta: userMessage,
    plano: plan,
    contexto: {
      estrategia: compactAllRows ? 'full_results' : 'summarized_results',
      quantidade_grupos_resultantes: allResults.length,
      metrica_principal: primaryMetric || null,
      metricas_resumo: metricSummaries,
      metadata: executionResult.metadata,
    },
    resultados_completos: compactAllRows,
    recortes: compactAllRows ? undefined : {
      top_grupos: topRows,
      bottom_grupos: bottomRows,
      serie_ou_amostra: temporalRows,
    },
  };

  if (benchmarks) payload.benchmarks_globais = benchmarks;

  if (conversationHistory && conversationHistory.length > 0) {
    payload.historico_conversa = conversationHistory.slice(-5);
  }

  return JSON.stringify(payload, null, 2);
}
