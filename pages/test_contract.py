"""Static checks for the ledger dashboard. No network and no hosted database.

The numeric fixtures live in pages/test_ledger_adapter.mjs and are synthetic.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'pages' / 'public' / 'index.html').read_text(encoding='utf-8')
JS = (ROOT / 'pages' / 'public' / 'app.js').read_text(encoding='utf-8')
SHARED = (ROOT / 'pages' / 'functions' / 'api' / '_shared.js').read_text(encoding='utf-8')
README = (ROOT / 'README.md').read_text(encoding='utf-8')

def main():
    errors = []
    if (ROOT / 'dashboard' / 'public' / 'index.html').read_text(encoding='utf-8') != HTML:
        errors.append('dashboard and pages HTML diverged')
    if (ROOT / 'dashboard' / 'public' / 'app.js').read_text(encoding='utf-8') != JS:
        errors.append('dashboard and pages JS diverged')
    if (ROOT / 'pages' / 'functions' / '_snapshot.json').exists() or (ROOT / 'dashboard' / 'public' / 'snapshot.json').exists():
        errors.append('stale snapshot file is still in the serving tree')
    if 'snapshot' in SHARED.lower():
        errors.append('API handler still mentions a snapshot fallback')
    if 'fact_procurement' in HTML or 'Purchases' in HTML or 'supplier' in HTML.lower():
        errors.append('dashboard HTML still presents removed subjects')
    if 'fact_procurement' in JS or 'purchase_total' in JS:
        errors.append('dashboard script still reads procurement')
    blob = HTML + JS + SHARED + README
    if '\u2014' in blob:
        errors.append('em dash in dashboard or README')
    if 'does not include a Power BI' not in README:
        errors.append('README must keep the Power BI statement')
    if 'fact_project_cost' not in HTML:
        errors.append('ledger scope is not stated')
    proc = subprocess.run(['node', str(ROOT / 'pages' / 'test_ledger_adapter.mjs')], capture_output=True, text=True)
    bundle = subprocess.run(['node', str(ROOT / 'pages' / 'test_deploy_bundle.mjs')], capture_output=True, text=True)
    if bundle.returncode != 0:
        errors.append('deploy bundle smoke test failed\n' + bundle.stdout + bundle.stderr)
    else:
        print(bundle.stdout.strip())
    # The expression above always uses node because a non-empty string is truthy.
    if proc.returncode != 0:
        errors.append('adapter test failed\n' + proc.stdout + proc.stderr)
    else:
        print(proc.stdout.strip())
    if errors:
        print('FAIL')
        print('\n'.join(errors))
        return 1
    print('PASS static ledger contract')
    return 0

if __name__ == '__main__':
    sys.exit(main())
