import React, { useState } from 'react';
import { Settings2, Save, X, Info } from 'lucide-react';
import { AIProvider, AIProviderConfig, getDefaultModel } from '../lib/ai';

interface AISettingsPanelProps {
  onClose: () => void;
  onSave: (plannerConfig: AIProviderConfig, analystConfig: AIProviderConfig) => void;
  initialPlannerConfig: AIProviderConfig;
  initialAnalystConfig: AIProviderConfig;
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini:    'Google Gemini',
  openai:    'OpenAI',
  anthropic: 'Anthropic Claude',
};

const PROVIDER_HINTS: Record<AIProvider, { planner: string; analyst: string }> = {
  gemini:    { planner: 'gemini-2.0-flash',               analyst: 'gemini-2.5-pro-preview-06-05' },
  openai:    { planner: 'gpt-4o-mini',                    analyst: 'gpt-4o' },
  anthropic: { planner: 'claude-haiku-4-5-20251001',      analyst: 'claude-sonnet-4-6' },
};

function ProviderSection({
  title,
  subtitle,
  config,
  role,
  onChange,
}: {
  title: string;
  subtitle: string;
  config: AIProviderConfig;
  role: 'planner' | 'analyst';
  onChange: (c: AIProviderConfig) => void;
}) {
  const hint = PROVIDER_HINTS[config.provider];

  const handleProviderChange = (provider: AIProvider) => {
    onChange({ ...config, provider, model: getDefaultModel(provider, role) });
  };

  return (
    <div className="space-y-3">
      <div className="border-b border-slate-100 pb-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Provedor</label>
          <select
            value={config.provider}
            onChange={e => handleProviderChange(e.target.value as AIProvider)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map(p => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Modelo</label>
          <input
            type="text"
            value={config.model}
            onChange={e => onChange({ ...config, model: e.target.value })}
            placeholder={hint[role]}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-slate-600">API Key</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={e => onChange({ ...config, apiKey: e.target.value })}
            placeholder={`Chave da API ${PROVIDER_LABELS[config.provider]}`}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
        <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500">
          Modelo padrão recomendado: <code className="bg-white px-1 rounded border border-slate-200">{hint[role]}</code>
        </p>
      </div>
    </div>
  );
}

export function AISettingsPanel({
  onClose,
  onSave,
  initialPlannerConfig,
  initialAnalystConfig,
}: AISettingsPanelProps) {
  const [plannerConfig, setPlannerConfig] = useState<AIProviderConfig>(initialPlannerConfig);
  const [analystConfig, setAnalystConfig] = useState<AIProviderConfig>(initialAnalystConfig);

  const handleSave = () => {
    onSave(plannerConfig, analystConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-emerald-600" />
            Configurações dos Agentes de IA
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <ProviderSection
            title="Agente 1 — Planner"
            subtitle="Interpreta a pergunta e gera o plano de consulta. Use modelos rápidos e baratos."
            config={plannerConfig}
            role="planner"
            onChange={setPlannerConfig}
          />
          <ProviderSection
            title="Agente 2 — Analyst"
            subtitle="Analisa os resultados e gera o relatório executivo em HTML. Use modelos mais capazes."
            config={analystConfig}
            role="analyst"
            onChange={setAnalystConfig}
          />

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
            <strong>Atenção:</strong> as chaves de API são armazenadas apenas no localStorage do navegador.
            Nunca compartilhe esta janela aberta ou exporte localStorage em ambientes compartilhados.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
