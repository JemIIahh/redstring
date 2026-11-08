import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright');
const workspace = await mkdtemp(join(tmpdir(), 'redstring-offline-'));
const artifacts = join(root, '.tmp/offline-ui');
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, 'workspace.json'), JSON.stringify({ workspace }));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) {
  if (file.startsWith('.') || file.startsWith('docs/') || file.startsWith('changelog/')) continue;
  await mkdir(dirname(join(workspace, file)), { recursive: true });
  await copyFile(join(root, file), join(workspace, file));
}
await symlink(join(root, 'node_modules'), join(workspace, 'node_modules'), 'dir');
const viteConfigPath = join(workspace, 'vite.config.ts');
const viteConfig = await readFile(viteConfigPath, 'utf8');
await writeFile(viteConfigPath, viteConfig.replace('export default defineConfig({',
  `export default defineConfig({\n  server: { fs: { allow: ${JSON.stringify([workspace, join(root, 'node_modules')])} } },`));
const { PATH, HOME, TMPDIR, USER, LOGNAME, SHELL, LANG, PNPM_HOME } = process.env;
const fixtureLog = join(workspace, '.offline-network.jsonl');
await writeFile(fixtureLog, '');
const serverLog = join(artifacts, 'server.log');
let logs = '';
const server = spawn('pnpm', ['exec', 'agent-native', 'dev', '--host', '127.0.0.1', '--port', '8094', '--strictPort'], {
  cwd: workspace,
  detached: true,
  env: {
    PATH, HOME, TMPDIR, USER, LOGNAME, SHELL, LANG, PNPM_HOME,
    NODE_OPTIONS: `--require=${join(root, 'tests/offline/provider-fixture.cjs')}`,
    DATABASE_URL: 'pglite:./data/offline',
    OPENAI_API_KEY: 'offline-fixture-key-not-a-real-credential',
    COMPANIES_HOUSE_API_KEY: 'offline-fixture-key-not-a-real-credential',
    OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
    AGENT_ENGINE: 'ai-sdk:openai', AGENT_MODEL: 'offline-approval-fixture',
    AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS: '0',
    AGENT_NATIVE_DISABLE_KEEP_WARM_BACKGROUND: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', b => { logs += b; });
server.stderr.on('data', b => { logs += b; });
const results = [];
const check = (name, condition, detail) => {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(JSON.stringify(results.at(-1)));
  assert.ok(condition, name);
};
let browser;
let page;
try {
  const origin = 'http://127.0.0.1:8094';
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { ready = (await fetch(origin + '/_agent-native/auth/local-dev', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    if (server.exitCode !== null) throw new Error('Offline server exited; inspect .tmp/offline-ui/server.log');
    await delay(500);
  }
  assert.ok(ready, 'Offline server starts');
  console.log('Offline server ready; external requests are blocked.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + '/cases');
  await page.waitForFunction(() => document.body.innerText.includes('Start a case') || document.body.innerText.includes('Continue as local dev'));
  if (await page.getByRole('button', { name: 'Continue as local dev' }).count()) await page.getByRole('button', { name: 'Continue as local dev' }).click();
  await page.getByLabel('Company name', { exact: true }).fill('OFFLINE APPROVAL FIXTURE');
  await page.getByRole('button', { name: 'Search registers', exact: true }).click();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await page.waitForURL(/\/case\//);
  const caseId = new URL(page.url()).pathname.split('/').at(-1);
  await page.locator('article[data-node-id]').first().click();
  const getBoard = async () => {
    const r = await context.request.get(origin + '/_agent-native/actions/get-board', { params: { caseId } });
    assert.equal(r.status(), 200);
    return r.json();
  };
  const exports = board => board.activity.filter(row => row.kind === 'export-brief').length;
  const submit = async marker => {
    await page.getByLabel('Ask the agent to go further on this', { exact: true }).fill(`${marker}: Export a sourced brief for this case.`);
    await page.getByRole('button', { name: 'Send to agent', exact: true }).click();
    await page.getByRole('button', { name: 'Approve', exact: true }).waitFor({ timeout: 45000 });
  };
  check('UI creates the offline case', (await getBoard()).nodes.length === 1, { caseId });
  await submit('OFFLINE_DENY');
  check('Approval appears before export runs', exports(await getBoard()) === 0);
  await page.screenshot({ path: join(artifacts, 'approval-pending.png'), fullPage: true });
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'hidden' });
  check('Deny leaves no export activity', exports(await getBoard()) === 0);
  await submit('OFFLINE_APPROVE');
  check('A fresh export asks again after denial', exports(await getBoard()) === 0);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByText('Based on public records retrieved on the dates shown. Not a finding of wrongdoing.', { exact: false }).last().waitFor({ timeout: 45000 });
  check('Approve resumes and exports exactly once', exports(await getBoard()) === 1);
  await page.screenshot({ path: join(artifacts, 'approval-completed.png'), fullPage: true });
  await page.getByRole('button', { name: 'Brief', exact: true }).click();
  await page.getByRole('button', { name: 'Make brief', exact: true }).click();
  await page.getByRole('button', { name: 'Download .md', exact: true }).waitFor();
  const markdown = await page.locator('pre[aria-label="Brief"]').innerText();
  check('Person Brief button runs directly', exports(await getBoard()) === 2);
  check('Brief cites the fixture and has the required footer', markdown.includes('[E1]') && markdown.includes('OFFLINE APPROVAL FIXTURE LLP') && markdown.trimEnd().endsWith('Based on public records retrieved on the dates shown. Not a finding of wrongdoing.'));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .md', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = join(artifacts, 'downloaded-brief.md');
  await download.saveAs(downloadPath);
  check('Downloaded brief equals the displayed text', await readFile(downloadPath, 'utf8') === markdown);
  await page.reload();
  await page.locator('article[data-node-id]').first().waitFor();
  check('Case and both exports persist after reload', exports(await getBoard()) === 2);
  check('No browser runtime errors', errors.length === 0, errors);
  const network = (await readFile(fixtureLog, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  check('Provider calls were answered by local fixtures', network.some(row => row.kind === 'model-fixture'));
  check('Fixture workspace has no .env', !(await access(join(workspace, '.env')).then(() => true, () => false)));
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ results, network, workspace }, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(join(artifacts, 'failure.txt'), await page.locator('body').innerText().catch(() => 'Page unavailable'));
  }
  throw error;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await writeFile(serverLog, logs);
  await copyFile(fixtureLog, join(artifacts, 'network.jsonl')).catch(() => {});
  await writeFile(join(artifacts, 'checks.json'), JSON.stringify(results, null, 2));
}
