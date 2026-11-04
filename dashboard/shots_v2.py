from playwright.sync_api import sync_playwright
U = "https://rockshell-dw.afriyierodney64.workers.dev"
OUT = "/workspace/rockshell/webapp/screenshots/v2_"
pages = ["overview", "projects", "suppliers", "dq", "star"]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def watch(pg):
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
    pg = b.new_page(viewport={"width": 1440, "height": 1500}); watch(pg)
    pg.goto(U, wait_until="networkidle"); pg.wait_for_timeout(1500)
    for name in pages:
        pg.click(f".tabs button[data-page={name}]"); pg.wait_for_timeout(1500)
        h = pg.evaluate("document.documentElement.scrollHeight"); pg.set_viewport_size({"width": 1440, "height": h}); pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}{name}.png")
        pg.set_viewport_size({"width": 1440, "height": 1500})
    pg.click(".tabs button[data-page=projects]"); pg.select_option("#projectFilter", "P001"); pg.wait_for_timeout(1500)
    h = pg.evaluate("document.documentElement.scrollHeight"); pg.set_viewport_size({"width": 1440, "height": h}); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}projects_projectA.png")
    print("ProjectA cards:", pg.inner_text("#prCards").replace("\n", " | "))
    pg.click(".tabs button[data-page=overview]"); pg.wait_for_timeout(800)
    print("overview cards:", pg.inner_text("#ovCards").replace("\n", " | "))
    print("titles:", pg.inner_text("#cpiTitle"), "/", pg.inner_text("#trendTitle"))
    pg.click(".tabs button[data-page=suppliers]"); pg.wait_for_timeout(800)
    print("supplier cards:", pg.inner_text("#spCards").replace("\n", " | "))
    print("titles:", pg.inner_text("#onTimeTitle"), "/", pg.inner_text("#premTitle"))
    pg.click(".tabs button[data-page=dq]"); pg.wait_for_timeout(800)
    print("dq cards:", pg.inner_text("#dqCards").replace("\n", " | "))
    print("footer:", pg.inner_text("footer"))
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2); watch(m)
    for name in ["overview", "suppliers"]:
        m.goto(f"{U}/#{name}", wait_until="networkidle"); m.wait_for_timeout(1800)
        h = m.evaluate("document.documentElement.scrollHeight"); m.set_viewport_size({"width": 390, "height": h}); m.wait_for_timeout(600)
        m.screenshot(path=f"{OUT}mobile_{name}.png"); m.set_viewport_size({"width": 390, "height": 844})
    print("horizontal overflow (mobile):", m.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
    print("errors:", errs)
    b.close()
