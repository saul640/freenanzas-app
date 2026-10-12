import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(path.join(root, 'manual_usuario_app.html'), 'utf8');
const collect = (regex) => [...source.matchAll(regex)].map((match) => match[1]);
const ids = collect(/\bid=["']([^"']+)["']/g);
const fragments = collect(/\bhref=["']#([^"']+)["']/g);

test('la guía ofrece Empezar y Consulta rápida al inicio', () => {
  assert.match(source, /id="empezar"/);
  assert.match(source, /id="consulta"/);
  assert.match(source, /href="#empezar"/);
  assert.match(source, /href="#consulta"/);
  assert.ok(source.indexOf('id="empezar"') < source.indexOf('id="consulta"'));
});

test('las anclas directas existen y no se repiten', () => {
  assert.equal(new Set(ids).size, ids.length, 'IDs repetidos en el HTML');
  const missing = [...new Set(fragments)].filter((fragment) => !ids.includes(fragment));
  assert.deepEqual(missing, [], `Enlaces internos sin destino: ${missing.join(', ')}`);
  for (const id of ['registro-movimientos', 'importar-csv', 'movimientos-historial', 'presupuestos-metas', 'tarjetas-credito', 'prestamos', 'gastos-recurrentes', 'asesor-ia']) {
    assert.ok(ids.includes(id), `Falta el ancla #${id}`);
  }
});

test('el consejo de privacidad documenta ambos iconos y el alcance real', () => {
  const advice = source.match(/<aside class="privacy-advice"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.match(advice, /privacy-visibility\.png/);
  assert.match(advice, /privacy-visibility-off\.png/);
  assert.match(advice, /aria-hidden="true"/);
  assert.match(advice, /cifras principales visibles/i);
  assert.match(advice, /cifras principales ocultas/i);
  assert.match(advice, /Otros importes secundarios del Dashboard pueden seguir visibles/);
  assert.doesNotMatch(advice, /<button|<input/);
  assert.doesNotMatch(source, /Ocultar Monto \(👁️\)/);
});

test('las capturas publicadas existen y el contenido separa simulación y OCR', () => {
  for (const [, imagePath] of source.matchAll(/<img[^>]+src=["']\.\.\/docs\/images\/([^"']+)["']/g)) {
    assert.ok(existsSync(path.join(root, 'public', 'docs', 'images', imagePath)), `Falta la captura ${imagePath}`);
  }
  assert.match(source, /simulaciones que abren el registro manual; no ejecutan OCR/);
  assert.match(source, /formulario detallado \(PRO\)/);
});

test('el build publica la página, los alias, las imágenes y el PDF vigente', () => {
  for (const file of [
    'dist/guia/index.html',
    'dist/GUIA_USUARIO.html',
    'dist/manual_usuario_app.html',
    'dist/guide-redirect.js',
    'dist/manual_usuario_app.pdf',
    'dist/docs/images/01-bienvenida.png',
    'dist/docs/images/privacy-visibility.png',
    'dist/docs/images/privacy-visibility-off.png',
  ]) {
    assert.ok(existsSync(path.join(root, file)), `Falta el archivo publicado ${file}`);
  }
  assert.match(readFileSync(path.join(root, 'dist/GUIA_USUARIO.html'), 'utf8'), /\/guia\//);
  assert.match(readFileSync(path.join(root, 'dist/GUIA_USUARIO.html'), 'utf8'), /guide-redirect\.js/);
  assert.match(readFileSync(path.join(root, 'dist/guide-redirect.js'), 'utf8'), /location\.hash/);
  assert.match(readFileSync(path.join(root, 'dist/guia/index.html'), 'utf8'), /id="importar-csv"/);
  assert.match(readFileSync(path.join(root, 'dist/guia/index.html'), 'utf8'), /privacy-visibility-off\.png/);
  assert.ok(readFileSync(path.join(root, 'dist/manual_usuario_app.pdf')).length > 50_000);
});
