/* The loading screen always starts at the top: no restored scroll position may show main-page blocks under it. */
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
toTop(); window.addEventListener('pageshow', toTop); window.addEventListener('load', toTop);
const frame = document.querySelector('#mira-frame');
if (!frame.src.includes('embed=1')) frame.src = './Mira.html?embed=1';
const wave = document.querySelector('.cursor-wave');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let pointerX = window.innerWidth / 2;
let pointerY = window.innerHeight / 2;
let waveX = pointerX;
let waveY = pointerY;
let waveRunning = false;
function animateWave() {
  waveX += (pointerX - waveX) * .075;
  waveY += (pointerY - waveY) * .075;
  wave.style.transform = `translate3d(${waveX}px, ${waveY}px, 0)`;
  if (Math.abs(pointerX - waveX) + Math.abs(pointerY - waveY) > .5) requestAnimationFrame(animateWave);
  else waveRunning = false;
}
function followPointer(event) {
  if (event.pointerType === 'touch') return;
  pointerX = event.clientX; pointerY = event.clientY;
  const bounds = frame.getBoundingClientRect();
  if (document.body.classList.contains('intro-complete')) frame.contentWindow?.postMessage({ type: 'mira-pointer', x: pointerX - bounds.left, y: pointerY - bounds.top }, location.protocol === 'file:' ? '*' : location.origin);
  if (!reducedMotion.matches) {
    wave.classList.add('active');
    if (!waveRunning) { waveRunning = true; requestAnimationFrame(animateWave); }
  }
}
window.addEventListener('pointermove', followPointer, { passive: true });
document.documentElement.addEventListener('pointerleave', () => wave.classList.remove('active'));
const messages = document.querySelector('#messages');
const input = document.querySelector('#chat-input');
const state = document.querySelector('#chat-state');
const status = document.querySelector('#chat-status');
const send = document.querySelector('#send-button');
const history = [];
let busy = false;
let greeted = false;
let pendingSummary = '';
let greetingTimer;
const action = (name) => frame.contentWindow?.postMessage({ type: 'mira-action', action: name }, location.protocol === 'file:' ? '*' : location.origin);
const setState = (text) => { state.replaceChildren(); const dot = document.createElement('i'); dot.className = 'dot'; state.append(dot, document.createTextNode(text)); };
let bootFinished = false;
let miraLoaded = false;
let pageLoaded = document.readyState === 'complete';
let imageProgress = 0;
let displayedLoad = 0;
let targetLoad = 0;
let loadAnimation = false;
let lastLoadFrame = performance.now();
function drawLoad() {
  const now = performance.now();
  displayedLoad = Math.min(targetLoad, displayedLoad + (now - lastLoadFrame) * .06);
  lastLoadFrame = now;
  document.querySelector('#boot-count').textContent = String(Math.floor(displayedLoad)).padStart(2, '0');
  document.documentElement.style.setProperty('--load', String(displayedLoad / 100));
  if (displayedLoad < targetLoad) requestAnimationFrame(drawLoad);
  else { loadAnimation = false; if (displayedLoad === 100) finishBoot(); }
}
function updateLoadProgress() {
  targetLoad = miraLoaded && pageLoaded ? 100 : Math.min(99, Math.round(imageProgress * 85 + (pageLoaded ? 15 : 0)));
  if (!loadAnimation) { loadAnimation = true; lastLoadFrame = performance.now(); requestAnimationFrame(drawLoad); }
}
window.addEventListener('load', () => { pageLoaded = true; updateLoadProgress(); }, { once: true });
function finishBoot() {
  if (bootFinished || !miraLoaded || !pageLoaded) return;
  bootFinished = true; document.querySelector('#boot-count').textContent = '100'; document.documentElement.style.setProperty('--load', '1'); document.body.classList.add('mira-awake');
  const blocks = [...document.querySelectorAll('.intro-block')];
  const stepDuration = reducedMotion.matches ? 1100 : 1500;
  const initialDelay = reducedMotion.matches ? 0 : 700;
  blocks.forEach((block, index) => setTimeout(() => {
    blocks.forEach(item => item.classList.remove('intro-focus'));
    block.classList.add('intro-visible', 'intro-focus');
    const rect = block.getBoundingClientRect(), bounds = frame.getBoundingClientRect();
    frame.contentWindow?.postMessage({ type: 'mira-gaze', x: Math.max(-1,Math.min(1,(rect.left+rect.width/2-(bounds.left+bounds.width/2))/(bounds.width*.65))), y: -1 }, location.protocol === 'file:' ? '*' : location.origin);
    if (index === blocks.length - 1) setTimeout(() => action('wink'), 1000);
  }, initialDelay + index*stepDuration));
  setTimeout(() => {
    blocks.forEach(block => block.classList.remove('intro-focus'));
    document.body.classList.add('intro-complete');
    frame.contentWindow?.postMessage({ type: 'mira-gaze-release' }, location.protocol === 'file:' ? '*' : location.origin);
    action('hi');
    document.querySelector('#launch-button').disabled = false;
    document.querySelector('#boot-label').textContent = 'Нажмите «Пуск»';
  }, initialDelay + blocks.length*stepDuration);
}
document.querySelector('#launch-button').addEventListener('click', () => {
  if (!bootFinished) return;
  toTop(); document.querySelector('.boot').classList.add('done'); document.body.classList.add('site-ready');
  window.dispatchEvent(new Event('mira-launch'));
});
window.addEventListener('message', (event) => {
  if (!(event.origin === location.origin || (location.protocol === 'file:' && event.origin === 'null')) || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'mira-progress') { imageProgress = event.data.loaded / event.data.total; updateLoadProgress(); }
  if (event.data?.type === 'mira-ready') { miraLoaded = true; imageProgress = 1; document.body.classList.add('character-ready'); updateLoadProgress(); }
  if (event.data?.type === 'mira-error') { document.querySelector('#boot-label').textContent = 'Не удалось загрузить Mira. Обновите страницу.'; }
});
const askMira = () => frame.contentWindow?.postMessage({ type: 'mira-query' }, location.protocol === 'file:' ? '*' : location.origin);
frame.addEventListener('load', askMira); askMira();
const miraRetry = setInterval(() => { if (miraLoaded) clearInterval(miraRetry); else askMira(); }, 500);
setTimeout(() => { clearInterval(miraRetry); if (!miraLoaded) document.querySelector('#boot-label').textContent = 'Не удалось загрузить Mira. Обновите страницу.'; }, 20000);
const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }); }, { threshold: .12 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
function addMessage(role, text) {
  const element = document.createElement('div'); element.className = `message ${role}`;
  
  element.append(document.createTextNode(text)); messages.append(element); messages.scrollTop = messages.scrollHeight; return element;
}
async function talk(text) {
  if (busy || !text.trim()) return;
  text = text.trim().slice(0, 2000); busy = true; send.disabled = true;
  document.querySelectorAll('[data-prompt]').forEach((button) => { button.disabled = true; });
  input.value = ''; status.textContent = ''; pendingSummary = '';
  document.querySelectorAll('.lead-button').forEach((button) => button.remove());
  addMessage('user', text);
  setState('Думаю над вашим вопросом');
  if (!greeted) { greeted = true; action('hi'); greetingTimer = setTimeout(() => action('think-start'), 1000); } else action('think-start');
  try {
    const localPreview = location.protocol === 'file:';
    const response = localPreview ? await new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => {
      let reply = 'Я Mira, ИИ-помощник для сайта. Отвечаю посетителям, уточняю, что им нужно, и готовлю обращение для владельца. Сейчас открыт локальный демонстрационный просмотр.';
      if (/сайт|проект|подключ/i.test(text)) reply = 'Я могу отвечать посетителям вашего сайта, уточнять, что им нужно, и передавать вам готовые обращения. Сейчас открыт локальный демонстрационный просмотр.';
      if (/цен|стоим|купить|бесплат/i.test(text)) reply = 'Сейчас Mira бесплатна: акция действует до конца 2026 года. Работа ИИ оплачивается у выбранного ИИ-провайдера, есть и бесплатные варианты.';
      return { reply, demo: true, leadReady: false };
    } }), 1600)) : await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, { role: 'user', content: text }].slice(-16) }), signal: AbortSignal.timeout(58000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Сервис временно недоступен. Попробуйте ещё раз.');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Ответ не получен. Попробуйте ещё раз.');
    history.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply });
    const element = addMessage('assistant', data.reply);
    clearTimeout(greetingTimer); action('think-stop'); action('tails');
    setState('Готова продолжить разговор');
    if (data.demo) status.textContent = 'Демонстрационный режим: подключите ключ ИИ в Vercel для свободного общения. Обращения пока не отправляются.';
    if (data.leadReady && !data.demo && typeof data.summary === 'string') {
      pendingSummary = data.summary; setTimeout(() => action('wink'), 1400);
      const button = document.createElement('button'); button.className = 'lead-button'; button.textContent = 'Отправить в Compile Point'; button.addEventListener('click', () => sendLead(button)); element.append(button); messages.scrollTop = messages.scrollHeight;
    }
  } catch (error) {
    addMessage('assistant', error.name === 'TimeoutError' ? 'Ответ занимает больше времени, чем обычно. Попробуйте отправить вопрос ещё раз.' : (error instanceof TypeError ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : error.message));
    setState('Можно повторить вопрос');
  } finally { clearTimeout(greetingTimer); action('think-stop'); busy = false; send.disabled = false; document.querySelectorAll('[data-prompt]').forEach((button) => { button.disabled = false; }); }
}
document.querySelector('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); talk(input.value); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); talk(input.value); } });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { document.querySelector('#chat').scrollIntoView({ behavior: 'smooth', block: 'center' }); talk(button.dataset.prompt); }));
async function sendLead(button) {
  if (!pendingSummary) return;
  button.disabled = true; status.textContent = 'Отправляем владельцу…';
  try {
    const response = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: pendingSummary, consent: true }), signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Не удалось отправить обращение.');
    status.textContent = ''; addMessage('assistant', 'Обращение отправлено владельцу в Telegram. Спасибо!'); action('wink');
    document.querySelectorAll('.lead-button').forEach((element) => element.remove()); pendingSummary = '';
  } catch (error) { status.textContent = error.name === 'TimeoutError' ? 'Не удалось подтвердить отправку. Проверьте доставку перед повторной попыткой.' : (error instanceof TypeError ? 'Нет связи с сервером. Обращение не отправлено.' : error.message); button.disabled = false; }
}
