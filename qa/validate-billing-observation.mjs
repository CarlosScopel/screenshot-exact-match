import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const root = process.cwd();
const dir = path.join(root,'.qa-observation');
await fs.mkdir(dir,{recursive:true});
await fs.mkdir('evidence',{recursive:true});
await fs.writeFile(path.join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
await fs.writeFile(path.join(dir,'main.tsx'),`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MentorshipPanel}from'../src/components/portal/MentorshipPanel';import'../src/styles.css';
function App(){const[view,setView]=useState('Admin A');const id=view==='Aluno B'?'00000000-0000-4000-8000-000000000003':'00000000-0000-4000-8000-000000000002';return <main style={{maxWidth:1100,margin:'auto',padding:20}}><nav style={{display:'flex',gap:12,marginBottom:20}}>{['Admin A','Aluno A','Aluno B'].map(v=><button key={v} onClick={()=>setView(v)}>{v}</button>)}</nav><MentorshipPanel key={view} userId={id} admin={view==='Admin A'}/></main>}createRoot(document.getElementById('root')!).render(<App/>);`);
await fs.writeFile(path.join(dir,'observation.ts'),`export const BILLING_OBSERVATION_LIMIT=5000;
export async function getBillingObservation(id:string){return JSON.parse(localStorage.getItem('qa-note:'+id)||JSON.stringify({user_id:id,content:'',revision:0,updated_at:null}));}
export async function saveBillingObservation(id:string,content:string,revision:number){const old=await getBillingObservation(id);if(old.revision!==revision)throw new Error('Conflito');const note={user_id:id,content:content.trim(),revision:revision+1,updated_at:new Date().toISOString()};localStorage.setItem('qa-note:'+id,JSON.stringify(note));return note;}`);
await fs.writeFile(path.join(dir,'account.ts'),`export function useMentorshipAccount(userId:string){return{loading:false,error:'',now:Date.parse('2026-11-15T12:00:00Z'),refresh:async()=>{},account:{user_id:userId,server_now:'2026-11-15T12:00:00Z',status:'active',has_access:true,legacy_expires_at:null,receipts:[],plans:[{id:'plan',user_id:userId,start_date:'2026-11-01',end_date:'2027-05-01',starts_at:'2026-11-01T03:00:00Z',ends_at:'2027-05-01T03:00:00Z',duration_count:6,duration_unit:'months',total_cents:500000,installment_count:1,first_due_date:'2026-11-10',revision:1}],installments:[{id:'invoice',plan_id:'plan',number:1,amount_cents:500000,due_date:'2026-11-10',paid_at:null,paid_on:null,payment_note:''}]}}}`);
await fs.writeFile(path.join(dir,'billing.ts'),`const forbidden=async()=>{throw new Error('Observation must not mutate financial data')};export const confirmInstallment=forbidden,openPaymentReceipt=forbidden,reviewPaymentReceipt=forbidden,saveMentorshipPlan=forbidden,uploadPaymentReceipt=forbidden;`);
const server=await createServer({configFile:false,root:dir,plugins:[react(),tailwindcss()],resolve:{alias:[{find:'@/lib/billing-observation',replacement:path.join(dir,'observation.ts')},{find:'@/lib/use-mentorship',replacement:path.join(dir,'account.ts')},{find:'@/lib/mentorship-api',replacement:path.join(dir,'billing.ts')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:5188,fs:{allow:[root]}}});
await server.listen();
const browser=await chromium.launch({headless:true});
const report={scope:'Actual MentorshipPanel and BillingObservation UI with simulated per-user persistence; no production accounts or financial records',tests:[],pageErrors:[]};
async function check(name,fn){await fn();report.tests.push({name,status:'passed'});console.log('PASS',name)}
try{
for(const mobile of [false,true]){
 const label=mobile?'mobile':'desktop';const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},...(mobile?{isMobile:true,hasTouch:true}:{})});const page=await ctx.newPage();page.on('pageerror',e=>report.pageErrors.push(String(e)));await page.goto('http://127.0.0.1:5188');
 const text='Conforme combinado, o pagamento será no dia 10.\nEsta observação é exclusiva do mentorado A.';
 await check(label+'-admin-saves-private-observation',async()=>{await page.getByLabel('Observação',{exact:true}).fill(text);await page.getByRole('button',{name:'Salvar observação',exact:true}).click();await page.getByText('Observação salva para este mentorado.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Observação',{exact:true}).inputValue(),text);await page.screenshot({path:'evidence/'+label+'-admin.png',fullPage:true});});
 await check(label+'-member-A-reads-without-edit-controls',async()=>{await page.getByRole('button',{name:'Aluno A',exact:true}).click();await page.getByText('Observação sobre seu plano e pagamentos',{exact:true}).waitFor();await page.getByText('Conforme combinado, o pagamento será no dia 10.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Salvar observação',exact:true}).count(),0);assert.equal(await page.getByRole('textbox').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'evidence/'+label+'-member.png',fullPage:true});});
 await check(label+'-member-B-does-not-see-A-message',async()=>{await page.getByRole('button',{name:'Aluno B',exact:true}).click();await page.getByText('Meu plano e pagamentos',{exact:true}).first().waitFor();await page.waitForTimeout(100);assert.equal(await page.getByText('Observação sobre seu plano e pagamentos',{exact:true}).count(),0);assert.equal(await page.getByText(text,{exact:true}).count(),0);});
 await check(label+'-observation-persists-after-reload',async()=>{await page.reload();assert.equal(await page.getByLabel('Observação',{exact:true}).inputValue(),text);});
 await check(label+'-edit-and-remove-without-changing-payments',async()=>{await page.getByLabel('Observação',{exact:true}).fill('Pagamento reagendado para dia 15.');await page.getByRole('button',{name:'Salvar observação',exact:true}).click();await page.getByText('Observação salva para este mentorado.',{exact:true}).waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remover observação',exact:true}).click();await page.getByText('Observação removida.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Observação',{exact:true}).inputValue(),'');await page.getByText('Saldo a pagar',{exact:true}).waitFor();assert.ok((await page.getByText('R$ 5.000,00',{exact:false}).count())>0);await page.getByRole('button',{name:'Aluno A',exact:true}).click();await page.waitForTimeout(100);assert.equal(await page.getByText('Observação sobre seu plano e pagamentos',{exact:true}).count(),0);});
 await ctx.close();
}
assert.deepEqual(report.pageErrors,[]);
}catch(e){report.error=String(e);process.exitCode=1;throw e;}finally{await fs.writeFile('evidence/browser-observation.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
