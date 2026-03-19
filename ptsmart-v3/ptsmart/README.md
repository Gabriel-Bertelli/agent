# PTSmart v2 — Observabilidade de Mídias

Aplicação React + Vite para análise de campanhas de marketing educacional, com **dois agentes de IA** (Planner + Analyst), **dashboard interativo**, **tabela de dados** e **assistente analítico** que gera relatórios executivos em HTML.

---

## Funcionalidades

- **Carregamento paginado** do Supabase — baixa até 400K linhas sem travar o browser
- **Dashboard com KPIs automáticos**: investimento, leads, MQLs, SALs, matrículas, CAC, CPMql, conversões
- **Agente Planner**: converte linguagem natural em JSON de consulta com 8 exemplos few-shot
- **Agente Analyst**: gera relatórios HTML executivos com insights, alertas e recomendações
- **Memória de conversa**: as últimas 5 perguntas ficam em contexto para referências anafóricas ("agora por curso", "mês anterior")
- **Benchmarks dinâmicos**: CPMql, CAC e conversões globais da base são calculados e injetados no contexto do Analyst
- **Tipagem numérica robusta**: safeNum() trata strings, formato pt-BR (1.234,56), valores nulos e "(not set)"
- **Suporte a 3 provedores**: Google Gemini, OpenAI, Anthropic Claude — configurável por agente
- **Export CSV** dos dados filtrados
- **Deploy-ready** para Vercel (vercel.json incluso)

---

## Pré-requisitos

- Node.js 18+ / npm 9+

---

## Instalação local

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/ptsmart.git
cd ptsmart

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas chaves

# 4. Rode em desenvolvimento
npm run dev
# Acesse http://localhost:3000
```

---

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto (não comite este arquivo):

```env
# Pelo menos uma das três chaves abaixo é necessária
VITE_GEMINI_API_KEY=sua_chave_aqui
VITE_OPENAI_API_KEY=sua_chave_aqui
VITE_ANTHROPIC_API_KEY=sua_chave_aqui
```

Se as variáveis não estiverem no `.env.local`, o usuário pode configurar as chaves diretamente na interface (engrenagem ⚙ no Assistente IA). As chaves ficam salvas no `localStorage` do navegador.

---

## Deploy na Vercel

### Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Via GitHub (recomendado)

1. Faça push do projeto para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) → **Add New Project** → importe o repositório
3. Em **Environment Variables**, adicione:
   - `VITE_GEMINI_API_KEY` (e/ou OpenAI/Anthropic)
4. Clique **Deploy**

> O arquivo `vercel.json` já está configurado com o rewrite para SPA (`/* → /index.html`).

### Build settings (Vercel detecta automaticamente)

| Campo | Valor |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

---

## Estrutura do projeto

```
ptsmart/
├── src/
│   ├── App.tsx                          # Aplicação principal (conexão, dashboard, tabela)
│   ├── main.tsx                         # Entry point React
│   ├── index.css                        # Tailwind + estilos do relatório HTML
│   ├── components/
│   │   ├── AIAssistant.tsx              # Interface do assistente com memória de conversa
│   │   └── AISettingsPanel.tsx          # Modal de configuração dos agentes
│   └── lib/
│       ├── ai.ts                        # Dispatcher multi-provider (Gemini/OpenAI/Anthropic)
│       ├── aiPrompts.ts                 # System prompts com 8 exemplos few-shot
│       ├── analyticsExecutor.ts         # Motor de agregação local com safeNum()
│       ├── analystContextBuilder.ts     # Builder de contexto com benchmarks dinâmicos
│       └── analyticsSchema.ts           # Tipos TypeScript do PlannerJSON
├── .env.example                         # Template de variáveis de ambiente
├── .gitignore
├── vercel.json                          # Rewrite para SPA
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Configuração dos agentes

No Assistente IA, clique na engrenagem ⚙ para configurar:

| Agente | Função | Modelo recomendado |
|---|---|---|
| Planner | Interpreta a pergunta → JSON de consulta | `gemini-2.0-flash` ou `claude-haiku-4-5-20251001` |
| Analyst | Analisa resultados → relatório HTML | `gemini-2.5-pro-preview-06-05` ou `claude-sonnet-4-6` |

Use modelos rápidos (flash/mini) no Planner e modelos mais capazes no Analyst para otimizar custo e qualidade.

---

## Dicionário de KPIs

| Campo | Descrição |
|---|---|
| investimento | Valor investido em mídia (R$) |
| impressoes | Impressões nas plataformas |
| cliques | Cliques nas plataformas |
| leads | Total de leads captados |
| leads_inscricao | Leads por formulário de inscrição |
| mql | Leads qualificados (graduação completa) |
| inscricoes | Volume de inscrições (pré-matrícula) |
| tickets | SALs — chegaram ao call center |
| matriculas | Volume de matrículas realizadas |
| **cpmql** | investimento ÷ mql |
| **cac** | investimento ÷ matriculas |
| **cpsal** | investimento ÷ tickets |
| **conv_mql_mat** | (matriculas ÷ mql) × 100 |
| **conv_mql_ticket** | (tickets ÷ mql) × 100 |
| **conv_ticket_mat** | (matriculas ÷ tickets) × 100 |

---

## Exemplos de perguntas para o Assistente IA

- "Qual o resumo geral da base? (período, volume, totais)"
- "Qual o CAC e investimento por plataforma nos últimos 30 dias?"
- "Evolução mensal de MQLs e matrículas"
- "Top 10 cursos por investimento"
- "Compare os últimos 15 dias com o período anterior"
- "Qual o CPMql do Google Search este mês?"
- "Quais cursos têm melhor conversão MQL → Matrícula?"

---

## Notas de desenvolvimento

- Os dados brutos são processados **100% no browser** — o LLM recebe apenas o contexto analítico resumido (top/bottom grupos, sumário estatístico com p25/p50/p75)
- Para bases > 50K linhas no browser, filtre por produto e período na tela de conexão
- A função `safeNum()` normaliza campos numéricos em formato string (incluindo pt-BR com vírgula decimal)
- O `analyticsExecutor.ts` suporta granularidade diária, semanal e mensal
