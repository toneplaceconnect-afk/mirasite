"""Голос Mira: Piper (ru_RU-irina-medium) -> лёгкая обработка ffmpeg -> MP3."""
import hashlib
import io
import os
import re
import subprocess
import threading
import wave
from collections import OrderedDict

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from piper import PiperVoice, SynthesisConfig

MODEL = os.environ.get("MIRA_MODEL", "/home/user/voices/ru_RU-irina-medium.onnx")
TOKEN = os.environ.get("TTS_TOKEN", "")  # необязательный общий секрет с сайтом
ORIGINS = [o for o in os.environ.get("ALLOW_ORIGINS", "*").split(",") if o]
MAX_CHARS = 420
D_PITCH = float(os.environ.get("MIRA_PITCH", "1.07"))   # выше 1.12 голос становится детским
D_SPEED = float(os.environ.get("MIRA_SPEED", "0.96"))   # <1 — спокойнее
D_FX = float(os.environ.get("MIRA_FX", "0.5"))          # «цифровой» оттенок 0..1

app = FastAPI(title="Mira TTS")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["POST", "GET"], allow_headers=["*"])

voice = PiperVoice.load(MODEL)
lock = threading.Lock()  # один синтез за раз: бесплатный CPU один
cache: "OrderedDict[str, bytes]" = OrderedDict()
CACHE_MAX = 300


def clean(text: str) -> str:
    t = re.sub(r"https?://\S+", " ", text)
    t = re.sub(r"[*_`#>~|\[\]{}<>]", " ", t)
    t = re.sub(r"[\U0001F000-\U0001FAFF☀-➿️]", " ", t)
    t = t.replace("Compile Point", "Компайл Поинт").replace("Mira", "Мира").replace("ИИ", "и-и")
    return re.sub(r"\s+", " ", t).strip()


def synth_wav(text: str, speed: float) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1.0 / speed, noise_scale=0.62, noise_w_scale=0.8))
    return buf.getvalue()


def fx_chain(sr: int, pitch: float, fx: float) -> str:
    f = [
        "highpass=f=90",
        f"asetrate={sr * pitch:.0f}", f"aresample={sr}", f"atempo={1 / pitch:.4f}",  # выше тон, темп прежний
        "treble=g=2:f=4200",
    ]
    if fx > 0.02:  # тонкий «цифровой» резонанс
        f.append(f"aecho=0.85:0.8:{9 + 10 * fx:.0f}:{0.12 + 0.22 * fx:.2f}")
        f.append(f"chorus=0.6:0.9:{40 + 20 * fx:.0f}:{0.15 + 0.25 * fx:.2f}:0.25:1.5")
    f.append("alimiter=limit=0.92")
    return ",".join(f)


def to_mp3(wav: bytes, pitch: float, fx: float) -> bytes:
    with wave.open(io.BytesIO(wav)) as w:
        sr = w.getframerate()
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "wav", "-i", "pipe:0", "-af", fx_chain(sr, pitch, fx), "-ac", "1", "-ar", "24000", "-b:a", "64k", "-f", "mp3", "pipe:1"],
        input=wav, capture_output=True, timeout=30,
    )
    if p.returncode or not p.stdout:
        raise RuntimeError(p.stderr.decode("utf-8", "ignore")[:200])
    return p.stdout


def clamp(v, lo, hi, d):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return d
    return min(hi, max(lo, v))


@app.get("/health")
def health():
    return {"ok": True, "voice": os.path.basename(MODEL), "cache": len(cache)}


@app.post("/tts")
async def tts(request: Request):
    if TOKEN and request.headers.get("x-tts-token") != TOKEN:
        raise HTTPException(401, "unauthorized")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "bad json")
    text = clean(str(body.get("text", "")))[:MAX_CHARS]
    if not re.search(r"[A-Za-zА-Яа-яЁё0-9]", text):
        raise HTTPException(400, "empty text")
    pitch = clamp(body.get("pitch"), 1.0, 1.2, D_PITCH)
    speed = clamp(body.get("speed"), 0.8, 1.2, D_SPEED)
    fx = clamp(body.get("fx"), 0.0, 1.0, D_FX)
    key = hashlib.sha1(f"{text}|{pitch}|{speed}|{fx}".encode()).hexdigest()
    mp3 = cache.get(key)
    if mp3 is None:
        try:
            with lock:
                wav = synth_wav(text, speed)
            mp3 = to_mp3(wav, pitch, fx)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"synthesis failed: {e}")
        cache[key] = mp3
        while len(cache) > CACHE_MAX:
            cache.popitem(last=False)
    else:
        cache.move_to_end(key)
    return Response(mp3, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
