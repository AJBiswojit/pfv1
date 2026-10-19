/**
 * Phase 3 employee-portal visual audit (development only).
 *
 * Signs in as the seeded Store Manager employee and captures the role
 * dashboard plus representative employee desks at desktop and mobile.
 * Mirrors capture.mjs (same Chromium packaging) but uses the employee
 * token scope so the portal's RBAC gate is exercised for real.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const BASE = args.base || "http://localhost:5173";
const LABEL = args.label || "employee";
const OUT = path.resolve(args.out || `docs/phase-3-refinement/evidence/${LABEL}`);
const CREDS = {
  identifier: process.env.PF_EMPLOYEE_EMAIL || "employee1@pratikshya.local",
  password: process.env.PF_EMPLOYEE_PASSWORD || "Employee@123",
};
const PAGES = [
  { id: "employee-dashboard", path: "/employee" },
  { id: "employee-orders", path: "/employee/orders" },
  { id: "employee-products", path: "/employee/products" },
  { id: "employee-attendance", path: "/employee/attendance" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDS),
  });
  if (!res.ok) throw new Error(`employee sign-in failed: ${res.status}`);
  const auth = await res.json();
  const profile = auth.employee ?? auth.admin;
  if (!profile) throw new Error("no employee profile in sign-in response");

  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args.filter((a) => !a.includes("single-process") || a.includes("hide-scrollbars")), "--font-render-hinting=none"],
    headless: true,
  });
  const log = [];
  for (const width of [1536, 390]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width > 1024 ? 900 : 844, deviceScaleFactor: 1 });
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) log.push({ width, url: page.url(), type: m.type(), text: m.text() });
    });
    page.on("pageerror", (err) => log.push({ width, url: page.url(), type: "pageerror", text: String(err) }));
    await page.goto(`${BASE}/employee/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate((data) => {
      localStorage.setItem("pf_employee_access_token", data.access_token);
      localStorage.setItem("pf_employee_refresh_token", data.refresh_token);
      localStorage.setItem("pratikshya_employee_auth", JSON.stringify(data.employee));
    }, auth);
    for (const target of PAGES) {
      if (width !== 1536 && target.id !== "employee-dashboard") continue;
      await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle2" });
      await sleep(900);
      await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
      const metrics = await page.evaluate(() => {
        const el = document.scrollingElement;
        return { overflowX: el.scrollWidth > el.clientWidth + 1, title: document.querySelector("h1")?.innerText ?? "" };
      });
      const file = path.join(OUT, `${target.id}-${width}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: true });
      console.log(`${target.id} @ ${width} → ${path.relative(process.cwd(), file)}${metrics.overflowX ? "  ⚠ HORIZONTAL OVERFLOW" : ""}  (${metrics.title})`);
    }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(log, null, 2));
  console.log(`console messages captured: ${log.length}`);
  await browser.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
