import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const publicDir = 'public';
const distDir = 'dist';

function copyFile(src, dest) {
  const bytes = readFileSync(src);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
}

function copyDir(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else if (entry.isFile()) {
      copyFile(src, dest);
    }
  }
}

copyDir(publicDir, distDir);

// `manual_usuario_app.html` is the single editable source for the current guide.
// Publish it at a stable URL and forward previous HTML URLs to that one page.
const guideSource = 'manual_usuario_app.html';
const guidePath = join(distDir, 'guia', 'index.html');
copyFile(guideSource, guidePath);
copyFile('manual_usuario_app.pdf', join(distDir, 'manual_usuario_app.pdf'));

const guideAlias = () => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guía de Freenanzas</title><script src="/guide-redirect.js"></script></head><body><p>La guía actual está en <a href="/guia/">Guía de Freenanzas</a>.</p></body></html>`;
writeFileSync(join(distDir, 'guide-redirect.js'), "location.replace('/guia/' + location.hash);\n", 'utf8');
for (const legacyName of ['GUIA_USUARIO.html', 'manual_usuario_app.html']) {
  const outputPath = join(distDir, legacyName);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, guideAlias(legacyName), 'utf8');
}

const emptyFiles = [];
function collectEmptyFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) collectEmptyFiles(filePath);
    if (entry.isFile() && statSync(filePath).size === 0) {
      emptyFiles.push(relative(distDir, filePath));
    }
  }
}

collectEmptyFiles(distDir);

if (emptyFiles.length > 0) {
  throw new Error(`Build generated empty files: ${emptyFiles.join(', ')}`);
}
