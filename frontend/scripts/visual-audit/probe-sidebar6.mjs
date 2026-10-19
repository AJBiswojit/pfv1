/**
 * Sidebar scroll-contract evidence (development only).
 *
 * Headless Chromium paints no scrollbars, so this probe records the CSS
 * contract (computed `scrollbar-width` / `scrollbar-color`, the mask, the
 * scroll owner) plus geometry that proves the rail is the only scroller, the
 * footer cannot overlap the nav, the first group heading is not clipped at
 * the scroll start, and the active item is fully visible after a deep link.
 *
 * Usage: node scripts/visual-audit/probe-sidebar6.mjs
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const BASE = "http://localhost:5173";
const OUT = path.resolve("docs/phase-3-refinement/evidence/probe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${BASE}/api/v1/auth/staff/sign-in`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin@pratikshya.local", password: "Admin@PF2026!" }),
});
const auth = await res.json();
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((a) => !a.includes("single-process") || a.includes("hide-scrollbars"))],
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1536, height: 768, deviceScaleFactor: 1 });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.evaluate((d) => {
  localStorage.setItem("pf_admin_access_token", d.access_token);
  localStorage.setItem("pf_admin_refresh_token", d.refresh_token);
  localStorage.setItem("pratikshya_admin_auth", JSON.stringify(d.admin));
  localStorage.removeItem("pf_admin_nav_groups");
}, auth);
await page.goto(`${BASE}/super-admin/dashboard`, { waitUntil: "networkidle2" });
await sleep(1200);

/* Open every group so the rail genuinely overflows at 768px height. */
await page.evaluate(() => {
  document
    .querySelectorAll("#admin-navigation button[aria-expanded='false']")
    .forEach((button) => button.click());
});
await sleep(500);

const metrics = await page.evaluate(() => {
  const nav = document.querySelector("#admin-navigation");
  const navBox = nav.getBoundingClientRect();
  const footer = nav.parentElement.querySelector("div.shrink-0.bg-pf-wine");
  const footerBox = footer?.getBoundingClientRect();
  const cs = getComputedStyle(nav);
  /* Every element inside the rail whose content can scroll. */
  const scrollable = [...nav.parentElement.querySelectorAll("*")].filter((el) => {
    const style = getComputedStyle(el);
    const scrollsY = ["auto", "scroll"].includes(style.overflowY);
    return scrollsY && el.scrollHeight > el.clientHeight + 1;
  });
  const headings = [...nav.querySelectorAll("h2 span.truncate")];
  const first = headings[0];
  const firstBox = first?.getBoundingClientRect();

  /* At the very top of the rail the first group heading must be fully
     painted: inside the nav box and hit-testable at its own centre. */
  nav.scrollTop = 0;
  const atTop = first ? document.elementFromPoint(
    Math.round(firstBox.x + Math.min(20, firstBox.width / 2)),
    Math.round(firstBox.y + firstBox.height / 2),
  ) : null;

  /* Deep link: the last item, scrolled into view by the component. */
  const links = [...nav.querySelectorAll("a")];
  const last = links[links.length - 1];
  last.focus();
  const lastBox = last.getBoundingClientRect();

  return {
    nav: {
      id: nav.id,
      clientHeight: nav.clientHeight,
      scrollHeight: nav.scrollHeight,
      scrollTop: nav.scrollTop,
      overflowY: cs.overflowY,
      overflowX: cs.overflowX,
      scrollbarWidth: cs.scrollbarWidth,
      scrollbarColor: cs.scrollbarColor,
      maskImage: cs.maskImage || cs.webkitMaskImage,
      scrollPaddingBlock: cs.scrollPaddingBlockStart,
      focusOutline: `${cs.outlineColor} ${cs.outlineWidth}`,
    },
    railScrollerCount: scrollable.length,
    railScrollerIds: scrollable.map((el) => el.id || el.className.toString().slice(0, 40)),
    pageScroll: {
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      documentScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
      horizontal: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
    },
    footer: footerBox
      ? {
          top: Math.round(footerBox.top),
          bottom: Math.round(footerBox.bottom),
          navBottom: Math.round(navBox.bottom),
          overlapsNav: footerBox.top < navBox.bottom - 1,
          insideViewport: footerBox.bottom <= window.innerHeight + 1,
        }
      : null,
    firstHeading: first
      ? {
          text: first.textContent.trim(),
          top: Math.round(firstBox.top),
          navTop: Math.round(navBox.top),
          fullyInside: firstBox.top >= navBox.top - 0.5,
          hitTarget: atTop?.closest("button")?.textContent?.trim().slice(0, 30) ?? atTop?.tagName ?? null,
        }
      : null,
    deepLink: {
      label: last.textContent.trim().slice(0, 40),
      top: Math.round(lastBox.top),
      bottom: Math.round(lastBox.bottom),
      withinNav: lastBox.top >= navBox.top - 0.5 && lastBox.bottom <= navBox.bottom + 0.5,
      focused: document.activeElement === last,
    },
    focusRing: (() => {
      const cs = getComputedStyle(last); /* read after await below */
      return {
        outlineColor: cs.outlineColor,
        outlineWidth: cs.outlineWidth,
        outlineOffset: cs.outlineOffset,
        boxShadow: cs.boxShadow,
      };
    })(),
  };
});

/* Mid-scroll screenshot of the rail so the mask treatment is visible. */
const railBox = await page.evaluate(() => {
  const nav = document.querySelector("#admin-navigation");
  const rail = nav.parentElement;
  const r = rail.getBoundingClientRect();
  nav.scrollTop = Math.round((nav.scrollHeight - nav.clientHeight) / 2);
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
await sleep(300);
await page.screenshot({ path: path.join(OUT, "sidebar-midscroll.png"), clip: railBox });
await page.evaluate(() => {
  const nav = document.querySelector("#admin-navigation");
  nav.scrollTop = 0;
});
await sleep(300);
await page.screenshot({ path: path.join(OUT, "sidebar-top.png"), clip: railBox });

await page.evaluate(() => {
  const links = [...document.querySelectorAll("#admin-navigation a")];
  links[links.length - 1]?.focus();
});
await sleep(400); /* the 150ms outline-colour transition settles */
metrics.focusRingSettled = await page.evaluate(() => {
  const links = [...document.querySelectorAll("#admin-navigation a")];
  const el = links[links.length - 1];
  const cs = getComputedStyle(el);
  return { outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow };
});

fs.writeFileSync(path.join(OUT, "sidebar-metrics.json"), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
