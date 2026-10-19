/**
 * Ad-hoc authenticated path capture (development only).
 * Usage: node scripts/visual-audit/capture-paths.mjs --label x --role admin|employee \
 *          --paths /a,/b --widths 1536,390
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
  return acc;
}, []));
const BASE = args.base || "http://localhost:5173";
const LABEL = args.label || "paths";
const ROLE = args.role || "admin";
const WIDTHS = (args.widths || "1536").split(",").map(Number);
const OUT = path.resolve(args.out || `docs/phase-3-refinement/evidence/${LABEL}`);
const PATHS = (args.paths || "/super-admin").split(",");
const creds = ROLE === "employee"
  ? { identifier: process.env.PF_EMPLOYEE_EMAIL || "employee1@pratikshya.local", password: process.env.PF_EMPLOYEE_PASSWORD || "Employee@123" }
  : { identifier: process.env.PF_ADMIN_EMAIL || "admin@pratikshya.local", password: process.env.PF_ADMIN_PASSWORD || "Admin@PF2026!" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
  if (!res.ok) throw new Error(`sign-in failed ${res.status}`);
  const auth = await res.json();
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args.filter((a) => !a.includes("single-process") || a.includes("hide-scrollbars")), "--font-render-hinting=none"],
    headless: true,
  });
  const log = [];
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width > 1024 ? 900 : 844, deviceScaleFactor: 1 });
    page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !m.text().includes("ERR_CONNECTION_CLOSED")) log.push({ width, url: page.url(), type: m.type(), text: m.text().slice(0, 500) }); });
    page.on("pageerror", (e) => log.push({ width, url: page.url(), type: "pageerror", text: String(e).slice(0, 500) }));
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ role, data }) => {
      const scope = role === "employee" ? "employee" : "admin";
      localStorage.setItem(`pf_${scope}_access_token`, data.access_token);
      localStorage.setItem(`pf_${scope}_refresh_token`, data.refresh_token);
      localStorage.setItem(`pratikshya_${scope}_auth`, JSON.stringify(role === "employee" ? data.employee : data.admin));
    }, { role: ROLE, data: auth });
    for (const p of PATHS) {
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle2" });
      await sleep(900);
      await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
      const info = await page.evaluate(() => ({
        overflowX: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1,
        title: document.querySelector("h1")?.innerText ?? "",
        boundary: Boolean(document.querySelector("h1") === null && document.body.innerText.includes("could not be opened")),
      }));
      const name = p.replace(/^\//, "").replace(/[\/]+/g, "-") || "root";
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.jpg`), type: "jpeg", quality: 82, fullPage: true });
      console.log(`${p} @${width} → ${name}-${width}.jpg${info.overflowX ? " ⚠OVERFLOW" : ""}${info.boundary ? " ⚠BOUNDARY" : ""} (${info.title})`);
    }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(log, null, 2));
  console.log("console:", log.length);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
