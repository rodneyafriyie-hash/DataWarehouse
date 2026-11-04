import sys
from playwright.sync_api import sync_playwright
U = "https://rockshell-dw.afriyierodney64.workers.dev"
pages = ["overview", "budget", "suppliers", "labour", "clients", "dq", "star"]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 1900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(U, wait_until="networkidle")
    pg.wait_for_timeout(1500)
    for name in pages:
        pg.click(f".tabs button[data-page={name}]"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f"/workspace/rockshell/webapp/screenshots/{name}.png")
    pg.click(".tabs button[data-page=budget]"); pg.wait_for_timeout(500)
    print("EVM row:", pg.inner_text("#evmTable tbody tr:first-child"))
    pg.select_option("#projectFilter", "P001"); pg.click(".tabs button[data-page=overview]"); pg.wait_for_timeout(1000)
    pg.screenshot(path="/workspace/rockshell/webapp/screenshots/overview_P001.png")
    print("cards P001:", pg.inner_text("#kpiCards").replace("\n", " | "))
    print("footer:", pg.inner_text("footer"))
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.goto(U + "/#suppliers", wait_until="networkidle"); m.wait_for_timeout(1500)
    m.screenshot(path="/workspace/rockshell/webapp/screenshots/mobile_suppliers.png")
    print("errors:", errs)
    b.close()
