/** Sidebar scrollbar + numeral probe (development only). */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const BASE="http://localhost:5173";
const OUT=path.resolve("docs/phase-3-refinement/evidence/probe");
const res=await fetch(`${BASE}/api/v1/auth/staff/sign-in`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"admin@pratikshya.local",password:"Admin@PF2026!"})});
const auth=await res.json();
fs.mkdirSync(OUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.includes("single-process")),"--font-render-hinting=none"],headless:true});
const page=await browser.newPage();
await page.setViewport({width:1536,height:900});
await page.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"});
await page.evaluate(d=>{localStorage.setItem("pf_admin_access_token",d.access_token);localStorage.setItem("pf_admin_refresh_token",d.refresh_token);localStorage.setItem("pratikshya_admin_auth",JSON.stringify(d.admin));},auth);
await page.goto(`${BASE}/super-admin`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,1500));

const metrics=await page.evaluate(()=>{
  const nav=document.querySelector("#admin-navigation");
  const cs=nav?getComputedStyle(nav):null;
  const aside=nav?.closest("aside");
  const frame=nav?.closest("div[class*='sticky']")??nav?.parentElement;
  return {
    nav: nav && {
      scrollHeight: nav.scrollHeight, clientHeight: nav.clientHeight, offsetWidth: nav.offsetWidth,
      scrollbarWidth: getComputedStyle(nav).scrollbarWidth,
      scrollbarColor: getComputedStyle(nav).scrollbarColor || getComputedStyle(nav).scrollbarGutter,
      overflowY: cs.overflowY, gutter: nav.offsetWidth - nav.clientWidth,
      mask: cs.maskImage || cs.webkitMaskImage,
    },
    aside: aside && { width: aside.offsetWidth, height: aside.offsetHeight, scrollHeight: aside.scrollHeight, clientHeight: aside.clientHeight, overflowY: getComputedStyle(aside).overflowY },
    frame: frame && { tag: frame.tagName, height: frame.clientHeight, scrollHeight: frame.scrollHeight, overflowY: getComputedStyle(frame).overflowY },
    docOverflowX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    scrollContainers: [...document.querySelectorAll(".pf-staff *")].filter((el)=>{const s=getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2;}).map(el=>({id:el.id||null,cls:el.className?.toString().slice(0,60),sh:el.scrollHeight,ch:el.clientHeight})),
  };
});
console.log(JSON.stringify(metrics,null,1));

// sidebar at middle scroll
await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); if(n) n.scrollTop = Math.round(n.scrollHeight/2.4);});
await new Promise(r=>setTimeout(r,400));
const asideBox=await page.evaluate(()=>{const a=document.querySelector("aside"); const r=a.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};});
await page.screenshot({path:path.join(OUT,"sidebar-mid-1536.png"),clip:{x:asideBox.x,y:asideBox.y,width:Math.min(asideBox.width+20,300),height:asideBox.height}});

// hover the nav to reveal the stronger thumb then crop the right edge
await page.mouse.move(asideBox.x+asideBox.width-6, asideBox.y+300);
await new Promise(r=>setTimeout(r,500));
await page.screenshot({path:path.join(OUT,"sidebar-hover-1536.png"),clip:{x:asideBox.x,y:asideBox.y,width:Math.min(asideBox.width+20,300),height:asideBox.height}});

// KPI numerals: orders page
await page.goto(`${BASE}/super-admin/orders`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,1200));
const kpi=await page.evaluate(()=>{const s=document.querySelector("section[aria-label='Order metrics']"); if(!s) return null; const r=s.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height, text:[...s.querySelectorAll("p")].map(p=>p.innerText).slice(0,12)};});
console.log("KPI", JSON.stringify(kpi));
if(kpi) await page.screenshot({path:path.join(OUT,"kpi-numerals-1536.png"),clip:{x:kpi.x,y:kpi.y,width:kpi.width,height:Math.min(kpi.height,260)}});
await browser.close();
