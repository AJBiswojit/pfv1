import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const BASE="http://localhost:5173";
const res=await fetch(`${BASE}/api/v1/auth/staff/sign-in`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:"employee1@pratikshya.local",password:"Employee@123"})});
const auth=await res.json();
const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.includes("single-process"))],headless:true});
const page=await browser.newPage();
await page.setViewport({width:1536,height:900});
page.on("response", async (r) => { const u=r.url(); if(u.includes("/api/v1/")) console.log(r.request().method(), r.status(), u.replace(BASE,"")); });
await page.goto(`${BASE}/employee/login`,{waitUntil:"domcontentloaded"});
await page.evaluate(d=>{
 localStorage.setItem("pf_employee_access_token",d.access_token);
 localStorage.setItem("pf_employee_refresh_token",d.refresh_token);
 localStorage.setItem("pratikshya_employee_auth",JSON.stringify(d.employee));
},auth);
await page.goto(`${BASE}/employee`,{waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,2000));
const mirror=await page.evaluate(async ()=> {
  const api = await import("/src/services/workforce/attendanceService.js");
  const codes = ["PF-EMP-101"];
  return {
    today: codes.map(c=>[c, api.getTodayAttendance(c)]),
    employees: JSON.parse(localStorage.getItem("pratikshya_workforce_employees")||"null")?.slice?.(0,2) ?? "n/a",
    attendance: (JSON.parse(localStorage.getItem("pratikshya_workforce_attendance")||"[]")).slice(0,3),
    keys: Object.keys(localStorage),
  };
});
console.log(JSON.stringify(mirror,null,1).slice(0,3000));
await browser.close();
