import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1]; pre=sys.argv[2]
with sync_playwright() as p:
  b=p.chromium.launch(); errs=[]
  for name,vp,sf in [("desktop",{"width":1440,"height":900},1),("mobile",{"width":390,"height":844},2)]:
    pg=b.new_page(viewport=vp,device_scale_factor=sf); pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.goto(U,wait_until="networkidle"); pg.wait_for_timeout(1500)
    h=pg.evaluate("document.documentElement.scrollHeight"); pg.set_viewport_size({"width":vp["width"],"height":h}); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{pre}{name}.png")
    if name=="desktop": print(pg.inner_text("main").replace("\n"," | ")); print(pg.inner_text("footer"))
    else: print("overflow:",pg.evaluate("document.documentElement.scrollWidth>window.innerWidth"))
  print("errors",errs); b.close()
