import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

function cleanStr(value: string | undefined | null): string {
  return value?.replace(/[^\x20-\x7E]/g, '').trim() || '';
}

export function getDefaultModel(provider: AIProvider, role: 'planner' | 'analyst' = 'analyst'): string {
  if (provider === 'gemini')    return role === 'planner' ? 'gemini-2.0-flash' : 'gemini-2.5-pro-preview-06-05';
  if (provider === 'anthropic') return role === 'planner' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
  // openai
  return role === 'planner' ? 'gpt-4o-mini' : 'gpt-4o';
}

// ── Anthropic ──────────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      `Anthropic API error ${response.status}`;
    throw new Error(msg);
  }

  return Array.isArray(payload?.content)
    ? payload.content
        .filter((item: any) => item?.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
    : '';
}

// ── Main dispatcher ────────────────────────────────────────────────────────

export async function callAI(
  config: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  jsonMode = false
): Promise<string> {
  const apiKey  = cleanStr(config.apiKey);
  const provider = config.provider;
  const model   = cleanStr(config.model) || getDefaultModel(provider);

  if (!apiKey) throw new Error('Chave de API não configurada. Clique na engrenagem ⚙ para configurar.');

  // ── Gemini ────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: jsonMode ? 'application/json' : 'text/plain',
      },
    });
    return response.text || '';
  }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
    });
    return response.choices[0].message.content || '';
  }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const sys = jsonMode
      ? `${systemPrompt}\n\nResponda APENAS com JSON válido, sem markdown e sem comentários.`
      : systemPrompt;
    return callAnthropic(apiKey, model, sys, userPrompt);
  }

  throw new Error(`Provedor "${provider}" não suportado.`);
}
