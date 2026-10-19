import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const BASE="http://localhost:5173";
const OUT=path.resolve("docs/phase-3-refinement/evidence/probe");
const res=await fetch(`${BASE}/api/v1/auth/staff/sign-in`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"admin@pratikshya.local",password:"Admin@PF2026!"})});
const auth=await res.json();
fs.mkdirSync(OUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.includes("single-process")||a.includes("hide-scrollbars")),"--font-render-hinting=none"],headless:true});
const page=await browser.newPage();
await page.setViewport({width:1536,height:900});
await page.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"});
await page.evaluate(d=>{localStorage.setItem("pf_admin_access_token",d.access_token);localStorage.setItem("pf_admin_refresh_token",d.refresh_token);localStorage.setItem("pratikshya_admin_auth",JSON.stringify(d.admin));localStorage.removeItem("pf_admin_nav_groups");},auth);
await page.goto(`${BASE}/super-admin`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,1200));
await page.evaluate(()=>{const nav=document.querySelector("#admin-navigation");[...nav.querySelectorAll("button[aria-expanded='false']")].forEach(b=>b.click());});
await new Promise(r=>setTimeout(r,600));
const frame=await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); const f=n.closest("div.sticky")||n.parentElement; const r=f.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};});
// variants
const variants=[
  ["mask", null],
  ["nomask", "n.style.maskImage='none'; n.style.webkitMaskImage='none';"],
  ["scrollforced", "n.style.maskImage='none'; n.style.webkitMaskImage='none'; n.style.overflowY='scroll'; n.style.scrollbarWidth='auto';"],
];
for(const [name, js] of variants){
  if(js) await page.evaluate(js2=>{const n=document.querySelector("#admin-navigation"); eval(js2);}, js);
  await page.evaluate(()=>{const n=document.querySelector("#admin-navigation"); n.scrollTop=Math.round((n.scrollHeight-n.clientHeight)/2);});
  await new Promise(r=>setTimeout(r,400));
  const info=await page.evaluate(()=>{const n=document.querySelector("#admin-navigation");const cs=getComputedStyle(n);return {offsetWidth:n.offsetWidth, clientWidth:n.clientWidth, sh:n.scrollHeight, ch:n.clientHeight, sw:cs.scrollbarWidth, sc:cs.scrollbarColor};});
  await page.screenshot({path:path.join(OUT,`sidebar-variant-${name}.png`),clip:{x:frame.x,y:frame.y,width:frame.width,height:frame.height}});
  console.log(name, JSON.stringify(info));
}
await browser.close();
