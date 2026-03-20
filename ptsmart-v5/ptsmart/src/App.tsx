/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Database, Loader2, AlertCircle, LogOut, LayoutDashboard, Filter, Calendar, Tag, Box, TrendingUp, Sparkles, Download, Table as TableIcon, Lock, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { BarChart, Bar, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, LineChart, Line, ComposedChart } from 'recharts';
import { format, isValid } from 'date-fns';
import { AIAssistant } from './components/AIAssistant';
import { CourseTable } from './components/CourseTable';

// Configurações do Supabase (Pré-configuradas)
const SUPABASE_URL = 'https://ackubuuqjwsxlrluomuw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja3VidXVxandzeGxybHVvbXV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjYzMjYsImV4cCI6MjA4OTM0MjMyNn0.mER3M5pq2qmvcSUcGa2IChK4rwDHb6FOl0gx4OfA-SI';
const DEFAULT_TABLE_NAME = 'base_data_tracker';

const PRODUCT_OPTIONS = [
  'Pós Artmed',
  'PUCPR DIGITAL',
  'HCOR',
  'Pós PUCRJ',
  'Pós PUCCAMPINAS',
  'DOM CABRAL',
  'PUCRJ Collab',
  'ESPM'
];

const parseLocalDate = (dateStr: string | number | Date) => {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).split('T')[0].split(' ')[0];
  return new Date(`${str}T00:00:00`);
};

function Dashboard({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        <LayoutDashboard className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Nenhum dado disponível para gerar relatórios.</p>
      </div>
    );
  }

  const keys = Object.keys(data[0]);

  // Auto-detect fields
  const dateField = keys.find(k => /data|date|created|time/i.test(k));
  const campaignField = keys.includes('tipo_campanha') ? 'tipo_campanha' : keys.find(k => /campanha|campaign|tipo/i.test(k));
  const productField = keys.includes('produto') ? 'produto' : keys.find(k => /produto|product/i.test(k));
  const numericFields = keys.filter(k => typeof data[0][k] === 'number' && !/id/i.test(k));

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [timeGrouping, setTimeGrouping] = useState('daily');
  const [comparePrevious, setComparePrevious] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState('all');

  const [selectedBarKpi, setSelectedBarKpi] = useState(numericFields[0] || '');
  const [selectedLineKpi, setSelectedLineKpi] = useState(numericFields[1] || numericFields[0] || '');

  const [compositionKpi, setCompositionKpi] = useState(numericFields[0] || '');
  const [compositionDimension, setCompositionDimension] = useState('tipo_campanha');

  const [stackedKpi, setStackedKpi] = useState(numericFields[0] || '');
  const [stackedDimension, setStackedDimension] = useState('tipo_campanha');

  const [stackedKpi2, setStackedKpi2] = useState(numericFields[1] || numericFields[0] || '');
  const [stackedDimension2, setStackedDimension2] = useState('tipo_campanha');

  const [efficiencyMetric, setEfficiencyMetric] = useState('cac');
  const [selectedEfficiencyCampaigns, setSelectedEfficiencyCampaigns] = useState<string[]>([]);

  // Extract unique values
  const campaigns = campaignField ? Array.from(new Set(data.map(d => d[campaignField]))).filter(Boolean) : [];
  const products = productField ? Array.from(new Set(data.map(d => d[productField]))).filter(Boolean) : [];

  React.useEffect(() => {
    if (selectedEfficiencyCampaigns.length === 0 && campaigns.length > 0) {
      setSelectedEfficiencyCampaigns(campaigns.slice(0, 3).map(String));
    }
  }, [campaigns, selectedEfficiencyCampaigns.length]);

  // Handle date presets
  React.useEffect(() => {
    if (datePreset === 'custom') return;

    let end = new Date();
    if (data.length > 0 && dateField) {
      const dates = data.map(d => parseLocalDate(d[dateField])).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        end = new Date(Math.max(...dates.map(d => d.getTime())));
      }
    }
    const start = new Date(end);

    if (datePreset === 'last_7') {
      start.setDate(end.getDate() - 6);
    } else if (datePreset === 'last_15') {
      start.setDate(end.getDate() - 14);
    } else if (datePreset === 'last_30') {
      start.setDate(end.getDate() - 29);
    }

    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
    setComparePrevious(true);
  }, [datePreset, data, dateField]);

  // Filter data
  const { filteredData, previousFilteredData, prevStartDate, prevEndDate } = useMemo(() => {
    const current: any[] = [];
    const previous: any[] = [];

    const sDate = startDate ? new Date(`${startDate}T00:00:00`) : new Date(0);
    const eDate = endDate ? new Date(`${endDate}T23:59:59`) : new Date();

    const diffDays = Math.round(Math.abs(eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24));

    const pEndDate = new Date(sDate);
    pEndDate.setDate(pEndDate.getDate() - 1);
    pEndDate.setHours(23, 59, 59, 999);

    const pStartDate = new Date(pEndDate);
    pStartDate.setDate(pStartDate.getDate() - diffDays + 1);
    pStartDate.setHours(0, 0, 0, 0);

    const prevStartDateStr = format(pStartDate, 'yyyy-MM-dd');
    const prevEndDateStr = format(pEndDate, 'yyyy-MM-dd');

    data.forEach(d => {
      let match = true;

      if (campaignField && selectedCampaign !== 'all') {
        if (d[campaignField] !== selectedCampaign) match = false;
      }
      if (productField && selectedProduct !== 'all') {
        if (d[productField] !== selectedProduct) match = false;
      }

      if (match) {
        if (dateField && startDate && endDate) {
          const dDate = parseLocalDate(d[dateField]);
          if (dDate >= sDate && dDate <= eDate) {
            current.push(d);
          } else if (comparePrevious && dDate >= pStartDate && dDate <= pEndDate) {
            previous.push(d);
          }
        } else {
          current.push(d);
        }
      }
    });

    return {
      filteredData: current,
      previousFilteredData: previous,
      prevStartDate: prevStartDateStr,
      prevEndDate: prevEndDateStr
    };
  }, [data, dateField, campaignField, productField, startDate, endDate, selectedCampaign, selectedProduct, comparePrevious]);

  const getField = (possibleNames: string[]) =>
    numericFields.find(f => possibleNames.some(n => f.toLowerCase() === n.toLowerCase()));

  const invField = getField(['investimento', 'cost', 'custo', 'valor']);
  const mqlField = getField(['mqls', 'mql', 'leads']);
  const ticketField = getField(['tickets', 'ticket']);
  const matField = getField(['matriculas', 'matrículas', 'matricula', 'vendas']);

  const chartableKpis = useMemo(() => [
    ...numericFields,
    'cpmql',
    'cac',
    'cpsal',
    'conv_mql_mat',
    'conv_mql_ticket',
    'conv_ticket_mat'
  ], [numericFields]);

  const formatChartLabel = (value: string) => {
    if (!value) return '';

    try {
      if (timeGrouping === 'monthly') {
        const d = new Date(`${value}-01T00:00:00`);
        return isValid(d) ? format(d, 'MMM/yy') : value;
      }

      const d = new Date(`${value}T00:00:00`);
      return isValid(d) ? format(d, 'dd/MM') : value;
    } catch {
      return value;
    }
  };

  const generateDateBuckets = (start: string, end: string, grouping: string) => {
    const buckets: string[] = [];
    let curr = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T23:59:59');

    if (!isValid(curr) || !isValid(e)) return [];

    while (curr <= e) {
      let key = '';
      if (grouping === 'weekly') {
        const weekStart = new Date(curr);
        weekStart.setDate(curr.getDate() - curr.getDay());
        key = format(weekStart, 'yyyy-MM-dd');
      } else if (grouping === 'monthly') {
        key = format(curr, 'yyyy-MM');
      } else {
        key = format(curr, 'yyyy-MM-dd');
      }
      if (!buckets.includes(key)) buckets.push(key);
      curr.setDate(curr.getDate() + 1);
    }

    return buckets;
  };

  const groupData = (dataset: any[], grouping: string, start: string, end: string) => {
    let s = start;
    let e = end;

    if (!s || !e) {
      const dates = dataset.map(d => String(d[dateField])).filter(Boolean).sort();
      if (dates.length > 0) {
        if (!s) s = dates[0];
        if (!e) e = dates[dates.length - 1];
      }
    }

    const buckets = generateDateBuckets(s, e, grouping);
    const grouped = buckets.reduce((acc, b) => {
      acc[b] = { [dateField as string]: b };
      numericFields.forEach(f => acc[b][f] = 0);
      return acc;
    }, {} as Record<string, any>);

    dataset.forEach(curr => {
      let dateKey = String(curr[dateField as string]);
      try {
        const d = parseLocalDate(dateKey);
        if (isValid(d)) {
          if (grouping === 'monthly') {
            dateKey = format(d, 'yyyy-MM');
          } else if (grouping === 'weekly') {
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            dateKey = format(weekStart, 'yyyy-MM-dd');
          } else {
            dateKey = format(d, 'yyyy-MM-dd');
          }
        }
      } catch (err) {}

      if (grouped[dateKey]) {
        numericFields.forEach(f => {
          grouped[dateKey][f] += (Number(curr[f]) || 0);
        });
      } else if (!s || !e) {
        if (!grouped[dateKey]) {
          grouped[dateKey] = { [dateField as string]: dateKey };
          numericFields.forEach(f => grouped[dateKey][f] = 0);
        }
        numericFields.forEach(f => {
          grouped[dateKey][f] += (Number(curr[f]) || 0);
        });
      }
    });

    const result = (!s || !e)
      ? Object.values(grouped).sort((a: any, b: any) => a[dateField as string].localeCompare(b[dateField as string]))
      : buckets.map(b => grouped[b]);

    return result.map((day: any) => {
      const inv = invField ? day[invField] : 0;
      const mql = mqlField ? day[mqlField] : 0;
      const sal = ticketField ? day[ticketField] : 0;
      const mat = matField ? day[matField] : 0;

      day.cpmql = mql > 0 ? inv / mql : 0;
      day.cac = mat > 0 ? inv / mat : 0;
      day.cpsal = sal > 0 ? inv / sal : 0;
      day.conv_mql_mat = mql > 0 ? (mat / mql) * 100 : 0;
      day.conv_mql_ticket = mql > 0 ? (sal / mql) * 100 : 0;
      day.conv_ticket_mat = sal > 0 ? (mat / sal) * 100 : 0;

      return day;
    });
  };

  const isCurrencyMetric = (metric: string) => {
    return [
      invField,
      'investimento',
      'cpmql',
      'cac',
      'cpsal'
    ].includes(metric);
  };

  const isPercentageMetric = (metric: string) => {
    return ['conv_mql_mat', 'conv_mql_ticket', 'conv_ticket_mat'].includes(metric);
  };

  const getDisplayKpiName = (kpi: string) => {
    if (!kpi) return '';
    if (ticketField && kpi === ticketField) return 'SAL';
    if (kpi === 'cpmql') return 'CPMQL';
    if (kpi === 'cac') return 'CAC';
    if (kpi === 'cpsal') return 'Custo por SAL';
    if (kpi === 'conv_mql_mat') return 'Conv. MQL > Mat';
    if (kpi === 'conv_mql_ticket') return 'Conv. MQL > SAL';
    if (kpi === 'conv_ticket_mat') return 'Conv. SAL > Mat';
    return kpi.replace(/_/g, ' ');
  };

  const formatMetricValue = (metric: string, value: number, options?: { compact?: boolean }) => {
    if (isPercentageMetric(metric)) {
      return `${new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: options?.compact ? 0 : 1
      }).format(value)}%`;
    }

    if (isCurrencyMetric(metric)) {
      if (options?.compact) {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          notation: 'compact',
          maximumFractionDigits: 2
        }).format(value);
      }
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 2
      }).format(value);
    }

    return new Intl.NumberFormat('pt-BR', {
      notation: options?.compact ? 'compact' : 'standard',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Aggregate by date
  const aggregatedData = useMemo(() => {
    if (!dateField) return filteredData;
    return groupData(filteredData, timeGrouping, startDate, endDate);
  }, [filteredData, dateField, numericFields, invField, mqlField, ticketField, matField, timeGrouping, startDate, endDate]);

  const previousAggregatedData = useMemo(() => {
    if (!dateField || !comparePrevious) return [];
    return groupData(previousFilteredData, timeGrouping, prevStartDate, prevEndDate);
  }, [previousFilteredData, dateField, numericFields, invField, mqlField, ticketField, matField, timeGrouping, comparePrevious, prevStartDate, prevEndDate]);

  const comparativeData = useMemo(() => {
    if (!dateField) return [];

    return aggregatedData.map((d, i) => {
      const baseLabel = d[dateField] || `Período ${i + 1}`;
      const prev = previousAggregatedData[i] || {};

      const res: any = {
        ...d,
        label: formatChartLabel(baseLabel),
        rawLabel: baseLabel,
        currentDate: baseLabel,
        previousDate: prev[dateField]
      };

      chartableKpis.forEach(kpi => {
        res[`current_${kpi}`] = d[kpi] || 0;
        res[`previous_${kpi}`] = prev[kpi] || 0;
      });

      return res;
    });
  }, [aggregatedData, previousAggregatedData, chartableKpis, dateField, timeGrouping]);

  const getDimensionColumn = (dim: string, kpi: string) => {
    if (dim === 'curso') {
      const kpiLower = kpi.toLowerCase();
      if (['investimento', 'cost', 'custo', 'valor', 'impressões', 'impressoes', 'tickets', 'ticket', 'cliques', 'clique'].some(k => kpiLower.includes(k))) {
        return 'curso_nome_campanha';
      }
      if (['leads', 'lead', 'mqls', 'mql', 'inscritos', 'inscrito', 'matriculas', 'matrículas', 'matricula'].some(k => kpiLower.includes(k))) {
        return 'curso_nome_captacao';
      }
      return 'curso_nome_campanha';
    }
    return dim;
  };

  const compositionData = useMemo(() => {
    if (!compositionKpi || !compositionDimension) return [];

    const dimCol = getDimensionColumn(compositionDimension, compositionKpi);

    const grouped = filteredData.reduce((acc, curr) => {
      const key = String(curr[dimCol] || 'Não Informado');
      if (!acc[key]) {
        acc[key] = { name: key, value: 0 };
      }
      acc[key].value += (Number(curr[compositionKpi]) || 0);
      return acc;
    }, {} as Record<string, { name: string, value: number }>);

    const sorted = (Object.values(grouped) as { name: string, value: number }[]).sort((a, b) => b.value - a.value);
    const totalValue = sorted.reduce((sum, item) => sum + item.value, 0);

    return sorted.map(item => ({
      ...item,
      label: `${new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(item.value)} (${totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0}%)`
    }));
  }, [filteredData, compositionKpi, compositionDimension]);

  const buildStackedData = (kpi: string, dimension: string) => {
    if (!dateField || !kpi || !dimension) return [];

    const dimCol = getDimensionColumn(dimension, kpi);

    const grouped = filteredData.reduce((acc, curr) => {
      let dateKey = String(curr[dateField]);
      try {
        const d = parseLocalDate(dateKey);
        if (isValid(d)) {
          if (timeGrouping === 'monthly') {
            dateKey = format(d, 'yyyy-MM');
          } else if (timeGrouping === 'weekly') {
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            dateKey = format(weekStart, 'yyyy-MM-dd');
          } else {
            dateKey = format(d, 'yyyy-MM-dd');
          }
        }
      } catch (e) {}

      const dimValue = String(curr[dimCol] || 'Não Informado');

      if (!acc[dateKey]) {
        acc[dateKey] = { [dateField]: dateKey };
      }

      if (!acc[dateKey][dimValue]) {
        acc[dateKey][dimValue] = 0;
      }

      acc[dateKey][dimValue] += (Number(curr[kpi]) || 0);
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).sort((a: any, b: any) => a[dateField].localeCompare(b[dateField]));
  };

  const stackedData = useMemo(() => buildStackedData(stackedKpi, stackedDimension), [filteredData, dateField, stackedKpi, stackedDimension, timeGrouping]);
  const stackedData2 = useMemo(() => buildStackedData(stackedKpi2, stackedDimension2), [filteredData, dateField, stackedKpi2, stackedDimension2, timeGrouping]);

  const getStackedKeys = (rows: any[]) => {
    const keySet = new Set<string>();
    rows.forEach(d => {
      Object.keys(d).forEach(k => {
        if (k !== dateField) keySet.add(k);
      });
    });
    return Array.from(keySet);
  };

  const stackedKeys = useMemo(() => getStackedKeys(stackedData), [stackedData, dateField]);
  const stackedKeys2 = useMemo(() => getStackedKeys(stackedData2), [stackedData2, dateField]);

  const efficiencyByCampaignData = useMemo(() => {
    if (!dateField || !campaignField || selectedEfficiencyCampaigns.length === 0) return [];

    const grouped = filteredData.reduce((acc, curr) => {
      const campaign = String(curr[campaignField] || 'Não Informado');
      if (!selectedEfficiencyCampaigns.includes(campaign)) return acc;

      let dateKey = String(curr[dateField]);
      try {
        const d = parseLocalDate(dateKey);
        if (isValid(d)) {
          if (timeGrouping === 'monthly') {
            dateKey = format(d, 'yyyy-MM');
          } else if (timeGrouping === 'weekly') {
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            dateKey = format(weekStart, 'yyyy-MM-dd');
          } else {
            dateKey = format(d, 'yyyy-MM-dd');
          }
        }
      } catch (e) {}

      if (!acc[dateKey]) {
        acc[dateKey] = { rawDate: dateKey, label: formatChartLabel(dateKey) };
      }

      if (!acc[dateKey][campaign]) {
        acc[dateKey][campaign] = { inv: 0, mql: 0, sal: 0, mat: 0 };
      }

      acc[dateKey][campaign].inv += invField ? Number(curr[invField]) || 0 : 0;
      acc[dateKey][campaign].mql += mqlField ? Number(curr[mqlField]) || 0 : 0;
      acc[dateKey][campaign].sal += ticketField ? Number(curr[ticketField]) || 0 : 0;
      acc[dateKey][campaign].mat += matField ? Number(curr[matField]) || 0 : 0;

      return acc;
    }, {} as Record<string, any>);

    const rows = Object.values(grouped).sort((a: any, b: any) => String(a.rawDate).localeCompare(String(b.rawDate)));

    return rows.map((row: any) => {
      const output: any = {
        label: row.label,
        rawDate: row.rawDate
      };

      selectedEfficiencyCampaigns.forEach(campaign => {
        const agg = row[campaign] || { inv: 0, mql: 0, sal: 0, mat: 0 };
        const inv = agg.inv || 0;
        const mql = agg.mql || 0;
        const sal = agg.sal || 0;
        const mat = agg.mat || 0;

        let value = 0;
        if (efficiencyMetric === 'cpmql') value = mql > 0 ? inv / mql : 0;
        if (efficiencyMetric === 'cac') value = mat > 0 ? inv / mat : 0;
        if (efficiencyMetric === 'cpsal') value = sal > 0 ? inv / sal : 0;
        if (efficiencyMetric === 'conv_mql_ticket') value = mql > 0 ? (sal / mql) * 100 : 0;
        if (efficiencyMetric === 'conv_ticket_mat') value = sal > 0 ? (mat / sal) * 100 : 0;
        if (efficiencyMetric === 'conv_mql_mat') value = mql > 0 ? (mat / mql) * 100 : 0;

        output[campaign] = value;
      });

      return output;
    });
  }, [filteredData, dateField, campaignField, selectedEfficiencyCampaigns, efficiencyMetric, timeGrouping, invField, mqlField, ticketField, matField]);

  const STACK_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#84cc16', '#14b8a6'];
  const LINE_COLORS = ['#0f5aa6', '#ff0000', '#f4b400', '#10b981', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'];

  // Calculate totals for summary cards
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    numericFields.forEach(f => t[f] = 0);
    filteredData.forEach(d => {
      numericFields.forEach(f => {
        t[f] += (Number(d[f]) || 0);
      });
    });
    return t;
  }, [filteredData, numericFields]);

  const previousTotals = useMemo(() => {
    const t: Record<string, number> = {};
    numericFields.forEach(f => t[f] = 0);
    if (!comparePrevious) return t;
    previousFilteredData.forEach(d => {
      numericFields.forEach(f => {
        t[f] += (Number(d[f]) || 0);
      });
    });
    return t;
  }, [previousFilteredData, numericFields, comparePrevious]);

  const invTotal = invField ? totals[invField] : 0;
  const mqlTotal = mqlField ? totals[mqlField] : 0;
  const salTotal = ticketField ? totals[ticketField] : 0;
  const matTotal = matField ? totals[matField] : 0;

  const prevInvTotal = invField ? previousTotals[invField] : 0;
  const prevMqlTotal = mqlField ? previousTotals[mqlField] : 0;
  const prevSalTotal = ticketField ? previousTotals[ticketField] : 0;
  const prevMatTotal = matField ? previousTotals[matField] : 0;

  const cpmql = mqlTotal > 0 ? invTotal / mqlTotal : 0;
  const cac = matTotal > 0 ? invTotal / matTotal : 0;
  const cpsal = salTotal > 0 ? invTotal / salTotal : 0;
  const conv_mql_mat = mqlTotal > 0 ? (matTotal / mqlTotal) * 100 : 0;
  const conv_mql_ticket = mqlTotal > 0 ? (salTotal / mqlTotal) * 100 : 0;
  const conv_ticket_mat = salTotal > 0 ? (matTotal / salTotal) * 100 : 0;

  const prevCpmql = prevMqlTotal > 0 ? prevInvTotal / prevMqlTotal : 0;
  const prevCac = prevMatTotal > 0 ? prevInvTotal / prevMatTotal : 0;
  const prevCpsal = prevSalTotal > 0 ? prevInvTotal / prevSalTotal : 0;
  const prevConv_mql_mat = prevMqlTotal > 0 ? (prevMatTotal / prevMqlTotal) * 100 : 0;
  const prevConv_mql_ticket = prevMqlTotal > 0 ? (prevSalTotal / prevMqlTotal) * 100 : 0;
  const prevConv_ticket_mat = prevSalTotal > 0 ? (prevMatTotal / prevSalTotal) * 100 : 0;

  const summaryKpis = [
    { id: invField || 'investimento', label: 'Investimento', value: invTotal, prevValue: prevInvTotal, isCurrency: true, isPercentage: false, invertTrend: true },
    { id: mqlField || 'mqls', label: 'MQLs', value: mqlTotal, prevValue: prevMqlTotal, isCurrency: false, isPercentage: false, invertTrend: false },
    { id: ticketField || 'tickets', label: 'SAL', value: salTotal, prevValue: prevSalTotal, isCurrency: false, isPercentage: false, invertTrend: false },
    { id: matField || 'matriculas', label: 'Matrículas', value: matTotal, prevValue: prevMatTotal, isCurrency: false, isPercentage: false, invertTrend: false },
    { id: 'cpmql', label: 'CPMQL', value: cpmql, prevValue: prevCpmql, isCurrency: true, isPercentage: false, invertTrend: true },
    { id: 'cac', label: 'CAC', value: cac, prevValue: prevCac, isCurrency: true, isPercentage: false, invertTrend: true },
    { id: 'cpsal', label: 'Custo por SAL', value: cpsal, prevValue: prevCpsal, isCurrency: true, isPercentage: false, invertTrend: true },
    { id: 'conv_mql_mat', label: 'Conv. MQL > Mat', value: conv_mql_mat, prevValue: prevConv_mql_mat, isCurrency: false, isPercentage: true, invertTrend: false },
    { id: 'conv_mql_ticket', label: 'Conv. MQL > SAL', value: conv_mql_ticket, prevValue: prevConv_mql_ticket, isCurrency: false, isPercentage: true, invertTrend: false },
    { id: 'conv_ticket_mat', label: 'Conv. SAL > Mat', value: conv_ticket_mat, prevValue: prevConv_ticket_mat, isCurrency: false, isPercentage: true, invertTrend: false },
  ];

  const toggleEfficiencyCampaign = (campaign: string) => {
    setSelectedEfficiencyCampaigns(prev =>
      prev.includes(campaign)
        ? prev.filter(item => item !== campaign)
        : [...prev, campaign]
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold">
          <Filter className="w-5 h-5 text-emerald-600" />
          Filtros do Relatório
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Período
            </label>
            <select
              value={datePreset}
              onChange={e => {
                setDatePreset(e.target.value);
                if (e.target.value !== 'custom') setComparePrevious(true);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="custom">Personalizado</option>
              <option value="last_7">Últimos 7 dias</option>
              <option value="last_15">Últimos 15 dias</option>
              <option value="last_30">Últimos 30 dias</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" /> Visualização
            </label>
            <select
              value={timeGrouping}
              onChange={e => setTimeGrouping(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>

          {dateField && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Data Inicial
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setDatePreset('custom'); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Data Final
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setDatePreset('custom'); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </>
          )}

          {campaignField && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Tipo de Campanha
              </label>
              <select
                value={selectedCampaign}
                onChange={e => setSelectedCampaign(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">Todas as Campanhas</option>
                {campaigns.map(c => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
              </select>
            </div>
          )}

          {productField && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" /> Produto
              </label>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">Todos os Produtos</option>
                {products.map(p => <option key={String(p)} value={String(p)}>{String(p)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {numericFields.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>Não encontramos colunas numéricas nos seus dados para gerar gráficos de KPI. Certifique-se de que a tabela possui colunas com números.</p>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {summaryKpis.map(kpi => {
              const isClickable = kpi.id && chartableKpis.includes(kpi.id);

              let trendIndicator = null;
              if (comparePrevious && kpi.prevValue !== undefined) {
                const diff = kpi.value - kpi.prevValue;
                const perc = kpi.prevValue > 0 ? (diff / kpi.prevValue) * 100 : 0;
                const isPositive = diff > 0;
                const isNegative = diff < 0;

                const isGood = kpi.invertTrend ? isNegative : isPositive;
                const isBad = kpi.invertTrend ? isPositive : isNegative;

                let colorClass = 'text-slate-500 bg-slate-100';
                if (isGood) colorClass = 'text-emerald-700 bg-emerald-100';
                if (isBad) colorClass = 'text-rose-700 bg-rose-100';

                trendIndicator = (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}>
                    {isPositive ? '+' : ''}{perc.toFixed(1)}%
                  </span>
                );
              }

              return (
                <div
                  key={kpi.label}
                  onClick={() => isClickable && setSelectedBarKpi(kpi.id)}
                  className={`bg-white p-4 rounded-xl shadow-sm border transition-all ${isClickable ? 'cursor-pointer hover:border-emerald-300 hover:shadow-md' : ''} ${selectedBarKpi === kpi.id ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/20' : 'border-slate-200'}`}
                >
                  <div className="flex items-start justify-between mb-2 h-8">
                    <div className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider leading-tight max-w-[70%]">{kpi.label}</div>
                    {trendIndicator}
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {kpi.isCurrency
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpi.value)
                      : kpi.isPercentage
                        ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(kpi.value) + '%'
                        : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(kpi.value)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main combo chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Evolução: <span className="text-emerald-600">{getDisplayKpiName(selectedBarKpi)}</span> + <span className="text-amber-600">{getDisplayKpiName(selectedLineKpi)}</span>
              </h3>

              <div className="flex items-center gap-3">
                <select
                  value={selectedBarKpi}
                  onChange={e => setSelectedBarKpi(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {chartableKpis.map(f => <option key={f} value={f}>{getDisplayKpiName(f)}</option>)}
                </select>

                <select
                  value={selectedLineKpi}
                  onChange={e => setSelectedLineKpi(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {chartableKpis.map(f => <option key={f} value={f}>{getDisplayKpiName(f)}</option>)}
                </select>
              </div>
            </div>

            <div className="h-[420px] w-full">
              {comparativeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={comparativeData} margin={{ top: 20, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dy={10}
                      height={40}
                      minTickGap={24}
                    />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => isPercentageMetric(selectedBarKpi) ? `${val}%` : new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => isPercentageMetric(selectedLineKpi) ? `${val}%` : new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string) => {
                        const metric = name === 'barValue' ? selectedBarKpi : selectedLineKpi;
                        const label = name === 'barValue' ? getDisplayKpiName(selectedBarKpi) : getDisplayKpiName(selectedLineKpi);
                        return [formatMetricValue(metric, value), label];
                      }}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.currentDate || label;
                        }
                        return label;
                      }}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Legend
                      formatter={(value) => {
                        if (value === 'barValue') return getDisplayKpiName(selectedBarKpi);
                        if (value === 'lineValue') return getDisplayKpiName(selectedLineKpi);
                        return value;
                      }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey={`current_${selectedBarKpi}`}
                      name="barValue"
                      fill="#3e668f"
                      radius={[4, 4, 0, 0]}
                    >
                      <LabelList
                        dataKey={`current_${selectedBarKpi}`}
                        position="top"
                        formatter={(value: number) => formatMetricValue(selectedBarKpi, value, { compact: true })}
                        style={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
                      />
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={`current_${selectedLineKpi}`}
                      name="lineValue"
                      stroke="#e97817"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    >
                      <LabelList
                        dataKey={`current_${selectedLineKpi}`}
                        position="top"
                        formatter={(value: number) => formatMetricValue(selectedLineKpi, value, { compact: false })}
                        style={{ fill: '#e97817', fontSize: 11, fontWeight: 700 }}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Nenhum dado para o período/filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* Composition Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Box className="w-5 h-5 text-emerald-600" />
                Composição: <span className="capitalize text-emerald-600">{getDisplayKpiName(compositionKpi)}</span> por <span className="capitalize text-emerald-600">{compositionDimension.replace('_', ' ')}</span>
              </h3>

              <div className="flex items-center gap-3">
                <select
                  value={compositionDimension}
                  onChange={e => setCompositionDimension(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="tipo_campanha">Tipo de Campanha</option>
                  <option value="curso">Curso</option>
                  <option value="plataforma">Plataforma</option>
                  <option value="campanha">Campanha</option>
                </select>

                <select
                  value={compositionKpi}
                  onChange={e => setCompositionKpi(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {chartableKpis.map(f => <option key={f} value={f}>{getDisplayKpiName(f)}</option>)}
                </select>
              </div>
            </div>

            <div className="h-[400px] w-full">
              {compositionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compositionData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      dy={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [formatMetricValue(compositionKpi, value), getDisplayKpiName(compositionKpi)]}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="label" position="top" style={{ fill: '#64748b', fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Nenhum dado para o período/filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* Stacked Bar Chart 1 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Evolução Empilhada: <span className="capitalize text-emerald-600">{getDisplayKpiName(stackedKpi)}</span> por <span className="capitalize text-emerald-600">{stackedDimension.replace('_', ' ')}</span>
              </h3>

              <div className="flex items-center gap-3">
                <select
                  value={stackedDimension}
                  onChange={e => setStackedDimension(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="tipo_campanha">Tipo de Campanha</option>
                  <option value="curso">Curso</option>
                  <option value="plataforma">Plataforma</option>
                  <option value="campanha">Campanha</option>
                </select>

                <select
                  value={stackedKpi}
                  onChange={e => setStackedKpi(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {chartableKpis.map(f => <option key={f} value={f}>{getDisplayKpiName(f)}</option>)}
                </select>
              </div>
            </div>

            <div className="h-[400px] w-full">
              {stackedData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackedData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey={dateField || ''}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dy={10}
                      height={40}
                      minTickGap={24}
                      tickFormatter={(value) => formatChartLabel(String(value))}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string) => [formatMetricValue(stackedKpi, value), name]}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    {stackedKeys.map((key, index) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={STACK_COLORS[index % STACK_COLORS.length]}>
                        <LabelList dataKey={key} position="center" fill="#fff" fontSize={10} formatter={(v: number) => v > 0 ? new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v) : ''} />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Nenhum dado para o período/filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* Stacked Bar Chart 2 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Evolução Empilhada 2: <span className="capitalize text-emerald-600">{getDisplayKpiName(stackedKpi2)}</span> por <span className="capitalize text-emerald-600">{stackedDimension2.replace('_', ' ')}</span>
              </h3>

              <div className="flex items-center gap-3">
                <select
                  value={stackedDimension2}
                  onChange={e => setStackedDimension2(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="tipo_campanha">Tipo de Campanha</option>
                  <option value="curso">Curso</option>
                  <option value="plataforma">Plataforma</option>
                  <option value="campanha">Campanha</option>
                </select>

                <select
                  value={stackedKpi2}
                  onChange={e => setStackedKpi2(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {chartableKpis.map(f => <option key={f} value={f}>{getDisplayKpiName(f)}</option>)}
                </select>
              </div>
            </div>

            <div className="h-[400px] w-full">
              {stackedData2.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackedData2} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey={dateField || ''}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dy={10}
                      height={40}
                      minTickGap={24}
                      tickFormatter={(value) => formatChartLabel(String(value))}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(val)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string) => [formatMetricValue(stackedKpi2, value), name]}
                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    {stackedKeys2.map((key, index) => (
                      <Bar key={key} dataKey={key} stackId="b" fill={STACK_COLORS[index % STACK_COLORS.length]}>
                        <LabelList dataKey={key} position="center" fill="#fff" fontSize={10} formatter={(v: number) => v > 0 ? new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v) : ''} />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Nenhum dado para o período/filtros selecionados.
                </div>
              )}
            </div>
          </div>

          {/* Efficiency Metrics small charts */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Evolução de Métricas de Eficiência
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">CPMQL (R$)</h4>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparativeData} margin={{ top: 5, right: 5, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)} />
                      <Tooltip
                        formatter={(v: number) => [formatMetricValue('cpmql', v), 'Atual']}
                        labelFormatter={(label, payload) => payload && payload.length > 0 ? (payload[0].payload.currentDate || label) : label}
                        labelStyle={{ fontSize: 12, color: '#64748b' }}
                        contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="current_cpmql" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">CAC (R$)</h4>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparativeData} margin={{ top: 5, right: 5, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)} />
                      <Tooltip
                        formatter={(v: number) => [formatMetricValue('cac', v), 'Atual']}
                        labelFormatter={(label, payload) => payload && payload.length > 0 ? (payload[0].payload.currentDate || label) : label}
                        labelStyle={{ fontSize: 12, color: '#64748b' }}
                        contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="current_cac" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">Conv. SAL {'>'} Matrícula (%)</h4>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparativeData} margin={{ top: 5, right: 5, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => v + '%'} />
                      <Tooltip
                        formatter={(v: number) => [formatMetricValue('conv_ticket_mat', v), 'Atual']}
                        labelFormatter={(label, payload) => payload && payload.length > 0 ? (payload[0].payload.currentDate || label) : label}
                        labelStyle={{ fontSize: 12, color: '#64748b' }}
                        contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="current_conv_ticket_mat" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Efficiency by campaign */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  Evolução - <span className="text-emerald-600">{getDisplayKpiName(efficiencyMetric)}</span> por Tipo de Campanha
                </h3>

                <select
                  value={efficiencyMetric}
                  onChange={e => setEfficiencyMetric(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="cpmql">CPMQL</option>
                  <option value="cac">CAC</option>
                  <option value="cpsal">Custo por SAL</option>
                  <option value="conv_mql_ticket">Conv. MQL &gt; SAL</option>
                  <option value="conv_ticket_mat">Conv. SAL &gt; Mat</option>
                  <option value="conv_mql_mat">Conv. MQL &gt; Mat</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {campaigns.map(c => {
                  const value = String(c);
                  const active = selectedEfficiencyCampaigns.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleEfficiencyCampaign(value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-[420px] w-full">
              {efficiencyByCampaignData.length > 0 && selectedEfficiencyCampaigns.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={efficiencyByCampaignData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      minTickGap={24}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(v) => isPercentageMetric(efficiencyMetric) ? `${Math.round(v)}%` : formatMetricValue(efficiencyMetric, v, { compact: true })}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number, name: string) => [formatMetricValue(efficiencyMetric, value), name]}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.rawDate || label;
                        }
                        return label;
                      }}
                    />
                    <Legend />
                    {selectedEfficiencyCampaigns.map((campaign, index) => (
                      <Line
                        key={campaign}
                        type="monotone"
                        dataKey={campaign}
                        stroke={LINE_COLORS[index % LINE_COLORS.length]}
                        strokeWidth={3}
                        dot={false}
                      >
                        <LabelList
                          dataKey={campaign}
                          position="top"
                          formatter={(value: number) => value > 0 ? formatMetricValue(efficiencyMetric, value) : ''}
                          style={{ fontSize: 11, fontWeight: 700 }}
                        />
                      </Line>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Selecione ao menos um tipo de campanha para visualizar a evolução.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Auth credentials (simple client-side gate) ────────────────────────────
const AUTH_USER = 'performancemaisa';
const AUTH_PASS = 'batermeta';

function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [user, setUser]   = useState('');
  const [pass, setPass]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (user === AUTH_USER && pass === AUTH_PASS) {
        sessionStorage.setItem('ptsmart_auth', '1');
        onAuth();
      } else {
        setErr('Login ou senha incorretos.');
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="px-8 pt-8 pb-6">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 mb-1">PTSmart</h1>
          <p className="text-sm text-slate-500 mb-7">Observabilidade de Mídias — acesso restrito.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Login</label>
              <input
                type="text"
                value={user}
                onChange={e => { setUser(e.target.value); setErr(''); }}
                autoComplete="username"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="seu login"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setErr(''); }}
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('ptsmart_auth') === '1');
  const [isConnected, setIsConnected] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'table' | 'dashboard' | 'ai' | 'courses'>('dashboard');
  const [tableName, setTableName] = useState(DEFAULT_TABLE_NAME);
  
  // Advanced filters
  const [dateColumn, setDateColumn] = useState('data');
  const [startDateFilter, setStartDateFilter] = useState('2026-01-01');
  const [endDateFilter, setEndDateFilter] = useState('2026-12-31');
  const [orderByColumn, setOrderByColumn] = useState('data');
  const [orderDirection, setOrderDirection] = useState<'desc' | 'asc'>('desc');
  const [productColumn, setProductColumn] = useState('produto');
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState(50000);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDownloadProgress(0);

    try {
      if (!SUPABASE_URL.startsWith('https://') || !SUPABASE_URL.includes('.supabase.co')) {
        throw new Error('A URL do Supabase pré-configurada parece inválida. Edite o código para inserir a URL correta.');
      }
      if (!SUPABASE_ANON_KEY) {
        throw new Error('A Public Key pré-configurada é inválida. Edite o código para inserir a chave correta.');
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      
      let allData: any[] = [];
      let hasMore = true;
      let page = 0;
      const pageSize = 1000;

      while (hasMore && allData.length < maxRows) {
        let query = supabase.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);

        if (dateColumn && startDateFilter) {
          query = query.gte(dateColumn, `${startDateFilter}T00:00:00`);
        }
        if (dateColumn && endDateFilter) {
          query = query.lte(dateColumn, `${endDateFilter}T23:59:59`);
        }
        
        if (productColumn && productFilter.length > 0) {
          query = query.in(productColumn, productFilter);
        }
        
        if (orderByColumn) {
          query = query.order(orderByColumn, { ascending: orderDirection === 'asc' });
        }

        const { data: fetchedData, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        if (fetchedData && fetchedData.length > 0) {
          allData = [...allData, ...fetchedData];
          setDownloadProgress(allData.length);
          page++;
          if (fetchedData.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // Coerce numeric strings to numbers on load.
      // Skip date fields, ID fields, name/text fields, and values that look like dates.
      const DATE_LIKE = /^\d{4}-\d{2}/;
      const SKIP_KEY  = /data|date|time|created|updated|name|nome|campanha|curso|produto|platform|tipo|campaign/i;
      const coerced = allData.slice(0, maxRows).map((row: any) => {
        const out: any = { ...row };
        for (const k of Object.keys(out)) {
          if (SKIP_KEY.test(k)) continue;
          const v = out[k];
          if (typeof v === 'string' && v !== '' && v !== '(not set)' && v !== 'not_set' && !DATE_LIKE.test(v)) {
            const normalized = v.replace(/\./g, '').replace(',', '.');
            const n = parseFloat(normalized);
            if (Number.isFinite(n) && n >= 0) out[k] = n;
          }
        }
        return out;
      });
      setData(coerced);
      setIsConnected(true);
    } catch (err: any) {
      let errorMessage = err.message || 'Erro ao conectar ou buscar dados. Verifique suas credenciais e o nome da tabela.';
      
      // Handle specific Supabase errors
      if (errorMessage.includes('schema cache') || errorMessage.includes('Could not find the table') || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        errorMessage = `A tabela "${tableName}" não foi encontrada. Verifique se: 1) O nome está correto (letras maiúsculas/minúsculas importam). 2) A tabela está no schema "public". 3) Se você acabou de criá-la, recarregue o "schema cache" no painel do Supabase (Settings > API).`;
      }

      setError(errorMessage);
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
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const val = row[header];
          if (val === null || val === undefined) return '""';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tableName}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!authed) {
    return <LoginScreen onAuth={() => setAuthed(true)} />;
  }

  if (isConnected) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-900">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Database className="w-6 h-6 text-emerald-600" />
                Supabase Viewer
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Conectado à tabela <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{tableName}</span>
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Desconectar
            </button>
          </header>

          <div className="flex gap-6 border-b border-slate-200">
            <button 
              onClick={() => setView('dashboard')} 
              className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${view === 'dashboard' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Relatórios
            </button>
            <button 
              onClick={() => setView('table')} 
              className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${view === 'table' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <TableIcon className="w-4 h-4" />
              Tabela de Dados
            </button>
            <button 
              onClick={() => setView('courses')} 
              className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${view === 'courses' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <GraduationCap className="w-4 h-4" />
              Cursos
            </button>
            <button 
              onClick={() => setView('ai')} 
              className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${view === 'ai' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles className="w-4 h-4" />
              Assistente IA
            </button>
          </div>

          {view === 'dashboard' ? (
            <Dashboard data={data} />
          ) : view === 'courses' ? (
            <CourseTable data={data} />
          ) : view === 'ai' ? (
            <AIAssistant data={data} />
          ) : (
            <main className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50/50">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-emerald-600" />
                  Dados Brutos
                </h2>
                <button
                  onClick={handleDownloadCSV}
                  disabled={data.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar CSV
                </button>
              </div>
              {data.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <TableIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Nenhum dado encontrado na tabela.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        {Object.keys(data[0]).map((key) => (
                          <th key={key} className="px-6 py-3 whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-6 py-4 whitespace-nowrap text-slate-700">
                              {typeof val === 'object' && val !== null 
                                ? JSON.stringify(val) 
                                : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                <span>Mostrando até {data.length} registros</span>
                <span>Total: {data.length}</span>
              </div>
            </main>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans text-slate-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
        <div className="p-8">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
            <Filter className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Carregar Dados</h1>
          <p className="text-slate-500 text-sm mb-8">
            Selecione os filtros abaixo para baixar os dados do Supabase.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Nome da Tabela</label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Data Inicial</label>
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Data Final</label>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Produto (Opcional)</label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_OPTIONS.map(prod => {
                  const isSelected = productFilter.includes(prod);
                  return (
                    <button
                      key={prod}
                      type="button"
                      onClick={() => {
                        setProductFilter(prev => 
                          prev.includes(prod) 
                            ? prev.filter(p => p !== prod)
                            : [...prev, prod]
                        );
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                        isSelected 
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-800' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {prod}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500">Se nenhum for selecionado, todos os produtos serão carregados.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Ordenar por</label>
                <input
                  type="text"
                  value={orderByColumn}
                  onChange={(e) => setOrderByColumn(e.target.value)}
                  placeholder="ex: data ou id"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Ordem</label>
                <select
                  value={orderDirection}
                  onChange={(e) => setOrderDirection(e.target.value as 'desc' | 'asc')}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                >
                  <option value="desc">Mais recentes</option>
                  <option value="asc">Mais antigos</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Limite Máximo de Linhas</label>
              <input
                type="number"
                min="100"
                max="400000"
                step="1000"
                value={maxRows}
                onChange={(e) => setMaxRows(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
              />
              <p className="text-[10px] text-slate-500">Bases muito grandes podem travar o navegador. Recomendado: até 50.000.</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-sm text-red-600 mt-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-6"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {downloadProgress > 0 ? `Baixando... (${downloadProgress})` : 'Conectando...'}
                </>
              ) : (
                'Carregar Dados'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
