import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const width = Number(process.argv[3] ?? 1440);
const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", FONTCONFIG_PATH: "/tmp/fonts", HOME: "/tmp" },
  defaultViewport: { width, height: 900 },
});
const page = await browser.newPage();
await page.goto(process.argv[2], { waitUntil: "load", timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const box = (el) => { const b = el.getBoundingClientRect(); return { y: Math.round(b.top + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; };
  const sections = [...document.querySelectorAll("section")].map((s) => ({ cls: s.className.slice(0, 34), h: Math.round(s.getBoundingClientRect().height), text: (s.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70), imgs: s.querySelectorAll("img").length }));
  const look = document.querySelector(".pf-sec-look");
  const strip = document.querySelector(".pf-sec-strip, [class*=strip]");
  return {
    docH: document.documentElement.scrollHeight,
    sections: sections.filter((s) => s.h > 0),
    lookbook: look ? {
      box: box(look),
      imgwrap: (() => { const el = look.querySelector(".pf-sec-look__imgwrap"); return el ? box(el) : null; })(),
      frame: (() => { const el = look.querySelector(".pf-sec-look__frame"); return el ? { ...box(el), style: getComputedStyle(el).cssText ? { border: getComputedStyle(el).borderTopWidth + " " + getComputedStyle(el).borderTopColor, outline: getComputedStyle(el).outlineWidth } : null } : null; })(),
      img: (() => { const el = look.querySelector("img"); return el ? { src: el.getAttribute("src"), nat: `${el.naturalWidth}x${el.naturalHeight}`, box: box(el) } : null; })(),
      moods: [...look.querySelectorAll(".pf-sec-look__mood, button, p")].map((m) => (m.textContent || "").replace(/\s+/g, " ").trim().slice(0, 26)).filter(Boolean).slice(0, 8),
      html: look.outerHTML.slice(0, 400),
    } : null,
    strip: strip ? { cls: strip.className.slice(0, 40), box: box(strip) } : null,
    parentOfLook: look?.parentElement?.className,
  };
});
console.log(JSON.stringify(out, null, 1).slice(0, 4500));
await browser.close();
