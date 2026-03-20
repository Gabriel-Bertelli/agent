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

// Metrics whose source of truth is course_name_CAMPANHA (ad side)
const MIDIA_FIELDS = new Set(['investimento', 'impressoes', 'impressões', 'cliques', 'clicks', 'impressions']);

// Metrics whose source of truth is course_name_CAPTACAO (conversion side)
const CAPTACAO_FIELDS = new Set(['leads', 'leads_inscricao', 'mql', 'mqls', 'inscricoes', 'inscrições', 'matriculas', 'matrículas', 'tickets', 'ticket']);

function isMidiaMetric(m: string)    { return MIDIA_FIELDS.has(m.toLowerCase()); }
function isCaptacaoMetric(m: string) { return CAPTACAO_FIELDS.has(m.toLowerCase()); }

// Whether ANY requested metric (or derived metric that needs it) requires mídia fields
function planNeedsMidia(plan: PlannerJSON): boolean {
  return plan.metrics.some(m => {
    const ml = m.toLowerCase();
    return isMidiaMetric(ml) || ['cpmql','cac','cpsal'].includes(ml);
  });
}

// Whether ANY requested metric requires captação fields
function planNeedsCaptacao(plan: PlannerJSON): boolean {
  return plan.metrics.some(m => {
    const ml = m.toLowerCase();
    return isCaptacaoMetric(ml) || DERIVED.has(ml);
  });
}

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
  const dateField          = findField(availableKeys, 'data', 'date', 'created_at', 'time');
  const invField           = findField(availableKeys, 'investimento', 'investment', 'cost', 'custo', 'valor');
  const impField           = findField(availableKeys, 'impressoes', 'impressões', 'impressions');
  const cliqField          = findField(availableKeys, 'cliques', 'clicks');
  const leadsField         = findField(availableKeys, 'leads');
  const leadsInsField      = findField(availableKeys, 'leads_inscricao');
  const mqlField           = findField(availableKeys, 'mql', 'mqls');
  const salField           = findField(availableKeys, 'tickets', 'ticket', 'sal');
  const matField           = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const inscField          = findField(availableKeys, 'inscricoes', 'inscrições', 'inscricao');
  const courseNameCampanha = findField(availableKeys, 'course_name_campanha');
  const courseNameCaptacao = findField(availableKeys, 'course_name_captacao');

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
  if (mode === 'last_7')          { startDate = subDays(endDate, 6);  startDate.setHours(0,0,0,0); }
  else if (mode === 'last_15')    { startDate = subDays(endDate, 14); startDate.setHours(0,0,0,0); }
  else if (mode === 'last_30')    { startDate = subDays(endDate, 29); startDate.setHours(0,0,0,0); }
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

  // ── Detect if dimensions reference course fields ──────────────────────────
  // When the user asks "by course", the Planner picks one of the two course fields
  // as the dimension. We need to know which one was chosen (or if it's ambiguous)
  // so we can run the correct aggregation strategy.

  const dimensionsLower = (plan.dimensions ?? []).map(d => d.toLowerCase());
  const dimHasCampanha  = dimensionsLower.includes('course_name_campanha') || dimensionsLower.includes('course_id_campanha');
  const dimHasCaptacao  = dimensionsLower.includes('course_name_captacao') || dimensionsLower.includes('course_id_captacao');

  // ── Non-course filters (date + platform + produto etc.) ──────────────────
  // Course filters are kept SEPARATE per universe so each side is filtered independently.
  // A single shared list would cause: filtering captacao by "Medicina" also blocks
  // midia rows where course_name_campanha !== "Medicina" — zeroing investimento.
  let courseFilterCampanha: string[] | null = null;  // gates mídia metrics
  let courseFilterCaptacao: string[] | null = null;  // gates captação metrics
  const remainingFilters: Record<string, string | string[]> = {};

  if (plan.filters) {
    for (const [key, value] of Object.entries(plan.filters)) {
      const kl     = key.toLowerCase();
      const values = (Array.isArray(value) ? value : [value]).map(v => String(v).toLowerCase().trim());

      if (kl === 'course_name_campanha' || kl === 'course_id_campanha') {
        // Explicit mídia-side filter
        courseFilterCampanha = values;
      } else if (kl === 'course_name_captacao' || kl === 'course_id_captacao') {
        // Explicit captação-side filter — but ALSO apply to campanha side
        // because the Planner always uses course_name_captacao as the filter key,
        // even for queries that include mídia metrics. The executor must fan out.
        courseFilterCaptacao = values;
        courseFilterCampanha = values;  // same value applied independently to each side
      } else if (kl === 'course_name' || kl === 'curso' || kl === 'course') {
        courseFilterCampanha = values;
        courseFilterCaptacao = values;
      } else {
        remainingFilters[key] = value;
      }
    }
  }

  const matchValues = (val: string, filter: string[]) =>
    filter.some(f => val === f || val.includes(f) || f.includes(val));

  const passesBaseFilter = (d: any): boolean => {
    if (dateField && startDate && endDate) {
      const dDate = parseLocalDate(d[dateField]);
      if (isNaN(dDate.getTime()) || dDate < startDate || dDate > endDate) return false;
    }
    for (const [key, value] of Object.entries(remainingFilters)) {
      const actualKey = availableKeys.find(k => k.toLowerCase() === key.toLowerCase());
      if (!actualKey) continue;
      const dataVal = String(d[actualKey] ?? '').toLowerCase().trim();
      const values  = Array.isArray(value) ? value : [value];
      if (!values.some(v => { const fv = String(v).toLowerCase().trim(); return dataVal === fv || dataVal.includes(fv) || fv.includes(dataVal); })) return false;
    }
    return true;
  };

  // A row qualifies for mídia metrics if it passes the campanha course filter (or no filter set)
  const midiaRowOk = (d: any): boolean => {
    if (!courseFilterCampanha) return true;
    if (!courseNameCampanha)   return false;
    const val = String(d[courseNameCampanha] ?? '').toLowerCase().trim();
    return matchValues(val, courseFilterCampanha);
  };

  // A row qualifies for captação metrics if it passes the captacao course filter (or no filter set)
  const captacaoRowOk = (d: any): boolean => {
    if (!courseFilterCaptacao) return true;
    if (!courseNameCaptacao)   return false;
    const val = String(d[courseNameCaptacao] ?? '').toLowerCase().trim();
    return matchValues(val, courseFilterCaptacao);
  };

  const baseFiltered = data.filter(passesBaseFilter);

  // ── Determine aggregation strategy ───────────────────────────────────────
  //
  // The fundamental challenge: a single row has two course names.
  // course_name_campanha → owns: investimento, impressoes, cliques
  // course_name_captacao → owns: leads, mql, inscricoes, tickets, matriculas
  //
  // When grouping by course we CANNOT use a single makeGroupKey because the
  // same row's investimento belongs to bucket "Medicina" (campanha) while its
  // mql belongs to bucket "Enfermagem" (captacao).
  //
  // Strategy:
  //   A) No course dimension → single pass, each row contributes its own
  //      investimento AND mql to the same (date/platform/etc.) group key.
  //      This is correct because both metrics are from the same row.
  //
  //   B) Course dimension present → TWO separate passes:
  //      Pass 1: group by course_name_campanha, aggregate only mídia metrics
  //      Pass 2: group by course_name_captacao, aggregate only captação metrics
  //      Then MERGE the two result maps by a normalised course name key,
  //      producing rows that have both investimento AND mql correctly attributed.

  const needsTwoPasses = (dimHasCampanha || dimHasCaptacao) ||
    (dimensionsLower.some(d => d.includes('course')));

  // ── Helper: build a group key from non-course dimensions + granularity ────
  const makeDateGranKey = (d: any): string => {
    if (plan.granularity === 'none' || !dateField) return '';
    const dDate = parseLocalDate(d[dateField]);
    if (isNaN(dDate.getTime())) return '';
    if (plan.granularity === 'month') return format(dDate, 'yyyy-MM');
    if (plan.granularity === 'week')  return format(startOfWeek(dDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return format(dDate, 'yyyy-MM-dd');
  };

  const makeNonCourseDimKey = (d: any): string => {
    return dimensionsLower
      .filter(dim => !dim.includes('course'))
      .map(dim => {
        const ak = availableKeys.find(k => k.toLowerCase() === dim);
        return ak ? String(d[ak] ?? 'N/A') : 'N/A';
      })
      .join(' | ');
  };

  // Full group key used in single-pass mode (strategy A)
  const makeGroupKey = (d: any): string => {
    const parts: string[] = [];
    const dateKey = makeDateGranKey(d);
    if (dateKey) parts.push(dateKey);

    if (plan.dimensions?.length > 0) {
      for (const dim of plan.dimensions) {
        const ak = availableKeys.find(k => k.toLowerCase() === dim.toLowerCase());
        parts.push(ak ? String(d[ak] ?? 'N/A') : 'N/A');
      }
    }

    return parts.length > 0 ? parts.join(' | ') : 'Total';
  };

  // ── STRATEGY A: no course dimension ─────────────────────────────────────
  if (!needsTwoPasses) {
    const grouped: Record<string, any> = {};

    const ensureGroup = (gk: string) => {
      if (!grouped[gk]) {
        grouped[gk] = { _group: gk, _inv: 0, _imp: 0, _cliq: 0, _leads: 0, _leadsIns: 0, _mql: 0, _sal: 0, _mat: 0, _ins: 0 };
        for (const m of plan.metrics) { if (!DERIVED.has(m.toLowerCase())) grouped[gk][m] = 0; }
      }
      return grouped[gk];
    };

    for (const d of baseFiltered) {
      // Apply course filter to the correct side; if no course filter, row qualifies fully
      const midiaOk    = midiaRowOk(d);
      const captacaoOk = captacaoRowOk(d);
      if (!midiaOk && !captacaoOk) continue;

      const gk  = makeGroupKey(d);
      const row = ensureGroup(gk);

      if (midiaOk) {
        if (invField)  row._inv  += safeNum(d[invField]);
        if (impField)  row._imp  += safeNum(d[impField]);
        if (cliqField) row._cliq += safeNum(d[cliqField]);
        for (const m of plan.metrics) {
          if (DERIVED.has(m.toLowerCase()) || !isMidiaMetric(m)) continue;
          const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
          if (ak) row[m] += safeNum(d[ak]);
        }
      }
      if (captacaoOk) {
        if (leadsField)    row._leads    += safeNum(d[leadsField]);
        if (leadsInsField) row._leadsIns += safeNum(d[leadsInsField]);
        if (mqlField)      row._mql      += safeNum(d[mqlField]);
        if (salField)      row._sal      += safeNum(d[salField]);
        if (matField)      row._mat      += safeNum(d[matField]);
        if (inscField)     row._ins      += safeNum(d[inscField]);
        for (const m of plan.metrics) {
          if (DERIVED.has(m.toLowerCase()) || !isCaptacaoMetric(m)) continue;
          const ak = availableKeys.find(k => k.toLowerCase() === m.toLowerCase());
          if (ak) row[m] += safeNum(d[ak]);
        }
      }
    }

    return finalise(plan, grouped, baseFiltered, dateField, availableKeys);
  }

  // ── STRATEGY B: course dimension — two separate passes then merge ─────────
  //
  // Pass 1 — Mídia: group by course_name_CAMPANHA, sum investimento/impressoes/cliques
  // Pass 2 — Captação: group by course_name_CAPTACAO, sum leads/mql/tickets/matriculas
  // Merge key = dateGran + nonCourseDims + courseName (normalised lower)

  const midiaMap:    Record<string, any> = {};
  const captacaoMap: Record<string, any> = {};

  for (const d of baseFiltered) {
    const dateKey        = makeDateGranKey(d);
    const nonCourseKey   = makeNonCourseDimKey(d);
    const campNome       = courseNameCampanha ? String(d[courseNameCampanha] ?? '').trim() : '';
    const captNome       = courseNameCaptacao ? String(d[courseNameCaptacao] ?? '').trim() : '';

    // Pass 1: mídia
    if (campNome && (!courseFilterCampanha || matchValues(campNome.toLowerCase(), courseFilterCampanha))) {
      const parts = [dateKey, nonCourseKey, campNome].filter(Boolean);
      const gk    = parts.join(' | ') || 'Total';
      if (!midiaMap[gk]) midiaMap[gk] = { _courseName: campNome, _dateKey: dateKey, _nonCourseKey: nonCourseKey, _inv: 0, _imp: 0, _cliq: 0 };
      if (invField)  midiaMap[gk]._inv  += safeNum(d[invField]);
      if (impField)  midiaMap[gk]._imp  += safeNum(d[impField]);
      if (cliqField) midiaMap[gk]._cliq += safeNum(d[cliqField]);
    }

    // Pass 2: captação
    if (captNome && (!courseFilterCaptacao || matchValues(captNome.toLowerCase(), courseFilterCaptacao))) {
      const parts = [dateKey, nonCourseKey, captNome].filter(Boolean);
      const gk    = parts.join(' | ') || 'Total';
      if (!captacaoMap[gk]) captacaoMap[gk] = { _courseName: captNome, _dateKey: dateKey, _nonCourseKey: nonCourseKey, _leads: 0, _leadsIns: 0, _mql: 0, _sal: 0, _mat: 0, _ins: 0 };
      if (leadsField)    captacaoMap[gk]._leads    += safeNum(d[leadsField]);
      if (leadsInsField) captacaoMap[gk]._leadsIns += safeNum(d[leadsInsField]);
      if (mqlField)      captacaoMap[gk]._mql      += safeNum(d[mqlField]);
      if (salField)      captacaoMap[gk]._sal      += safeNum(d[salField]);
      if (matField)      captacaoMap[gk]._mat      += safeNum(d[matField]);
      if (inscField)     captacaoMap[gk]._ins      += safeNum(d[inscField]);
    }
  }

  // Merge: union of all keys from both maps
  const allKeys = new Set([...Object.keys(midiaMap), ...Object.keys(captacaoMap)]);
  const merged: Record<string, any> = {};

  for (const gk of allKeys) {
    const m = midiaMap[gk]    || { _inv: 0, _imp: 0, _cliq: 0 };
    const c = captacaoMap[gk] || { _leads: 0, _leadsIns: 0, _mql: 0, _sal: 0, _mat: 0, _ins: 0 };
    const courseName = (m._courseName || c._courseName) ?? '';
    const dateKey    = (m._dateKey    || c._dateKey)    ?? '';
    const ncKey      = (m._nonCourseKey || c._nonCourseKey) ?? '';

    // Rebuild the display group key: date + non-course dims + course name
    const groupParts = [dateKey, ncKey, courseName].filter(Boolean);
    merged[gk] = {
      _group: groupParts.join(' | ') || 'Total',
      _inv: m._inv, _imp: m._imp, _cliq: m._cliq,
      _leads: c._leads, _leadsIns: c._leadsIns, _mql: c._mql, _sal: c._sal, _mat: c._mat, _ins: c._ins,
    };

    // Expose named raw metrics that were explicitly requested
    for (const reqMetric of plan.metrics) {
      if (DERIVED.has(reqMetric.toLowerCase())) continue;
      if (isMidiaMetric(reqMetric))    { merged[gk][reqMetric] = m[`_${reqMetric.toLowerCase()}`] ?? m._inv ?? 0; continue; }
      if (isCaptacaoMetric(reqMetric)) { merged[gk][reqMetric] = c[`_${reqMetric.toLowerCase()}`] ?? 0; continue; }
    }
  }

  return finalise(plan, merged, baseFiltered, dateField, availableKeys);
}

// ── Shared finalisation: derived metrics + sort + metadata ─────────────────

function finalise(
  plan: PlannerJSON,
  grouped: Record<string, any>,
  baseFiltered: any[],
  dateField: string | undefined,
  availableKeys: string[],
) {
  const metricsLower = plan.metrics.map(m => m.toLowerCase());

  const results = Object.values(grouped).map((g: any) => {
    const { _inv: inv, _mql: mql, _sal: sal, _mat: mat } = g;

    if (metricsLower.includes('cpmql'))           g.cpmql           = mql > 0 ? inv / mql  : null;
    if (metricsLower.includes('cac'))             g.cac             = mat > 0 ? inv / mat  : null;
    if (metricsLower.includes('cpsal'))           g.cpsal           = sal > 0 ? inv / sal  : null;
    if (metricsLower.includes('conv_mql_mat'))    g.conv_mql_mat    = mql > 0 ? (mat / mql) * 100 : null;
    if (metricsLower.includes('conv_mql_ticket')) g.conv_mql_ticket = mql > 0 ? (sal / mql) * 100 : null;
    if (metricsLower.includes('conv_ticket_mat')) g.conv_ticket_mat = sal > 0 ? (mat / sal) * 100 : null;

    // Sync named fields from private accumulators if explicitly requested
    if (metricsLower.includes('investimento') && g.investimento == null) g.investimento = g._inv ?? 0;
    if (metricsLower.includes('impressoes')   && g.impressoes   == null) g.impressoes   = g._imp ?? 0;
    if (metricsLower.includes('cliques')      && g.cliques      == null) g.cliques      = g._cliq ?? 0;
    if (metricsLower.includes('mql')          && g.mql          == null) g.mql          = g._mql ?? 0;
    if (metricsLower.includes('leads')        && g.leads        == null) g.leads        = g._leads ?? 0;
    if (metricsLower.includes('matriculas')   && g.matriculas   == null) g.matriculas   = g._mat ?? 0;
    if (metricsLower.includes('tickets')      && g.tickets      == null) g.tickets      = g._sal ?? 0;
    if (metricsLower.includes('inscricoes')   && g.inscricoes   == null) g.inscricoes   = g._ins ?? 0;

    delete g._inv;  delete g._imp;  delete g._cliq;
    delete g._leads; delete g._leadsIns;
    delete g._mql; delete g._sal; delete g._mat; delete g._ins;

    return g;
  });

  const sorted = [...results];
  if (plan.analysisType === 'ranking' && plan.metrics.length > 0) {
    const sortMetric = plan.metrics[0];
    sorted.sort((a, b) => (b[sortMetric] ?? -Infinity) - (a[sortMetric] ?? -Infinity));
  } else if (plan.granularity !== 'none') {
    sorted.sort((a, b) => String(a._group ?? '').localeCompare(String(b._group ?? '')));
  }

  const finalResults = plan.limit ? sorted.slice(0, plan.limit) : sorted;

  let minDate = null;
  let maxDate = null;
  if (dateField && baseFiltered.length > 0) {
    const dates = baseFiltered.map(d => parseLocalDate(d[dateField])).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      minDate = format(new Date(Math.min(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
      maxDate = format(new Date(Math.max(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
    }
  }

  return {
    metadata: { total_linhas_filtradas: baseFiltered.length, data_minima: minDate, data_maxima: maxDate },
    results: finalResults,
    allResults: sorted,
  };
}
