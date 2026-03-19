import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Sparkles, Send, Bot, User, Settings2, Loader2,
  Code2, FileText, Trash2, Copy, Check, ChevronDown, ChevronUp, Lightbulb,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { AISettingsPanel } from './AISettingsPanel';
import { AIProviderConfig, getDefaultModel } from '../lib/ai';
import { callAI } from '../lib/ai';
import { PLANNER_PROMPT, ANALYST_PROMPT } from '../lib/aiPrompts';
import { executePlan } from '../lib/analyticsExecutor';
import { buildAnalystContext, buildBenchmarks } from '../lib/analystContextBuilder';

// ── Types ──────────────────────────────────────────────────────────────────

type Status = 'idle' | 'planning' | 'executing' | 'analyzing';

interface ConversationTurn {
  role: 'user' | 'ai';
  intent: string;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
  contentType: 'markdown' | 'html';
  debug?: any;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'Qual o resumo geral da base? (período, volume, totais)',
  'Qual o CAC e investimento por plataforma?',
  'Evolução mensal de MQLs e matrículas',
  'Top 10 cursos por investimento',
  'Compare os últimos 15 dias com o período anterior',
  'Qual o CPMql por tipo de campanha?',
  'Quais cursos têm melhor conversão MQL → Matrícula?',
];

const STATUS_LABELS: Record<Status, string> = {
  idle:      '',
  planning:  'Interpretando pergunta...',
  executing: 'Agregando dados localmente...',
  analyzing: 'Gerando relatório executivo...',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('O Planner não retornou um JSON válido.');
  return JSON.parse(m[1]);
}

function extractHtml(text: string): string {
  const t = text.trim();
  if (!t) return '<section class="report"><p>Nenhum conteúdo retornado.</p></section>';
  const m = t.match(/```html\s*([\s\S]*?)\s*```/i);
  return m ? m[1].trim() : t;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

function defaultConfig(role: 'planner' | 'analyst'): AIProviderConfig {
  const envGemini    = (import.meta as any).env?.VITE_GEMINI_API_KEY    || '';
  const envOpenAI    = (import.meta as any).env?.VITE_OPENAI_API_KEY    || '';
  const envAnthropic = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY || '';

  // Auto-detect provider from available env vars
  if (envAnthropic) return { provider: 'anthropic', model: getDefaultModel('anthropic', role), apiKey: envAnthropic };
  if (envGemini)    return { provider: 'gemini',    model: getDefaultModel('gemini', role),    apiKey: envGemini };
  if (envOpenAI)    return { provider: 'openai',    model: getDefaultModel('openai', role),    apiKey: envOpenAI };

  return { provider: 'gemini', model: getDefaultModel('gemini', role), apiKey: '' };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReportHtml({ html }: { html: string }) {
  const safe = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div className="report-shell">
      <div className="report-paper">
        <div className="report-html" dangerouslySetInnerHTML={{ __html: safe }} />
      </div>
    </div>
  );
}

function CopyButton({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <button
      onClick={handle}
      title="Copiar HTML do relatório"
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copiado!' : 'Copiar HTML'}
    </button>
  );
}

function DebugPanel({ debug }: { debug: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        <Code2 className="w-3.5 h-3.5" />
        Debug
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-slate-800 rounded-xl text-xs text-emerald-400 font-mono overflow-x-auto max-h-80 overflow-y-auto">
          {[
            { label: 'Planner JSON', key: 'plan' },
            { label: 'Executor Result', key: 'executionResult' },
          ].map(({ label, key }) => (
            <details key={key} className="mb-2">
              <summary className="cursor-pointer hover:text-emerald-300 text-slate-300 font-semibold">{label}</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(debug[key], null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function AIAssistant({ data }: { data: any[] }) {
  const [query, setQuery]       = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus]     = useState<Status>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [showDebug, setShowDebug]       = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Conversation memory (last 5 turns for anaphora resolution)
  const conversationHistory = useRef<ConversationTurn[]>([]);

  // Benchmarks computed once from the full dataset
  const benchmarks = useMemo(() => buildBenchmarks(data), [data]);

  const [plannerConfig, setPlannerConfig] = useState<AIProviderConfig>(() => {
    try {
      const s = localStorage.getItem('ai_planner_config');
      return s ? JSON.parse(s) : defaultConfig('planner');
    } catch { return defaultConfig('planner'); }
  });

  const [analystConfig, setAnalystConfig] = useState<AIProviderConfig>(() => {
    try {
      const s = localStorage.getItem('ai_analyst_config');
      return s ? JSON.parse(s) : defaultConfig('analyst');
    } catch { return defaultConfig('analyst'); }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleSaveSettings = (pc: AIProviderConfig, ac: AIProviderConfig) => {
    setPlannerConfig(pc);
    setAnalystConfig(ac);
    localStorage.setItem('ai_planner_config', JSON.stringify(pc));
    localStorage.setItem('ai_analyst_config', JSON.stringify(ac));
  };

  const handleClear = () => {
    setMessages([]);
    conversationHistory.current = [];
  };

  const handleAsk = async (userMessage: string) => {
    if (!userMessage.trim() || status !== 'idle') return;

    setMessages(prev => [...prev, { role: 'user', content: userMessage, contentType: 'markdown' }]);
    setQuery('');

    try {
      if (!plannerConfig.apiKey || !analystConfig.apiKey) {
        throw new Error('Configure as API Keys clicando na engrenagem ⚙ acima.');
      }

      // ── Step 1: Planner ─────────────────────────────────────────────────
      setStatus('planning');

      // Inject conversation history into the user prompt for context
      const historyContext = conversationHistory.current.length > 0
        ? `\n\nHistórico recente da conversa (para resolver referências como "esse", "esse produto", "período anterior"):\n${conversationHistory.current
            .slice(-4)
            .map(t => `- ${t.role === 'user' ? 'Usuário' : 'IA'}: ${t.intent}`)
            .join('\n')}`
        : '';

      const plannerUserPrompt = `${userMessage}${historyContext}`;
      const plannerResponse   = await callAI(plannerConfig, PLANNER_PROMPT, plannerUserPrompt, true);
      const plan              = extractJson(plannerResponse);

      // ── Step 2: Execute locally ─────────────────────────────────────────
      setStatus('executing');
      const availableKeys    = data.length > 0 ? Object.keys(data[0]) : [];
      const executionResult  = executePlan(plan, data, availableKeys);

      // ── Step 3: Analyst ─────────────────────────────────────────────────
      setStatus('analyzing');
      const analystContext = buildAnalystContext({
        userMessage,
        plan,
        executionResult,
        conversationHistory: conversationHistory.current,
        benchmarks,
      });

      const analystResponse = await callAI(analystConfig, ANALYST_PROMPT, analystContext, false);
      const analystHtml     = extractHtml(analystResponse);

      // Save to conversation memory
      conversationHistory.current.push(
        { role: 'user', intent: plan.intent || userMessage },
        { role: 'ai',   intent: `Relatório gerado: ${plan.intent}` }
      );
      // Keep only last 10 turns
      if (conversationHistory.current.length > 10) {
        conversationHistory.current = conversationHistory.current.slice(-10);
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: analystHtml,
          contentType: 'html',
          debug: { plan, executionResult },
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: `**Erro:** ${err.message}`,
          contentType: 'markdown',
        },
      ]);
    } finally {
      setStatus('idle');
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(query);
  };

  const hasApiKeys = plannerConfig.apiKey && analystConfig.apiKey;

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-800">Assistente Analítico</span>
          {data.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {data.length.toLocaleString('pt-BR')} linhas
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              title="Limpar conversa"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowDebug(v => !v)}
            title="Modo debug"
            className={`p-1.5 rounded-lg transition-colors ${showDebug ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
          >
            <Code2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Configurar agentes de IA"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center py-8 space-y-6">
            <div className="text-center space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 max-w-sm">
                Faça perguntas em linguagem natural sobre os dados carregados.
                O agente interpreta, consulta e gera relatórios executivos em HTML.
              </p>
              {!hasApiKeys && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium mt-2 hover:underline"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Configure as API Keys para começar
                </button>
              )}
            </div>

            {/* Suggested questions */}
            <div className="w-full max-w-xl space-y-2">
              <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                Sugestões de perguntas
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {SUGGESTED_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => handleAsk(q)}
                    disabled={!hasApiKeys || status !== 'idle'}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user'
                ? 'bg-slate-900 text-white'
                : 'bg-emerald-100 text-emerald-600'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5" />
                : <Bot className="w-3.5 h-3.5" />}
            </div>

            {/* Content */}
            <div className={`max-w-[90%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
              {msg.role === 'user' ? (
                <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 bg-slate-900 text-white text-sm">
                  {msg.content}
                </div>
              ) : (
                <>
                  {msg.contentType === 'html'
                    ? <ReportHtml html={msg.content} />
                    : (
                      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-100 text-slate-800 prose prose-sm prose-slate max-w-none text-sm">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )
                  }
                  {/* Toolbar under AI message */}
                  <div className="flex items-center gap-2 pl-1">
                    {msg.contentType === 'html' && <CopyButton html={msg.content} />}
                    {showDebug && msg.debug && <DebugPanel debug={msg.debug} />}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Status indicator */}
        {status !== 'idle' && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-tl-sm shadow-sm text-sm text-slate-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
              {STATUS_LABELS[status]}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white">
        <form onSubmit={onFormSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={hasApiKeys ? 'Pergunte sobre os dados...' : 'Configure as API Keys ⚙ para começar'}
            disabled={status !== 'idle' || !hasApiKeys}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={!query.trim() || status !== 'idle' || !hasApiKeys}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        {conversationHistory.current.length > 0 && (
          <p className="text-xs text-slate-400 mt-1.5 pl-1">
            {conversationHistory.current.length / 2} {conversationHistory.current.length / 2 === 1 ? 'pergunta' : 'perguntas'} na memória da conversa
          </p>
        )}
      </div>

      {/* ── Settings modal ── */}
      {showSettings && (
        <AISettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          initialPlannerConfig={plannerConfig}
          initialAnalystConfig={analystConfig}
        />
      )}
    </div>
  );
}
