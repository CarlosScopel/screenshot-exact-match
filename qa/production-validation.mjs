import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const { chromium } = await import(pathToFileURL(process.env.QA_TOOLS + '/node_modules/playwright/index.mjs'));
const bcrypt = (await import(pathToFileURL(process.env.QA_TOOLS + '/node_modules/bcryptjs/index.js'))).default;
const base = 'https://pixel-perfect-replay-54723.lovable.app';
const sbUrl = process.env.VITE_SUPABASE_URL.replace(/\/$/, '');
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = process.env.GITHUB_RUN_ID;
const marker = `QA-${run}`;
const prefix = `[${marker}]`;
const out = 'qa-reports';
await fs.mkdir(out, { recursive: true });
const report = { marker, source: process.env.GITHUB_SHA, environment: 'published production, real Auth/API/Storage, no mocks', tests: [], limitations: ['QA passwords are seeded out of band only for newly requested QA accounts; receiving/opening real email is not inferred from provider acceptance.'], pageErrors: [], cleanup: {} };
const state = { accounts: [], trainingId: null, moduleId: null, lessonId: null, recording: null, materialPath: null, receiptPaths: [] };
let browser;
const clients = {};
const contexts = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
function client() { return createClient(sbUrl,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>{const h=new Headers(init.headers);h.set('apikey',key);if(h.get('Authorization')===`Bearer ${key}`&&key.startsWith('sb_'))h.delete('Authorization');return fetch(input,{...init,headers:h});}}}); }
function errorMessage(e) { return String(e?.message || e).replace(/eyJ[A-Za-z0-9_.-]+/g,'[TOKEN REDACTED]').slice(0,1000); }
async function checkpoint() { await fs.writeFile(`${out}/production.json`,JSON.stringify(report,null,2)); }
async function test(name, task) { try { const detail=await task(); report.tests.push({name,status:'passed',...(detail?{detail}:{})}); console.log('PASS '+name); await checkpoint(); return true; } catch(e) {report.tests.push({name,status:'failed',error:errorMessage(e)});console.log('FAIL '+name+': '+errorMessage(e));await checkpoint();return false;} }
function must(result,label) { if(result.error)throw Error(label+': '+result.error.message);return result.data; }
async function publish(name,data) { await fs.mkdir('qa',{recursive:true});await fs.writeFile(`qa/${name}.json`,JSON.stringify(data,null,2));execFileSync('git',['add',`qa/${name}.json`]);execFileSync('git',['-c','user.name=QA validation','-c','user.email=qa@users.noreply.github.com','commit','-m',`test: ${name} ${run}`],{stdio:'ignore'});execFileSync('git',['push','origin',`HEAD:${process.env.GITHUB_REF_NAME}`],{stdio:'ignore'}); }
async function session(kind) {const a=state.accounts.find(a=>a.kind===kind);const c=client();const r=await c.auth.signInWithPassword({email:a.email,password:a.password});if(r.error)throw r.error;console.log('::add-mask::'+r.data.session.access_token);console.log('::add-mask::'+r.data.session.refresh_token);a.id=r.data.user.id;clients[kind]=c;return c;}
async function pageFor(kind,mobile=false) {const a=state.accounts.find(a=>a.kind===kind);const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{} )});contexts.push(ctx);const p=await ctx.newPage();p.setDefaultTimeout(25000);p.on('pageerror',e=>report.pageErrors.push(errorMessage(e)));p.on('dialog',d=>d.accept());await p.goto(base,{waitUntil:'domcontentloaded'});await p.getByRole('textbox',{name:'E-mail',exact:true}).fill(a.email);await p.getByLabel('Senha',{exact:true}).fill(a.password);await p.getByRole('button',{name:'Entrar na plataforma',exact:true}).click();await p.getByRole('button',{name:'Sair da conta',exact:true}).waitFor({state:'attached'});return p;}
async function nav(p,name){const open=p.getByRole('button',{name:'Abrir menu',exact:true});if(await open.isVisible())await open.click();await p.locator('aside nav').getByRole('button',{name,exact:true}).click();}
async function manage(p,a){await nav(p,'Mentorados');const row=p.getByRole('row').filter({hasText:a.email});await row.getByRole('button',{name:'Gerenciar',exact:true}).click();await p.getByRole('button',{name:'Voltar aos mentorados'}).waitFor();}
async function reloadAdmin(p,a){await p.reload({waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Sair da conta'}).waitFor();await manage(p,a);}
function account(kind){return state.accounts.find(a=>a.kind===kind);}
async function signup(p,a){await p.goto(base,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Quero fazer parte de A ORDEM',exact:true}).click();await p.getByLabel('Seu nome',{exact:true}).fill(a.name);await p.getByRole('textbox',{name:'E-mail',exact:true}).fill(a.email);await p.getByRole('button',{name:'Solicitar aprovação',exact:true}).click();await p.getByText(/Solicitação recebida!/).waitFor();}
async function approve(p,a,decision){const region=p.getByRole('region',{name:'Solicitações aguardando aprovação'});const box=region.getByText(a.name,{exact:true}).locator('..').locator('..');await box.getByRole('button',{name:decision,exact:true}).click();await p.getByText(decision==='Aprovar'?/Acesso aprovado!|Acesso aprovado, mas/:/Solicitação recusada/).waitFor();if(decision==='Aprovar'){const warning=await p.getByText(/e-mail de criação de senha não foi enviado/).isVisible();report.tests.push({name:`email-provider-${a.kind}`,status:warning?'failed':'passed',detail:warning?'Application reported email send failure.':'Application reported no provider error. Inbox delivery not confirmed.'});}}
try {
  browser=await chromium.launch({headless:true});
  const prep=await browser.newPage();prep.setDefaultTimeout(30000);
  for(const [kind,label] of [['admin','Administrador temporário'],['a','Aluno A'],['b','Aluno B'],['rejected','Recusado']]){
    const password=randomBytes(32).toString('base64url')+'Aa9!';console.log('::add-mask::'+password);
    const a={kind,name:`${prefix} ${label}`,email:`dudu.escopelcarlos253+ordemqa${run}${kind}@gmail.com`,password,password_hash:await bcrypt.hash(password,12)};state.accounts.push(a);
    if(!await test('public-access-request-'+kind,()=>signup(prep,a)))throw Error('Unable to create isolated QA account through the published request form.');
    await delay(1000);
  }
  await test('pending-account-cannot-login',async()=>{const r=await client().auth.signInWithPassword({email:account('a').email,password:account('a').password});assert.ok(r.error);assert.equal(r.data.session,null);});
  await publish('seed-manifest',{marker,createdAt:new Date().toISOString(),accounts:state.accounts.map(({kind,name,email,password_hash})=>({kind,name,email,password_hash}))});
  console.log('QA manifest ready; waiting for narrowly scoped test fixture initialization.');
  let ready=false;
  for(let i=0;i<60;i++){try{await session('admin');ready=true;break;}catch{await delay(10000);}}
  if(!ready)throw Error('QA initialization not available; real authenticated tests not executed.');
  const adm=clients.admin;
  for(const a of state.accounts){const row=must(await adm.from('profiles').select('id,status,admin_notes').eq('email',a.email).single(),'QA profile');a.id=row.id;if(a.kind!=='admin')assert.equal(row.status,'suspended');}
  let ap=await pageFor('admin');
  await test('real-admin-password-login',async()=>{await ap.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();});
  await nav(ap,'Mentorados');
  await test('real-admin-approves-student-a',()=>approve(ap,account('a'),'Aprovar'));
  await test('real-admin-approves-student-b',()=>approve(ap,account('b'),'Aprovar'));
  await test('real-admin-rejects-application',()=>approve(ap,account('rejected'),'Recusar'));
  await test('rejected-account-remains-blocked',async()=>{const p=must(await adm.from('profiles').select('status,admin_notes').eq('id',account('rejected').id).single(),'rejected profile');assert.equal(p.status,'suspended');assert.equal(p.admin_notes,'A_ORDEM:ACCESS_REJECTED');const r=await client().auth.signInWithPassword({email:account('rejected').email,password:account('rejected').password});assert.ok(r.error);assert.equal(r.data.session,null);});
  const a=account('a'),b=account('b');await session('a');await session('b');
  let sp=await pageFor('a');
  await test('approved-student-real-login-no-admin-controls',async()=>{await sp.locator('aside nav').getByRole('button',{name:'Treinamentos',exact:true}).waitFor();assert.equal(await sp.getByRole('button',{name:'Abrir administração',exact:true}).count(),0);});
  await test('admin-creates-private-training-and-material-via-real-api',async()=>{
    const training=must(await adm.from('trainings').insert({title:`${prefix} Treinamento`,description:'Conteúdo temporário de validação; não é aula da mentoria.',status:'published',position:900,published_at:new Date().toISOString()}).select('id').single(),'training');state.trainingId=training.id;
    const module=must(await adm.from('modules').insert({training_id:training.id,title:`${prefix} Módulo`,status:'published',position:0}).select('id').single(),'module');state.moduleId=module.id;
    const lesson=must(await adm.from('lessons').insert({module_id:module.id,title:`${prefix} Aula arquivo`,description:'Arquivo inofensivo de teste.',status:'published',position:0,content:'Material QA sem conteúdo real.'}).select('id').single(),'lesson');state.lessonId=lesson.id;
    must(await adm.from('training_grants').insert({user_id:a.id,training_id:training.id}),'grant');
    state.materialPath=`lesson/${lesson.id}/${randomUUID()}-qa.txt`;must(await adm.storage.from('materials').upload(state.materialPath,Buffer.from('QA: MATERIAL FICTICIO. SEM DADOS REAIS.'),{contentType:'text/plain'}),'material upload');
    must(await adm.from('lesson_materials').insert({lesson_id:lesson.id,title:`${prefix} Material`,file_path:state.materialPath}),'material reference');
  });
  await test('student-opens-lesson-saves-note-and-progress',async()=>{
    await sp.reload();await nav(sp,'Treinamentos');await sp.getByRole('button',{name:new RegExp(marker+'\\] Treinamento')}).click();await sp.getByRole('button',{name:new RegExp(marker+'\\] Aula arquivo')}).click();await sp.getByRole('heading',{name:`${prefix} Aula arquivo`,exact:true}).waitFor();
    await sp.getByPlaceholder('Anotações privadas desta aula...').fill(`${prefix} nota persistente da aula`);await sp.getByRole('button',{name:'Salvar anotação',exact:true}).click();await sp.getByText('Anotação salva.',{exact:true}).waitFor();await sp.getByRole('button',{name:'Marcar como concluída',exact:true}).click();await sp.getByRole('button',{name:'Desmarcar conclusão',exact:true}).waitFor();
    const note=must(await clients.a.from('lesson_notes').select('content').eq('lesson_id',state.lessonId).single(),'lesson note');assert.equal(note.content,`${prefix} nota persistente da aula`);
    const progress=must(await clients.a.from('lesson_progress').select('completed').eq('lesson_id',state.lessonId).single(),'lesson progress');assert.equal(progress.completed,true);
  });
  await test('private-material-download-real-bytes',async()=>{const signed=must(await clients.a.storage.from('materials').createSignedUrl(state.materialPath,60),'material sign');const res=await fetch(signed.signedUrl);assert.equal(res.status,200);assert.match(await res.text(),/SEM DADOS REAIS/);});
  await manage(ap,a);
  await test('real-private-recording-upload-and-publication',async()=>{
    await ap.getByRole('tab',{name:'Aulas e gravações',exact:true}).click();await ap.getByLabel('Título da gravação',{exact:true}).fill(`${prefix} Call`);await ap.getByLabel('Descrição ou assuntos abordados').fill('Vídeo sintético criado para QA.');await ap.getByLabel('Arquivo da call (MP4 ou WebM)').setInputFiles('qa-fixtures/call.mp4');await ap.getByRole('button',{name:'Enviar gravação',exact:true}).click();await ap.getByText('Gravação publicada no espaço exclusivo do mentorado.',{exact:true}).waitFor({timeout:120000});const rows=must(await adm.rpc('recordings_list',{p_user_id:a.id}),'recording list');state.recording=rows.find(r=>r.title===`${prefix} Call`);assert.equal(state.recording?.status,'published');
  });
  await test('student-real-video-playback-speed-and-note',async()=>{
    assert.ok(state.recording);await nav(sp,'Minhas gravações');const v=sp.getByLabel(`Gravação: ${prefix} Call`,{exact:true});await v.waitFor();await v.evaluate(el=>el.play());await sp.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentTime>0.3;});await v.evaluate(el=>el.pause());await sp.getByRole('button',{name:'Velocidade 1.5×',exact:true}).click();assert.equal(await v.evaluate(el=>el.playbackRate),1.5);await sp.getByLabel('Minhas anotações privadas',{exact:true}).fill(`${prefix} nota privada persistente`);await sp.getByRole('button',{name:'Salvar anotações',exact:true}).click();await sp.getByText('Anotações salvas.',{exact:true}).waitFor();await sp.screenshot({path:`${out}/real-student-recording.png`,fullPage:true});
  });
  await test('real-logout-login-retains-private-notes',async()=>{
    await sp.getByRole('button',{name:'Sair da conta',exact:true}).click();await sp.getByRole('button',{name:'Entrar na plataforma',exact:true}).waitFor();await sp.context().close();sp=await pageFor('a',true);await nav(sp,'Minhas gravações');await sp.getByLabel('Minhas anotações privadas',{exact:true}).waitFor();assert.equal(await sp.getByLabel('Minhas anotações privadas',{exact:true}).inputValue(),`${prefix} nota privada persistente`);const dims=await sp.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.width+1);await sp.screenshot({path:`${out}/real-mobile-recording.png`,fullPage:true});
  });
  await test('admin-cannot-read-student-private-notes',async()=>{const r=await adm.rpc('recordings_learning',{p_id:state.recording.id});assert.ok(r.error);});
  await test('student-b-cannot-read-a-content-storage-or-billing',async()=>{
    const bc=clients.b;const t=must(await bc.from('trainings').select('id').eq('id',state.trainingId),'B trainings');assert.equal(t.length,0);assert.ok((await bc.storage.from('materials').createSignedUrl(state.materialPath,60)).error);assert.ok((await bc.rpc('recordings_list',{p_user_id:a.id})).error);assert.ok((await bc.rpc('recordings_learning',{p_id:state.recording.id})).error);assert.ok((await bc.storage.from('mentorship-recordings').createSignedUrl(state.recording.file_path,60)).error);assert.ok((await bc.rpc('mentorship_account',{p_user_id:a.id})).error);assert.ok((await bc.from('user_roles').insert({user_id:b.id,role:'admin'})).error);
  });
  await test('admin-creates-plan-and-installments-via-published-ui',async()=>{
    await ap.getByRole('tab',{name:'Plano e pagamentos',exact:true}).click();await ap.getByRole('button',{name:'Cadastrar plano',exact:true}).click();const f=ap.getByRole('form',{name:'Configurar plano de mentoria'});await f.getByLabel('Duração',{exact:true}).fill('2');await f.getByLabel('Unidade de duração',{exact:true}).selectOption('months');await f.getByLabel('Valor total cobrado (R$)',{exact:true}).fill('1.01');await f.getByLabel('Forma de pagamento',{exact:true}).selectOption('installments');await f.getByLabel('Quantidade de parcelas',{exact:true}).fill('2');await f.getByRole('button',{name:'Salvar plano',exact:true}).click();await ap.getByText('Plano salvo. O prazo de acesso foi atualizado sem alterar pagamentos anteriores.',{exact:true}).waitFor();const ac=must(await adm.rpc('mentorship_account',{p_user_id:a.id}),'plan');assert.equal(ac.plans.length,1);assert.equal(ac.installments.length,2);assert.equal(ac.installments.reduce((s,i)=>s+i.amount_cents,0),101);assert.ok(ac.installments.every(i=>i.paid_at===null));state.plan=ac.plans[0];
  });
  async function uploadReceipt(){await nav(sp,'Meu plano e pagamentos');await sp.getByRole('button',{name:'Enviar comprovante',exact:true}).first().click();await sp.getByLabel('Comprovante (PDF, PNG ou JPG, até 10 MB)').setInputFiles('qa-fixtures/sem-valor.png');const f=sp.getByRole('form',{name:'Pagamento da parcela 1'});await f.locator('button[type="submit"]').click();await sp.getByText('Comprovante enviado para análise. Aguarde a confirmação do administrador.',{exact:true}).waitFor();const ac=must(await clients.a.rpc('mentorship_account',{p_user_id:a.id}),'receipt account');const r=ac.receipts.find(r=>r.status==='pending');assert.ok(r);state.receiptPaths.push(r.file_path);return r;}
  let receipt;
  await test('student-submits-private-receipt-through-real-ui',async()=>{receipt=await uploadReceipt();assert.ok((await clients.b.storage.from('payment-receipts').createSignedUrl(receipt.file_path,60)).error);const signed=must(await clients.a.storage.from('payment-receipts').createSignedUrl(receipt.file_path,60),'receipt sign');assert.equal((await fetch(signed.signedUrl)).status,200);});
  await test('admin-rejects-receipt-without-crediting-payment',async()=>{
    await reloadAdmin(ap,a);await ap.getByRole('tab',{name:'Plano e pagamentos',exact:true}).click();await ap.getByRole('button',{name:'Recusar comprovante',exact:true}).click();await ap.getByLabel('Motivo da recusa',{exact:true}).fill('QA: comprovante fictício sem valor.');await ap.getByRole('form',{name:'Pagamento da parcela 1'}).locator('button[type="submit"]').click();await ap.getByText('Comprovante recusado. O mentorado pode enviar outro.',{exact:true}).waitFor();const ac=must(await clients.a.rpc('mentorship_account',{p_user_id:a.id}),'rejected receipt');assert.ok(ac.installments.every(i=>i.paid_at===null));assert.ok(ac.receipts.some(r=>r.status==='rejected'));
  });
  await test('student-resubmits-and-admin-approves-one-installment',async()=>{
    await sp.reload();await sp.getByRole('button',{name:'Sair da conta'}).waitFor({state:'attached'});receipt=await uploadReceipt();await reloadAdmin(ap,a);await ap.getByRole('tab',{name:'Plano e pagamentos',exact:true}).click();await ap.getByRole('button',{name:'Aprovar comprovante',exact:true}).click();await ap.getByText('Comprovante aprovado e parcela quitada.',{exact:true}).waitFor();const ac=must(await clients.a.rpc('mentorship_account',{p_user_id:a.id}),'approved receipt');assert.equal(ac.installments.filter(i=>i.paid_at).length,1);assert.equal(ac.plans[0].ends_at,state.plan.ends_at);assert.equal(ac.installments.filter(i=>!i.paid_at).reduce((s,i)=>s+i.amount_cents,0),50);
  });
  await test('expired-membership-blocks-content-but-retains-billing',async()=>{
    const ac=must(await adm.rpc('mentorship_account',{p_user_id:a.id}),'plan before expiry');const p=ac.plans[0];must(await adm.rpc('mentorship_save_plan',{p_id:p.id,p_user_id:a.id,p_start_date:'2020-01-01',p_duration_count:1,p_duration_unit:'months',p_total_cents:p.total_cents,p_installment_count:p.installment_count,p_first_due_date:p.first_due_date,p_expected_revision:p.revision}),'expire QA plan');const own=must(await clients.a.rpc('mentorship_account',{p_user_id:a.id}),'expired billing');assert.equal(own.has_access,false);assert.ok((await clients.a.rpc('recordings_list',{p_user_id:a.id})).error);assert.equal(must(await clients.a.from('lessons').select('id').eq('id',state.lessonId),'expired lesson').length,0);assert.ok((await clients.a.storage.from('mentorship-recordings').createSignedUrl(state.recording.file_path,60)).error);await sp.reload();await sp.getByRole('heading',{name:'Meu plano e pagamentos',exact:true}).waitFor();assert.equal(await sp.getByRole('button',{name:'Treinamentos',exact:true}).count(),0);
  });
  await test('renewal-restores-access-and-preserves-payment-history',async()=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());must(await adm.rpc('mentorship_save_plan',{p_id:randomUUID(),p_user_id:a.id,p_start_date:today,p_duration_count:1,p_duration_unit:'years',p_total_cents:100,p_installment_count:1,p_first_due_date:today,p_expected_revision:0}),'renew QA');const ac=must(await clients.a.rpc('mentorship_account',{p_user_id:a.id}),'renewed account');assert.equal(ac.plans.length,2);assert.equal(ac.has_access,true);assert.equal(ac.installments.filter(i=>i.paid_at).length,1);assert.ok(must(await clients.a.rpc('recordings_list',{p_user_id:a.id}),'renewed recordings').some(r=>r.id===state.recording.id));
  });
  await test('suspension-blocks-real-student-session',async()=>{must(await adm.from('profiles').update({status:'suspended'}).eq('id',a.id),'QA suspension');assert.ok((await clients.a.rpc('recordings_list',{p_user_id:a.id})).error);await sp.reload();await sp.getByRole('heading',{name:'Acesso indisponível',exact:true}).waitFor();});
  await test('anonymous-access-to-private-recording-denied',async()=>{assert.ok((await client().rpc('recordings_list',{p_user_id:a.id})).error);const res=await fetch(`${sbUrl}/storage/v1/object/public/mentorship-recordings/${state.recording.file_path}`);assert.notEqual(res.status,200);});
  await test('no-unhandled-javascript-errors',async()=>assert.deepEqual(report.pageErrors,[]));
} catch(e) {report.fatal=errorMessage(e);console.log('FATAL '+report.fatal);}
finally {
  await checkpoint();
  const inventory={marker,accounts:state.accounts.map(({kind,name,email,id})=>({kind,name,email,id})),trainingId:state.trainingId,moduleId:state.moduleId,lessonId:state.lessonId,recording:state.recording?{id:state.recording.id,file_path:state.recording.file_path}:null,materialPath:state.materialPath,receiptPaths:state.receiptPaths,tests:report.tests};
  await publish('production-results',inventory).catch(e=>console.log('Unable to publish QA inventory: '+errorMessage(e)));
  if(clients.admin){
    // Cleanup authorization is limited to the exact paths in this manifest, installed separately
    // after all policy tests. Never change production RLS while measuring isolation.
    const targets=[];if(state.materialPath)targets.push(['materials',state.materialPath]);if(state.recording)targets.push(['mentorship-recordings',state.recording.file_path]);for(const p of state.receiptPaths)targets.push(['payment-receipts',p]);
    let remaining=targets;
    for(let i=0;i<60&&remaining.length;i++){
      const next=[];for(const [bucket,path] of remaining){try{const r=await clients.admin.storage.from(bucket).remove([path]);if(r.error||!r.data?.length)next.push([bucket,path]);}catch{next.push([bucket,path]);}}
      remaining=next;if(remaining.length)await delay(10000);
    }
    report.cleanup.storage={requested:targets.length,remaining:remaining.map(([bucket,path])=>({bucket,path}))};
    await publish('storage-cleanup',{marker,...report.cleanup.storage}).catch(()=>{});
  }
  for(const c of Object.values(clients))await c.auth.signOut().catch(()=>{});
  if(browser)await browser.close();
  await checkpoint();
  if(report.fatal||report.tests.some(t=>t.status==='failed'))process.exitCode=1;
}
