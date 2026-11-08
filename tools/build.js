// Egyetlen, telepítés nélkül futtatható HTML-fájlba csomagolja a forrásokat.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

const html = src('index.html')
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, file) => `<style>\n${src(file)}</style>`)
  .replace(/<script src="([^"]+)"><\/script>/g, (_, file) => (
    `<script>\n${src(file).replace(/<\/script/gi, '<\\/script')}</script>`
  ));

const out = path.join(root, 'dist', 'BB84-szimulator.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} kB)`);
