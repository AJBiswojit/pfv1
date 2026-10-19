/**
 * Phase 3 visual audit harness (development only).
 *
 * Captures real, authenticated renders of the staff portal in headless
 * Chromium. Not part of the app bundle and never imported by src/.
 *
 * Usage:
 *   node scripts/visual-audit/capture.mjs --label before --base http://localhost:5173
 *
 * Env:
 *   PF_ADMIN_EMAIL / PF_ADMIN_PASSWORD  staff credentials for the local API.
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
const LABEL = args.label || "capture";
const ONLY = args.only ? args.only.split(",") : null;
const WIDTHS = (args.widths || "1536,1366,1024,768,390,320").split(",").map(Number);
const OUT = path.resolve(args.out || `docs/phase-3-refinement/evidence/${LABEL}`);

const CREDENTIALS = {
  identifier: process.env.PF_ADMIN_EMAIL || "admin@pratikshya.local",
  password: process.env.PF_ADMIN_PASSWORD || "Admin@PF2026!",
};

const PAGES = [
  { id: "dashboard", path: "/super-admin", full: true },
  { id: "analytics", path: "/super-admin/analytics", full: true },
  { id: "products", path: "/super-admin/products", full: true },
  { id: "product-review", path: "/super-admin/products/review", full: true },
  { id: "inventory", path: "/super-admin/inventory", full: true },
  { id: "orders", path: "/super-admin/orders", full: true },
  { id: "employees", path: "/super-admin/employees", full: true },
  { id: "categories", path: "/super-admin/categories", full: true },
  { id: "attendance", path: "/super-admin/attendance", full: true },
  { id: "media-homepage", path: "/super-admin/media/marketing", full: true },
  { id: "product-form", path: "/super-admin/products/new", full: true },
  { id: "settings", path: "/super-admin/settings", full: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const loginRes = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDENTIALS),
  });
  if (!loginRes.ok) throw new Error(`staff sign-in failed: ${loginRes.status}`);
  const auth = await loginRes.json();
  const profile = auth.admin;

  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath,
    args: [...chromium.args.filter((a) => !a.includes("single-process") || a.includes("hide-scrollbars")), "--font-render-hinting=none"],
    headless: true,
  });

  const consoleLog = [];
  const pages = ONLY ? PAGES.filter((p) => ONLY.includes(p.id)) : PAGES;

  for (const width of WIDTHS) {
    const height = width >= 1024 ? 900 : width >= 768 ? 1024 : 844;
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    page.on("console", (msg) => {
      if (["error", "warning"].includes(msg.type())) {
        consoleLog.push({ width, url: page.url(), type: msg.type(), text: msg.text() });
      }
    });
    page.on("pageerror", (err) => consoleLog.push({ width, url: page.url(), type: "pageerror", text: String(err) }));

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate((data) => {
      localStorage.setItem("pf_admin_access_token", data.access_token);
      localStorage.setItem("pf_admin_refresh_token", data.refresh_token);
      localStorage.setItem("pratikshya_admin_auth", JSON.stringify(data.admin));
    }, auth);

    /* Viewport-width matrix: every page gets a viewport shot at each width so
       overflow/stacking can be judged at 1366/1024/768/390/320. Full-page
       evidence stays a desktop artefact. */
    for (const target of pages) {
      const viewportOnly = width !== 1536 && target.full;
      const url = `${BASE}${target.path}`;
      await page.goto(url, { waitUntil: "networkidle2" });
      await sleep(900);
      await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
      await sleep(250);
      const metrics = await page.evaluate(() => {
        const el = document.scrollingElement;
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: el.scrollWidth > el.clientWidth + 1,
          title: document.querySelector("h1")?.innerText ?? "",
        };
      });
      const file = path.join(OUT, `${target.id}-${width}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: !viewportOnly && Boolean(target.full) });
      console.log(`${target.id} @ ${width} → ${path.relative(process.cwd(), file)}${metrics.overflowX ? "  ⚠ HORIZONTAL OVERFLOW" : ""}`);

      if (width === 1536) {
        // Scrollable sidebar evidence: scroll to the lower navigation and capture the footer.
        const nav = await page.$("#admin-navigation");
        if (nav) {
          await page.evaluate(() => {
            const n = document.querySelector("#admin-navigation");
            if (n) n.scrollTop = n.scrollHeight;
          });
          await sleep(500);
          const navFile = path.join(OUT, `${target.id}-sidebar-scrolled-${width}.jpg`);
          await page.screenshot({ path: navFile, type: "jpeg", quality: 82 });
        }
      }
    }

    if (width === 1536 || width === 390) {
      // Mobile drawer + account menu evidence.
      await page.goto(`${BASE}/super-admin`, { waitUntil: "networkidle2" });
      await sleep(700);
      if (width < 1024) {
        const trigger = await page.$('button[aria-controls="admin-navigation"]');
        if (trigger) {
          await trigger.click();
          await sleep(500);
          await page.screenshot({ path: path.join(OUT, `dashboard-drawer-${width}.jpg`), type: "jpeg", quality: 82 });
        }
      } else {
        const account = await page.$('button[aria-haspopup="menu"]');
        if (account) {
          await account.click();
          await sleep(400);
          await page.screenshot({ path: path.join(OUT, `dashboard-account-menu-${width}.jpg`), type: "jpeg", quality: 82 });
        }
      }
    }
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(consoleLog, null, 2));
  console.log(`console messages captured: ${consoleLog.length}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
