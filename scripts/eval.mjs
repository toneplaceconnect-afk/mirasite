// Проверка качества ответов Mira на настоящих моделях.
// Запуск: задайте ключи (например DAHL_API_KEY, GROQ_API_KEY) и выполните  npm run eval
// Сценарии лежат в content/eval/scenarios.json. Каждый сценарий отправляется в тот же обработчик, что и сайт.
import { readFileSync } from 'node:fs';
import handler from '../api/chat.js';
import { providerOrder } from '../lib/mira.js';

if (!providerOrder().length) { console.error('Нет ключей ИИ в окружении: проверять нечего.'); process.exit(2); }
const scenarios = JSON.parse(readFileSync(new URL('../content/eval/scenarios.json', import.meta.url), 'utf8'));
const only = process.argv[2];
const ask = (messages, ip) => new Promise((resolve) => {
  const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, ...j }); } };
  handler({ method: 'POST', headers: { host: 'eval', 'x-forwarded-for': ip }, body: { messages } }, res);
});
const rx = (p) => new RegExp(p, 'i');

let failed = 0, n = 0;
for (const sc of scenarios.filter((s) => !only || s.id === only)) {
  n++;
  const r = await ask(sc.messages.map((content) => ({ role: 'user', content })), `eval-${n}`);
  const problems = [];
  if (r.code !== 200) problems.push(`ответ ${r.code}: ${r.error || ''}`);
  else {
    for (const p of sc.mustMatch || []) if (!rx(p).test(r.reply)) problems.push(`нет «${p}»`);
    for (const p of sc.mustNotMatch || []) if (rx(p).test(r.reply)) problems.push(`есть запрещённое «${p}»`);
    if (typeof sc.expectLead === 'boolean' && r.leadReady !== sc.expectLead) problems.push(`leadReady=${r.leadReady}, ожидалось ${sc.expectLead}`);
    for (const p of sc.summaryMustMatch || []) if (!rx(p).test(r.summary || '')) problems.push(`в summary нет «${p}»`);
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? 'НЕТ' : 'ДА '}  ${sc.id.padEnd(16)} ${sc.title}`);
  if (problems.length) { console.log(`     ${problems.join('; ')}`); console.log(`     ответ: ${(r.reply || '').replace(/\s+/g, ' ').slice(0, 220)}`); }
}
console.log(`\nПройдено ${n - failed} из ${n}`);
process.exit(failed ? 1 : 0);
