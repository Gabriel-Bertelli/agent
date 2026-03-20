import React, { useMemo, useState } from 'react';
import { GraduationCap, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, ChevronsUpDown, Filter, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface CourseRow {
  curso: string;
  investimento: number;
  leads: number;
  mql: number;
  inscricoes: number;
  matriculas: number;
  cpmql: number | null;
  cpi: number | null;       // custo por inscrição
  cac: number | null;
  conv_mql_mat: number | null;
}

type SortKey = keyof CourseRow;
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
  const n = parseFloat(s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'));
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

const fmtBRL  = (v: number | null) => v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt  = (v: number)        => v === 0 ? '0' : v.toLocaleString('pt-BR');
const fmtPct  = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;

// ── Aggregation using the dual-field business rule ─────────────────────────
//
//  course_name_campanha → investimento (mídia side)
//  course_name_captacao → leads, mql, inscricoes, matriculas (captação side)
//
// Two passes: aggregate each side separately, then merge by course name.

function aggregateCourses(
  data: any[],
  availableKeys: string[],
  opts: { start: string; end: string; tipoCampanha: string }
): CourseRow[] {
  if (!data.length) return [];

  const dateField        = findField(availableKeys, 'data', 'date', 'created_at');
  const invField         = findField(availableKeys, 'investimento', 'investment', 'custo');
  const leadsField       = findField(availableKeys, 'leads');
  const mqlField         = findField(availableKeys, 'mql', 'mqls');
  const inscField        = findField(availableKeys, 'inscricoes', 'inscrições', 'inscricao');
  const matField         = findField(availableKeys, 'matriculas', 'matricula', 'matrículas');
  const tipoCampanhaField = findField(availableKeys, 'tipo_campanha');
  const courseNameCampanha = findField(availableKeys, 'course_name_campanha');
  const courseNameCaptacao = findField(availableKeys, 'course_name_captacao');

  const sDate = opts.start ? new Date(`${opts.start}T00:00:00`) : null;
  const eDate = opts.end   ? new Date(`${opts.end}T23:59:59`)   : null;

  // Base filter: date + tipo_campanha (non-course dimensions)
  const passBase = (d: any): boolean => {
    if (dateField && sDate && eDate) {
      const dd = parseLocalDate(d[dateField]);
      if (isNaN(dd.getTime()) || dd < sDate || dd > eDate) return false;
    }
    if (opts.tipoCampanha && opts.tipoCampanha !== 'all' && tipoCampanhaField) {
      if (d[tipoCampanhaField] !== opts.tipoCampanha) return false;
    }
    return true;
  };

  const baseRows = data.filter(passBase);

  // Pass 1 — mídia: group by course_name_campanha, accumulate investimento
  const midiaMap: Record<string, { inv: number }> = {};
  for (const d of baseRows) {
    if (!courseNameCampanha) continue;
    const nome = String(d[courseNameCampanha] ?? '').trim();
    if (!nome || nome === '(not set)') continue;
    if (!midiaMap[nome]) midiaMap[nome] = { inv: 0 };
    if (invField) midiaMap[nome].inv += safeNum(d[invField]);
  }

  // Pass 2 — captação: group by course_name_captacao, accumulate conversions
  const captMap: Record<string, { leads: number; mql: number; ins: number; mat: number }> = {};
  for (const d of baseRows) {
    if (!courseNameCaptacao) continue;
    const nome = String(d[courseNameCaptacao] ?? '').trim();
    if (!nome || nome === '(not set)') continue;
    if (!captMap[nome]) captMap[nome] = { leads: 0, mql: 0, ins: 0, mat: 0 };
    if (leadsField) captMap[nome].leads += safeNum(d[leadsField]);
    if (mqlField)   captMap[nome].mql   += safeNum(d[mqlField]);
    if (inscField)  captMap[nome].ins   += safeNum(d[inscField]);
    if (matField)   captMap[nome].mat   += safeNum(d[matField]);
  }

  // Merge — union of all course names from both sides
  const allCourses = new Set([...Object.keys(midiaMap), ...Object.keys(captMap)]);
  const rows: CourseRow[] = [];

  for (const curso of allCourses) {
    const m = midiaMap[curso] ?? { inv: 0 };
    const c = captMap[curso]  ?? { leads: 0, mql: 0, ins: 0, mat: 0 };

    const inv = m.inv;
    const mql = c.mql;
    const mat = c.mat;
    const ins = c.ins;

    rows.push({
      curso,
      investimento:  inv,
      leads:         c.leads,
      mql,
      inscricoes:    ins,
      matriculas:    mat,
      cpmql:         mql > 0 ? inv / mql  : null,
      cpi:           ins > 0 ? inv / ins  : null,
      cac:           mat > 0 ? inv / mat  : null,
      conv_mql_mat:  mql > 0 ? (mat / mql) * 100 : null,
    });
  }

  return rows;
}

// ── Sort icon ──────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" />
    : <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />;
}

// ── Badge for efficiency metrics ───────────────────────────────────────────

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

export function CourseTable({ data }: { data: any[] }) {
  const availableKeys = useMemo(() => data.length ? Object.keys(data[0]) : [], [data]);

  // Date limits from data
  const { minDate, maxDate } = useMemo(() => {
    const dateField = findField(availableKeys, 'data', 'date', 'created_at');
    if (!dateField || !data.length) return { minDate: '', maxDate: '' };
    const dates = data.map(d => parseLocalDate(d[dateField])).filter(d => !isNaN(d.getTime()));
    if (!dates.length) return { minDate: '', maxDate: '' };
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    return {
      minDate: min.toISOString().split('T')[0],
      maxDate: max.toISOString().split('T')[0],
    };
  }, [data, availableKeys]);

  // Unique tipo_campanha values
  const tipoCampanhaOptions = useMemo(() => {
    const field = findField(availableKeys, 'tipo_campanha');
    if (!field) return [];
    return Array.from(new Set(data.map(d => d[field]).filter(Boolean))).sort() as string[];
  }, [data, availableKeys]);

  // Filters
  const [start, setStart]       = useState(minDate);
  const [end, setEnd]           = useState(maxDate);
  const [tipoCampanha, setTipo] = useState('all');
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('investimento');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');

  // Sync date state when data loads
  React.useEffect(() => { if (minDate && !start) setStart(minDate); }, [minDate]);
  React.useEffect(() => { if (maxDate && !end)   setEnd(maxDate);   }, [maxDate]);

  const rows = useMemo(
    () => aggregateCourses(data, availableKeys, { start, end, tipoCampanha }),
    [data, availableKeys, start, end, tipoCampanha]
  );

  // Global benchmarks (unfiltered)
  const benchmarks = useMemo(() => {
    if (!rows.length) return { cpmql: null, cac: null, cpi: null, conv: null };
    const totalInv = rows.reduce((s, r) => s + r.investimento, 0);
    const totalMql = rows.reduce((s, r) => s + r.mql, 0);
    const totalMat = rows.reduce((s, r) => s + r.matriculas, 0);
    const totalIns = rows.reduce((s, r) => s + r.inscricoes, 0);
    return {
      cpmql: totalMql > 0 ? totalInv / totalMql : null,
      cac:   totalMat > 0 ? totalInv / totalMat : null,
      cpi:   totalIns > 0 ? totalInv / totalIns : null,
      conv:  totalMql > 0 ? (totalMat / totalMql) * 100 : null,
    };
  }, [rows]);

  // Totals row
  const totals = useMemo<CourseRow>(() => {
    const inv = rows.reduce((s, r) => s + r.investimento, 0);
    const mql = rows.reduce((s, r) => s + r.mql, 0);
    const mat = rows.reduce((s, r) => s + r.matriculas, 0);
    const ins = rows.reduce((s, r) => s + r.inscricoes, 0);
    return {
      curso: 'TOTAL',
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
    let r = rows.filter(row => !search || row.curso.toLowerCase().includes(search.toLowerCase()));
    r = [...r].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return r;
  }, [rows, sortKey, sortDir, search]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const thClass = (key: SortKey) =>
    `px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-emerald-700 ${sortKey === key ? 'text-emerald-700' : 'text-slate-500'}`;

  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-20" />
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
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar curso</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nome do curso..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
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
              type="date"
              value={start}
              min={minDate}
              max={end || maxDate}
              onChange={e => setStart(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
          </div>

          {/* Date end */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Até</label>
            <input
              type="date"
              value={end}
              min={start || minDate}
              max={maxDate}
              onChange={e => setEnd(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
          </div>

          {/* Tipo campanha */}
          {tipoCampanhaOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de campanha</label>
              <select
                value={tipoCampanha}
                onChange={e => setTipo(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent bg-white"
              >
                <option value="all">Todos os tipos</option>
                {tipoCampanhaOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Summary pills */}
          <div className="flex gap-2 ml-auto flex-wrap">
            {[
              { label: 'Cursos', value: sorted.length },
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
                {/* Curso — left aligned, not sortable */}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[220px]">
                  Curso
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
                <tr key={row.curso} className={`hover:bg-emerald-50/40 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[280px]">
                    <span className="line-clamp-2 leading-snug">{row.curso}</span>
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

            {/* ── Totals row ── */}
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
                <td className="px-4 py-3 text-slate-800 text-xs uppercase tracking-wide">
                  Total ({sorted.length} cursos)
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
            <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum curso encontrado para os filtros selecionados.</p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-right">
        Investimento agregado por <code className="bg-slate-100 px-1 rounded">course_name_campanha</code> ·
        Leads, MQLs, Inscritos e Matrículas por <code className="bg-slate-100 px-1 rounded">course_name_captacao</code>
      </p>
    </div>
  );
}
