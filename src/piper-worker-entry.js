/* Голос Mira в браузере: Piper (ru_RU-irina-medium) в отдельном потоке, чтобы страница и робот не подвисали. */
import { TtsSession } from '@mintplex-labs/piper-tts-web';

const VOICE = 'ru_RU-irina-medium';
let session = null;

self.onmessage = async (e) => {
  const { id, type, text } = e.data || {};
  try {
    if (type === 'init') {
      session = await TtsSession.create({
        voiceId: VOICE,
        progress: (p) => { if (p && /\.onnx$/.test(p.url || '')) self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); },
      });
      self.postMessage({ id, type: 'ready' });
    } else if (type === 'predict') {
      if (!session) throw new Error('not ready');
      const blob = await session.predict(text);
      self.postMessage({ id, type: 'wav', blob });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String((err && err.message) || err) });
  }
};
