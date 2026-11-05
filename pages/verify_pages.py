"""Check the dashboard. Static contract always runs. Browser checks need puppeteer-core.

    python pages/verify_pages.py
    NODE_PATH=/tmp/dash-test/node_modules CHROME_PATH=/usr/local/bin/google-chrome node pages/test_dashboard.mjs
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract = subprocess.run([sys.executable, str(ROOT / 'pages' / 'test_contract.py')])
sys.exit(contract.returncode)
