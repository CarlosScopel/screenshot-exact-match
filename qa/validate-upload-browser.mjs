import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const root=process.cwd(), qa=path.join(root,'.upload-browser-qa');
await fs.mkdir(qa,{recursive:true}); await fs.mkdir('evidence',{recursive:true});
const backend='http://127.0.0.1:4191', uid='00000000-0000-4000-8000-000000000002';
const records=[],uploads=new Map(); let lostResponse=false; const report={scope:'Actual app components and TUS client; real loopback HTTP uploads. Auth and database responses are isolated test doubles. No production accounts or storage are accessed.',checks:[],pageErrors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,tus-resumable,upload-length,upload-offset,upload-metadata');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,HEAD,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Location,Upload-Offset');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url,backend);const body=async()=>{const chunks=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks);};
  const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname==='/records'&&req.method==='POST'){
    const row=JSON.parse((await body()).toString());row.id=crypto.randomUUID();row.file_path=`${row.user_id}/${row.id}/recording.mp4`;row.status='uploading';row.created_at=new Date().toISOString();records.push(row);return json(row);
  }
  if(url.pathname==='/records')return json(records);
  if(url.pathname.startsWith('/publish/')){
    const row=records.find(r=>r.id===url.pathname.split('/').pop());const upload=[...uploads.values()].find(u=>u.path===row?.file_path);
    if(!upload||upload.offset!==row.size_bytes){res.statusCode=409;return json({error:'Envio incompleto: arquivo ainda não disponível.'});}
    row.status='published';return json(row);
  }
  if(url.pathname==='/storage/v1/upload/resumable'&&req.method==='POST'){
    const id=crypto.randomUUID();const metadata=Object.fromEntries(String(req.headers['upload-metadata']).split(',').map(p=>{const[k,v]=p.split(' ');return[k,Buffer.from(v,'base64').toString()];}));
    uploads.set(id,{id,path:metadata.objectName,size:Number(req.headers['upload-length']),offset:0,chunks:[],heads:0,patches:0});
    res.writeHead(201,{Location:backend+url.pathname+'/'+id});return res.end();
  }
  const upload=uploads.get(url.pathname.split('/').pop());
  if(!upload){res.statusCode=404;return res.end();}
  if(req.method==='HEAD'){upload.heads++;res.writeHead(200,{'Upload-Offset':String(upload.offset)});return res.end();}
  if(req.method==='PATCH'){
    const bytes=await body();upload.patches++;
    if(Number(req.headers['upload-offset'])!==upload.offset){res.writeHead(409,{'Upload-Offset':String(upload.offset)});return res.end();}
    upload.chunks.push(bytes);upload.offset+=bytes.length;
    await wait(500);
    if(lostResponse){lostResponse=false;req.socket.destroy();return;}
    res.writeHead(204,{'Upload-Offset':String(upload.offset)});return res.end();
  }
  res.statusCode=405;res.end();
});
await new Promise(resolve=>server.listen(4191,'127.0.0.1',resolve));
await fs.writeFile(path.join(qa,'client.ts'),`const session={user:{id:'admin-test'},access_token:'local-test-only'};
const callbacks=new Set<any>();(window as any).focusAuth=()=>callbacks.forEach(cb=>cb('SIGNED_IN',session));
export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:(cb:any)=>{callbacks.add(cb);return {data:{subscription:{unsubscribe:()=>callbacks.delete(cb)}}};}},rpc:()=>Promise.resolve({data:null,error:null}),from:(table:string)=>({select:()=>({eq:()=>table==='profiles'?{maybeSingle:async()=>({data:{id:'admin-test',status:'active'},error:null})}:Promise.resolve({data:[{role:'admin'}],error:null})})})};`);
await fs.writeFile(path.join(qa,'functions.ts'),`export const activateOwnerAccess=async()=>{};export const loadPlatformSettings=async()=>null;export const editExclusiveRecording=async()=>{};export const deleteExclusiveRecording=async()=>{};`);
await fs.writeFile(path.join(qa,'recordings.ts'),`export {RECORDING_BUCKET,validateRecordingFile} from '${path.join(root,'src/lib/recordings.ts')}';
async function request(p:string,body?:any){const r=await fetch('${backend}'+p,body?{method:'POST',body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
export const listRecordings=async()=>request('/records');
export const createRecording=async(user_id:string,title:string,description:string,recorded_on:string,file:File)=>request('/records',{user_id,title,description,recorded_on,file_name:file.name,mime_type:'video/mp4',size_bytes:file.size});
export const publishRecording=async(id:string)=>request('/publish/'+id,{});
export const recordingDate=(v:string)=>v;export const recordingPlayback=async()=>'';export const getRecordingLearning=async()=>({content:'',revision:0,position_seconds:0});export const saveRecordingNote=async()=>{};export const saveRecordingPosition=async()=>{};`);
await fs.writeFile(path.join(qa,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>');
await fs.writeFile(path.join(qa,'entry.tsx'),`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AuthProvider,useAuth}from'${root}/src/lib/auth.tsx';import{RecordingsPanel}from'${root}/src/components/portal/RecordingsPanel.tsx';import{RecordingTransferStatus}from'${root}/src/components/portal/RecordingTransferStatus.tsx';import '${root}/src/styles.css';function App(){const{loading}=useAuth();const[shown,setShown]=useState(true);return loading?<p>Carregando</p>:<main style={{maxWidth:900,margin:'auto',padding:24}}><button onClick={()=>setShown(!shown)}>{shown?'Outra tela':'Abrir gravações'}</button>{shown?<RecordingsPanel userId='${uid}' admin/>:<h1>Outra tela da plataforma</h1>}<RecordingTransferStatus ownerId='admin-test'/></main>}createRoot(document.getElementById('root')!).render(<AuthProvider><App/></AuthProvider>);`);
const stubs={ '@/integrations/supabase/client':'client.ts','@/lib/owner.functions':'functions.ts','@/lib/platform-settings':'functions.ts','@/lib/content-admin.functions':'functions.ts','@/lib/recordings':'recordings.ts','./recordings':'recordings.ts' };
const vite=await createServer({configFile:false,root:qa,plugins:[{name:'isolated-backend',enforce:'pre',resolveId(source){if(stubs[source])return path.join(qa,stubs[source]);}},react()],resolve:{alias:{'@':path.join(root,'src')}},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(backend),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-test-only')},server:{host:'127.0.0.1',port:4190,fs:{allow:[root]}}});
await vite.listen();
const browser=await chromium.launch({headless:true});
const bytes=Buffer.alloc(24*1024*1024+17,7);Buffer.from([0,0,0,16,0x66,0x74,0x79,0x70]).copy(bytes);const file=path.join(qa,'call.mp4');await fs.writeFile(file,bytes);
async function check(name,task){await task();report.checks.push({name,status:'passed'});console.log('PASS',name);}
async function start(page,title){const form=page.getByRole('form',{name:'Enviar gravação exclusiva'});await form.getByLabel('Título da gravação',{exact:true}).fill(title);await form.getByLabel('Arquivo da call (MP4 ou WebM)',{exact:true}).setInputFiles(file);await form.getByRole('button',{name:'Enviar gravação',exact:true}).click();}
async function done(page){await page.getByRole('complementary',{name:'Envios de gravações'}).getByText('Gravação publicada no espaço exclusivo do mentorado.',{exact:true}).waitFor({timeout:30000});}
try{
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});const page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(e.message));await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return host==='127.0.0.1'||host==='localhost'?route.continue():route.abort();});
  await page.goto('http://127.0.0.1:4190');await page.getByRole('form',{name:'Enviar gravação exclusiva'}).waitFor();const before=records.length;
  await check(label+'-upload-starts',async()=>{await start(page,label+' call');await page.getByRole('form',{name:'Enviar gravação exclusiva'}).getByRole('progressbar').waitFor();});
  await check(label+'-refocus-does-not-clear-upload',async()=>{const tab=await context.newPage();await tab.goto('about:blank');await tab.bringToFront();await wait(100);await page.bringToFront();await page.evaluate(()=>window.focusAuth());await page.getByRole('form',{name:'Enviar gravação exclusiva'}).waitFor();await tab.close();assert.equal(records.length,before+1);});
  await check(label+'-navigation-does-not-stop-transfer',async()=>{await page.getByRole('button',{name:'Outra tela',exact:true}).click();await page.getByRole('heading',{name:'Outra tela da plataforma'}).waitFor();await page.getByRole('complementary',{name:'Envios de gravações'}).waitFor();});
  if(!mobile)await check('browser-freeze-and-resume',async()=>{const cdp=await context.newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await wait(300);await cdp.send('Page.setWebLifecycleState',{state:'active'});await cdp.detach();});
  await check(label+'-upload-completes-with-identical-bytes',async()=>{await done(page);const row=records.at(-1);const upload=[...uploads.values()].find(u=>u.path===row.file_path);assert.equal(upload.offset,bytes.length);assert.equal(crypto.createHash('sha256').update(Buffer.concat(upload.chunks)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(records.length,before+1);});
  await page.screenshot({path:'evidence/'+label+'-continued.png',fullPage:true});
  await page.getByRole('button',{name:'Abrir gravações',exact:true}).click();await page.getByRole('form',{name:'Enviar gravação exclusiva'}).waitFor();
  await check(label+'-lost-chunk-response-recovers-server-offset',async()=>{lostResponse=true;await start(page,label+' retry');await done(page);const row=records.at(-1);const u=[...uploads.values()].find(u=>u.path===row.file_path);assert.ok(u.heads>=1);assert.equal(Buffer.concat(u.chunks).length,bytes.length);assert.equal(crypto.createHash('sha256').update(Buffer.concat(u.chunks)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));});
  await check(label+'-pause-and-resume-without-reselecting-file',async()=>{await start(page,label+' paused');const form=page.getByRole('form',{name:'Enviar gravação exclusiva'});await form.getByRole('button',{name:'Pausar envio',exact:true}).click();await form.getByText('Envio pausado. Clique em Retomar envio para continuar.',{exact:true}).waitFor();await page.getByRole('button',{name:'Outra tela',exact:true}).click();await page.getByRole('complementary',{name:'Envios de gravações'}).getByRole('button',{name:'Retomar envio',exact:true}).click();await done(page);const row=records.at(-1);const u=[...uploads.values()].find(u=>u.path===row.file_path);assert.equal(u.offset,bytes.length);});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
 }
 assert.deepEqual(report.pageErrors,[]);report.success=true;
}catch(e){report.success=false;report.error=String(e);process.exitCode=1;}finally{await fs.writeFile('evidence/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
