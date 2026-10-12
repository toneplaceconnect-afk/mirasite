import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelAnswer, sanitizeReply, leadAllowed, PRICE_FALLBACK, loadKnowledge } from '../lib/mira.js';
import handler from '../api/chat.js';

const KEYS = ['DAHL_API_KEY', 'DAHL_MODEL', 'GROQ_MODEL', 'GROQ_API_KEY', 'NVIDIA_API_KEY', 'OPENAI_API_KEY', 'CUSTOM_API_KEY', 'CUSTOM_BASE_URL', 'AI_PROVIDER_ORDER'];
function env(vars) { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, vars); }
function call(method, body, ip = '1.1.1.1') {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, json: j }); } };
    handler({ method, headers: { host: 'x.test', 'x-forwarded-for': ip }, body }, res);
  });
}
const msg = (text) => ({ messages: [{ role: 'user', content: text }] });
const ai = (obj) => ({ ok: true, json: async () => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] }) });

test('знания: контракт и модули загружаются', () => {
  const k = loadKnowledge();
  assert.deepEqual(k.names, ['core', 'about', 'faq', 'limits', 'handoff']);
  assert.match(k.prompt, /до конца 2026 года/);
  assert.match(k.prompt, /Compile Point/);
  assert.match(k.prompt, /Никаких цен/);
});

test('parseModelAnswer: чистый JSON, обёртка, мусор', () => {
  assert.equal(parseModelAnswer('{"reply":"Привет","leadReady":false}').reply, 'Привет');
  assert.equal(parseModelAnswer('```json\n{"reply":"Да"}\n```').reply, 'Да');
  assert.equal(parseModelAnswer('Вот ответ: {"reply":"Ок","summary":""} спасибо').reply, 'Ок');
  assert.equal(parseModelAnswer('просто текст'), null);
  assert.equal(parseModelAnswer('{"reply":""}'), null);
});

test('sanitizeReply: убирает разметку и подменяет цены', () => {
  assert.equal(sanitizeReply('**Привет**\n- первое\n- второе'), 'Привет\nпервое\nвторое');
  for (const bad of ['Это стоит 5000 рублей', 'Всего 15 тыс. в месяц', 'Скидка 30%', 'Цена от 100 до 200', 'Это $20', '€ 30 в месяц'])
    assert.equal(sanitizeReply(bad), PRICE_FALLBACK, bad);
  assert.notEqual(sanitizeReply('Сейчас Mira бесплатна: акция действует до конца 2026 года.'), PRICE_FALLBACK);
});

test('leadAllowed: нужен контакт посетителя', () => {
  assert.equal(leadAllowed('Сайт: студия', ['хочу Mira', 'пишите на ivan@mail.ru']), true);
  assert.equal(leadAllowed('Сайт: студия', ['мой номер +7 913 123-45-67']), true);
  assert.equal(leadAllowed('Сайт: студия', ['телеграм @ivan_studio']), true);
  assert.equal(leadAllowed('Сайт: студия', ['хочу Mira', 'не хочу оставлять контакт']), false);
  assert.equal(leadAllowed('', ['ivan@mail.ru']), false);
});

test('без ключей: честная демонстрация', async () => {
  env({});
  const r = await call('POST', msg('привет'));
  assert.equal(r.code, 200); assert.equal(r.json.demo, true); assert.equal(r.json.leadReady, false);
});

test('GET: состояние без секретов', async () => {
  env({ GROQ_API_KEY: 'secret-1', NVIDIA_API_KEY: 'secret-2' });
  const r = await call('GET');
  assert.equal(r.json.providers, 2); assert.equal(r.json.knowledgeModules.length, 5);
  assert.doesNotMatch(JSON.stringify(r.json), /secret/);
});

test('если первый провайдер упал, отвечает второй', async () => {
  env({ GROQ_API_KEY: 'g', NVIDIA_API_KEY: 'n' });
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return url.includes('groq') ? { ok: false, status: 503 } : ai({ reply: 'Здравствуйте! Я Mira.', leadReady: false, summary: '' }); };
  const r = await call('POST', msg('привет'), '2.2.2.2');
  assert.equal(r.code, 200); assert.equal(r.json.reply, 'Здравствуйте! Я Mira.'); assert.equal(r.json.demo, false);
  assert.equal(urls.length, 2); assert.match(urls[0], /groq/); assert.match(urls[1], /nvidia/);
});

test('несколько моделей через запятую: сначала вторая модель того же провайдера', async () => {
  env({ GROQ_API_KEY: 'g', NVIDIA_API_KEY: 'n', GROQ_MODEL: 'model-a, model-b' });
  const seen = [];
  globalThis.fetch = async (url, opts) => { const m = JSON.parse(opts.body).model; seen.push(m); return m === 'model-b' ? ai({ reply: 'Ответила вторая модель', leadReady: false, summary: '' }) : { ok: false, status: 429 }; };
  const r = await call('POST', msg('привет'), '9.9.9.9');
  delete process.env.GROQ_MODEL;
  assert.equal(r.json.reply, 'Ответила вторая модель'); assert.deepEqual(seen, ['model-a', 'model-b']);
});

test('dahl: адрес, ключ и три модели по очереди, служебный <think> вырезается', async () => {
  env({ DAHL_API_KEY: 'd-secret' });
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    const model = JSON.parse(opts.body).model; seen.push([url, model, opts.headers.Authorization]);
    if (model.startsWith('MiniMax')) return { ok: false, status: 500 };
    if (model.startsWith('deepseek')) return ai('<think>размышляю {не json}</think>{"reply":"Ответ после раздумий","leadReady":false,"summary":""}');
    return ai({ reply: 'не должна дойти' });
  };
  const r = await call('POST', msg('привет'), '10.0.0.1');
  assert.equal(r.json.reply, 'Ответ после раздумий');
  assert.deepEqual(seen.map((x) => x[1]), ['MiniMaxAI/MiniMax-M2.7', 'deepseek-ai/DeepSeek-V4-Flash-0731']);
  assert.equal(seen[0][0], 'https://inference.dahl.global/v1/chat/completions'); assert.equal(seen[0][2], 'Bearer d-secret');
});

test('parseModelAnswer: <think> с фигурными скобками не ломает разбор', () => {
  assert.equal(parseModelAnswer('<think>план: {"x":1}</think>\n{"reply":"Ок"}').reply, 'Ок');
  assert.equal(parseModelAnswer('Рассуждение без тега</think>{"reply":"Да"}').reply, 'Да');
});

test('порядок по умолчанию: dahl первым, потом groq и nvidia', async () => {
  env({ DAHL_API_KEY: 'd', GROQ_API_KEY: 'g', NVIDIA_API_KEY: 'n' });
  const hosts = [];
  globalThis.fetch = async (url) => { hosts.push(new URL(url).host); return { ok: false, status: 500 }; };
  await call('POST', msg('привет'), '11.0.0.1');
  assert.deepEqual([...new Set(hosts)], ['inference.dahl.global', 'api.groq.com', 'integrate.api.nvidia.com']);
});

test('все провайдеры упали: понятная ошибка', async () => {
  env({ GROQ_API_KEY: 'g' });
  globalThis.fetch = async () => { throw new Error('network'); };
  const r = await call('POST', msg('привет'), '3.3.3.3');
  assert.equal(r.code, 502); assert.match(r.json.error, /Mira/);
});

test('цена в ответе модели подменяется, обращение не готово', async () => {
  env({ GROQ_API_KEY: 'g' });
  globalThis.fetch = async () => ai({ reply: 'Стоит 5000 рублей в месяц', leadReady: true, summary: 'Контакт: a@b.ru' });
  const r = await call('POST', msg('сколько стоит? мой ivan@mail.ru'), '4.4.4.4');
  assert.equal(r.json.reply, PRICE_FALLBACK); assert.equal(r.json.leadReady, false);
});

test('обращение готово только с контактом посетителя', async () => {
  env({ GROQ_API_KEY: 'g' });
  globalThis.fetch = async () => ai({ reply: 'Передать это владельцу?', leadReady: true, summary: 'Сайт: студия\nКонтакт: ivan@mail.ru' });
  const withContact = await call('POST', msg('Хочу Mira для студии, почта ivan@mail.ru'), '5.5.5.5');
  assert.equal(withContact.json.leadReady, true); assert.match(withContact.json.summary, /студия/);
  const without = await call('POST', msg('Хочу Mira для студии'), '5.5.5.6');
  assert.equal(without.json.leadReady, false); assert.equal(without.json.summary, '');
});

test('в провайдера уходит системный контракт и история', async () => {
  env({ GROQ_API_KEY: 'g' });
  let sent;
  globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return ai({ reply: 'Ок', leadReady: false, summary: '' }); };
  await call('POST', { messages: [{ role: 'user', content: 'привет' }, { role: 'assistant', content: 'Здравствуйте' }, { role: 'user', content: 'что умеешь?' }] }, '6.6.6.6');
  assert.equal(sent.messages[0].role, 'system'); assert.match(sent.messages[0].content, /Контракт Mira/);
  assert.equal(sent.messages.length, 4); assert.equal(sent.response_format.type, 'json_object');
});

test('защита: чужой origin, плохое тело, лимит', async () => {
  env({ GROQ_API_KEY: 'g' });
  globalThis.fetch = async () => ai({ reply: 'Ок' });
  const bad = await call('POST', { messages: [] }, '7.7.7.7'); assert.equal(bad.code, 400);
  let last; for (let i = 0; i < 42; i++) last = await call('POST', msg('привет'), '8.8.8.8');
  assert.equal(last.code, 429);
});
