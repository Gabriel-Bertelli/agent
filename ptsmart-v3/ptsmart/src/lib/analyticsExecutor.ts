import { PlannerJSON } from './analyticsSchema';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, format as fmtDate } from 'date-fns';

// ── Helpers ────────────────────────────────────────────────────────────────

const parseLocalDate = (dateStr: string | number | Date): Date => {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).split('T')[0].split(' ')[0];
  return new Date(`${str}T00:00:00`);
};

/**
 * Safe numeric coercion — handles "1.234,56" (pt-BR) and English formats.
 * Returns 0 for nullish, negative, or non-finite values.
 */
function safeNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '(not set)') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  // pt-BR: 1.234,56  →  English: 1234.56
  const normalised = s.includes(',') && s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')   // 1.234,56 → 1234.56
    : s.replace(',', '.');                      // 1234,56  → 1234.56 (also handles English)
  const n = parseFloat(normalised);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Derived metric names that are computed, not summed from raw fields */
const DERIVED = new Set([
  'cpmql', 'cac', 'cpsal',
  'conv_mql_mat', 'conv_mql_ticket', 'conv_ticket_mat',
]);

/** Find a column by priority list of possible names (case-insensitive) */
function findField(keys: string[], ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  // Fallback: partial match
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

// ── Main executor ──────────────────────────────────────────────────────────

export function executePlan(plan: PlannerJSON, data: any[], availableKeys: string[]) {
  if (!data || data.length === 0) {
    return {
      metadata: { total_linhas_filtradas: 0, data_minima: null, data_maxima: null },
      results: [],
      allResults: [],
    };
  }

  // ── Well-known field resolution ──────────────────────────────────────────
  const dateField   = findField(availableKeys, 'data', 'date', 'created_at', 'time');
  const invField    = findField(availableKeys, 'investimento', 'investment', 'cost', 'custo', 'valor');
  const leadsField  = findField(availableKeys, 'leads');
  const mqlField    = findField(availableKeys, 'mql', 'mqls');
  const salField    = findField(availableKeys, 'tickets', 'ticket', 'sal');
  const matField    = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const inscField   = findField(availableKeys, 'inscricoes', 'inscrições', 'inscricao');
  const impField    = findField(availableKeys, 'impressoes', 'impressões', 'impressions');
  const cliqField   = findField(availableKeys, 'cliques', 'clicks', 'cliques');
  const leadsInsField = findField(availableKeys, 'leads_inscricao', 'leads_inscricao');

  // ── Date range ───────────────────────────────────────────────────────────
  let startDate: Date | null = null;
  let endDate: Date | null   = null;

  if (dateField && data.length > 0) {
    const dates = data
      .map(d => parseLocalDate(d[dateField]))
      .filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      endDate = new Date(Math.max(...dates.map(d => d.getTime())));
      endDate.setHours(23, 59, 59, 999);
    }
  }

  if (!endDate) endDate = new Date();

  const { mode } = plan.timeRange;
  if (mode === 'last_7')  { startDate = subDays(endDate, 6);  startDate.setHours(0,0,0,0); }
  else if (mode === 'last_15') { startDate = subDays(endDate, 14); startDate.setHours(0,0,0,0); }
  else if (mode === 'last_30') { startDate = subDays(endDate, 29); startDate.setHours(0,0,0,0); }
  else if (mode === 'this_month') { startDate = startOfMonth(endDate); startDate.setHours(0,0,0,0); }
  else if (mode === 'last_month') {
    startDate = startOfMonth(subMonths(endDate, 1)); startDate.setHours(0,0,0,0);
    endDate   = endOfMonth(subMonths(endDate, 1));   endDate.setHours(23,59,59,999);
  }
  else if (mode === 'this_year') {
    startDate = new Date(`${endDate.getFullYear()}-01-01T00:00:00`);
  }
  else if (mode === 'custom' && plan.timeRange.start && plan.timeRange.end) {
    startDate = new Date(`${plan.timeRange.start}T00:00:00`);
    endDate   = new Date(`${plan.timeRange.end}T23:59:59`);
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  let filtered = data.filter(d => {
    // Date filter
    if (dateField && startDate && endDate) {
      const dDate = parseLocalDate(d[dateField]);
      if (isNaN(dDate.getTime())) return false;
      if (dDate < startDate || dDate > endDate) return false;
    }

    // Dimension filters
    if (plan.filters) {
      for (const [key, value] of Object.entries(plan.filters)) {
        const actualKey = availableKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (!actualKey) continue;
        const dataVal = String(d[actualKey] ?? '').toLowerCase().trim();
        const values  = Array.isArray(value) ? value : [value];
        const match   = values.some(v => {
          const fv = String(v).toLowerCase().trim();
          return dataVal === fv || dataVal.includes(fv) || fv.includes(dataVal);
        });
        if (!match) return false;
      }
    }
    return true;
  });

  // ── Group key builder ────────────────────────────────────────────────────
  const makeGroupKey = (d: any): string => {
    const parts: string[] = [];

    if (plan.granularity !== 'none' && dateField) {
      const dDate = parseLocalDate(d[dateField]);
      if (!isNaN(dDate.getTime())) {
        if (plan.granularity === 'month') parts.push(format(dDate, 'yyyy-MM'));
        else if (plan.granularity === 'week') parts.push(format(startOfWeek(dDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
        else parts.push(format(dDate, 'yyyy-MM-dd'));
      }
    }

    if (plan.dimensions?.length > 0) {
      for (const dim of plan.dimensions) {
        const ak = availableKeys.find(k => k.toLowerCase() === dim.toLowerCase());
        parts.push(ak ? String(d[ak] ?? 'N/A') : 'N/A');
      }
    }

    return parts.length > 0 ? parts.join(' | ') : 'Total';
  };

  // ── Aggregation ──────────────────────────────────────────────────────────
  const grouped: Record<string, any> = {};

  for (const d of filtered) {
    const gk = makeGroupKey(d);

    if (!grouped[gk]) {
      grouped[gk] = {
        _group: gk,
        _inv: 0, _leads: 0, _leadsIns: 0, _mql: 0, _sal: 0, _mat: 0, _ins: 0,
      };
      // Initialise requested raw metrics
      for (const m of plan.metrics) {
        if (!DERIVED.has(m.toLowerCase())) grouped[gk][m] = 0;
      }
    }

    const row = grouped[gk];

    // Always accumulate base sums for derived metrics
    if (invField)    row._inv     += safeNum(d[invField]);
    if (leadsField)  row._leads   += safeNum(d[leadsField]);
    if (leadsInsField) row._leadsIns += safeNum(d[leadsInsField]);
    if (mqlField)    row._mql     += safeNum(d[mqlField]);
    if (salField)    row._sal     += safeNum(d[salField]);
    if (matField)    row._mat     += safeNum(d[matField]);
    if (inscField)   row._ins     += safeNum(d[inscField]);

    // Accumulate requested raw metrics
    for (const m of plan.metrics) {
      if (DERIVED.has(m.toLowerCase())) continue;
      const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
      if (ak) row[m] += safeNum(d[ak]);
    }
  }

  // ── Derived metric calculation ───────────────────────────────────────────
  const results = Object.values(grouped).map((g: any) => {
    const { _inv: inv, _mql: mql, _sal: sal, _mat: mat } = g;

    if (plan.metrics.includes('cpmql'))         g.cpmql           = mql  > 0 ? inv / mql  : null;
    if (plan.metrics.includes('cac'))           g.cac             = mat  > 0 ? inv / mat  : null;
    if (plan.metrics.includes('cpsal'))         g.cpsal           = sal  > 0 ? inv / sal  : null;
    if (plan.metrics.includes('conv_mql_mat'))  g.conv_mql_mat    = mql  > 0 ? (mat / mql)  * 100 : null;
    if (plan.metrics.includes('conv_mql_ticket')) g.conv_mql_ticket = mql > 0 ? (sal / mql)  * 100 : null;
    if (plan.metrics.includes('conv_ticket_mat')) g.conv_ticket_mat = sal > 0 ? (mat / sal)  * 100 : null;

    // Clean private accumulators
    delete g._inv; delete g._leads; delete g._leadsIns;
    delete g._mql; delete g._sal;  delete g._mat; delete g._ins;

    return g;
  });

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sorted = [...results];
  if (plan.analysisType === 'ranking' && plan.metrics.length > 0) {
    const sortMetric = plan.metrics[0];
    sorted.sort((a, b) => {
      const bv = b[sortMetric] ?? -Infinity;
      const av = a[sortMetric] ?? -Infinity;
      return bv - av;
    });
  } else if (plan.granularity !== 'none') {
    // Sort time series by group key (which starts with date)
    sorted.sort((a, b) => String(a._group ?? '').localeCompare(String(b._group ?? '')));
  }

  const finalResults = plan.limit ? sorted.slice(0, plan.limit) : sorted;

  // ── Metadata ─────────────────────────────────────────────────────────────
  let minDate = null;
  let maxDate = null;

  if (dateField && filtered.length > 0) {
    const dates = filtered
      .map(d => parseLocalDate(d[dateField]))
      .filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      minDate = format(new Date(Math.min(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
      maxDate = format(new Date(Math.max(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
    }
  }

  return {
    metadata: {
      total_linhas_filtradas: filtered.length,
      data_minima: minDate,
      data_maxima: maxDate,
    },
    results: finalResults,
    allResults: sorted,
  };
}
