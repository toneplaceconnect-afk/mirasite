---
title: Mira TTS
emoji: 🎙️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

Голосовой сервис Mira: русский голос Piper (ru_RU-irina-medium) + лёгкая обработка (тон, цифровой оттенок), ответ в MP3.

`POST /tts` с JSON `{"text": "Привет!"}` возвращает `audio/mpeg`.
Необязательно: `pitch` (1.00–1.20), `speed` (0.80–1.20), `fx` (0–1).
`GET /health` показывает, что сервис работает.
