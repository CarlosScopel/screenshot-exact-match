import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const tools = process.env.QA_TOOLS;
const { createClient } = await import(pathToFileURL(path.join(tools, 'node_modules/@supabase/supabase-js/dist/index.mjs')).href).catch(async () => {
  const { createRequire } = await import('node:module');
  return createRequire(path.join(tools, 'package.json'))('@supabase/supabase-js');
});
const { createRequire } = await import('node:module');
const requireTool = createRequire(path.join(tools, 'package.json'));
const bcrypt = requireTool('bcryptjs');
const { chromium } = requireTool('playwright');
const out = 'qa-live-evidence';
fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(process.env.RUNNER_TEMP, 'ordem-live-credentials.json');
const run = process.env.GITHUB_RUN_ID;
const marker = `QA_LAUNCH_${run}`;
const base = 'https://pixel-perfect-replay-54723.lovable.app';
const backend = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
if (process.argv[2] === 'prepare') {
  const accounts = await Promise.all(['admin','learner','outsider'].map(async kind => {
    const password = crypto.randomBytes(36).toString('base64url');
    return { kind, id: crypto.randomUUID(), email: `qa.${run}.${kind}@example.invalid`, name: `${marker} ${kind}`, password, hash: await bcrypt.hash(password, 12) };
  }));
  fs.writeFileSync(privatePath, JSON.stringify(accounts), { mode: 0o600 });
  fs.writeFileSync(`${out}/provision.json`, JSON.stringify({ marker, accounts: accounts.map(({password,...a}) => a) }, null, 2));
  console.log('Generated random runner-only credentials; provisioning artifact contains only salted hashes.');
  process.exit(0);
}
const accounts = JSON.parse(fs.readFileSync(privatePath));
const report = { marker, sourceCommit: process.env.APP_SHA, tests: [], limitations: ['Fixture accounts have confirmed email and runner-only random passwords; inbox delivery and valid email-link consumption are not asserted.', 'No existing users, plans, receipts or recordings are changed.', 'Private recording upload is not attempted because the current storage policies provide no safe cleanup permission for test videos.'], fixtures: {}, errors: [], cleanup: {} };
const clients = {};
const files = [];
let browser;
let trainingId, moduleId, lessonId, planId;
function writeReport() { fs.writeFileSync(`${out}/report.json`, JSON.stringify(report,null,2)); }
function safeError(error) { return String(error?.message || error).replace(/https?:\/\/[^\s]+/g, '[url]').slice(0,500); }
async function check(name, action) {
  try { await action(); report.tests.push({name,status:'passed'}); console.log(`PASS ${name}`); }
  catch (error) { report.tests.push({name,status:'failed',error:safeError(error)}); console.log(`FAIL ${name}: ${safeError(error)}`); }
  writeReport();
}
function ok(result) { if (result.error) throw new Error(result.error.message); return result.data; }
function client() { return createClient(backend,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}); }
async function rpc(c, name, args) { return ok(await c.rpc(name,args)); }
async function login(a) { const c=client(); const result=await c.auth.signInWithPassword({email:a.email,password:a.password}); if(result.error) throw new Error(result.error.message); clients[a.kind]=c; return c; }
async function uiLogin(context, a) { const p=await context.newPage(); await p.goto(base,{waitUntil:'domcontentloaded'}); await p.getByRole('textbox',{name:'E-mail',exact:true}).fill(a.email); await p.getByLabel('Senha',{exact:true}).fill(a.password); await p.getByRole('button',{name:'Entrar na plataforma',exact:true}).click(); return p; }
async function nav(p,label) { const button=p.locator('nav').getByRole('button',{name:label,exact:true}); if(!(await button.isVisible())) await p.getByRole('button',{name:'Abrir menu',exact:true}).click(); await button.click(); }
const adminAccount=accounts.find(a=>a.kind==='admin'), studentAccount=accounts.find(a=>a.kind==='learner'), outsiderAccount=accounts.find(a=>a.kind==='outsider');
const uid=studentAccount.id, otherId=outsiderAccount.id;
const today=new Date().toISOString().slice(0,10);
const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
try {
  console.log('Waiting for narrowly scoped QA fixture provisioning (maximum eight minutes).');
  for(let n=0;n<96;n++){try{await login(adminAccount);break;}catch{await sleep(5000);}}
  assert.ok(clients.admin,'Fixture provisioning not available; no tests executed.');
  const admin=clients.admin, student=await login(studentAccount), outsider=await login(outsiderAccount);
  report.fixtures.accounts=accounts.map(({kind,id,email})=>({kind,id,email}));
  await check('real-auth-password-logins-three-temporary-accounts',async()=>{for(const c of Object.values(clients)) assert.ok(ok(await c.auth.getUser()).user.id);});
  await check('pending-account-cannot-read-recordings-or-admin-data',async()=>{assert.equal(await rpc(student,'is_active_member',{_user_id:uid}),false); assert.ok((await student.rpc('recordings_list',{p_user_id:uid})).error); assert.ok((await student.from('user_roles').insert({user_id:uid,role:'admin'})).error);});
  browser=await chromium.launch({headless:true});
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const p=await uiLogin(adminContext,adminAccount);
  await p.getByRole('button',{name:'Sair da conta',exact:true}).waitFor({timeout:30000});
  await nav(p,'Mentorados');
  await check('admin-approves-pending-learner-through-published-ui',async()=>{
    const card=p.getByRole('region',{name:'Solicitações aguardando aprovação'}).getByText(studentAccount.name,{exact:true}).locator('xpath=../..');
    await card.getByRole('button',{name:'Aprovar',exact:true}).click();
    await p.getByText('Acesso aprovado! O mentorado poderá entrar após criar sua senha.',{exact:true}).waitFor({timeout:20000});
    assert.equal(await rpc(student,'is_active_member',{_user_id:uid}),true);
  });
  await check('admin-rejects-other-pending-account-through-published-ui',async()=>{
    p.once('dialog',dialog=>dialog.accept());
    const card=p.getByRole('region',{name:'Solicitações aguardando aprovação'}).getByText(outsiderAccount.name,{exact:true}).locator('xpath=../..');
    await card.getByRole('button',{name:'Recusar',exact:true}).click();
    await p.getByText('Solicitação recusada. O acesso permanece bloqueado.',{exact:true}).waitFor({timeout:20000});
    assert.equal(await rpc(outsider,'is_active_member',{_user_id:otherId}),false);
  });
  // All database changes below are restricted to the fresh QA identities and IDs.
  await check('admin-creates-real-plan-exact-installments-and-deadline',async()=>{
    planId=crypto.randomUUID();report.fixtures.planId=planId;
    await rpc(admin,'mentorship_save_plan',{p_id:planId,p_user_id:uid,p_start_date:yesterday,p_duration_count:1,p_duration_unit:'months',p_total_cents:500000,p_installment_count:3,p_first_due_date:today,p_expected_revision:0});
    const account=await rpc(student,'mentorship_account',{p_user_id:uid});
    assert.equal(account.has_access,true);assert.equal(account.plans.length,1);assert.equal(account.installments.reduce((s,x)=>s+x.amount_cents,0),500000);assert.equal(account.installments.length,3);assert.ok(account.installments.every(x=>!x.paid_at));
  });
  await check('admin-publishes-real-training-module-lesson-and-grants-only-A',async()=>{
    trainingId=crypto.randomUUID();moduleId=crypto.randomUUID();lessonId=crypto.randomUUID();Object.assign(report.fixtures,{trainingId,moduleId,lessonId});
    ok(await admin.from('trainings').insert({id:trainingId,title:marker+' treinamento',status:'published'}));
    ok(await admin.from('modules').insert({id:moduleId,training_id:trainingId,title:marker+' módulo',status:'published'}));
    ok(await admin.from('lessons').insert({id:lessonId,module_id:moduleId,title:marker+' aula',status:'published',content:'Conteúdo temporário de validação. Sem dados reais.'}));
    ok(await admin.from('training_grants').insert({training_id:trainingId,user_id:uid}));
    assert.equal(ok(await student.from('lessons').select('id').eq('id',lessonId)).length,1);
    assert.equal(ok(await outsider.from('lessons').select('id').eq('id',lessonId)).length,0);
  });
  await check('lesson-note-and-progress-persist-after-sign-out-and-new-session',async()=>{
    ok(await student.from('lesson_notes').upsert({lesson_id:lessonId,user_id:uid,content:marker+' anotação',updated_at:new Date().toISOString()}));
    ok(await student.from('lesson_progress').upsert({lesson_id:lessonId,user_id:uid,completed:true,completed_at:new Date().toISOString(),position_seconds:12,updated_at:new Date().toISOString()}));
    ok(await student.auth.signOut());const again=await login(studentAccount);
    assert.equal(ok(await again.from('lesson_notes').select('content').eq('lesson_id',lessonId)).at(0).content,marker+' anotação');
    assert.equal(ok(await again.from('lesson_progress').select('completed').eq('lesson_id',lessonId)).at(0).completed,true);
    assert.equal(ok(await outsider.from('lesson_notes').select('content').eq('lesson_id',lessonId)).length,0);
  });
  const learner=clients.learner;
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const materialPath=`lesson/${lessonId}/${marker}.pdf`;
  await check('private-material-upload-signed-download-and-cross-account-denial',async()=>{
    ok(await admin.storage.from('materials').upload(materialPath,pdf,{contentType:'application/pdf',upsert:false}));files.push({bucket:'materials',path:materialPath,kind:'admin'});
    ok(await admin.from('lesson_materials').insert({lesson_id:lessonId,title:marker+' PDF',file_path:materialPath}));
    const signed=ok(await learner.storage.from('materials').createSignedUrl(materialPath,60));
    const response=await fetch(signed.signedUrl);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
    assert.ok((await outsider.storage.from('materials').createSignedUrl(materialPath,60)).error);
    const anonymous=client();assert.ok((await anonymous.storage.from('materials').createSignedUrl(materialPath,60)).error);
  });
  await check('receipt-real-upload-without-registration-can-be-cleaned-safely',async()=>{
    const account=await rpc(learner,'mentorship_account',{p_user_id:uid});const item=account.installments[0];
    const receiptPath=`${uid}/${item.id}/${crypto.randomUUID()}.pdf`;
    ok(await learner.storage.from('payment-receipts').upload(receiptPath,pdf,{contentType:'application/pdf',upsert:false}));files.push({bucket:'payment-receipts',path:receiptPath,kind:'learner'});
    assert.ok((await outsider.storage.from('payment-receipts').createSignedUrl(receiptPath,60)).error);
    ok(await learner.storage.from('payment-receipts').createSignedUrl(receiptPath,60));
  });
  await check('admin-confirms-real-fixture-payment-and-remaining-balance',async()=>{
    const before=await rpc(learner,'mentorship_account',{p_user_id:uid});const first=before.installments[0];
    await rpc(admin,'mentorship_confirm_payment',{p_installment_id:first.id,p_paid_on:today,p_note:marker+' pagamento fictício de validação'});
    const after=await rpc(learner,'mentorship_account',{p_user_id:uid});assert.equal(after.installments.filter(i=>i.paid_at).length,1);assert.equal(after.installments.filter(i=>!i.paid_at).reduce((s,i)=>s+i.amount_cents,0),333333);
    assert.ok((await learner.rpc('mentorship_confirm_payment',{p_installment_id:after.installments[1].id,p_paid_on:today,p_note:'unauthorized test'})).error);
  });
  await check('member-cannot-extend-own-access-or-grant-administrator',async()=>{
    const before=ok(await learner.from('profiles').select('status,access_expires_at').eq('id',uid).single());
    const attempt=await learner.from('profiles').update({access_expires_at:'2099-01-01T00:00:00Z'}).eq('id',uid);
    const after=ok(await learner.from('profiles').select('status,access_expires_at').eq('id',uid).single());assert.deepEqual(after,before);
    assert.ok((await learner.from('user_roles').insert({user_id:uid,role:'admin'})).error);
  });
  await check('suspension-blocks-already-authenticated-content-and-signed-urls',async()=>{
    ok(await admin.from('profiles').update({status:'suspended'}).eq('id',uid));
    assert.equal(await rpc(learner,'is_active_member',{_user_id:uid}),false);
    assert.equal(ok(await learner.from('lessons').select('id').eq('id',lessonId)).length,0);
    assert.ok((await learner.storage.from('materials').createSignedUrl(materialPath,60)).error);
    ok(await admin.from('profiles').update({status:'active'}).eq('id',uid));
  });
  await check('expired-plan-blocks-and-renewal-restores-access-retaining-history',async()=>{
    ok(await admin.from('profiles').update({status:'active'}).eq('id',uid));
    const expired=crypto.randomUUID();report.fixtures.expiredPlanId=expired;
    // Use a separate fixture user for expiry so a valid current plan cannot mask the check.
    ok(await admin.from('profiles').update({status:'active',admin_notes:null}).eq('id',otherId));
    await rpc(admin,'mentorship_save_plan',{p_id:expired,p_user_id:otherId,p_start_date:'2025-01-01',p_duration_count:1,p_duration_unit:'months',p_total_cents:100,p_installment_count:1,p_first_due_date:'2025-01-01',p_expected_revision:0});
    assert.equal(await rpc(outsider,'is_active_member',{_user_id:otherId}),false);
    const renewal=crypto.randomUUID();report.fixtures.renewalPlanId=renewal;
    await rpc(admin,'mentorship_save_plan',{p_id:renewal,p_user_id:otherId,p_start_date:yesterday,p_duration_count:1,p_duration_unit:'years',p_total_cents:100,p_installment_count:1,p_first_due_date:today,p_expected_revision:0});
    const account=await rpc(outsider,'mentorship_account',{p_user_id:otherId});assert.equal(account.has_access,true);assert.equal(account.plans.length,2);
    assert.equal(ok(await outsider.from('lessons').select('id').eq('id',lessonId)).length,0);
  });
  await check('authenticated-student-browser-desktop-content-and-plan',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await uiLogin(ctx,studentAccount);
    await page.getByRole('button',{name:'Sair da conta',exact:true}).waitFor({timeout:30000});
    await nav(page,'Treinamentos');await page.getByRole('button',{name:new RegExp(marker+' treinamento')}).click();
    await page.getByRole('button',{name:new RegExp(marker+' aula')}).click();
    await page.getByRole('heading',{name:marker+' aula',exact:true}).waitFor();
    await page.getByDisplayValue(marker+' anotação').waitFor();
    await page.screenshot({path:`${out}/learner-desktop.png`,fullPage:true});
    await nav(page,'Meu plano e pagamentos');await page.getByText('R$ 5.000,00',{exact:true}).first().waitFor();
    await page.screenshot({path:`${out}/learner-plan.png`,fullPage:true});await ctx.close();
  });
  await check('authenticated-student-mobile-and-no-admin-menu',async()=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await uiLogin(ctx,studentAccount);
    await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor({timeout:30000});await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
    assert.equal(await page.locator('nav').getByRole('button',{name:'Mentorados',exact:true}).count(),0);
    await page.locator('nav').getByRole('button',{name:'Meu plano e pagamentos',exact:true}).click();
    await page.getByText('R$ 5.000,00',{exact:true}).first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/learner-mobile.png`,fullPage:true});await ctx.close();
  });
} catch(error) {report.errors.push(safeError(error));console.log('SETUP/EXECUTION ERROR',safeError(error));}
finally {
  // Only objects created by this run are removed, through the real Storage API.
  for(const file of files.reverse()){
    try {const result=await clients[file.kind].storage.from(file.bucket).remove([file.path]);ok(result);report.cleanup[file.bucket+':'+file.path]='removed';}
    catch(error){report.cleanup[file.bucket+':'+file.path]='failed: '+safeError(error);}
  }
  report.fixtures.files=files;
  for(const c of Object.values(clients))try{await c.auth.signOut();}catch{}
  await browser?.close();writeReport();
  console.log(JSON.stringify({tests:report.tests,errors:report.errors,cleanup:report.cleanup}));
}
if(report.errors.length || report.tests.some(x=>x.status==='failed'))process.exitCode=1;
