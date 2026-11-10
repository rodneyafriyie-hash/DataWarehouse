/**
 * Builds the Pages direct-upload worker and runs it.
 * No Supabase key is read or written. The RPC body is a local mock.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
const workerPath = join(root, 'dist', '_worker.js');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function check(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(file + ' failed node --check\n' + result.stderr);
}

const py = spawnSync('python3', ['build_pages_deploy.py', '--worker-only'], { cwd: root, encoding: 'utf8' });
if (py.status !== 0) throw new Error('worker build failed\n' + py.stdout + py.stderr);

check(workerPath);
check(join(repo, 'dashboard/src/worker.js'));
check(join(repo, 'dashboard/src/ledger_adapter.js'));

const generated = readFileSync(workerPath, 'utf8');
const secCount = generated.split('const SEC').length - 1;
assert(secCount === 1, 'generated worker has ' + secCount + ' const SEC bindings');
assert(!generated.includes("from './ledger_adapter.js'"), 'import was not inlined');
assert(!generated.includes('Accept-Profile'), 'generated worker uses schema REST');
assert(generated.includes('/rest/v1/rpc/rockshell_dashboard') || generated.includes("'/rest/v1/rpc/' + LEDGER_RPC"), 'RPC route missing');
for (const secret of ['eyJhbGci', 'sb_secret', 'service_role', 'ghp_', 'github_pat_', 'CLOUDFLARE_API_TOKEN']) {
  assert(!generated.includes(secret), 'secret-like text in generated worker: ' + secret);
}
assert(!generated.includes('SUPABASE_KEY') || generated.includes('env.SUPABASE_KEY'), 'key must stay an env read');
assert(!/SUPABASE_KEY"\s*:\s*"[^"]+"/.test(generated), 'a key value was written into the worker');

globalThis.caches = {
  default: {
    async match() { return null; },
    async put() {},
  },
};
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), method: options && options.method, headers: options && options.headers, body: options && options.body });
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        projects: [{ project_id: 'P-A', project_name: 'Synthetic', approved_budget_ghs: 10, actual_cost_ghs: 0, expense_lines: 0 }],
        categories: [],
        monthly: [],
        totals: { approved_budget_ghs: 10, actual_cost_ghs: 0, expense_lines: 0 },
        table_counts: { dim_project: 1, dim_date: 365, dim_cost_category: 5, fact_project_cost: 0 },
        quality_checks: { orphan_project_keys: 0 },
      };
    },
  };
};

const mod = await import(pathToFileURL(workerPath).href);
const env = { SUPABASE_URL: 'https://kthdkdbrokrcokngnfpy.supabase.co', SUPABASE_KEY: 'smoke-test-key' };
const ctx = { waitUntil() {} };

const page = await mod.default.fetch(new Request('https://example.test/'), env, ctx);
assert(page.status === 200, 'home status ' + page.status);
assert((await page.text()).includes('Rockshell ledger'), 'home HTML missing');

const api = await mod.default.fetch(new Request('https://example.test/api/data'), env, ctx);
assert(api.status === 200, 'api status ' + api.status);
const body = await api.json();
assert(body._source === 'live', 'worker did not mark a successful function call');
assert(body.totals.approved_budget_ghs === 10, 'mock total');
assert(body.projects.length === 1 && body.projects[0].actual_cost_ghs === 0, 'zero spend kept');
assert(calls.length === 1, 'one upstream call');
assert(calls[0].method === 'POST', calls[0].method);
assert(calls[0].url === 'https://kthdkdbrokrcokngnfpy.supabase.co/rest/v1/rpc/rockshell_dashboard', calls[0].url);
assert(calls[0].headers['Accept-Profile'] === undefined, 'profile header');
assert(calls[0].body === '{}', 'rpc body');
assert(!JSON.stringify(body).includes('smoke-test-key'), 'key leaked into JSON');

const denied = await mod.default.fetch(new Request('https://example.test/api/data', { method: 'POST' }), env, ctx);
assert(denied.status === 405, 'non-GET api status');

const missing = await mod.default.fetch(new Request('https://example.test/no-such'), env, ctx);
assert(missing.status === 404, 'missing asset status');

console.log('PASS generated Pages worker runs, and Worker modules parse');
