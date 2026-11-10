"""Copy dashboard/public files next to src/worker.js for Wrangler.

Wrangler serves those files as text or data modules. The script renames the
JavaScript, JSON and SVG files with a .txt suffix so they are not executed
as modules. It does not read environment variables and it does not write secrets.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUB = ROOT / 'public'
SRC = ROOT / 'src'
COPIES = {
    'index.html': 'index.html',
    'styles.css': 'styles.css',
    'app.js': 'app.js.txt',
    'chart.umd.min.js': 'chart.umd.min.js.txt',
    'erd.png': 'erd.png',
    'schema.svg': 'schema.svg.txt',
}

def main():
    missing = [name for name in COPIES if not (PUB / name).is_file()]
    if missing:
        raise SystemExit('Missing public files: ' + ', '.join(missing))
    for src, dest in COPIES.items():
        data = (PUB / src).read_bytes()
        (SRC / dest).write_bytes(data)
    print('Staged', len(COPIES), 'files in', SRC)

if __name__ == '__main__':
    main()
