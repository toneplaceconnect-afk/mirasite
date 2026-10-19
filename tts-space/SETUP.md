# Запуск голоса Mira (Hugging Face Space)

1. huggingface.co → New Space → имя `mira-tts`, SDK **Docker**, Blank, оборудование **CPU basic (free)**, доступ **Public**.
2. Загрузите в Space файлы из этой папки: `Dockerfile`, `app.py`, `requirements.txt`, `README.md`.
3. Дождитесь сборки (5–10 минут, модель ~63 МБ скачивается при сборке). Откройте `https://<ваш-логин>-mira-tts.hf.space/health` — должно показать `{"ok":true,...}`.
4. В Vercel (проект `mirasite`) → Settings → Environment Variables добавьте `TTS_URL` = `https://<ваш-логин>-mira-tts.hf.space` и сделайте Redeploy.
5. Необязательно: `TTS_TOKEN` и в Space (Settings → Variables and secrets) такой же `TTS_TOKEN` — тогда сервис отвечает только сайту.

Настройка тембра (переменные Space): `MIRA_PITCH` (1.00–1.20, сейчас 1.07), `MIRA_SPEED` (0.8–1.2, сейчас 0.96), `MIRA_FX` (0–1, сейчас 0.5).
Бесплатный Space засыпает после ~2 суток без запросов; первый запрос после сна идёт 1–2 минуты, сайт в это время говорит голосом браузера.
Piper распространяется под GPL-3.0 и работает отдельным сервисом; голос Irina — CC BY-SA 4.0 (нужно указать авторство).

> Необязательный вариант. Сейчас голос работает прямо в браузере (src/voice.js), этот сервис не нужен.
