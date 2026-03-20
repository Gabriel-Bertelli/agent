import React, { useEffect, useMemo, useState } from 'react';
import { Target, TrendingUp, TrendingDown, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { loadGoals, GoalRow } from '../lib/goalsLoader';
import { mapToCanal, mapToBU } from '../lib/goalsMapper';

// ── Types ──────────────────────────────────────────────────────────────────

interface MetricSet {
  investimento: number;
  leads: number;
  matriculas: number;
}

interface GoalActualRow {
  key: string;          // BU or "BU | canal"
  bu: string;
  canal?: string;
  meta: MetricSet;
  real: MetricSet;
}

type ViewMode = 'bu' | 'canal_bu';
type SortDir  = 'asc' | 'desc';
type SortCol  = 'meta_inv' | 'real_inv' | 'pct_inv' | 'meta_leads' | 'real_leads' | 'pct_leads' | 'meta_mat' | 'real_mat' | 'pct_mat' | 'cac_meta' | 'cac_real';

// ── Helpers ────────────────────────────────────────────────────────────────

function safeNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '(not set)') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  const n = parseFloat(s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function findField(keys: string[], ...candidates: string[]): string | undefined {
  for (const c of candidates) { const f = keys.find(k => k.toLowerCase() === c.toLowerCase()); if (f) return f; }
  for (const c of candidates) { const f = keys.find(k => k.toLowerCase().includes(c.toLowerCase())); if (f) return f; }
}

const parseLocalDate = (v: any): Date => {
  if (!v) return new Date(NaN);
  if (v instanceof Date) return v;
  return new Date(`${String(v).split('T')[0].split(' ')[0]}T00:00:00`);
};

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const pct    = (real: number, meta: number): number | null => meta > 0 ? (real / meta) * 100 : null;

// ── Progress bar + badge ───────────────────────────────────────────────────

function Gauge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400 text-xs">—</span>;
  const capped  = Math.min(value, 150);
  const color   = value >= 90 ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-400' : 'bg-red-400';
  const textCol = value >= 90 ? 'text-emerald-700' : value >= 70 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(capped / 150) * 100}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-12 text-right ${textCol}`}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function DeltaBadge({ real, meta }: { real: number; meta: number }) {
  if (meta === 0) return null;
  const v = real - meta;
  if (Math.abs(v) < 1) return null;
  return v > 0
    ? <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5"><TrendingUp className="w-2.5 h-2.5" />+{fmtInt(Math.round(v))}</span>
    : <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5"><TrendingDown className="w-2.5 h-2.5" />{fmtInt(Math.round(v))}</span>;
}

// ── Aggregation ────────────────────────────────────────────────────────────

function aggregateActual(
  data: any[],
  availableKeys: string[],
  start: string,
  end: string,
): Map<string, MetricSet> {
  const map = new Map<string, MetricSet>();
  const dateField     = findField(availableKeys, 'data', 'date', 'created_at');
  const invField      = findField(availableKeys, 'investimento', 'investment', 'custo');
  const leadsField    = findField(availableKeys, 'leads');
  const matField      = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const platformField = findField(availableKeys, 'platform');
  const tipoField     = findField(availableKeys, 'tipo_campanha');
  const produtoField  = findField(availableKeys, 'produto');

  const sDate = start ? new Date(`${start}T00:00:00`) : null;
  const eDate = end   ? new Date(`${end}T23:59:59`)   : null;

  for (const d of data) {
    if (dateField && sDate && eDate) {
      const dd = parseLocalDate(d[dateField]);
      if (isNaN(dd.getTime()) || dd < sDate || dd > eDate) continue;
    }
    const bu     = mapToBU(d[produtoField ?? ''] ?? '');
    const canal  = mapToCanal(d[platformField ?? ''] ?? '', d[tipoField ?? ''] ?? '');
    if (!bu) continue;

    // BU-level key
    if (!map.has(bu)) map.set(bu, { investimento: 0, leads: 0, matriculas: 0 });
    const buRow = map.get(bu)!;
    buRow.investimento += safeNum(d[invField ?? '']);
    buRow.leads        += safeNum(d[leadsField ?? '']);
    buRow.matriculas   += safeNum(d[matField ?? '']);

    // Canal×BU key
    const ck = `${bu} | ${canal}`;
    if (!map.has(ck)) map.set(ck, { investimento: 0, leads: 0, matriculas: 0 });
    const ckRow = map.get(ck)!;
    ckRow.investimento += safeNum(d[invField ?? '']);
    ckRow.leads        += safeNum(d[leadsField ?? '']);
    ckRow.matriculas   += safeNum(d[matField ?? '']);
  }

  return map;
}

function aggregateGoals(
  goals: GoalRow[],
  start: string,
  end: string,
): Map<string, MetricSet> {
  const map = new Map<string, MetricSet>();
  const sDate = start ? new Date(`${start}T00:00:00`) : null;
  const eDate = end   ? new Date(`${end}T23:59:59`)   : null;

  for (const g of goals) {
    if (sDate && eDate) {
      const gd = new Date(`${g.date}T00:00:00`);
      if (gd < sDate || gd > eDate) continue;
    }
    // BU key
    if (!map.has(g.bu)) map.set(g.bu, { investimento: 0, leads: 0, matriculas: 0 });
    const buRow = map.get(g.bu)!;
    buRow.investimento += g.investimento;
    buRow.leads        += g.leads;
    buRow.matriculas   += g.matriculas;

    // Canal×BU key
    const ck = `${g.bu} | ${g.canal}`;
    if (!map.has(ck)) map.set(ck, { investimento: 0, leads: 0, matriculas: 0 });
    const ckRow = map.get(ck)!;
    ckRow.investimento += g.investimento;
    ckRow.leads        += g.leads;
    ckRow.matriculas   += g.matriculas;
  }

  return map;
}

// ── Main component ─────────────────────────────────────────────────────────

export function GoalsView({ data }: { data: any[] }) {
  const availableKeys = useMemo(() => data.length ? Object.keys(data[0]) : [], [data]);

  const { minDate, maxDate } = useMemo(() => {
    const df = findField(availableKeys, 'data', 'date', 'created_at');
    if (!df || !data.length) return { minDate: '', maxDate: '' };
    const dates = data.map(d => parseLocalDate(d[df])).filter(d => !isNaN(d.getTime()));
    if (!dates.length) return { minDate: '', maxDate: '' };
    return {
      minDate: new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0],
      maxDate: new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0],
    };
  }, [data, availableKeys]);

  // Goals state
  const [goals, setGoals]       = useState<GoalRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError]     = useState('');

  // Filters
  const [start, setStart]       = useState('');
  const [end, setEnd]           = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('bu');
  const [expandedBUs, setExpandedBUs] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol]   = useState<SortCol>('meta_mat');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');

  React.useEffect(() => { if (minDate && !start) setStart(minDate); }, [minDate]);
  React.useEffect(() => { if (maxDate && !end)   setEnd(maxDate);   }, [maxDate]);

  const fetchGoals = async () => {
    setGoalsLoading(true);
    setGoalsError('');
    try {
      const rows = await loadGoals();
      setGoals(rows);
    } catch (e: any) {
      setGoalsError(e.message ?? 'Erro ao carregar metas.');
    } finally {
      setGoalsLoading(false);
    }
  };

  useEffect(() => { fetchGoals(); }, []);

  // Aggregations
  const actualMap = useMemo(() => aggregateActual(data, availableKeys, start, end), [data, availableKeys, start, end]);
  const goalMap   = useMemo(() => aggregateGoals(goals, start, end), [goals, start, end]);

  // All BUs from either source
  const allBUs = useMemo(() => {
    const s = new Set<string>();
    for (const k of actualMap.keys()) { if (!k.includes(' | ')) s.add(k); }
    for (const k of goalMap.keys())   { if (!k.includes(' | ')) s.add(k); }
    return Array.from(s).sort();
  }, [actualMap, goalMap]);

  // All canals per BU
  const canalsPerBU = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const addKey = (k: string) => {
      if (!k.includes(' | ')) return;
      const [bu, canal] = k.split(' | ');
      if (!m.has(bu)) m.set(bu, new Set());
      m.get(bu)!.add(canal);
    };
    for (const k of actualMap.keys()) addKey(k);
    for (const k of goalMap.keys())   addKey(k);
    return m;
  }, [actualMap, goalMap]);

  // Build sorted rows for BU view
  const buRows: GoalActualRow[] = useMemo(() => {
    return allBUs.map(bu => ({
      key: bu, bu, canal: undefined,
      meta: goalMap.get(bu)   ?? { investimento: 0, leads: 0, matriculas: 0 },
      real: actualMap.get(bu) ?? { investimento: 0, leads: 0, matriculas: 0 },
    }));
  }, [allBUs, goalMap, actualMap]);

  const sortedBURows = useMemo(() => {
    return [...buRows].sort((a, b) => {
      const va = getSort(a, sortCol);
      const vb = getSort(b, sortCol);
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [buRows, sortCol, sortDir]);

  // Totals
  const totals = useMemo(() => {
    const meta = { investimento: 0, leads: 0, matriculas: 0 };
    const real = { investimento: 0, leads: 0, matriculas: 0 };
    buRows.forEach(r => {
      meta.investimento += r.meta.investimento;
      meta.leads        += r.meta.leads;
      meta.matriculas   += r.meta.matriculas;
      real.investimento += r.real.investimento;
      real.leads        += r.real.leads;
      real.matriculas   += r.real.matriculas;
    });
    return { meta, real };
  }, [buRows]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const toggleExpand = (bu: string) => {
    setExpandedBUs(prev => {
      const next = new Set(prev);
      next.has(bu) ? next.delete(bu) : next.add(bu);
      return next;
    });
  };

  const thCls = (col: SortCol, align = 'text-right') =>
    `px-3 py-2.5 ${align} text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-indigo-700 ${sortCol === col ? 'text-indigo-700' : 'text-slate-500'}`;

  // ── Loading / error states ────────────────────────────────────────────────

  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
        <Target className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Nenhum dado disponível.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Period */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">De</label>
            <input type="date" value={start} min={minDate} max={end || maxDate}
              onChange={e => setStart(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Até</label>
            <input type="date" value={end} min={start || minDate} max={maxDate}
              onChange={e => setEnd(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          {/* View toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Agrupamento</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              {(['bu', 'canal_bu'] as ViewMode[]).map(m => (
                <button key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-3 py-2 transition-colors ${viewMode === m ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {m === 'bu' ? 'Por BU' : 'Canal × BU'}
                </button>
              ))}
            </div>
          </div>

          {/* Goals status + reload */}
          <div className="ml-auto flex items-center gap-2">
            {goalsLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
            {goalsError && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5" /> {goalsError}
              </span>
            )}
            {!goalsLoading && !goalsError && goals.length > 0 && (
              <span className="text-xs text-emerald-600 font-medium">✓ {goals.length} linhas de meta carregadas</span>
            )}
            {!goalsLoading && !goalsError && goals.length === 0 && (
              <span className="text-xs text-amber-600">Configure VITE_GOALS_CSV_URL no .env.local</span>
            )}
            <button onClick={fetchGoals} title="Recarregar metas"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Group headers */}
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="px-3 py-2 text-left" rowSpan={2} />
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-indigo-700 border-l border-slate-200">
                  Investimento
                </th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-sky-700 border-l border-slate-200">
                  Leads
                </th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-700 border-l border-slate-200">
                  Matrículas
                </th>
                <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 border-l border-slate-200">
                  CAC
                </th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px]">
                {[
                  ['meta_inv',   'Meta',     'border-l border-slate-200'],
                  ['real_inv',   'Realizado', ''],
                  ['pct_inv',    '% Ating.',  ''],
                  ['meta_leads', 'Meta',      'border-l border-slate-200'],
                  ['real_leads', 'Realizado', ''],
                  ['pct_leads',  '% Ating.',  ''],
                  ['meta_mat',   'Meta',      'border-l border-slate-200'],
                  ['real_mat',   'Realizado', ''],
                  ['pct_mat',    '% Ating.',  ''],
                  ['cac_meta',   'Meta',      'border-l border-slate-200'],
                  ['cac_real',   'Realizado', ''],
                ].map(([col, label, extra]) => (
                  <th key={col} onClick={() => toggleSort(col as SortCol)}
                    className={`px-3 py-2 text-right font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-indigo-700 ${extra} ${sortCol === col ? 'text-indigo-700' : 'text-slate-500'}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {sortedBURows.map((row, i) => {
                const pctInv  = pct(row.real.investimento, row.meta.investimento);
                const pctLead = pct(row.real.leads,        row.meta.leads);
                const pctMat  = pct(row.real.matriculas,   row.meta.matriculas);
                const cacMeta = row.meta.matriculas > 0 ? row.meta.investimento / row.meta.matriculas : null;
                const cacReal = row.real.matriculas > 0 ? row.real.investimento / row.real.matriculas : null;
                const isExpanded = expandedBUs.has(row.bu);
                const hasCanals  = (canalsPerBU.get(row.bu)?.size ?? 0) > 0;

                return (
                  <React.Fragment key={row.bu}>
                    <tr className={`transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-indigo-50/30`}>
                      {/* BU label with expand toggle */}
                      <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          {hasCanals && (
                            <button onClick={() => toggleExpand(row.bu)}
                              className="text-slate-400 hover:text-indigo-600 transition-colors">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {!hasCanals && <span className="w-5" />}
                          {row.bu}
                        </div>
                      </td>
                      {/* Investimento */}
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-slate-100">{fmtBRL(row.meta.investimento)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">
                        {fmtBRL(row.real.investimento)}
                        <DeltaBadge real={row.real.investimento} meta={row.meta.investimento} />
                      </td>
                      <td className="px-3 py-3"><Gauge value={pctInv} /></td>
                      {/* Leads */}
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-slate-100">{fmtInt(Math.round(row.meta.leads))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">
                        {fmtInt(row.real.leads)}
                        <DeltaBadge real={row.real.leads} meta={row.meta.leads} />
                      </td>
                      <td className="px-3 py-3"><Gauge value={pctLead} /></td>
                      {/* Matrículas */}
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-slate-100">{fmtInt(Math.round(row.meta.matriculas))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">
                        {fmtInt(row.real.matriculas)}
                        <DeltaBadge real={row.real.matriculas} meta={row.meta.matriculas} />
                      </td>
                      <td className="px-3 py-3"><Gauge value={pctMat} /></td>
                      {/* CAC */}
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-slate-100">{cacMeta != null ? fmtBRL(cacMeta) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">{cacReal != null ? fmtBRL(cacReal) : '—'}</td>
                    </tr>

                    {/* ── Sub-rows: Canal × BU ── */}
                    {isExpanded && Array.from(canalsPerBU.get(row.bu) ?? []).sort().map(canal => {
                      const ck       = `${row.bu} | ${canal}`;
                      const subMeta  = goalMap.get(ck)   ?? { investimento: 0, leads: 0, matriculas: 0 };
                      const subReal  = actualMap.get(ck) ?? { investimento: 0, leads: 0, matriculas: 0 };
                      const sp1 = pct(subReal.investimento, subMeta.investimento);
                      const sp2 = pct(subReal.leads,        subMeta.leads);
                      const sp3 = pct(subReal.matriculas,   subMeta.matriculas);
                      const sc1 = subMeta.matriculas > 0 ? subMeta.investimento / subMeta.matriculas : null;
                      const sc2 = subReal.matriculas > 0 ? subReal.investimento / subReal.matriculas : null;
                      return (
                        <tr key={ck} className="bg-indigo-50/20 border-t border-indigo-100/50">
                          <td className="px-3 py-2 text-slate-500 text-xs pl-9 whitespace-nowrap">
                            ↳ {canal}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs border-l border-slate-100">{fmtBRL(subMeta.investimento)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 text-xs">{fmtBRL(subReal.investimento)}</td>
                          <td className="px-3 py-2"><Gauge value={sp1} /></td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs border-l border-slate-100">{fmtInt(Math.round(subMeta.leads))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 text-xs">{fmtInt(subReal.leads)}</td>
                          <td className="px-3 py-2"><Gauge value={sp2} /></td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs border-l border-slate-100">{fmtInt(Math.round(subMeta.matriculas))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 text-xs">{fmtInt(subReal.matriculas)}</td>
                          <td className="px-3 py-2"><Gauge value={sp3} /></td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs border-l border-slate-100">{sc1 != null ? fmtBRL(sc1) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 text-xs">{sc2 != null ? fmtBRL(sc2) : '—'}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* ── Totals ── */}
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold text-sm">
                <td className="px-3 py-3 text-slate-800 text-xs uppercase tracking-wide whitespace-nowrap">
                  Total ({allBUs.length} BUs)
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700 border-l border-slate-200">{fmtBRL(totals.meta.investimento)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-800">{fmtBRL(totals.real.investimento)}</td>
                <td className="px-3 py-3"><Gauge value={pct(totals.real.investimento, totals.meta.investimento)} /></td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700 border-l border-slate-200">{fmtInt(Math.round(totals.meta.leads))}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.real.leads)}</td>
                <td className="px-3 py-3"><Gauge value={pct(totals.real.leads, totals.meta.leads)} /></td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700 border-l border-slate-200">{fmtInt(Math.round(totals.meta.matriculas))}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.real.matriculas)}</td>
                <td className="px-3 py-3"><Gauge value={pct(totals.real.matriculas, totals.meta.matriculas)} /></td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700 border-l border-slate-200">
                  {totals.meta.matriculas > 0 ? fmtBRL(totals.meta.investimento / totals.meta.matriculas) : '—'}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                  {totals.real.matriculas > 0 ? fmtBRL(totals.real.investimento / totals.real.matriculas) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-right">
        Metas via Google Sheets (VITE_GOALS_CSV_URL) · Realizado via Supabase ·
        Canal mapeado por <code className="bg-slate-100 px-1 rounded">platform + tipo_campanha</code>
      </p>
    </div>
  );
}

// ── Sort value extractor ───────────────────────────────────────────────────

function getSort(row: GoalActualRow, col: SortCol): number {
  switch (col) {
    case 'meta_inv':   return row.meta.investimento;
    case 'real_inv':   return row.real.investimento;
    case 'pct_inv':    return row.meta.investimento > 0 ? row.real.investimento / row.meta.investimento : 0;
    case 'meta_leads': return row.meta.leads;
    case 'real_leads': return row.real.leads;
    case 'pct_leads':  return row.meta.leads > 0 ? row.real.leads / row.meta.leads : 0;
    case 'meta_mat':   return row.meta.matriculas;
    case 'real_mat':   return row.real.matriculas;
    case 'pct_mat':    return row.meta.matriculas > 0 ? row.real.matriculas / row.meta.matriculas : 0;
    case 'cac_meta':   return row.meta.matriculas > 0 ? row.meta.investimento / row.meta.matriculas : Infinity;
    case 'cac_real':   return row.real.matriculas > 0 ? row.real.investimento / row.real.matriculas : Infinity;
  }
}
