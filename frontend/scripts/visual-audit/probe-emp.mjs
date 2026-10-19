import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const BASE="http://localhost:5173";
const res=await fetch(`${BASE}/api/v1/auth/staff/sign-in`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"employee1@pratikshya.local",password:"Employee@123"})});
const auth=await res.json();
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.includes("single-process"))],headless:true});
const page=await browser.newPage();
await page.setViewport({width:1536,height:900});
page.on("response", async (r) => { if(r.status()>=400){ const u=r.url(); if(!u.includes("fonts.")) console.log(r.status(), u.replace(BASE,"")); } });
await page.goto(`${BASE}/employee/login`,{waitUntil:"domcontentloaded"});
await page.evaluate(d=>{
 localStorage.setItem("pf_employee_access_token",d.access_token);
 localStorage.setItem("pf_employee_refresh_token",d.refresh_token);
 localStorage.setItem("pratikshya_employee_auth",JSON.stringify(d.employee));
},auth);
await page.goto(`${BASE}/employee`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,1500));
const probe=await page.evaluate(()=>({
  keys:Object.keys(localStorage),
  panels:[...document.querySelectorAll("section")].map(s=>s.innerText.slice(0,80)),
  body:document.body.innerText.slice(0,800),
}));
console.log(JSON.stringify(probe,null,1));
await browser.close();
