import React, { useMemo, useState } from 'react';
import { Megaphone, TrendingUp, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface CampaignRow {
  campanha: string;
  investimento: number;
  leads: number;
  mql: number;
  inscricoes: number;
  matriculas: number;
  cpmql: number | null;
  cpi: number | null;
  cac: number | null;
  conv_mql_mat: number | null;
}

type SortKey = keyof CampaignRow;
type SortDir = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────

const parseLocalDate = (v: any): Date => {
  if (!v) return new Date(NaN);
  if (v instanceof Date) return v;
  const s = String(v).split('T')[0].split(' ')[0];
  return new Date(`${s}T00:00:00`);
};

function safeNum(v: any): number {
  if (v === null || v === undefined || v === '' || v === '(not set)') return 0;
  const s = String(v).trim().replace(/\s/g, '');
  const n = parseFloat(
    s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.')
  );
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function findField(keys: string[], ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    const f = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (f) return f;
  }
  for (const c of candidates) {
    const f = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (f) return f;
  }
}

const fmtBRL = (v: number | null) =>
  v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => v === 0 ? '0' : v.toLocaleString('pt-BR');
const fmtPct = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;

// ── Aggregation ────────────────────────────────────────────────────────────
//
// campaign_name exists on both the mídia and captação sides of the same row,
// so this is a direct single-pass group-by — no merge needed.
// Every row contributes all metrics to the campaign_name bucket of that row.

function aggregateCampaigns(
  data: any[],
  availableKeys: string[],
  opts: { start: string; end: string; tipoCampanha: string; produto: string }
): CampaignRow[] {
  if (!data.length) return [];

  const dateField         = findField(availableKeys, 'data', 'date', 'created_at');
  const campaignField     = findField(availableKeys, 'campaign_name');
  const invField          = findField(availableKeys, 'investimento', 'investment', 'custo');
  const leadsField        = findField(availableKeys, 'leads');
  const mqlField          = findField(availableKeys, 'mql', 'mqls');
  const inscField         = findField(availableKeys, 'inscricoes', 'inscrições', 'inscricao');
  const matField          = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const tipoCampanhaField = findField(availableKeys, 'tipo_campanha');
  const produtoField      = findField(availableKeys, 'produto');

  if (!campaignField) return [];

  const sDate = opts.start ? new Date(`${opts.start}T00:00:00`) : null;
  const eDate = opts.end   ? new Date(`${opts.end}T23:59:59`)   : null;

  const grouped: Record<string, {
    inv: number; leads: number; mql: number; ins: number; mat: number;
  }> = {};

  for (const d of data) {
    // Date filter
    if (dateField && sDate && eDate) {
      const dd = parseLocalDate(d[dateField]);
      if (isNaN(dd.getTime()) || dd < sDate || dd > eDate) continue;
    }
    // Tipo campanha filter
    if (opts.tipoCampanha && opts.tipoCampanha !== 'all' && tipoCampanhaField) {
      if (d[tipoCampanhaField] !== opts.tipoCampanha) continue;
    }
    // Produto filter
    if (opts.produto && opts.produto !== 'all' && produtoField) {
      if (d[produtoField] !== opts.produto) continue;
    }

    const campanha = String(d[campaignField] ?? '').trim();
    if (!campanha || campanha === '(not set)') continue;

    if (!grouped[campanha]) grouped[campanha] = { inv: 0, leads: 0, mql: 0, ins: 0, mat: 0 };
    const g = grouped[campanha];

    if (invField)   g.inv   += safeNum(d[invField]);
    if (leadsField) g.leads += safeNum(d[leadsField]);
    if (mqlField)   g.mql   += safeNum(d[mqlField]);
    if (inscField)  g.ins   += safeNum(d[inscField]);
    if (matField)   g.mat   += safeNum(d[matField]);
  }

  return Object.entries(grouped).map(([campanha, g]) => ({
    campanha,
    investimento:  g.inv,
    leads:         g.leads,
    mql:           g.mql,
    inscricoes:    g.ins,
    matriculas:    g.mat,
    cpmql:         g.mql > 0 ? g.inv / g.mql  : null,
    cpi:           g.ins > 0 ? g.inv / g.ins  : null,
    cac:           g.mat > 0 ? g.inv / g.mat  : null,
    conv_mql_mat:  g.mql > 0 ? (g.mat / g.mql) * 100 : null,
  }));
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-violet-600" />
    : <ChevronDown className="w-3.5 h-3.5 text-violet-600" />;
}

function EffBadge({ value, benchmark, lower = true }: { value: number | null; benchmark: number | null; lower?: boolean }) {
  if (value == null || benchmark == null || benchmark === 0) return null;
  const better = lower ? value < benchmark : value > benchmark;
  const pct = Math.abs((value - benchmark) / benchmark * 100);
  if (pct < 3) return null;
  return better
    ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5"><TrendingDown className="w-2.5 h-2.5" />{pct.toFixed(0)}%</span>
    : <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5"><TrendingUp className="w-2.5 h-2.5" />{pct.toFixed(0)}%</span>;
}

// ── Main component ─────────────────────────────────────────────────────────

export function CampaignTable({ data }: { data: any[] }) {
  const availableKeys = useMemo(() => data.length ? Object.keys(data[0]) : [], [data]);

  // Date limits from data
  const { minDate, maxDate } = useMemo(() => {
    const dateField = findField(availableKeys, 'data', 'date', 'created_at');
    if (!dateField || !data.length) return { minDate: '', maxDate: '' };
    const dates = data.map(d => parseLocalDate(d[dateField])).filter(d => !isNaN(d.getTime()));
    if (!dates.length) return { minDate: '', maxDate: '' };
    return {
      minDate: new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0],
      maxDate: new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0],
    };
  }, [data, availableKeys]);

  // Unique filter options
  const tipoCampanhaOptions = useMemo(() => {
    const f = findField(availableKeys, 'tipo_campanha');
    if (!f) return [];
    return Array.from(new Set(data.map(d => d[f]).filter(Boolean))).sort() as string[];
  }, [data, availableKeys]);

  const produtoOptions = useMemo(() => {
    const f = findField(availableKeys, 'produto');
    if (!f) return [];
    return Array.from(new Set(data.map(d => d[f]).filter(Boolean))).sort() as string[];
  }, [data, availableKeys]);

  // Filter state
  const [start, setStart]         = useState(minDate);
  const [end, setEnd]             = useState(maxDate);
  const [tipoCampanha, setTipo]   = useState('all');
  const [produto, setProduto]     = useState('all');
  const [search, setSearch]       = useState('');
  const [sortKey, setSortKey]     = useState<SortKey>('investimento');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');

  React.useEffect(() => { if (minDate && !start) setStart(minDate); }, [minDate]);
  React.useEffect(() => { if (maxDate && !end)   setEnd(maxDate);   }, [maxDate]);

  const rows = useMemo(
    () => aggregateCampaigns(data, availableKeys, { start, end, tipoCampanha, produto }),
    [data, availableKeys, start, end, tipoCampanha, produto]
  );

  // Benchmarks from filtered rows
  const benchmarks = useMemo(() => {
    if (!rows.length) return { cpmql: null, cac: null, cpi: null, conv: null };
    const inv = rows.reduce((s, r) => s + r.investimento, 0);
    const mql = rows.reduce((s, r) => s + r.mql, 0);
    const mat = rows.reduce((s, r) => s + r.matriculas, 0);
    const ins = rows.reduce((s, r) => s + r.inscricoes, 0);
    return {
      cpmql: mql > 0 ? inv / mql : null,
      cac:   mat > 0 ? inv / mat : null,
      cpi:   ins > 0 ? inv / ins : null,
      conv:  mql > 0 ? (mat / mql) * 100 : null,
    };
  }, [rows]);

  // Totals
  const totals = useMemo<CampaignRow>(() => {
    const inv = rows.reduce((s, r) => s + r.investimento, 0);
    const mql = rows.reduce((s, r) => s + r.mql, 0);
    const mat = rows.reduce((s, r) => s + r.matriculas, 0);
    const ins = rows.reduce((s, r) => s + r.inscricoes, 0);
    return {
      campanha:     'TOTAL',
      investimento: inv,
      leads:        rows.reduce((s, r) => s + r.leads, 0),
      mql,
      inscricoes:   ins,
      matriculas:   mat,
      cpmql:        mql > 0 ? inv / mql  : null,
      cpi:          ins > 0 ? inv / ins  : null,
      cac:          mat > 0 ? inv / mat  : null,
      conv_mql_mat: mql > 0 ? (mat / mql) * 100 : null,
    };
  }, [rows]);

  // Sort + search
  const sorted = useMemo(() => {
    let r = rows.filter(row =>
      !search || row.campanha.toLowerCase().includes(search.toLowerCase())
    );
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortDir, search]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const thClass = (key: SortKey) =>
    `px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-violet-700 ${sortKey === key ? 'text-violet-700' : 'text-slate-500'}`;

  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Nenhum dado disponível.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Search */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar campanha</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nome da campanha..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Date start */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">De</label>
            <input
              type="date" value={start} min={minDate} max={end || maxDate}
              onChange={e => setStart(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
          </div>

          {/* Date end */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Até</label>
            <input
              type="date" value={end} min={start || minDate} max={maxDate}
              onChange={e => setEnd(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
          </div>

          {/* Tipo campanha */}
          {tipoCampanhaOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de campanha</label>
              <select
                value={tipoCampanha} onChange={e => setTipo(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white"
              >
                <option value="all">Todos os tipos</option>
                {tipoCampanhaOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Produto */}
          {produtoOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Produto</label>
              <select
                value={produto} onChange={e => setProduto(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white"
              >
                <option value="all">Todos os produtos</option>
                {produtoOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          {/* Summary pills */}
          <div className="flex gap-2 ml-auto flex-wrap">
            {[
              { label: 'Campanhas',      value: sorted.length },
              { label: 'Benchmark CPMql', value: benchmarks.cpmql != null ? fmtBRL(benchmarks.cpmql) : '—' },
              { label: 'Benchmark CAC',   value: benchmarks.cac   != null ? fmtBRL(benchmarks.cac)   : '—' },
            ].map(p => (
              <div key={p.label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-center">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">{p.label}</div>
                <div className="text-sm font-semibold text-slate-700">{p.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[260px]">
                  Campanha
                </th>
                {([
                  ['investimento', 'Investimento'],
                  ['leads',        'Leads'],
                  ['mql',          'MQLs'],
                  ['inscricoes',   'Inscritos'],
                  ['matriculas',   'Matrículas'],
                  ['cpmql',        'CPMql'],
                  ['cpi',          'CPI'],
                  ['cac',          'CAC'],
                  ['conv_mql_mat', 'Conv. MQL→Mat'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className={thClass(key)} onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      {label}
                      <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {sorted.map((row, i) => (
                <tr key={row.campanha} className={`hover:bg-violet-50/40 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[320px]">
                    <span className="line-clamp-2 leading-snug">{row.campanha}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtBRL(row.investimento)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtInt(row.leads)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtInt(row.mql)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtInt(row.inscricoes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{fmtInt(row.matriculas)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    {fmtBRL(row.cpmql)}
                    <EffBadge value={row.cpmql} benchmark={benchmarks.cpmql} lower={true} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtBRL(row.cpi)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    {fmtBRL(row.cac)}
                    <EffBadge value={row.cac} benchmark={benchmarks.cac} lower={true} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    {fmtPct(row.conv_mql_mat)}
                    <EffBadge value={row.conv_mql_mat} benchmark={benchmarks.conv} lower={false} />
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
                <td className="px-4 py-3 text-slate-800 text-xs uppercase tracking-wide">
                  Total ({sorted.length} campanhas)
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtBRL(totals.investimento)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.leads)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.mql)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.inscricoes)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtInt(totals.matriculas)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtBRL(totals.cpmql)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtBRL(totals.cpi)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtBRL(totals.cac)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-800">{fmtPct(totals.conv_mql_mat)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhuma campanha encontrada para os filtros selecionados.</p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-right">
        Todas as métricas agregadas por <code className="bg-slate-100 px-1 rounded">campaign_name</code> ·
        Join direto (campo presente nos dois lados da base)
      </p>
    </div>
  );
}
