import { defineConfig } from 'vite';
import { buildSync } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  plugins: [{ name: 'mira-original', buildStart() { for(const name of ['podium','cursor']) buildSync({entryPoints:[`src/${name}-entry.js`],outfile:`src/${name}.js`,bundle:true,format:'iife',minify:true}); }, closeBundle() { copyFileSync('Mira.html', 'dist/Mira.html'); mkdirSync('dist/src', { recursive: true }); for(const file of ['main.js','motion.js','podium.js','cursor.js','glass.js','fiber.js']) copyFileSync(`src/${file}`, `dist/src/${file}`); } }],
});
