import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const label = process.argv[2] ?? "before";
mkdirSync("/home/user/pfv1/.p22/lookbook", { recursive: true });
const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", FONTCONFIG_PATH: "/tmp/fonts", HOME: "/tmp" },
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto("http://localhost:5174/.p22-lookbook.html", { waitUntil: "load", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
for (const w of [1440, 390]) {
  await page.setViewport({ width: w, height: 900 });
  await new Promise((r) => setTimeout(r, 800));
  const m = await page.evaluate(() => [...document.querySelectorAll("[data-state]")].map((s) => {
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    const frame = s.querySelector(".pf-sec-look__frame");
    const wrap = s.querySelector(".pf-sec-look__imgwrap");
    return {
      state: s.dataset.state.slice(0, 34),
      sectionH: Math.round(s.querySelector(".pf-sec-look")?.getBoundingClientRect().height ?? 0),
      visual: box(s.querySelector(".pf-sec-look__visual")),
      imgwrapH: wrap ? Math.round(wrap.getBoundingClientRect().height) : null,
      frame: frame ? box(frame) : null,
      imgs: s.querySelectorAll(".pf-sec-look img").length,
      gridCols: getComputedStyle(s.querySelector(".pf-sec-look__grid")).gridTemplateColumns,
    };
  }));
  console.log(`── ${label} @ ${w}`);
  for (const r of m) console.log("   ", JSON.stringify(r));
  await page.screenshot({ path: `/home/user/pfv1/.p22/lookbook/${label}-${w}-full.png`, fullPage: true });
}
console.log("errors:", errors);
await browser.close();
