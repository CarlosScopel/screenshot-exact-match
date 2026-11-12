import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, LoaderCircle, Play, Upload, Video } from "lucide-react";
import { createRecording, getRecordingLearning, listRecordings, publishRecording, recordingDate, recordingPlayback, saveRecordingNote, saveRecordingPosition, type CallRecording } from "@/lib/recordings";
import { clearRecordingUpload, uploadRecordingFile } from "@/lib/recordings-upload";

const messageOf = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
export function RecordingsPanel({userId,admin=false}:{userId:string;admin?:boolean}) {
  const [recordings,setRecordings]=useState<CallRecording[]>([]);
  const [selected,setSelected]=useState<CallRecording|null>(null);
  const [resume,setResume]=useState<CallRecording|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [dirty,setDirty]=useState(false);
  const request=useRef(0);
  const load=useCallback(async()=>{
    const version=++request.current;
    setLoading(true);setError("");
    try { const result=await listRecordings(userId); if(version===request.current)setRecordings(result); }
    catch(e){ if(version===request.current){setError(messageOf(e));setRecordings([]);setSelected(null);} }
    finally{if(version===request.current)setLoading(false);}
  },[userId]);
  useEffect(()=>{setSelected(null);setResume(null);setDirty(false);void load();return()=>{request.current++;};},[load]);
  const choose=(recording:CallRecording)=>{
    if(selected?.id===recording.id)return;
    if(dirty&&!window.confirm("Há anotações não salvas. Trocar de gravação e descartar esse texto?"))return;
    setDirty(false);setSelected(recording);
  };
  return <section className="space-y-5 min-w-0" aria-label={admin?"Gravações exclusivas do mentorado":"Minhas gravações"}>
    <div><h2 className="text-xl font-semibold flex items-center gap-2"><Video className="size-5 text-primary"/>{admin?"Gravações exclusivas":"Minhas gravações"}</h2><p className="text-sm text-muted-foreground mt-2">{admin?"Envie as calls semanais deste mentorado. Apenas ele e a administração podem assisti-las.":"Reassista às suas calls, retome de onde parou e registre suas anotações privadas."}</p></div>
    {admin&&<RecordingUpload key={resume?.id||"new"} userId={userId} resume={resume} onDone={async()=>{setResume(null);await load();}} onRefresh={load}/>}
    {error&&<div role="alert" className="surface p-4"><p>{error}</p><button type="button" className="portal-outline mt-3" onClick={()=>void load()}>Tentar novamente</button></div>}
    {loading&&<p role="status" className="text-sm text-muted-foreground flex gap-2"><LoaderCircle className="size-4 animate-spin"/>Carregando gravações...</p>}
    {!loading&&!error&&!recordings.length&&<div className="surface p-8 text-center text-muted-foreground">{admin?"Nenhuma gravação enviada para este mentorado.":"Suas gravações aparecerão aqui quando forem disponibilizadas pelo administrador."}</div>}
    {!!recordings.length&&<div className="grid gap-3 sm:grid-cols-2">{recordings.map(recording=><div className={"surface p-4 min-w-0 "+(selected?.id===recording.id?"border-primary/50":"")} key={recording.id}>
      <h3 className="font-semibold break-words">{recording.title}</h3><p className="text-xs text-muted-foreground flex items-center gap-2 mt-2"><CalendarDays className="size-3"/>{recordingDate(recording.recorded_on)} · {(recording.size_bytes/1024/1024).toFixed(1)} MB</p>
      {recording.status==="published"?<button type="button" className="portal-outline mt-4" onClick={()=>choose(recording)}><Play className="size-4"/>Assistir gravação</button>:admin&&<div className="mt-3"><p className="text-xs text-muted-foreground">Envio pendente — ainda não visível para o aluno.</p><button type="button" className="portal-outline mt-2" onClick={()=>setResume(recording)}>Retomar envio</button></div>}
    </div>)}</div>}
    {selected&&<RecordingPlayer key={selected.id} recording={selected} admin={admin} onDirty={setDirty}/>}
  </section>;
}
function RecordingUpload({userId,resume,onDone,onRefresh}:{userId:string;resume:CallRecording|null;onDone:()=>Promise<void>;onRefresh:()=>Promise<void>}) {
  const [title,setTitle]=useState(resume?.title||"");
  const [date,setDate]=useState(resume?.recorded_on||today());
  const [description,setDescription]=useState(resume?.description||"");
  const [file,setFile]=useState<File|null>(null);
  const [draft,setDraft]=useState<CallRecording|null>(resume);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [notice,setNotice]=useState("");
  const abort=useRef<AbortController|null>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  useEffect(()=>{
    if(!busy)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[busy]);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(busy)return;
    const form=event.currentTarget;
    if(!file){setNotice("Selecione o arquivo da gravação.");return;}
    const controller=new AbortController();abort.current=controller;
    setBusy(true);setNotice("");setProgress(0);
    try{
      let target=draft;
      if(!target){target=await createRecording(userId,title,description,date,file);if(alive.current)setDraft(target);}
      controller.signal.throwIfAborted();
      let published=false;
      if(draft){
        try{await publishRecording(target.id);published=true;}
        catch(error){if(!messageOf(error).startsWith("Envio incompleto"))throw error;}
      }
      if(!published){
        await uploadRecordingFile(target,file,{signal:controller.signal,onProgress:(done,total)=>{if(alive.current)setProgress(Math.floor(done/total*100));}});
        controller.signal.throwIfAborted();
        await publishRecording(target.id);
      }
      clearRecordingUpload(target.file_path);
      if(alive.current){setNotice("Gravação publicada no espaço exclusivo do mentorado.");setDraft(null);setFile(null);setTitle("");setDescription("");setDate(today());form.reset();await onDone();}
    }catch(e){
      if(alive.current){setNotice(controller.signal.aborted?"Envio pausado. Selecione o mesmo arquivo e retome quando desejar.":messageOf(e));await onRefresh();}
    }finally{if(alive.current)setBusy(false);}
  };
  return <form onSubmit={submit} aria-label="Enviar gravação exclusiva" className="surface p-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm min-w-0">Título da gravação<input className="portal-input mt-2" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required disabled={busy||!!draft}/></label>
    <label className="text-sm min-w-0">Data da call<input type="date" className="portal-input mt-2" value={date} onChange={e=>setDate(e.target.value)} required disabled={busy||!!draft}/></label>
    <label className="text-sm sm:col-span-2 min-w-0">Descrição ou assuntos abordados<textarea className="portal-input mt-2 min-h-20" value={description} onChange={e=>setDescription(e.target.value)} maxLength={8000} disabled={busy||!!draft}/></label>
    <label className="text-sm sm:col-span-2 min-w-0">Arquivo da call (MP4 ou WebM)<input type="file" accept="video/mp4,video/webm,.mp4,.webm" className="portal-input mt-2" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <p className="text-xs text-muted-foreground sm:col-span-2">MP4 H.264/AAC ou WebM, até 2 GB, sujeito ao limite do armazenamento. O envio usa blocos e pode ser retomado nesta aba com o mesmo arquivo. Mantenha a página aberta até concluir.</p>
    {draft&&<p className="text-xs text-muted-foreground sm:col-span-2 break-all">Arquivo esperado: {draft.file_name}</p>}
    {busy&&<div className="sm:col-span-2"><progress aria-label="Progresso do envio" value={progress} max={100} className="w-full h-2"/><p role="status" className="text-sm mt-2">{progress===100?"Conferindo e publicando gravação...":`Enviando gravação: ${progress}%`}</p></div>}
    <div className="sm:col-span-2 flex flex-wrap gap-3"><button type="submit" className="portal-button" disabled={busy||!file}><Upload className="size-4"/>{busy?"Enviando...":draft?"Retomar envio":"Enviar gravação"}</button>{busy&&<button type="button" className="portal-outline" onClick={()=>abort.current?.abort()}>Pausar envio</button>}</div>
    {notice&&<p role="status" className="text-sm sm:col-span-2 break-words">{notice}</p>}
  </form>;
}
function RecordingPlayer({recording,admin,onDirty}:{recording:CallRecording;admin:boolean;onDirty:(dirty:boolean)=>void}) {
  const [url,setUrl]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [note,setNote]=useState("");
  const [savedNote,setSavedNote]=useState("");
  const [revision,setRevision]=useState(0);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [speed,setSpeed]=useState("1");
  const video=useRef<HTMLVideoElement>(null);
  const position=useRef(0), lastWrite=useRef(0), wasPlaying=useRef(false);
  const queue=useRef(Promise.resolve());
  const live=useRef(true);
  const dirty=note!==savedNote;
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  useEffect(()=>{
    live.current=true;let alive=true;
    void Promise.all([recordingPlayback(recording),admin?Promise.resolve(null):getRecordingLearning(recording.id)]).then(([source,learning])=>{
      if(!alive)return;
      if(learning){setNote(learning.content);setSavedNote(learning.content);setRevision(learning.revision);position.current=learning.position_seconds;}
      setUrl(source);setLoading(false);
    }).catch(e=>{if(alive){setError(messageOf(e));setLoading(false);}});
    return()=>{alive=false;live.current=false;};
  },[recording,admin]);
  const storePosition=(seconds:number)=>{
    if(admin||!Number.isFinite(seconds))return;
    lastWrite.current=Date.now();
    queue.current=queue.current.then(()=>saveRecordingPosition(recording.id,seconds)).catch(()=>{if(live.current)setNotice("Não foi possível salvar o ponto de reprodução. Tente novamente.");});
  };
  const refreshVideo=async()=>{
    setError("");setLoading(true);
    if(video.current){position.current=video.current.currentTime;wasPlaying.current=!video.current.paused;}
    try{const source=await recordingPlayback(recording);if(live.current)setUrl(source);}
    catch(e){if(live.current)setError(messageOf(e));}
    finally{if(live.current)setLoading(false);}
  };
  const save=async()=>{
    if(saving)return;setSaving(true);setNotice("");
    const text=note;
    try{const result=await saveRecordingNote(recording.id,text,revision);if(live.current){setSavedNote(text);setRevision(result.revision);setNotice("Anotações salvas.");}}
    catch(e){if(live.current)setNotice(messageOf(e));}
    finally{if(live.current)setSaving(false);}
  };
  return <article className="surface p-4 sm:p-6 space-y-4 min-w-0" aria-label={`Assistindo: ${recording.title}`}>
    <div><h3 className="text-lg font-semibold break-words">{recording.title}</h3><p className="text-sm text-muted-foreground mt-1">Call de {recordingDate(recording.recorded_on)}</p>{recording.description&&<p className="text-sm whitespace-pre-wrap break-words mt-3">{recording.description}</p>}</div>
    {loading&&<p role="status">Carregando gravação...</p>}
    {error&&<div role="alert"><p>{error}</p><button type="button" className="portal-outline mt-3" onClick={()=>void refreshVideo()}>Recarregar vídeo</button></div>}
    {url&&<video ref={video} src={url} aria-label={`Gravação: ${recording.title}`} controls playsInline preload="metadata" className="w-full aspect-video rounded-xl bg-black" onLoadedMetadata={event=>{const player=event.currentTarget;player.playbackRate=Number(speed);if(position.current>0&&position.current<player.duration-2)player.currentTime=position.current;if(wasPlaying.current){wasPlaying.current=false;void player.play().catch(()=>undefined);}}} onTimeUpdate={event=>{position.current=event.currentTarget.currentTime;if(Date.now()-lastWrite.current>=30000&&!event.currentTarget.paused)storePosition(position.current);}} onPause={event=>storePosition(event.currentTarget.currentTime)} onEnded={()=>storePosition(0)} onError={()=>setError("O vídeo não carregou ou o link de reprodução expirou. Recarregue para renovar o acesso. Para MP4, use H.264/AAC.")}/>}
    {url&&<div className="flex flex-wrap items-center gap-4"><label className="text-sm flex items-center gap-2">Velocidade<select className="portal-input w-auto" value={speed} onChange={e=>{setSpeed(e.target.value);if(video.current)video.current.playbackRate=Number(e.target.value);}}>{[0.75,1,1.25,1.5,2].map(rate=><option value={String(rate)} key={rate}>{rate}×</option>)}</select></label><button type="button" className="text-sm text-primary" onClick={()=>void refreshVideo()}>Renovar reprodução</button></div>}
    {!admin&&!loading&&url&&<section className="space-y-3"><label className="text-sm font-semibold block">Minhas anotações privadas<textarea className="portal-input min-h-40 mt-2" value={note} onChange={e=>setNote(e.target.value)} maxLength={50000} disabled={saving} placeholder="Registre aprendizados, decisões e próximos passos desta call..."/></label><div className="flex flex-wrap items-center gap-3"><button type="button" className="portal-button" disabled={saving||!dirty} onClick={()=>void save()}>{saving?"Salvando...":"Salvar anotações"}</button>{dirty&&<span className="text-xs text-muted-foreground">Alterações ainda não salvas</span>}</div></section>}
    {admin&&<p className="text-xs text-muted-foreground">As anotações do mentorado são privadas e não aparecem para a administração.</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
  </article>;
}
