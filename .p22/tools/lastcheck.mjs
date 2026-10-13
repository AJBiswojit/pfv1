import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", FONTCONFIG_PATH: "/tmp/fonts", HOME: "/tmp" },
});
for (const [url, tag] of [["http://localhost:5174/?home=editorial", "editorial"], ["http://localhost:5174/?home=aarna", "aarna"]]) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1800));
  console.log(`\n=== ${tag}`);
  for (const w of [1440, 1024, 834, 768, 390]) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise((r) => setTimeout(r, 700));
    const m = await page.evaluate(() => {
      const h = document.querySelector("header");
      const brand = h.querySelector(".pf-shell__brand, .logo");
      const left = h.querySelector(".pf-shell__left, .header__left");
      const right = h.querySelector(".pf-shell__right, .header__right");
      const vis = (el) => el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
      const b = (el) => (el ? el.getBoundingClientRect() : null);
      const bb = b(brand), lb = b(left), rb = b(right);
      const nav = h.querySelector(".pf-shell__nav, .nav");
      const navBox = vis(nav) ? b(nav) : null;
      const overlaps = [];
      if (vis(left) && bb && lb.right > bb.left + 1) overlaps.push("left↔brand");
      if (vis(right) && bb && bb.right > rb.left + 1) overlaps.push("brand↔right");
      if (navBox && bb && navBox.right > bb.left + 1) overlaps.push("nav↔brand");
      return { vw: innerWidth, docW: document.documentElement.scrollWidth, brand: bb ? `${Math.round(bb.left)}..${Math.round(bb.right)}` : null,
        left: lb ? `${Math.round(lb.left)}..${Math.round(lb.right)}` : null, right: rb ? `${Math.round(rb.left)}..${Math.round(rb.right)}` : null,
        navVisible: Boolean(navBox), burger: vis(h.querySelector(".pf-shell__burger, .header__burger")), overlaps };
    });
    console.log(`  ${String(w).padStart(5)} docW=${m.docW} brand=${m.brand} left=${m.left} right=${m.right} nav=${m.navVisible} burger=${m.burger} overlaps=${m.overlaps.length ? m.overlaps.join(",") : "none"}${m.docW > m.vw ? "  H-OVERFLOW" : ""}`);
  }
  /* account dropdown (also inside the header) */
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise((r) => setTimeout(r, 600));
  const acct = await page.$('header a[aria-label^="Account"]');
  if (acct) {
    await acct.click();
    await new Promise((r) => setTimeout(r, 800));
    const dd = await page.evaluate(() => { const el = document.querySelector("[data-account-dropdown], .pf-shell__account [class*=absolute], [role=menu]"); if (!el) return null; const b = el.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)} pos=${getComputedStyle(el).position}`; });
    console.log(`  account dropdown: ${dd}`);
  }
  await page.close();
}
await browser.close();
