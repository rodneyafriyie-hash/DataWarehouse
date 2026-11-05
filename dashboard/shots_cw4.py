from playwright.sync_api import sync_playwright
import sys
OUT="/workspace/rockshell/webapp/screenshots/cw4_"
with sync_playwright() as p:
  b=p.chromium.launch(); errs=[]
  for host,U in [("pages","https://rockshell-dw.pages.dev/"),("worker","https://rockshell-dw.afriyierodney64.workers.dev/")]:
    pg=b.new_page(viewport={"width":1440,"height":1200})
    pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.goto(U,wait_until="networkidle"); pg.wait_for_timeout(1500)
    for t in ["overview","projects","procurement","labour","materials","dq","schema"]:
      pg.click(f".tabs button[data-page={t}]"); pg.wait_for_timeout(900)
      if host=="pages":
        h=pg.evaluate("document.documentElement.scrollHeight"); pg.set_viewport_size({"width":1440,"height":h}); pg.wait_for_timeout(400)
        pg.screenshot(path=f"{OUT}{t}.png"); pg.set_viewport_size({"width":1440,"height":1200})
    print(host, pg.inner_text("footer"), "| erd w:", pg.evaluate("document.querySelector('.erd img').naturalWidth"))
  print("errors:",errs); b.close()
