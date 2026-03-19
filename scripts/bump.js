import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Increment patch version (x.y.z -> x.y.z+1)
function bumpVersion(version) {
  const parts = version.split('.');
  parts[2] = parseInt(parts[2], 10) + 1;
  return parts.join('.');
}

try {
  // 1. Update package.json
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion);
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  // 2. Update manifest.json
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  console.log(`\n🚀 version bumped: v${oldVersion} -> v${newVersion}`);
  console.log(`\n✅ package.json updated`);
  console.log(`✅ manifest.json updated`);
  console.log(`\n⚠️  Don't forget to write your changelog before committing!\n`);
} catch (error) {
  console.error('Failed to bump version:', error);
  process.exit(1);
}
