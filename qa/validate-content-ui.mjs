import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
fs.mkdirSync('.qa-content',{recursive:true});
fs.writeFileSync('.qa-content/index.html','<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
fs.writeFileSync('.qa-content/mock.ts', `
export const uid='22222222-2222-4222-8222-222222222222';
let rows=[{id:'11111111-1111-4111-8111-111111111111',user_id:uid,title:'Encontro privado de teste',description:'Dados fictícios de validação',recorded_on:'2026-11-15',file_path:uid+'/11111111-1111-4111-8111-111111111111/recording.mp4',file_name:'call.mp4',mime_type:'video/mp4',size_bytes:200,status:'published',created_at:'2026-11-15T00:00:00Z'}, {id:'33333333-3333-4333-8333-333333333333',user_id:uid,title:'Outro encontro preservado',description:'Este encontro não deve ser excluído.',recorded_on:'2026-11-16',file_path:uid+'/33333333-3333-4333-8333-333333333333/recording.mp4',file_name:'call.mp4',mime_type:'video/mp4',size_bytes:200,status:'published',created_at:'2026-11-15T00:00:00Z'}];
(window as any).writes=[];
export const listRecordings=async()=>rows;
export const createRecording=async()=>{throw new Error('Upload não faz parte deste teste');};
export const publishRecording=async()=>{};
export const getRecordingLearning=async()=>({content:'',revision:0,position_seconds:0});
export const saveRecordingNote=async()=>{};
export const saveRecordingPosition=async()=>{};
export const recordingPlayback=async()=>'';
export const recordingDate=(value:string)=>value;
export const clearRecordingUpload=()=>{};
export const uploadRecordingFile=async()=>{};
export async function editExclusiveRecording({data}:any){(window as any).writes.push({kind:'edit-recording',data}); rows=rows.map(r=>r.id===data.id?{...r,title:data.title,description:data.description,recorded_on:data.recordedOn}:r);return {id:data.id};}
export async function deleteExclusiveRecording({data}:any){(window as any).writes.push({kind:'delete-recording',data});rows=rows.filter(r=>r.id!==data.id);return {id:data.id};}
export async function editLessonMaterial({data}:any){(window as any).writes.push({kind:'edit-material',data});return {id:data.id};}
export async function deleteLessonMaterial({data}:any){(window as any).writes.push({kind:'delete-material',data});return {id:data.id};}
`);
fs.writeFileSync('.qa-content/main.tsx', `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import '../src/styles.css';import {RecordingsPanel} from '../src/components/portal/RecordingsPanel';import {LessonMaterialActions} from '../src/components/portal/LessonMaterialActions';
function App(){const [show,setShow]=useState(true);const admin=!location.search.includes('student');return <main className="mx-auto max-w-5xl p-5 space-y-6"><h1 className="text-2xl">Conteúdos — validação com dados fictícios</h1><RecordingsPanel userId="22222222-2222-4222-8222-222222222222" admin={admin}/>{admin&&show&&<LessonMaterialActions material={{id:'44444444-4444-4444-8444-444444444444',lesson_id:'55555555-5555-4555-8555-555555555555',title:'Guia de apoio',position:0,file_path:'lesson/test/file.pdf',url:null,created_at:'2026-11-15T00:00:00Z'}} reload={async()=>{if((window as any).writes.some((x:any)=>x.kind==='delete-material'))setShow(false);}}/>}</main>;}createRoot(document.getElementById('root')!).render(<App/>);`);
fs.writeFileSync('.qa-content/vite.config.mjs', `import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tailwind from '@tailwindcss/vite';import path from 'node:path';export default defineConfig({root:'.qa-content',plugins:[react(),tailwind()],resolve:{alias:[{find:'@/lib/recordings-upload',replacement:path.resolve('.qa-content/mock.ts')},{find:'@/lib/recordings',replacement:path.resolve('.qa-content/mock.ts')},{find:'@/lib/content-admin.functions',replacement:path.resolve('.qa-content/mock.ts')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:4175,fs:{allow:[process.cwd()]}}});`);
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','.qa-content/vite.config.mjs'],{stdio:['ignore','pipe','pipe']});
const logfile=fs.createWriteStream('evidence/browser-server.log');server.stdout.pipe(logfile);server.stderr.pipe(logfile);
const report={tests:[],pageErrors:[],scope:'Actual components and styles, simulated admin backend. No production data changed.'};let browser;
async function check(name,fn){await fn();report.tests.push({name,status:'passed'});console.log('PASS '+name);}
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4175')).ok)break;}catch{}await new Promise(r=>setTimeout(r,400));}
 browser=await chromium.launch();
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop';const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error)));
  await page.goto('http://127.0.0.1:4175');
  const card=page.getByRole('group',{name:'Gerenciar gravação: Encontro privado de teste',exact:true});
  await check(label+'-edit-call-title-date-description',async()=>{await card.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Título da call',{exact:true}).fill('Encontro corrigido');await page.getByLabel('Data do encontro',{exact:true}).fill('2026-11-14');await page.getByLabel('Descrição da call',{exact:true}).fill('Descrição atualizada da call fictícia.');await page.screenshot({path:'evidence/'+label+'-editing.png',fullPage:true});await page.getByRole('button',{name:'Salvar gravação',exact:true}).click();await page.getByText('Gravação atualizada. O vídeo e as anotações foram preservados.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes[0].data.title),'Encontro corrigido');});
  await check(label+'-cancel-delete-preserves-recording',async()=>{page.once('dialog',d=>d.dismiss());await page.getByRole('group',{name:'Gerenciar gravação: Encontro corrigido',exact:true}).getByRole('button',{name:'Excluir',exact:true}).click();assert.equal(await page.evaluate(()=>window.writes.filter(x=>x.kind==='delete-recording').length),0);});
  await check(label+'-confirmed-delete-only-target-recording',async()=>{page.once('dialog',d=>d.accept());await page.getByRole('group',{name:'Gerenciar gravação: Encontro corrigido',exact:true}).getByRole('button',{name:'Excluir',exact:true}).click();await page.getByText('Gravação excluída do espaço do mentorado.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Outro encontro preservado',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Encontro corrigido',exact:true}).count(),0);});
  await check(label+'-edit-material-metadata',async()=>{const material=page.getByRole('region',{name:'Material: Guia de apoio',exact:true});await material.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Título do material',{exact:true}).fill('Guia atualizado');await page.getByLabel('Ordem do material',{exact:true}).fill('2');await page.getByRole('button',{name:'Salvar material',exact:true}).click();await page.getByText('Material atualizado.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.find(x=>x.kind==='edit-material').data.position),2);});
  await check(label+'-delete-material-confirmation-and-reload',async()=>{page.once('dialog',d=>d.accept());await page.getByRole('region',{name:'Material: Guia de apoio',exact:true}).getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('region',{name:'Material: Guia de apoio',exact:true}).waitFor({state:'detached'});});
  await check(label+'-layout-fits-viewport',async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'evidence/'+label+'-list.png',fullPage:true});});
  await page.goto('http://127.0.0.1:4175/?student');await page.getByRole('heading',{name:'Minhas gravações',exact:true}).waitFor();
  await check(label+'-student-has-no-edit-or-delete',async()=>{assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Excluir',exact:true}).count(),0);});await context.close();
 }
 assert.deepEqual(report.pageErrors,[]);
}catch(e){report.error=String(e);throw e;}finally{fs.writeFileSync('evidence/browser.json',JSON.stringify(report,null,2));await browser?.close();server.kill();}
