// Логика чата Mira (используется в api/chat.js и в тестах). Провайдеры ИИ идут по очереди: если один не ответил, берём следующий.
// Знания и контракт лежат в content/knowledge/*.md, их можно править без изменения кода.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KNOWLEDGE_DIR = join(process.cwd(), 'content', 'knowledge');
// Порядок важен: сначала контракт, потом остальные модули.
const MODULE_ORDER = ['core', 'about', 'faq', 'limits', 'handoff'];

let knowledgeCache = null;
export function loadKnowledge() {
  if (knowledgeCache) return knowledgeCache;
  const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  const names = [...MODULE_ORDER.filter((n) => files.includes(`${n}.md`)), ...files.map((f) => f.slice(0, -3)).filter((n) => !MODULE_ORDER.includes(n)).sort()];
  const parts = names.map((n) => readFileSync(join(KNOWLEDGE_DIR, `${n}.md`), 'utf8').trim());
  knowledgeCache = { names, prompt: parts.join('\n\n---\n\n') };
  return knowledgeCache;
}

// Провайдеры с OpenAI-совместимым API. Ключи только в переменных окружения Vercel.
const PROVIDERS = {
  groq: { key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', json: true },
  nvidia: { key: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: () => process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct', json: false },
  dahl: { key: 'DAHL_API_KEY', url: 'https://inference.dahl.global/v1/chat/completions', model: () => process.env.DAHL_MODEL || 'MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731,zai-org/GLM-5.3-Flash', json: false },
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/chat/completions', model: () => process.env.OPENAI_MODEL || 'gpt-4o-mini', json: true },
  custom: { key: 'CUSTOM_API_KEY', url: () => `${(process.env.CUSTOM_BASE_URL || '').replace(/\/+$/, '')}/chat/completions`, model: () => process.env.CUSTOM_MODEL || '', json: false },
};

// В GROQ_MODEL, NVIDIA_MODEL, OPENAI_MODEL, CUSTOM_MODEL можно перечислить несколько моделей через запятую:
// если первая не ответила, чат пробует следующую, и только потом переходит к другому провайдеру.
export function modelsFor(name) {
  return String(PROVIDERS[name].model() || '').split(',').map((m) => m.trim()).filter(Boolean);
}

export function providerOrder() {
  const order = (process.env.AI_PROVIDER_ORDER || 'groq,nvidia,dahl,openai,custom').split(',').map((s) => s.trim()).filter((s) => PROVIDERS[s]);
  return order.filter((name) => process.env[PROVIDERS[name].key] && (name !== 'custom' || process.env.CUSTOM_BASE_URL));
}

// Достаёт JSON из ответа модели, даже если вокруг него есть лишний текст.
export function parseModelAnswer(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const tryParse = (s) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } };
  let obj = tryParse(cleaned);
  if (!obj) { const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}'); if (a !== -1 && b > a) obj = tryParse(cleaned.slice(a, b + 1)); }
  if (!obj || typeof obj.reply !== 'string' || !obj.reply.trim()) return null;
  return obj;
}

// Контракт запрещает цены и цифры. Если модель всё же назвала сумму или процент, подменяем ответ.
const PRICE_RE = /(\d[\d\s.,]*\s*(?:₽|руб|р\.|тыс|млн|\$|€|usd|eur|долл|евро|%|процент))|((?:₽|\$|€)\s*\d)|((?<![а-яёa-z])от\s+\d[\d\s]*\s*(?:до|-|—)\s*\d)/i;
export const PRICE_FALLBACK = 'Суммы я не называю. Сейчас Mira бесплатна: акция действует до конца 2026 года. Условия после акции я не называю, но могу передать этот вопрос владельцу.';
export function sanitizeReply(reply) {
  let text = reply.replace(/\*\*|__|`{1,3}/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/^#+\s*/gm, '').trim();
  if (PRICE_RE.test(text)) return PRICE_FALLBACK;
  return text.slice(0, 2000);
}

// Контакт должен быть в обращении: формы на сайте нет. Ищем телефон, почту, @ник или ссылку.
const CONTACT_RE = /(\+?\d[\d\s().-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)|(@[\w]{3,})|(t\.me\/|vk\.(?:com|ru)\/|wa\.me\/)/i;
export function leadAllowed(summary, userMessages) {
  const s = typeof summary === 'string' ? summary.trim() : '';
  if (!s || s.length > 4000) return false;
  return CONTACT_RE.test(userMessages.join('\n'));
}

// Простой лимит запросов на IP. На serverless он работает в пределах одного инстанса, этого достаточно против случайного перегруза.
const hits = new Map();
export function limited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 40;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export async function askProvider(name, messages, model, timeoutMs = 14000) {
  const p = PROVIDERS[name];
  const url = typeof p.url === 'function' ? p.url() : p.url;
  const body = { model: model || modelsFor(name)[0], messages, temperature: 0.4, max_tokens: 900 };
  if (p.json) body.response_format = { type: 'json_object' };
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env[p.key]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1000, timeoutMs)) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const parsed = parseModelAnswer(data.choices?.[0]?.message?.content);
  if (!parsed) throw new Error('bad answer');
  return parsed;
}

export function log(event) { try { console.log(JSON.stringify({ ev: 'mira', ...event })); } catch {} }
