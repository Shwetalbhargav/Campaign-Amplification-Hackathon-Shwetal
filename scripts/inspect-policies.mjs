import {chromium} from 'playwright';import fs from 'node:fs';
if(process.env.WEBSITE_OWNER_PERMISSION_CONFIRMED!=='true')throw new Error('Collection disabled: obtain website owner permission first (Terms section 9).');
const b=await chromium.launch({channel:'chromium',headless:true});const p=await b.newPage();await p.goto('https://campaign-one-pearl.vercel.app/policies');await p.waitForSelector('#root.react-ready');await p.waitForTimeout(1500);
console.log(await p.getByRole('dialog').getByRole('button').allTextContents());
await p.getByRole('dialog').getByRole('button').first().click();
for(const label of ['Terms of Service','Privacy Policy','Refund Policy','Acceptable Use Policy'])await p.getByRole('button').filter({hasText:label}).last().click();
const pages=JSON.parse(fs.readFileSync('reports/raw/pages.json','utf8'));pages.push({url:p.url()+'#expanded-policies',text:await p.locator('body').innerText()});fs.writeFileSync('reports/raw/pages.json',JSON.stringify(pages,null,2));await b.close();
