/** Expanded-sidebar scrollbar probe (development only). */
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
await new Promise(r=>setTimeout(r,1200));

// Expand every collapsed group by clicking its disclosure button.
const clicked=await page.evaluate(()=>{
  const nav=document.querySelector("#admin-navigation");
  const buttons=[...nav.querySelectorAll("button[aria-expanded='false']")];
  buttons.forEach(b=>b.click());
  return buttons.length;
});
await new Promise(r=>setTimeout(r,600));
const info=await page.evaluate(()=>{
  const nav=document.querySelector("#admin-navigation");
  const first=nav.querySelector("a,button");
  const r=nav.getBoundingClientRect();
  return {scrollHeight:nav.scrollHeight, clientHeight:nav.clientHeight, gutter:nav.offsetWidth-nav.clientWidth,
    scrollTop:nav.scrollTop, navLeft:r.left, navRight:r.right, firstItemWidth:first?.getBoundingClientRect().width,
    links:[...nav.querySelectorAll("a")].slice(0,4).map(a=>a.getAttribute("href")), mask:getComputedStyle(nav).maskImage};
});
console.log("expanded groups:",clicked, JSON.stringify(info,null,1));

const aside=await page.evaluate(()=>{const a=document.querySelector("aside");const r=a.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); n.scrollTop=Math.round((n.scrollHeight-n.clientHeight)/2);});
await new Promise(r=>setTimeout(r,400));
await page.screenshot({path:path.join(OUT,"sidebar-expanded-mid-1536.png"),clip:{x:aside.x,y:aside.y,width:Math.min(aside.width+24,310),height:aside.height}});
await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); n.scrollTop=n.scrollHeight;});
await new Promise(r=>setTimeout(r,400));
await page.screenshot({path:path.join(OUT,"sidebar-expanded-end-1536.png"),clip:{x:aside.x,y:aside.y,width:Math.min(aside.width+24,310),height:aside.height}});

// keyboard focus path: tab into the nav and capture the ring
await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); n.scrollTop=0;});
await page.evaluate(()=>{document.querySelector("#admin-navigation a")?.focus();});
await new Promise(r=>setTimeout(r,300));
const focus=await page.evaluate(()=>{const a=document.activeElement; const cs=getComputedStyle(a); return {tag:a.tagName, text:a.innerText?.slice(0,40), outline:cs.outline, boxShadow:cs.boxShadow};});
console.log("focus:", JSON.stringify(focus));
await browser.close();
