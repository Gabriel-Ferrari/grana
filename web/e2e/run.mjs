// Testes de tela (Playwright) contra o app LOCAL: `npx ng serve` (:4200) + `npx supabase start` com o
// usuário dev (dev@grana.local / devdev123, dados de teste). Uso: npm run e2e [-- nome-do-arquivo]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = {
    ...process.env,
    TARGET_URL: process.env.TARGET_URL ?? 'http://localhost:4200',
    TEST_EMAIL: process.env.TEST_EMAIL ?? 'dev@grana.local',
    TEST_PASSWORD: process.env.TEST_PASSWORD ?? 'devdev123',
    OUT_DIR: process.env.OUT_DIR ?? join(tmpdir(), 'grana-e2e'),
};
mkdirSync(env.OUT_DIR, { recursive: true });
const only = process.argv.slice(2);
const files = readdirSync(here)
    .filter((f) => f.endsWith('.cjs') && (!only.length || only.some((o) => f.includes(o))))
    .sort((a, b) => (a === 'geral.cjs' ? -1 : b === 'geral.cjs' ? 1 : a.localeCompare(b)));

let failed = 0;
for (const f of files) {
    const r = spawnSync(process.execPath, [join(here, f)], { env, encoding: 'utf8', timeout: 10 * 60_000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const ok = (out.match(/✅/g) ?? []).length;
    const bad = out.split('\n').filter((l) => /❌|💥|Error:/.test(l));
    const status = r.status !== 0 || bad.length ? '✗' : '✓';
    if (status === '✗') failed++;
    console.log(`${status} ${f.padEnd(22)} ${ok} ok${bad.length ? `, ${bad.length} falha(s)` : ''}`);
    for (const l of bad.slice(0, 5)) console.log('    ' + l.trim());
}
console.log(`\nprints em ${env.OUT_DIR}`);
process.exit(failed ? 1 : 0);
