/**
 * Console triage probe (development only).
 * Usage: node scripts/visual-audit/probe-console.mjs --role admin \
 *          --paths /super-admin/dashboard,/super-admin/products
 *
 * Groups console warnings/errors by normalised text so repeated React
 * warnings ("Each child in a list should have a unique key") surface once
 * with a count and the page that emitted them.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const BASE = args.base || "http://localhost:5173";
const ROLE = args.role || "admin";
const PATHS = (args.paths || "/super-admin/dashboard").split(",");
const OUT = path.resolve(args.out || "docs/phase-3-refinement/evidence/console-triage");
const creds =
  ROLE === "employee"
    ? { identifier: "employee1@pratishya.local", password: "Employee@123" }
    : { identifier: "admin@pratikshya.local", password: "Admin@PF2026!" };
if (ROLE === "employee") creds.identifier = "employee1@pratikshya.local";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!res.ok) throw new Error(`sign-in failed ${res.status}`);
  const auth = await res.json();
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args.filter((a) => !a.includes("single-process")), "--font-render-hinting=none"],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 950, deviceScaleFactor: 1 });
  const raw = [];
  page.on("console", async (m) => {
    if (!["error", "warning"].includes(m.type())) return;
    const entry = { page: page.url(), type: m.type(), text: m.text() };
    if (m.text().includes("same key")) {
      try {
        entry.args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?")));
      } catch { /* ignored */ }
    }
    raw.push(entry);
  });
  page.on("pageerror", (e) => raw.push({ page: page.url(), type: "pageerror", text: String(e) }));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ role, data }) => {
    const scope = role === "employee" ? "employee" : "admin";
    localStorage.setItem(`pf_${scope}_access_token`, data.access_token);
    localStorage.setItem(`pf_${scope}_refresh_token`, data.refresh_token);
    localStorage.setItem(`pratikshya_${scope}_auth`, JSON.stringify(role === "employee" ? data.employee : data.admin));
  }, { role: ROLE, data: auth });

  const perPage = [];
  for (const p of PATHS) {
    const before = raw.length;
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle2" });
    await sleep(1200);
    perPage.push({ path: p, count: raw.length - before });
  }

  const groups = new Map();
  for (const entry of raw) {
    const key = entry.text.replace(/at .*?:\d+:\d+/g, "").slice(0, 180);
    const g = groups.get(key) ?? { text: entry.text.slice(0, 400), type: entry.type, count: 0, pages: new Set() };
    g.count += 1;
    g.pages.add(entry.page.replace(BASE, ""));
    groups.set(key, g);
  }
  const report = {
    total: raw.length,
    perPage,
    groups: [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .map((g) => ({ ...g, pages: [...g.pages] })),
  };
  fs.writeFileSync(path.join(OUT, "console-triage.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ total: report.total, perPage }, null, 2));
  for (const g of report.groups.slice(0, 12)) {
    console.log(`\n×${g.count} [${g.type}] ${g.text.slice(0, 220).replace(/\n/g, " ⏎ ")}`);
    console.log(`   pages: ${g.pages.join(", ")}`);
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
