import { defineConfig } from 'vite';
import { buildSync } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  plugins: [{ name: 'mira-original', buildStart() { buildSync({entryPoints:['src/piper-worker-entry.js'],outdir:'public/vendor/piper',entryNames:'worker',bundle:true,format:'esm',splitting:true,minify:true,platform:'browser',external:['fs','path','crypto','worker_threads','perf_hooks','os','child_process','ws','node:*'],logLevel:'error'}); for(const name of ['podium','cursor']) buildSync({entryPoints:[`src/${name}-entry.js`],outfile:`src/${name}.js`,bundle:true,format:'iife',minify:true}); }, closeBundle() { copyFileSync('Mira.html', 'dist/Mira.html'); mkdirSync('dist/src', { recursive: true }); for(const file of ['main.js','motion.js','scenes.js','podium.js','cursor.js','glass.js','fiber.js','stage.js','voice.js']) copyFileSync(`src/${file}`, `dist/src/${file}`); } }],
});
