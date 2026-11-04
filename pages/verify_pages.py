from playwright.sync_api import sync_playwright
U = "https://rockshell-dw.pages.dev"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={"width": 1440, "height": 1100})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(U, wait_until="networkidle"); pg.wait_for_timeout(2000)
    pg.screenshot(path="/workspace/rockshell/webapp/screenshots/pages_overview.png")
    print("overview:", pg.inner_text("#cpiTitle"))
    for t, sel in [("projects", "#evmTable tbody tr:first-child"), ("suppliers", "#onTimeTitle"), ("dq", "#dqCards"), ("star", "#countTable tbody tr:first-child")]:
        pg.click(f".tabs button[data-page={t}]"); pg.wait_for_timeout(1200)
        print(t + ":", pg.inner_text(sel).replace("\n", " | ")[:200])
    print("star img loaded:", pg.evaluate("document.querySelector('.erd img').naturalWidth"))
    print("footer:", pg.inner_text("footer"))
    m = b.new_page(viewport={"width": 390, "height": 844}); m.on("pageerror", lambda e: errs.append(str(e)))
    m.goto(U, wait_until="networkidle"); m.wait_for_timeout(1500)
    print("mobile overflow:", m.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
    print("errors:", errs); b.close()
