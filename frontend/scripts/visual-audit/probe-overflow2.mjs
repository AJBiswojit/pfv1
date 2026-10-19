import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const BASE="http://localhost:5173";
const PATHS=(process.env.PATHS||"/super-admin/products,/super-admin/attendance").split(",");
const WIDTH=Number(process.env.W||320);
const res=await fetch(`${BASE}/api/v1/auth/staff/sign-in`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"admin@pratikshya.local",password:"Admin@PF2026!"})});
const auth=await res.json();
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.includes("single-process")||a.includes("hide-scrollbars")),"--font-render-hinting=none"],headless:true});
const page=await browser.newPage();
await page.setViewport({width:WIDTH,height:844});
await page.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"});
await page.evaluate(d=>{localStorage.setItem("pf_admin_access_token",d.access_token);localStorage.setItem("pf_admin_refresh_token",d.refresh_token);localStorage.setItem("pratikshya_admin_auth",JSON.stringify(d.admin));},auth);
for(const p of PATHS){
  await page.goto(`${BASE}${p}`,{waitUntil:"networkidle2"});
  await new Promise(r=>setTimeout(r,900));
  const out=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const bad=[...document.querySelectorAll("body *")].filter(el=>{
      const r=el.getBoundingClientRect();
      return r.width>0 && r.right>vw+1;
    }).map(el=>({tag:el.tagName, cls:(el.className||"").toString().slice(0,80), right:Math.round(el.getBoundingClientRect().right), left:Math.round(el.getBoundingClientRect().left), w:Math.round(el.getBoundingClientRect().width)})).slice(0,15);
    return {vw, scrollW:document.scrollingElement.scrollWidth, bad};
  });
  console.log(p, JSON.stringify(out));
}
await browser.close();
