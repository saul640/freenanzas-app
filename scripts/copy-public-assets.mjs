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
