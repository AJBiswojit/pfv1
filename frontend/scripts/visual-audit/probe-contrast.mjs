/**
 * Rendered contrast probe (development only).
 *
 * Samples real DOM nodes on the running app, resolves the effective opaque
 * background by walking ancestors, and reports WCAG AA ratios. Large text
 * (>= 24px, or >= 18.66px bold) is judged at 3:1, everything else at 4.5:1.
 *
 * Usage: node scripts/visual-audit/probe-contrast.mjs
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const BASE = "http://localhost:5173";
const OUT = path.resolve("docs/phase-3-refinement/evidence/probe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const signIn = async (identifier, password) => {
  const res = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed ${res.status}`);
  return res.json();
};

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !a.includes("single-process"))],
  headless: true,
});

const parser = (() => {
  const canvas = null; // resolved in-page instead
  return null;
})();
void parser;

const collect = async (page, label) => {
  const rows = await page.evaluate(() => {
    const parse = (value) => {
      const m = String(value).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(/[, /]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const luminance = ({ r, g, b }) => {
      const f = (c) => {
        const v = c / 255;
        return v > 0.03928 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const effectiveBg = (el) => {
      let node = el;
      let color = { r: 251, g: 244, b: 235, a: 1 }; // staff ivory canvas
      const stack = [];
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) stack.push(bg);
        if (bg && bg.a >= 0.999) break;
        node = node.parentElement;
      }
      color = stack.length ? stack[stack.length - 1] : color;
      for (let i = stack.length - 2; i >= 0; i -= 1) color = over(stack[i], color);
      return color;
    };

    const samples = [];
    const add = (selector, name, { all = false, limit = 6 } = {}) => {
      const nodes = [...document.querySelectorAll(selector)];
      const list = all ? nodes.slice(0, limit) : nodes.slice(0, 1);
      list.forEach((el, index) => {
        if (!el || !el.innerText?.trim()) return;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg) return;
        const bg = effectiveBg(el);
        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const text = el.innerText.trim().replace(/\s+/g, " ").slice(0, 48);
        samples.push({
          name: all ? `${name}[${index}]` : name,
          text,
          fg: cs.color,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          size,
          weight,
          large,
          ratio: Math.round(ratio(fg, bg) * 100) / 100,
          required: large ? 3 : 4.5,
        });
      });
    };

    add("main h1", "page heading");
    add("main p", "body copy", { all: true, limit: 3 });
    add("article p", "kpi label");
    add("article .font-display", "kpi value", { all: true, limit: 4 });
    add("main table th", "table head");
    add("main table td", "table cell");
    add("main label", "form label", { all: true, limit: 2 });
    add("aside nav a[aria-current='page']", "active nav");
    add("aside nav a:not([aria-current])", "nav link", { all: true, limit: 2 });
    add("aside nav h2 span.truncate", "nav section head");
    add("aside p.font-display", "sidebar identity");
    add("header p", "masthead role");

    return samples;
  });
  return rows.map((row) => ({ page: label, ...row }));
};

const scenarios = [
  {
    label: "admin/dashboard",
    creds: { identifier: "admin@pratikshya.local", password: "Admin@PF2026!" },
    scope: "admin",
    paths: ["/super-admin/dashboard"],
  },
  {
    label: "admin/analytics",
    creds: { identifier: "admin@pratikshya.local", password: "Admin@PF2026!" },
    scope: "admin",
    paths: ["/super-admin/analytics"],
  },
  {
    label: "admin/products",
    creds: { identifier: "admin@pratikshya.local", password: "Admin@PF2026!" },
    scope: "admin",
    paths: ["/super-admin/products"],
  },
  {
    label: "employee/desk",
    creds: { identifier: "employee1@pratikshya.local", password: "Employee@123" },
    scope: "employee",
    paths: ["/employee"],
  },
];

fs.mkdirSync(OUT, { recursive: true });
const results = [];
for (const scenario of scenarios) {
  const auth = await signIn(scenario.creds.identifier, scenario.creds.password);
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 950, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ scope, data }) => {
      localStorage.setItem(`pf_${scope}_access_token`, data.access_token);
      localStorage.setItem(`pf_${scope}_refresh_token`, data.refresh_token);
      localStorage.setItem(
        `pratikshya_${scope}_auth`,
        JSON.stringify(scope === "employee" ? data.employee : data.admin),
      );
    },
    { scope: scenario.scope, data: auth },
  );
  for (const p of scenario.paths) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle2" });
    await sleep(1200);
    results.push(...(await collect(page, scenario.label)));
  }
  await page.close();
}
await browser.close();

const failures = results.filter((row) => row.ratio + 0.01 < row.required);
const summary = {
  sampled: results.length,
  failures: failures.length,
  worst: [...results].sort((a, b) => a.ratio - b.ratio).slice(0, 8),
  byPage: Object.fromEntries(
    [...new Set(results.map((r) => r.page))].map((pageName) => {
      const rows = results.filter((r) => r.page === pageName);
      return [pageName, { sampled: rows.length, failures: rows.filter((r) => r.ratio + 0.01 < r.required).length }];
    }),
  ),
};
fs.writeFileSync(path.join(OUT, "contrast.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.log(failures.map((f) => `${f.page} · ${f.name} ${f.ratio} < ${f.required} · "${f.text}"`).join("\n"));
}
