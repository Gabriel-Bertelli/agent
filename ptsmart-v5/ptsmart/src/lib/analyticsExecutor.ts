import { PlannerJSON } from './analyticsSchema';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek } from 'date-fns';

// ── Helpers ────────────────────────────────────────────────────────────────

const parseLocalDate = (dateStr: string | number | Date): Date => {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).split('T')[0].split(' ')[0];
  return new Date(`${str}T00:00:00`);
};

function safeNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '(not set)') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  const normalised = s.includes(',') && s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(',', '.');
  const n = parseFloat(normalised);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const DERIVED = new Set([
  'cpmql', 'cac', 'cpsal',
  'conv_mql_mat', 'conv_mql_ticket', 'conv_ticket_mat',
]);

/**
 * Metrics that belong to the MÍDIA universe.
 * These are read from rows where course_name_campanha matches the course filter.
 */
const MIDIA_METRICS = new Set([
  'investimento', 'investment', 'cost', 'custo', 'valor',
  'impressoes', 'impressões', 'impressions',
  'cliques', 'clicks',
]);

/**
 * Metrics that belong to the CAPTAÇÃO universe.
 * These are read from rows where course_name_captacao matches the course filter.
 */
const CAPTACAO_METRICS = new Set([
  'leads', 'leads_inscricao',
  'mql', 'mqls',
  'inscricoes', 'inscrições', 'inscricao',
  'matriculas', 'matricula', 'matrículas',
  'tickets', 'ticket',
]);

function findField(keys: string[], ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

function metricAffinity(metricKey: string): 'midia' | 'captacao' | 'both' {
  const k = metricKey.toLowerCase();
  if (MIDIA_METRICS.has(k))    return 'midia';
  if (CAPTACAO_METRICS.has(k)) return 'captacao';
  return 'both';
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

  // ── Field resolution ─────────────────────────────────────────────────────
  const dateField             = findField(availableKeys, 'data', 'date', 'created_at', 'time');
  const invField              = findField(availableKeys, 'investimento', 'investment', 'cost', 'custo', 'valor');
  const impField              = findField(availableKeys, 'impressoes', 'impressões', 'impressions');
  const cliqField             = findField(availableKeys, 'cliques', 'clicks');
  const leadsField            = findField(availableKeys, 'leads');
  const leadsInsField         = findField(availableKeys, 'leads_inscricao');
  const mqlField              = findField(availableKeys, 'mql', 'mqls');
  const salField              = findField(availableKeys, 'tickets', 'ticket', 'sal');
  const matField              = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const inscField             = findField(availableKeys, 'inscricoes', 'inscrições', 'inscricao');
  const courseNameCampanha    = findField(availableKeys, 'course_name_campanha');
  const courseNameCaptacao    = findField(availableKeys, 'course_name_captacao');

  // ── Date range ───────────────────────────────────────────────────────────
  let startDate: Date | null = null;
  let endDate: Date | null   = null;

  if (dateField && data.length > 0) {
    const dates = data.map(d => parseLocalDate(d[dateField])).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      endDate = new Date(Math.max(...dates.map(d => d.getTime())));
      endDate.setHours(23, 59, 59, 999);
    }
  }
  if (!endDate) endDate = new Date();

  const { mode } = plan.timeRange;
  if (mode === 'last_7')       { startDate = subDays(endDate, 6);  startDate.setHours(0,0,0,0); }
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

  // ── Course filter extraction ─────────────────────────────────────────────
  //
  // Course filters are treated separately from other filters because they must
  // be applied selectively per metric universe:
  //
  //   • course_name_campanha  →  gates mídia metrics  (investimento, impressoes, cliques)
  //   • course_name_captacao  →  gates captação metrics (leads, mql, tickets, matriculas)
  //
  // When a generic "curso" filter arrives (ambiguous), it is applied to BOTH sides.
  // This prevents the classic bug: filtering by course on a single field zeroes out
  // the other universe's metrics.

  let courseFilterCampanha: string[] | null = null;
  let courseFilterCaptacao: string[] | null = null;
  const remainingFilters: Record<string, string | string[]> = {};

  if (plan.filters) {
    for (const [key, value] of Object.entries(plan.filters)) {
      const kl     = key.toLowerCase();
      const values = (Array.isArray(value) ? value : [value]).map(v => String(v).toLowerCase().trim());

      if (kl === 'course_name_campanha' || kl === 'course_id_campanha') {
        courseFilterCampanha = values;
      } else if (kl === 'course_name_captacao' || kl === 'course_id_captacao') {
        courseFilterCaptacao = values;
      } else if (kl === 'course_name' || kl === 'curso' || kl === 'course') {
        // Ambiguous — apply to both sides so neither universe is silenced
        courseFilterCampanha = values;
        courseFilterCaptacao = values;
      } else {
        remainingFilters[key] = value;
      }
    }
  }

  // ── Base filter (date + non-course dimensions) ───────────────────────────
  const passesBaseFilter = (d: any): boolean => {
    if (dateField && startDate && endDate) {
      const dDate = parseLocalDate(d[dateField]);
      if (isNaN(dDate.getTime())) return false;
      if (dDate < startDate || dDate > endDate) return false;
    }
    for (const [key, value] of Object.entries(remainingFilters)) {
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
    return true;
  };

  // Mídia: contributes investimento, impressoes, cliques
  const passesMidiaFilter = (d: any): boolean => {
    if (!courseFilterCampanha) return true;           // no course filter → all rows qualify
    if (!courseNameCampanha)   return false;          // filter requested but field missing
    const val = String(d[courseNameCampanha] ?? '').toLowerCase().trim();
    return courseFilterCampanha.some(f => val === f || val.includes(f) || f.includes(val));
  };

  // Captação: contributes leads, mql, tickets, matriculas, inscricoes
  const passesCaptacaoFilter = (d: any): boolean => {
    if (!courseFilterCaptacao) return true;
    if (!courseNameCaptacao)   return false;
    const val = String(d[courseNameCaptacao] ?? '').toLowerCase().trim();
    return courseFilterCaptacao.some(f => val === f || val.includes(f) || f.includes(val));
  };

  const baseFiltered = data.filter(passesBaseFilter);

  // ── Group key builder ────────────────────────────────────────────────────
  const makeGroupKey = (d: any): string => {
    const parts: string[] = [];

    if (plan.granularity !== 'none' && dateField) {
      const dDate = parseLocalDate(d[dateField]);
      if (!isNaN(dDate.getTime())) {
        if (plan.granularity === 'month')     parts.push(format(dDate, 'yyyy-MM'));
        else if (plan.granularity === 'week') parts.push(format(startOfWeek(dDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
        else                                  parts.push(format(dDate, 'yyyy-MM-dd'));
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
  //
  // Each row can contribute to the mídia universe, the captação universe, or both.
  // Private accumulators (_inv, _mql, etc.) always receive values so derived
  // metrics (cac, cpmql…) are always calculable regardless of which fields were
  // explicitly requested.

  const grouped: Record<string, any> = {};

  const ensureGroup = (gk: string) => {
    if (!grouped[gk]) {
      grouped[gk] = {
        _group: gk,
        _inv: 0, _imp: 0, _cliq: 0,
        _leads: 0, _leadsIns: 0, _mql: 0, _sal: 0, _mat: 0, _ins: 0,
      };
      for (const m of plan.metrics) {
        if (!DERIVED.has(m.toLowerCase())) grouped[gk][m] = 0;
      }
    }
    return grouped[gk];
  };

  for (const d of baseFiltered) {
    const gk  = makeGroupKey(d);
    const row = ensureGroup(gk);

    // ── Mídia universe ────────────────────────────────────────────────────
    if (passesMidiaFilter(d)) {
      if (invField)  row._inv  += safeNum(d[invField]);
      if (impField)  row._imp  += safeNum(d[impField]);
      if (cliqField) row._cliq += safeNum(d[cliqField]);

      for (const m of plan.metrics) {
        if (DERIVED.has(m.toLowerCase())) continue;
        if (metricAffinity(m) !== 'midia') continue;
        const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
        if (ak) row[m] += safeNum(d[ak]);
      }
    }

    // ── Captação universe ─────────────────────────────────────────────────
    if (passesCaptacaoFilter(d)) {
      if (leadsField)    row._leads    += safeNum(d[leadsField]);
      if (leadsInsField) row._leadsIns += safeNum(d[leadsInsField]);
      if (mqlField)      row._mql      += safeNum(d[mqlField]);
      if (salField)      row._sal      += safeNum(d[salField]);
      if (matField)      row._mat      += safeNum(d[matField]);
      if (inscField)     row._ins      += safeNum(d[inscField]);

      for (const m of plan.metrics) {
        if (DERIVED.has(m.toLowerCase())) continue;
        if (metricAffinity(m) !== 'captacao') continue;
        const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
        if (ak) row[m] += safeNum(d[ak]);
      }
    }

    // ── Metrics with no affinity (custom fields the Planner added) ─────────
    for (const m of plan.metrics) {
      if (DERIVED.has(m.toLowerCase())) continue;
      if (metricAffinity(m) !== 'both') continue;
      const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
      if (ak) row[m] += safeNum(d[ak]);
    }
  }

  // ── Derived metric calculation ───────────────────────────────────────────
  const metricsLower = plan.metrics.map(m => m.toLowerCase());

  const results = Object.values(grouped).map((g: any) => {
    const { _inv: inv, _mql: mql, _sal: sal, _mat: mat } = g;

    if (metricsLower.includes('cpmql'))           g.cpmql           = mql > 0 ? inv / mql  : null;
    if (metricsLower.includes('cac'))             g.cac             = mat > 0 ? inv / mat  : null;
    if (metricsLower.includes('cpsal'))           g.cpsal           = sal > 0 ? inv / sal  : null;
    if (metricsLower.includes('conv_mql_mat'))    g.conv_mql_mat    = mql > 0 ? (mat / mql) * 100 : null;
    if (metricsLower.includes('conv_mql_ticket')) g.conv_mql_ticket = mql > 0 ? (sal / mql) * 100 : null;
    if (metricsLower.includes('conv_ticket_mat')) g.conv_ticket_mat = sal > 0 ? (mat / sal) * 100 : null;

    // Sync named fields from private accumulators if the user requested them
    if (metricsLower.includes('investimento') && !g.investimento) g.investimento = g._inv;
    if (metricsLower.includes('impressoes')   && !g.impressoes)   g.impressoes   = g._imp;
    if (metricsLower.includes('cliques')      && !g.cliques)      g.cliques      = g._cliq;

    delete g._inv;  delete g._imp;  delete g._cliq;
    delete g._leads; delete g._leadsIns;
    delete g._mql; delete g._sal; delete g._mat; delete g._ins;

    return g;
  });

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sorted = [...results];
  if (plan.analysisType === 'ranking' && plan.metrics.length > 0) {
    const sortMetric = plan.metrics[0];
    sorted.sort((a, b) => (b[sortMetric] ?? -Infinity) - (a[sortMetric] ?? -Infinity));
  } else if (plan.granularity !== 'none') {
    sorted.sort((a, b) => String(a._group ?? '').localeCompare(String(b._group ?? '')));
  }

  const finalResults = plan.limit ? sorted.slice(0, plan.limit) : sorted;

  // ── Metadata ─────────────────────────────────────────────────────────────
  let minDate = null;
  let maxDate = null;

  if (dateField && baseFiltered.length > 0) {
    const dates = baseFiltered
      .map(d => parseLocalDate(d[dateField]))
      .filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      minDate = format(new Date(Math.min(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
      maxDate = format(new Date(Math.max(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
    }
  }

  return {
    metadata: {
      total_linhas_filtradas: baseFiltered.length,
      data_minima: minDate,
      data_maxima: maxDate,
    },
    results: finalResults,
    allResults: sorted,
  };
}
