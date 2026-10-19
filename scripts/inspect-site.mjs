import { chromium } from 'playwright';
import fs from 'node:fs';
if(process.env.WEBSITE_OWNER_PERMISSION_CONFIRMED!=='true')throw new Error('Collection disabled: website Terms section 9 prohibits scraping. Obtain owner permission, then explicitly set WEBSITE_OWNER_PERMISSION_CONFIRMED=true.');
const base='https://campaign-one-pearl.vercel.app';
const browser=await chromium.launch({headless:true, channel: 'chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const records=[];
async function capture(path){
 await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForSelector('#root.react-ready',{timeout:20000});await page.waitForTimeout(1200);
 const data=await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].map(a=>({text:a.textContent,href:a.href})),images:[...document.images].map(i=>({src:i.currentSrc,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})),backgrounds:[...document.querySelectorAll('*')].map(e=>getComputedStyle(e).backgroundImage).filter(s=>s!=='none'),videos:[...document.querySelectorAll('video,video source')].map(v=>v.src),tokens:Object.fromEntries([...getComputedStyle(document.documentElement)].filter(k=>k.startsWith('--')).map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue(k).trim()])),samples:Object.fromEntries(['body','h1','button','article'].map(k=>{const e=document.querySelector(k);const s=e&&getComputedStyle(e);return[k,s?{fontFamily:s.fontFamily,color:s.color,backgroundColor:s.backgroundColor,borderRadius:s.borderRadius,padding:s.padding}:null]}))}));
 records.push(data);fs.writeFileSync('reports/raw/pages.json',JSON.stringify(records,null,2));return data;
}
await capture('/');
const campaigns=await page.evaluate(async()=>{const r=await fetch('/campaigns/approved');return r.json()});
fs.writeFileSync('reports/raw/public-campaigns.json',JSON.stringify(campaigns,null,2));
for(const path of ['/explore-campaigns','/faq','/policies','/how-we-review-campaigns','/why-fund-a-campaign','/how-you-make-impact','/create-campaign'])await capture(path);
const list=Array.isArray(campaigns)?campaigns:campaigns.data||[];
for(const c of list){
 await capture('/campaign/'+(c.slug||c.id));
 for(const sub of ['/audience','/report','/impact'])await capture('/campaign/'+c.id+sub);
}
await capture('/policies');
if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button').first().click();
for(const button of await page.getByRole('button').all()){
 const label=await button.innerText();
 if(/Terms of Service|Privacy Policy|Refund Policy|Acceptable Use Policy/.test(label))await button.click();
}
records.push({url:page.url()+'#expanded-policies',text:await page.locator('body').innerText()});
fs.writeFileSync('reports/raw/pages.json',JSON.stringify(records,null,2));
await browser.close();console.log({campaigns:list.length,pages:records.length});

