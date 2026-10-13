import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", FONTCONFIG_PATH: "/tmp/fonts", HOME: "/tmp" },
});
const page = await browser.newPage();
await page.goto("http://localhost:5174/?home=editorial", { waitUntil: "load", timeout: 90000 });
await new Promise((r) => setTimeout(r, 1800));
for (const [w, h, tag] of [[1440, 900, "1440"], [1100, 900, "1100"], [1024, 900, "1024"], [834, 1112, "834"], [390, 844, "390"]]) {
  await page.setViewport({ width: w, height: h });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 700));
  const info = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.left)}..${Math.round(b.right)}`; };
    const right = document.querySelector(".pf-shell__right");
    const left = document.querySelector(".pf-shell__left");
    return {
      left: r(left), leftKids: [...left.children].map((c) => `${c.className.split(" ").pop()}:${getComputedStyle(c).display}:${r(c)}`).join(" | "),
      brand: r(document.querySelector(".pf-shell__brand")),
      right: r(right), rightKids: [...right.children].map((c) => `${(c.getAttribute("aria-label") || c.className.split(" ").pop()).slice(0, 12)}:${getComputedStyle(c).display}`).join(" | "),
    };
  });
  console.log(`@${w} left=${info.left} [${info.leftKids}]  brand=${info.brand}  right=${info.right} [${info.rightKids}]`);
  await page.screenshot({ path: `/home/user/pfv1/.p22/evidence/${tag}-header-final.png`, clip: { x: 0, y: 0, width: w, height: 120 } });
  await page.screenshot({ path: `/home/user/pfv1/.p22/evidence/${tag}-viewport-final.png` });
  await page.evaluate(async () => { document.documentElement.style.scrollBehavior = "auto"; const h = document.documentElement.scrollHeight; for (let i = 0; i < 5; i += 1) { window.scrollTo({ top: h, behavior: "instant" }); await new Promise((r) => setTimeout(r, 220)); } });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `/home/user/pfv1/.p22/evidence/${tag}-footer-final.png` });
}
await browser.close();
