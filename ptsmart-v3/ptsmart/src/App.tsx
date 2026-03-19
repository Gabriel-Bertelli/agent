import React, { useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Database, Filter, Loader2, AlertCircle, LogOut,
  LayoutDashboard, TableIcon as TableIconLucide, Sparkles,
  TrendingUp, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, LineChart, Line,
} from 'recharts';
import { format, isValid, subDays, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { AIAssistant } from './components/AIAssistant';

// ── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL       = 'https://ackubuuqjwsxlrluomuw.supabase.co';
const SUPABASE_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja3VidXVxandzeGxybHVvbXV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjYzMjYsImV4cCI6MjA4OTM0MjMyNn0.mER3M5pq2qmvcSUcGa2IChK4rwDHb6FOl0gx4OfA-SI';
const DEFAULT_TABLE      = 'base_data_tracker';

const PRODUCT_OPTIONS = [
  'Pós Artmed', 'PUCPR DIGITAL', 'HCOR', 'Pós PUCRJ',
  'Pós PUCCAMPINAS', 'DOM CABRAL', 'PUCRJ Collab', 'ESPM',
];

const LINE_COLORS = [
  '#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
];

// ── Utilities ──────────────────────────────────────────────────────────────

const parseLocalDate = (v: string | number | Date): Date => {
  if (!v) return new Date(NaN);
  if (v instanceof Date) return v;
  const s = String(v).split('T')[0].split(' ')[0];
  return new Date(`${s}T00:00:00`);
};

function safeNum(v: any): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sumField(rows: any[], field: string | undefined): number {
  if (!field) return 0;
  return rows.reduce((acc, d) => acc + safeNum(d[field]), 0);
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function deltaClass(v: number): string {
  return v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-slate-400';
}

function deltaSign(v: number): string {
  return v > 0 ? '▲' : v < 0 ? '▼' : '';
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, deltaValue,
}: { label: string; value: string; sub?: string; deltaValue?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1 leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {deltaValue !== undefined && (
        <p className={`text-xs font-medium mt-1 ${deltaClass(deltaValue)}`}>
          {deltaSign(deltaValue)} {Math.abs(deltaValue).toFixed(1)}% vs período anterior
        </p>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <LayoutDashboard className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p>Nenhum dado disponível.</p>
      </div>
    );
  }

  const keys = Object.keys(data[0]);
  const findKey = (...c: string[]) =>
    c.map(n => keys.find(k => k.toLowerCase() === n.toLowerCase())).find(Boolean);

  const dateField     = findKey('data', 'date', 'created_at');
  const campaignField = findKey('tipo_campanha', 'campaign_type');
  const productField  = findKey('produto', 'product');
  const invField      = findKey('investimento', 'investment', 'custo');
  const leadsField    = findKey('leads');
  const mqlField      = findKey('mql', 'mqls');
  const salField      = findKey('tickets', 'ticket');
  const matField      = findKey('matriculas', 'matricula');
  const impField      = findKey('impressoes', 'impressions');
  const cliqField     = findKey('cliques', 'clicks');

  // ── Filters ──
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [datePreset, setDatePreset]       = useState('all');
  const [timeGrouping, setTimeGrouping]   = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [comparePrev, setComparePrev]     = useState(false);
  const [selCampaign, setSelCampaign]     = useState('all');
  const [selProduct, setSelProduct]       = useState('all');

  // Chart KPI selectors
  const [barKpi, setBarKpi]   = useState(invField || '');
  const [lineKpi, setLineKpi] = useState(mqlField || invField || '');
  const [effKpi, setEffKpi]   = useState('cac');
  const [selEffCampaigns, setSelEffCampaigns] = useState<string[]>([]);

  const numericFields = useMemo(
    () => keys.filter(k => !/(id|_id|sk_)/i.test(k) && typeof data[0][k] === 'number'),
    [keys]
  );

  const campaigns = useMemo(
    () => campaignField ? Array.from(new Set(data.map(d => d[campaignField!]))).filter(Boolean) as string[] : [],
    [data, campaignField]
  );
  const products = useMemo(
    () => productField ? Array.from(new Set(data.map(d => d[productField!]))).filter(Boolean) as string[] : [],
    [data, productField]
  );

  React.useEffect(() => {
    if (selEffCampaigns.length === 0 && campaigns.length > 0) {
      setSelEffCampaigns(campaigns.slice(0, 4));
    }
  }, [campaigns.length]);

  // Date preset handler
  React.useEffect(() => {
    if (datePreset === 'all') { setStartDate(''); setEndDate(''); return; }
    const maxDate = data.length > 0 && dateField
      ? new Date(Math.max(...data.map(d => parseLocalDate(d[dateField!]).getTime()).filter(n => !isNaN(n))))
      : new Date();
    let start = new Date(maxDate);
    if      (datePreset === 'last_7')    start = subDays(maxDate, 6);
    else if (datePreset === 'last_15')   start = subDays(maxDate, 14);
    else if (datePreset === 'last_30')   start = subDays(maxDate, 29);
    else if (datePreset === 'this_month') start = startOfMonth(maxDate);
    else if (datePreset === 'last_month') {
      const lm = subMonths(maxDate, 1);
      setStartDate(format(startOfMonth(lm), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(lm), 'yyyy-MM-dd'));
      return;
    }
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(maxDate, 'yyyy-MM-dd'));
  }, [datePreset]);

  // ── Filtered data ──
  const { current, previous } = useMemo(() => {
    const sDate = startDate ? new Date(`${startDate}T00:00:00`) : new Date(0);
    const eDate = endDate   ? new Date(`${endDate}T23:59:59`)   : new Date(8640000000000000);

    const diffMs   = eDate.getTime() - sDate.getTime();
    const pEndDate = new Date(sDate.getTime() - 1);
    const pStartDate = new Date(pEndDate.getTime() - diffMs);

    const current:  any[] = [];
    const previous: any[] = [];

    for (const d of data) {
      // Product filter
      if (productField && selProduct !== 'all' && d[productField] !== selProduct) continue;
      // Campaign filter
      if (campaignField && selCampaign !== 'all' && d[campaignField] !== selCampaign) continue;

      if (dateField) {
        const dd = parseLocalDate(d[dateField]);
        if (dd >= sDate && dd <= eDate) { current.push(d); continue; }
        if (comparePrev && dd >= pStartDate && dd <= pEndDate) { previous.push(d); }
      } else {
        current.push(d);
      }
    }
    return { current, previous };
  }, [data, startDate, endDate, selCampaign, selProduct, comparePrev, dateField, campaignField, productField]);

  // ── KPI totals ──
  const totals = useMemo(() => {
    const inv  = sumField(current, invField);
    const leads = sumField(current, leadsField);
    const mql  = sumField(current, mqlField);
    const sal  = sumField(current, salField);
    const mat  = sumField(current, matField);
    const imp  = sumField(current, impField);
    const cliq = sumField(current, cliqField);
    return {
      inv, leads, mql, sal, mat, imp, cliq,
      cpmql:          mql  > 0 ? inv / mql  : 0,
      cac:            mat  > 0 ? inv / mat  : 0,
      cpsal:          sal  > 0 ? inv / sal  : 0,
      convMqlMat:     mql  > 0 ? (mat / mql)  * 100 : 0,
      convMqlSal:     mql  > 0 ? (sal / mql)  * 100 : 0,
      convSalMat:     sal  > 0 ? (mat / sal)  * 100 : 0,
    };
  }, [current, invField, leadsField, mqlField, salField, matField, impField, cliqField]);

  const prevTotals = useMemo(() => {
    if (!comparePrev || previous.length === 0) return null;
    const inv = sumField(previous, invField);
    const mql = sumField(previous, mqlField);
    const mat = sumField(previous, matField);
    return { inv, mql, mat, cac: mat > 0 ? inv / mat : 0 };
  }, [previous, invField, mqlField, matField, comparePrev]);

  const pctDelta = (curr: number, prev: number | undefined) =>
    prev && prev > 0 ? ((curr - prev) / prev) * 100 : undefined;

  // ── Time series ──
  const timeSeriesData = useMemo(() => {
    if (!dateField || current.length === 0) return [];
    const grouped: Record<string, { label: string; [k: string]: any }> = {};

    for (const d of current) {
      const dDate = parseLocalDate(d[dateField]);
      if (isNaN(dDate.getTime())) continue;
      let key: string;
      if      (timeGrouping === 'monthly') key = format(dDate, 'yyyy-MM');
      else if (timeGrouping === 'weekly')  key = format(dDate, "yyyy-'W'II");
      else                                  key = format(dDate, 'yyyy-MM-dd');

      if (!grouped[key]) grouped[key] = { label: key };
      const r = grouped[key];

      numericFields.forEach(f => { r[f] = (r[f] || 0) + safeNum(d[f]); });
    }

    return Object.values(grouped).sort((a, b) => a.label.localeCompare(b.label));
  }, [current, dateField, timeGrouping, numericFields]);

  // ── By campaign ──
  const byCampaign = useMemo(() => {
    if (!campaignField || current.length === 0) return [];
    const g: Record<string, any> = {};
    for (const d of current) {
      const k = String(d[campaignField] || 'Outros');
      if (!g[k]) g[k] = { name: k };
      numericFields.forEach(f => { g[k][f] = (g[k][f] || 0) + safeNum(d[f]); });
    }
    return Object.values(g).sort((a, b) => safeNum(b[barKpi]) - safeNum(a[barKpi]));
  }, [current, campaignField, numericFields, barKpi]);

  // ── Efficiency series (derived per campaign × time) ──
  type EffKey = 'cac' | 'cpmql' | 'cpsal' | 'conv_mql_mat' | 'conv_mql_ticket' | 'conv_ticket_mat';

  const calcEff = (row: any, metric: EffKey): number => {
    const inv = safeNum(row[invField!]);
    const mql = safeNum(row[mqlField!]);
    const sal = safeNum(row[salField!]);
    const mat = safeNum(row[matField!]);
    if (metric === 'cac')            return mat > 0 ? inv / mat  : 0;
    if (metric === 'cpmql')          return mql > 0 ? inv / mql  : 0;
    if (metric === 'cpsal')          return sal > 0 ? inv / sal  : 0;
    if (metric === 'conv_mql_mat')   return mql > 0 ? (mat / mql)  * 100 : 0;
    if (metric === 'conv_mql_ticket') return mql > 0 ? (sal / mql) * 100 : 0;
    if (metric === 'conv_ticket_mat') return sal > 0 ? (mat / sal) * 100 : 0;
    return 0;
  };

  const effData = useMemo(() => {
    if (!dateField || !campaignField || current.length === 0) return [];
    const g: Record<string, Record<string, any>> = {};
    for (const d of current) {
      const dk = timeGrouping === 'monthly' ? format(parseLocalDate(d[dateField]), 'yyyy-MM')
               : timeGrouping === 'weekly'  ? format(parseLocalDate(d[dateField]), "yyyy-'W'II")
               : format(parseLocalDate(d[dateField]), 'yyyy-MM-dd');
      const camp = String(d[campaignField] || 'Outros');
      if (!g[dk]) g[dk] = { label: dk };
      if (!g[dk][`_${camp}_inv`]) { g[dk][`_${camp}_inv`] = 0; g[dk][`_${camp}_mql`] = 0; g[dk][`_${camp}_sal`] = 0; g[dk][`_${camp}_mat`] = 0; }
      g[dk][`_${camp}_inv`] += safeNum(d[invField!]);
      g[dk][`_${camp}_mql`] += safeNum(d[mqlField!]);
      g[dk][`_${camp}_sal`] += safeNum(d[salField!]);
      g[dk][`_${camp}_mat`] += safeNum(d[matField!]);
    }

    return Object.values(g).sort((a, b) => a.label.localeCompare(b.label)).map(row => {
      const out: any = { label: row.label };
      for (const camp of selEffCampaigns) {
        const inv = row[`_${camp}_inv`] || 0;
        const mql = row[`_${camp}_mql`] || 0;
        const sal = row[`_${camp}_sal`] || 0;
        const mat = row[`_${camp}_mat`] || 0;
        const fake: any = {};
        if (invField)  fake[invField]  = inv;
        if (mqlField)  fake[mqlField]  = mql;
        if (salField)  fake[salField]  = sal;
        if (matField)  fake[matField]  = mat;
        out[camp] = calcEff(fake, effKpi as EffKey);
      }
      return out;
    });
  }, [current, dateField, campaignField, selEffCampaigns, timeGrouping, effKpi, invField, mqlField, salField, matField]);

  const toggleEffCamp = (c: string) =>
    setSelEffCampaigns(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const fmtEffVal = (v: number) =>
    ['conv_mql_mat','conv_mql_ticket','conv_ticket_mat'].includes(effKpi) ? fmtPct(v) : fmtBRL(v);

  const EFF_OPTIONS: { value: string; label: string }[] = [
    { value: 'cpmql',           label: 'CPMql' },
    { value: 'cac',             label: 'CAC' },
    { value: 'cpsal',           label: 'Custo por SAL' },
    { value: 'conv_mql_mat',    label: 'Conv MQL→Mat' },
    { value: 'conv_mql_ticket', label: 'Conv MQL→SAL' },
    { value: 'conv_ticket_mat', label: 'Conv SAL→Mat' },
  ];

  const SelectKpi = ({ value, onChange, options }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const numericOptions = numericFields.map(f => ({ value: f, label: f }));

  return (
    <div className="space-y-4">

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Date preset */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Período</label>
            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Todo o período</option>
              <option value="last_7">Últimos 7 dias</option>
              <option value="last_15">Últimos 15 dias</option>
              <option value="last_30">Últimos 30 dias</option>
              <option value="this_month">Este mês</option>
              <option value="last_month">Mês passado</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {datePreset === 'custom' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">De</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Até</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
            </>
          )}

          {/* Grouping */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Agrupamento</label>
            <select
              value={timeGrouping}
              onChange={e => setTimeGrouping(e.target.value as any)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>

          {/* Product */}
          {products.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Produto</label>
              <select value={selProduct} onChange={e => setSelProduct(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option value="all">Todos</option>
                {products.map(p => <option key={String(p)} value={String(p)}>{String(p)}</option>)}
              </select>
            </div>
          )}

          {/* Campaign */}
          {campaigns.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Tipo de campanha</label>
              <select value={selCampaign} onChange={e => setSelCampaign(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option value="all">Todos</option>
                {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Compare toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
            <div
              onClick={() => setComparePrev(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${comparePrev ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${comparePrev ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-xs font-medium text-slate-600">Comparar período anterior</span>
          </label>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          {current.length.toLocaleString('pt-BR')} linhas filtradas
          {comparePrev && previous.length > 0 && ` | ${previous.length.toLocaleString('pt-BR')} no período anterior`}
        </p>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="Investimento"   value={fmtBRL(totals.inv)}  deltaValue={pctDelta(totals.inv, prevTotals?.inv)} />
        <KpiCard label="Leads"          value={fmtCompact(totals.leads)} />
        <KpiCard label="MQLs"           value={fmtCompact(totals.mql)}   deltaValue={pctDelta(totals.mql, prevTotals?.mql)} />
        <KpiCard label="SALs (tickets)" value={fmtCompact(totals.sal)} />
        <KpiCard label="Matrículas"     value={fmtCompact(totals.mat)}  deltaValue={pctDelta(totals.mat, prevTotals?.mat)} />
        <KpiCard label="CAC"            value={totals.cac > 0 ? fmtBRL(totals.cac) : '—'} deltaValue={pctDelta(totals.cac, prevTotals?.cac)} />
        <KpiCard label="CPMql"          value={totals.cpmql > 0 ? fmtBRL(totals.cpmql) : '—'} />
        <KpiCard label="Custo por SAL"  value={totals.cpsal > 0 ? fmtBRL(totals.cpsal) : '—'} />
        <KpiCard label="Conv MQL→Mat"   value={totals.convMqlMat > 0 ? fmtPct(totals.convMqlMat) : '—'} />
        <KpiCard label="Conv MQL→SAL"   value={totals.convMqlSal > 0 ? fmtPct(totals.convMqlSal) : '—'} />
        <KpiCard label="Conv SAL→Mat"   value={totals.convSalMat > 0 ? fmtPct(totals.convSalMat) : '—'} />
        <KpiCard label="Impressões"     value={fmtCompact(totals.imp)} />
      </div>

      {/* ── Time series ── */}
      {timeSeriesData.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Evolução temporal
            </h3>
            <div className="flex items-center gap-2">
              <SelectKpi value={barKpi}  onChange={setBarKpi}  options={numericOptions} />
              <SelectKpi value={lineKpi} onChange={setLineKpi} options={numericOptions} />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend />
                {barKpi  && <Area yAxisId="left"  type="monotone" dataKey={barKpi}  stroke="#10b981" fill="url(#g1)" strokeWidth={2} dot={false} />}
                {lineKpi && <Area yAxisId="right" type="monotone" dataKey={lineKpi} stroke="#3b82f6" fill="url(#g2)" strokeWidth={2} dot={false} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── By campaign bar ── */}
      {byCampaign.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-slate-800">Por tipo de campanha</h3>
            <SelectKpi value={barKpi} onChange={setBarKpi} options={numericOptions} />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCampaign} layout="vertical" margin={{ left: 10, right: 32 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey={barKpi} fill="#10b981" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey={barKpi} position="right" formatter={fmtCompact} style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Efficiency by campaign (time series) ── */}
      {campaigns.length > 0 && effData.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Eficiência por tipo de campanha
              </h3>
              <SelectKpi value={effKpi} onChange={setEffKpi} options={EFF_OPTIONS} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {campaigns.map(c => (
                <button key={c} onClick={() => toggleEffCamp(c)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    selEffCampaigns.includes(c)
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={effData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtEffVal} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [fmtEffVal(v)]} />
                <Legend />
                {selEffCampaigns.map((c, i) => (
                  <Line key={c} type="monotone" dataKey={c}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App root ───────────────────────────────────────────────────────────────

type View = 'dashboard' | 'table' | 'ai';

export default function App() {
  const [isConnected, setIsConnected]     = useState(false);
  const [data, setData]                   = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [view, setView]                   = useState<View>('dashboard');
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Connection params
  const [tableName, setTableName]               = useState(DEFAULT_TABLE);
  const [dateColumn, setDateColumn]             = useState('data');
  const [startDateFilter, setStartDateFilter]   = useState('2026-01-01');
  const [endDateFilter, setEndDateFilter]       = useState('2026-12-31');
  const [orderByColumn, setOrderByColumn]       = useState('data');
  const [orderDirection, setOrderDirection]     = useState<'desc'|'asc'>('desc');
  const [productFilter, setProductFilter]       = useState<string[]>([]);
  const [productColumn, setProductColumn]       = useState('produto');
  const [maxRows, setMaxRows]                   = useState(50000);

  const toggleProduct = (p: string) =>
    setProductFilter(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDownloadProgress(0);

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore && allData.length < maxRows) {
        let q = supabase.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
        if (dateColumn && startDateFilter) q = q.gte(dateColumn, `${startDateFilter}T00:00:00`);
        if (dateColumn && endDateFilter)   q = q.lte(dateColumn, `${endDateFilter}T23:59:59`);
        if (productColumn && productFilter.length > 0) q = q.in(productColumn, productFilter);
        if (orderByColumn) q = q.order(orderByColumn, { ascending: orderDirection === 'asc' });

        const { data: rows, error: fetchError } = await q;
        if (fetchError) throw fetchError;

        if (rows && rows.length > 0) {
          allData = [...allData, ...rows];
          setDownloadProgress(allData.length);
          page++;
          if (rows.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // Numeric coercion on load — ensure number fields are numbers
      const coerced = allData.slice(0, maxRows).map(row => {
        const out: any = { ...row };
        for (const k of Object.keys(out)) {
          const v = out[k];
          if (typeof v === 'string' && v !== '' && v !== '(not set)') {
            const n = parseFloat(v.replace(',', '.'));
            if (Number.isFinite(n)) out[k] = n;
          }
        }
        return out;
      });

      setData(coerced);
      setIsConnected(true);
    } catch (err: any) {
      let msg = err.message || 'Erro ao conectar ou buscar dados.';
      if (/schema cache|relation|does not exist|Could not find/i.test(msg)) {
        msg = `Tabela "${tableName}" não encontrada. Verifique o nome (letras maiúsculas/minúsculas importam) e se está no schema "public".`;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setData([]);
    setError('');
  };

  const handleDownloadCSV = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const v = row[h];
          if (v === null || v === undefined) return '""';
          return `"${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `${tableName}_export.csv`;
    a.click();
  };

  // ── Connected view ──────────────────────────────────────────────────────
  if (isConnected) {
    const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
      { id: 'dashboard', label: 'Relatórios',      icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'table',     label: 'Dados brutos',     icon: <TableIconLucide className="w-4 h-4" /> },
      { id: 'ai',        label: 'Assistente IA',    icon: <Sparkles className="w-4 h-4" /> },
    ];

    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">

          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                PTSmart
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{tableName}</span>
                {' · '}{data.length.toLocaleString('pt-BR')} linhas carregadas
              </p>
            </div>
            <button onClick={handleDisconnect}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
              Desconectar
            </button>
          </header>

          {/* Nav tabs */}
          <nav className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm w-fit">
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView(n.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  view === n.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {n.icon}{n.label}
              </button>
            ))}
          </nav>

          {/* Views */}
          {view === 'dashboard' && <Dashboard data={data} />}

          {view === 'ai' && <AIAssistant data={data} />}

          {view === 'table' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">Dados brutos</h2>
                <button onClick={handleDownloadCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Baixar CSV
                </button>
              </div>
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      {Object.keys(data[0]).map(k => (
                        <th key={k} className="px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        {Object.values(row).map((v: any, j) => (
                          <td key={j} className="px-4 py-2 text-slate-700 whitespace-nowrap">
                            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
                {data.length.toLocaleString('pt-BR')} registros
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Login / connection screen ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8">
          <div className="w-11 h-11 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-5">
            <Filter className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-1">PTSmart</h1>
          <p className="text-sm text-slate-500 mb-7">Observabilidade de mídias — carregue os dados para começar.</p>

          <form onSubmit={handleConnect} className="space-y-4">

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Tabela</label>
              <input type="text" value={tableName} onChange={e => setTableName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Data inicial</label>
                <input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Data final</label>
                <input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Produto (opcional)</label>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_OPTIONS.map(p => (
                  <button key={p} type="button" onClick={() => toggleProduct(p)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                      productFilter.includes(p)
                        ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">Sem seleção = todos os produtos</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Ordenar por</label>
                <input type="text" value={orderByColumn} onChange={e => setOrderByColumn(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Ordem</label>
                <select value={orderDirection} onChange={e => setOrderDirection(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                  <option value="desc">Mais recentes</option>
                  <option value="asc">Mais antigos</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Limite máximo de linhas</label>
              <input type="number" min={100} max={400000} step={1000} value={maxRows}
                onChange={e => setMaxRows(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              <p className="text-[10px] text-slate-400">Recomendado: até 50.000 linhas para garantir performance no navegador.</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {downloadProgress > 0 ? `Baixando... (${downloadProgress.toLocaleString('pt-BR')})` : 'Conectando...'}
                </>
              ) : 'Carregar dados'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
