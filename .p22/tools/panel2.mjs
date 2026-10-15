import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", FONTCONFIG_PATH: "/tmp/fonts", HOME: "/tmp" },
  defaultViewport: { width: 390, height: 844 },
});
const page = await browser.newPage();
await page.goto("http://localhost:5174/?home=editorial", { waitUntil: "load", timeout: 90000 });
await new Promise((r) => setTimeout(r, 2000));
await page.click(".pf-shell__burger");
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const info = (sel) => [...document.querySelectorAll(sel)].map((el) => {
    const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
    return { cls: el.className.slice(0, 34), rect: `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`, pos: cs.position, inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`, z: cs.zIndex, opacity: cs.opacity, transform: cs.transform };
  });
  return { mobile: info(".pf-shell__mobile"), scrim: info(".pf-shell__scrim"), mmenu: info(".pf-shell__mmenu"), sheets: document.styleSheets.length };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: "/home/user/pfv1/.p22/final/editorial-390-panel2.png" });
await browser.close();
