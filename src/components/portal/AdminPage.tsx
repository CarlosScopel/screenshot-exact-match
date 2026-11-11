import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, Layers3, Plus, Save, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inviteMentee, resendInvite, deleteMentee, reviewMentee } from "@/lib/admin.functions";
import { approvalState } from "@/lib/approval";
import { uploadMaterial, uploadMedia } from "@/lib/media";
import { displayPlatformName, formatDate, type PortalData, type Row } from "@/lib/portal";

type View = "home" | "trainings" | "training" | "lesson" | "library" | "tools" | "announcements" | "profile" | "admin" | "manage-trainings" | "manage-library" | "manage-tools" | "mentees" | "cohorts" | "manage-announcements" | "settings";
type Go = (view: View, id?: string) => void;
type Field = { key: string; label: string; type?: "text" | "textarea" | "select" | "number" | "url" | "date" | "datetime-local" | "color"; options?: string[]; required?: boolean };
type AdminPageProps = {
  page: View; data: PortalData; reload: () => Promise<void>; go: Go;
  settings: Row<"platform_settings"> | null; refreshSettings: () => Promise<void>;
};

const trainingFields: Field[] = [
  { key: "title", label: "Título", required: true }, { key: "description", label: "Descrição", type: "textarea" },
  { key: "cover_url", label: "Capa (URL HTTPS)", type: "url" }, { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
  { key: "position", label: "Ordem", type: "number" },
];
const moduleFields: Field[] = [
  { key: "title", label: "Título do módulo", required: true }, { key: "description", label: "Descrição", type: "textarea" },
  { key: "status", label: "Status", type: "select", options: ["draft", "published"] }, { key: "position", label: "Ordem", type: "number" },
];
const lessonFields: Field[] = [
  { key: "title", label: "Título da aula", required: true }, { key: "description", label: "Descrição", type: "textarea" },
  { key: "content", label: "Conteúdo (Markdown)", type: "textarea" }, { key: "video_url", label: "URL HTTPS do vídeo", type: "url" },
  { key: "thumbnail_url", label: "Capa (URL HTTPS)", type: "url" }, { key: "duration_minutes", label: "Duração em minutos", type: "number" },
  { key: "available_at", label: "Disponível a partir de", type: "datetime-local" },
  { key: "status", label: "Status", type: "select", options: ["draft", "published"] }, { key: "position", label: "Ordem", type: "number" },
];
const libraryFields: Field[] = [
  { key: "title", label: "Título", required: true }, { key: "description", label: "Descrição", type: "textarea" },
  { key: "kind", label: "Tipo", type: "select", options: ["file", "link", "article"] },
  { key: "category_id", label: "ID da categoria (opcional)" }, { key: "url", label: "URL do link", type: "url" },
  { key: "body", label: "Texto / artigo (Markdown)", type: "textarea" },
  { key: "status", label: "Status", type: "select", options: ["draft", "published"] },
];
const toolFields: Field[] = [
  { key: "name", label: "Nome", required: true }, { key: "description", label: "Descrição", type: "textarea" },
  { key: "icon", label: "Ícone Lucide" }, { key: "category", label: "Categoria" },
  { key: "status", label: "Status", type: "select", options: ["soon", "beta", "active"] },
  { key: "kind", label: "Tipo", type: "select", options: ["internal", "external"] }, { key: "url", label: "URL externa", type: "url" },
  { key: "route", label: "Rota interna" }, { key: "position", label: "Ordem", type: "number" },
  { key: "enabled", label: "Ativa", type: "select", options: ["true", "false"] },
];
const announcementFields: Field[] = [
  { key: "title", label: "Título", required: true }, { key: "body", label: "Mensagem", type: "textarea", required: true },
  { key: "published_at", label: "Publicação", type: "datetime-local" },
  { key: "pinned", label: "Destacar", type: "select", options: ["false", "true"] },
];
const cohortFields: Field[] = [
  { key: "name", label: "Nome da turma", required: true }, { key: "description", label: "Descrição", type: "textarea" },
];

function Heading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="flex gap-4 justify-between items-end flex-wrap mb-6"><div><h1 className="text-2xl sm:text-3xl font-semibold">{title}</h1>{subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}</div>{action}</div>; }
function Notice({ text }: { text: string }) { return text ? <p role="status" className="p-3 border border-primary/20 bg-primary/5 rounded-xl text-sm mb-4">{text}</p> : null; }

function EditPanel({ table, title, fields, initial, extra, afterSave, onClose }: {
  table: "trainings" | "modules" | "lessons" | "library_items" | "library_categories" | "tools" | "announcements" | "cohorts";
  title: string; fields: Field[]; initial?: Record<string, unknown>; extra?: Record<string, unknown>;
  afterSave: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(e.currentTarget);
      const payload: Record<string, unknown> = { ...(extra || {}) };
      for (const field of fields) {
        const raw = String(form.get(field.key) || "");
        payload[field.key] = !raw ? (field.type === "number" ? 0 : field.key === "icon" ? "Sparkles" : field.required ? "" : null) :
          field.type === "number" ? Number(raw) :
          (["true", "false"].includes(raw) && (field.key === "pinned" || field.key === "enabled")) ? raw === "true" :
          field.type === "datetime-local" ? new Date(raw).toISOString() : raw;
      }
      const coverFile = form.get("cover_file");
      if (coverFile instanceof File && coverFile.size) payload.cover_url = await uploadMedia(coverFile, "covers");
      const thumbnailFile = form.get("thumbnail_file");
      if (thumbnailFile instanceof File && thumbnailFile.size) payload.thumbnail_url = await uploadMedia(thumbnailFile, "thumbnails");
      if (table === "announcements" && !payload.published_at) payload.published_at = new Date().toISOString();
      if (initial?.id) payload.id = initial.id;
      if (table === "trainings" && payload.status === "published" && !initial?.published_at) payload.published_at = new Date().toISOString();
      if (table === "library_items" && payload.status === "published" && !initial?.published_at) payload.published_at = new Date().toISOString();
      const { data, error } = await supabase.from(table as "trainings").upsert(payload as never).select("id").single();
      if (error || !data) throw error || new Error("O banco não retornou o registro salvo.");
      await afterSave(data.id);
      onClose();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };
  return <div className="surface p-6 mt-5"><div className="flex justify-between items-center mb-6"><h2 className="font-semibold text-lg">{title}</h2><button className="text-sm text-muted-foreground" onClick={onClose}>Cancelar</button></div><form onSubmit={submit} className="grid md:grid-cols-2 gap-4">{fields.map((f) => <label className={"text-sm font-medium block " + (f.type === "textarea" ? "md:col-span-2" : "")} key={f.key}>{f.label}{f.type === "textarea" ? <textarea name={f.key} className="portal-input mt-2 min-h-28" required={f.required} defaultValue={String(initial?.[f.key] ?? "")} /> : f.type === "select" ? <select name={f.key} className="portal-input mt-2" defaultValue={String(initial?.[f.key] ?? f.options?.[0] ?? "")}>{f.options?.map((v) => <option value={v} key={v}>{v === "draft" ? "Rascunho" : v === "published" ? "Publicado" : v === "soon" ? "Em breve" : v === "true" ? "Sim" : v === "false" ? "Não" : v}</option>)}</select> : <input name={f.key} className="portal-input mt-2" required={f.required} type={f.type === "url" ? "text" : f.type || "text"} step={f.type === "number" ? 1 : undefined} defaultValue={f.type === "datetime-local" && initial?.[f.key] ? new Date(String(initial[f.key])).toISOString().slice(0, 16) : String(initial?.[f.key] ?? "")} />}</label>)}{fields.some((f) => f.key === "cover_url") && <label className="text-sm block">Enviar imagem de capa<input className="portal-input mt-2" type="file" name="cover_file" accept="image/*" /></label>}{fields.some((f) => f.key === "thumbnail_url") && <label className="text-sm block">Enviar thumbnail<input className="portal-input mt-2" type="file" name="thumbnail_file" accept="image/*" /></label>}<div className="md:col-span-2"><button disabled={busy} className="portal-button"><Save className="size-4" />{busy ? "Salvando..." : "Salvar alterações"}</button><Notice text={message} /></div></form></div>;
}
async function deleteRecord(table: "trainings" | "modules" | "lessons" | "library_items" | "library_categories" | "tools" | "announcements" | "cohorts", id: string, reload: () => Promise<void>) {
  if (!window.confirm("Tem certeza? Esta ação não poderá ser desfeita.")) return;
  const { error } = await supabase.from(table as "trainings").delete().eq("id", id);
  if (error) throw error;
  await reload();
}
function EntityManager({ title, subtitle, table, items, fields, reload }: {
  title: string; subtitle: string; table: "library_items" | "tools" | "announcements" | "cohorts" | "library_categories";
  items: Array<Record<string, unknown>>; fields: Field[]; reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  return <><Heading title={title} subtitle={subtitle} action={<button className="portal-button" onClick={() => setSelected(null)}><Plus className="size-4" />Adicionar</button>} /><Notice text={message} />{selected !== undefined && <EditPanel key={String(selected?.id || "new")} table={table} title={selected ? "Editar item" : "Adicionar item"} fields={fields} initial={selected || undefined} afterSave={async () => { await reload(); }} onClose={() => setSelected(undefined)} />}<div className="surface overflow-hidden mt-6">{items.length ? items.map((item) => <div key={String(item.id)} className="p-5 flex justify-between items-center gap-4 border-b last:border-0"><div className="min-w-0"><h3 className="font-medium truncate">{String(item.title || item.name || "Sem título")}</h3><p className="text-xs text-muted-foreground mt-1">{String(item.status || item.kind || (item.description ?? ""))}</p></div><div className="flex gap-2 shrink-0"><button className="portal-outline" onClick={() => setSelected(item)}>Editar</button><button aria-label="Excluir" className="portal-outline text-destructive" onClick={() => deleteRecord(table, String(item.id), reload).catch((e) => setMessage(String(e)))}><Trash2 className="size-4" /></button></div></div>) : <p className="p-10 text-center text-sm text-muted-foreground">Nenhum conteúdo cadastrado.</p>}</div></>;
}

export function AdminPage({ page, data, reload, go, settings, refreshSettings }: AdminPageProps) {
  const [message, setMessage] = useState("");
  const [training, setTraining] = useState<string | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ type: "trainings" | "modules" | "lessons"; record: Record<string, unknown> | null } | null>(null);
  const trainingRecord = data.trainings.find((t) => t.id === training);
  const moduleRecord = data.modules.find((m) => m.id === module);
  if (page === "admin") return <div className="space-y-7"><Heading title="Visão geral" subtitle="Acompanhe os indicadores reais da plataforma." /><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4"><Stat name="Mentorados" value={data.profiles.length} /><Stat name="Mentorados ativos" value={data.profiles.filter((p) => p.status === "active").length} /><Stat name="Treinamentos publicados" value={data.trainings.filter((t) => t.status === "published").length} /><Stat name="Aulas cadastradas" value={data.lessons.length} /></div>{data.profiles.some((p) => approvalState(p) === "pending") && <button className="surface p-5 w-full text-left flex flex-wrap items-center justify-between gap-3 border-primary/30" onClick={() => go("mentees")}><div><p className="font-semibold">Novos acessos aguardando aprovação</p><p className="text-sm text-muted-foreground mt-1">{data.profiles.filter((p) => approvalState(p) === "pending").length} solicitação(ões) para você analisar.</p></div><span className="portal-button">Analisar agora <ArrowRight className="size-4" /></span></button>}<div className="grid md:grid-cols-2 gap-5"><button className="surface p-7 text-left hover:border-primary/40" onClick={() => go("manage-trainings")}><GraduationCap className="text-primary mb-4" /><h3 className="font-semibold">Gerenciar treinamentos</h3><p className="text-muted-foreground text-sm mt-2">Crie módulos, publique aulas e organize os conteúdos.</p></button><button className="surface p-7 text-left hover:border-primary/40" onClick={() => go("mentees")}><Users className="text-primary mb-4" /><h3 className="font-semibold">Gerenciar mentorados</h3><p className="text-muted-foreground text-sm mt-2">Convide alunos e libere acesso a treinamentos.</p></button></div><div className="surface p-6"><h2 className="font-semibold mb-4">Mentorados recentes</h2>{data.profiles.slice(0, 6).map((p) => <div key={p.id} className="flex gap-4 border-t py-3 justify-between"><span className="text-sm">{p.full_name || p.email}</span><span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span></div>)}{!data.profiles.length && <p className="text-sm text-muted-foreground">Ainda não existem mentorados.</p>}</div></div>;
  if (page === "manage-trainings") {
    const items: Array<Record<string, unknown>> = training ? module ? data.lessons.filter((l) => l.module_id === module) : data.modules.filter((m) => m.training_id === training) : data.trainings;
    const table = module ? "lessons" : training ? "modules" : "trainings";
    const fields = module ? lessonFields : training ? moduleFields : trainingFields;
    return <div><Heading title={module ? moduleRecord?.title || "Aulas" : training ? trainingRecord?.title || "Módulos" : "Treinamentos"} subtitle="Organize e publique os conteúdos da plataforma." action={<button className="portal-button" onClick={() => setEditing({ type: table, record: null })}><Plus className="size-4" />{module ? "Nova aula" : training ? "Novo módulo" : "Novo treinamento"}</button>} /><div className="flex gap-2 mb-5">{training && <button className="portal-outline" onClick={() => { setTraining(null); setModule(null); setEditing(null); }}><ArrowLeft className="size-4" />Treinamentos</button>}{module && <button className="portal-outline" onClick={() => { setModule(null); setEditing(null); }}><ArrowLeft className="size-4" />Módulos</button>}</div><Notice text={message} />{editing && <EditPanel key={String(editing.record?.id || editing.type)} table={editing.type} title={editing.record ? "Editar" : "Adicionar"} fields={fields} extra={module ? { module_id: module } : training ? { training_id: training } : {}} initial={editing.record || undefined} afterSave={async () => { await reload(); }} onClose={() => setEditing(null)} />}<div className="surface overflow-hidden mt-5">{items.map((item) => <div className="flex gap-3 items-center p-5 border-b last:border-0" key={String(item.id)}><span className="size-10 rounded-xl bg-primary/10 text-primary grid place-content-center">{module ? <BookOpen className="size-5" /> : training ? <Layers3 className="size-5" /> : <GraduationCap className="size-5" />}</span><div className="flex-1 min-w-0"><p className="font-medium truncate">{String(item.title)}</p><p className="text-xs text-muted-foreground">{String(item.status || "")}</p></div>{!module && <button className="portal-outline" onClick={() => { if (training) setModule(String(item.id)); else setTraining(String(item.id)); setEditing(null); }}>Abrir <ArrowRight className="size-4" /></button>}<button className="portal-outline" onClick={() => setEditing({ type: table, record: item })}>Editar</button><button className="portal-outline text-destructive" aria-label="Excluir" onClick={() => deleteRecord(table, String(item.id), reload).catch((e) => setMessage(String(e)))}><Trash2 className="size-4" /></button></div>)}{!items.length && <p className="p-10 text-sm text-muted-foreground text-center">Nenhum conteúdo cadastrado neste nível.</p>}</div>{module && <LessonMaterials lessonIds={data.lessons.filter((l) => l.module_id === module).map((l) => ({ id: l.id, title: l.title }))} data={data} reload={reload} />}{!module && !training && <p className="text-xs text-muted-foreground mt-5">Os treinamentos são privados. Libere acesso pelo gerenciamento de mentorados ou turmas.</p>}</div>;
  }
  if (page === "manage-library") return <div className="space-y-8"><EntityManager title="Biblioteca" subtitle="Publique arquivos, links e artigos." table="library_items" items={data.library} fields={libraryFields} reload={reload} /><LibraryUpload data={data} reload={reload} /><EntityManager title="Categorias" subtitle="Organização da biblioteca." table="library_categories" items={data.categories} fields={[{ key: "name", label: "Nome", required: true }, { key: "position", label: "Ordem", type: "number" }]} reload={reload} /></div>;
  if (page === "manage-tools") return <EntityManager title="Catálogo de ferramentas" subtitle="Gerencie recursos ativos, em beta ou em breve. Ferramentas internas precisam ser implementadas separadamente." table="tools" items={data.tools} fields={toolFields} reload={reload} />;
  if (page === "manage-announcements") return <EntityManager title="Comunicados" subtitle="Publique atualizações para os mentorados." table="announcements" items={data.announcements} fields={announcementFields} reload={reload} />;
  if (page === "cohorts") return <div className="space-y-7"><EntityManager title="Turmas" subtitle="Organize grupos de mentorados." table="cohorts" items={data.cohorts} fields={cohortFields} reload={reload} /><TrainingCohorts data={data} reload={reload} /></div>;
  if (page === "mentees") return <Mentees data={data} reload={reload} />;
  if (page === "settings") return <SettingsEditor settings={settings} refreshSettings={refreshSettings} />;
  return null;
}
function Stat({ name, value }: { name: string; value: number }) { return <div className="surface p-6"><p className="text-sm text-muted-foreground">{name}</p><p className="text-3xl font-semibold mt-3">{value}</p></div>; }
function LessonMaterials({ lessonIds, data, reload }: { lessonIds: { id: string; title: string }[]; data: PortalData; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const form = new FormData(event.currentTarget); const id = String(form.get("lesson")); const file = form.get("file"); const title = String(form.get("title"));
      if (!(file instanceof File) || !file.size) throw new Error("Selecione um arquivo.");
      const path = await uploadMaterial(file, "lesson", id);
      const { error } = await supabase.from("lesson_materials").insert({ lesson_id: id, title: title || file.name, file_path: path });
      if (error) throw error;
      await reload(); (event.target as HTMLFormElement).reset(); setMessage("Material adicionado.");
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  return <div className="surface p-6 mt-6"><h3 className="font-semibold mb-4">Materiais complementares das aulas</h3><form className="grid md:grid-cols-4 gap-3" onSubmit={add}><select name="lesson" className="portal-input" required>{lessonIds.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select><input name="title" placeholder="Título do material" className="portal-input" /><input name="file" aria-label="Arquivo" type="file" required className="portal-input" /><button className="portal-button" disabled={busy || !lessonIds.length}><Upload className="size-4" />Enviar arquivo</button></form><Notice text={message} />{data.materials.filter((m) => lessonIds.some((l) => l.id === m.lesson_id)).map((m) => <div className="flex justify-between items-center border-t py-3 text-sm" key={m.id}><span>{m.title}</span><button className="text-destructive" onClick={() => { if (window.confirm("Excluir referência a este material?")) void supabase.from("lesson_materials").delete().eq("id", m.id).then(() => reload()); }}>Excluir</button></div>)}</div>;
}
function LibraryUpload({ data, reload }: { data: PortalData; reload: () => Promise<void> }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMessage("");
    let id = "";
    try { const f = new FormData(e.currentTarget); const file = f.get("file");
      if (!(file instanceof File) || !file.size) throw new Error("Selecione um arquivo.");
      const { data: item, error } = await supabase.from("library_items").insert({ title: String(f.get("title")) || file.name, kind: "file", category_id: String(f.get("category")) || null, status: "draft", file_name: file.name }).select("id").single();
      if (error || !item) throw error || new Error("Falha ao criar material.");
      id = item.id;
      const path = await uploadMaterial(file, "library", id);
      const { error: updateError } = await supabase.from("library_items").update({ file_path: path }).eq("id", id);
      if (updateError) throw updateError;
      await reload(); (e.target as HTMLFormElement).reset(); setMessage("Arquivo enviado como rascunho. Edite o material para publicá-lo.");
    } catch (e) { setMessage(String(e) + (id ? " O rascunho foi mantido para recuperação." : "")); }
    finally { setBusy(false); }
  };
  return <div className="surface p-6"><h3 className="font-semibold mb-4">Enviar novo arquivo privado</h3><form className="grid md:grid-cols-4 gap-3" onSubmit={submit}><input className="portal-input" name="title" placeholder="Título" /><select className="portal-input" name="category"><option value="">Sem categoria</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className="portal-input" name="file" type="file" required aria-label="Arquivo privado" /><button disabled={busy} className="portal-button"><Upload className="size-4" />Enviar arquivo</button></form><Notice text={message} /></div>;
}
function TrainingCohorts({ data, reload }: { data: PortalData; reload: () => Promise<void> }) {
  const [notice, setNotice] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const training_id = String(f.get("training")); const cohort_id = String(f.get("cohort"));
    const { error } = await supabase.from("training_cohorts").upsert({ training_id, cohort_id });
    setNotice(error?.message || "Turma vinculada ao treinamento."); if (!error) await reload();
  };
  return <div className="surface p-6"><h3 className="font-semibold mb-4">Acesso aos treinamentos por turma</h3><form onSubmit={submit} className="grid md:grid-cols-3 gap-3"><select className="portal-input" name="training" required>{data.trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select><select className="portal-input" name="cohort" required>{data.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="portal-button" disabled={!data.cohorts.length || !data.trainings.length}>Vincular turma</button></form><Notice text={notice} />{data.trainingCohorts.map((c) => <div key={c.training_id + c.cohort_id} className="border-t py-3 flex justify-between gap-3 text-sm"><span>{data.trainings.find((t) => t.id === c.training_id)?.title} — {data.cohorts.find((t) => t.id === c.cohort_id)?.name}</span><button className="text-destructive" onClick={() => { if (window.confirm("Remover acesso desta turma?")) void supabase.from("training_cohorts").delete().eq("training_id", c.training_id).eq("cohort_id", c.cohort_id).then(() => reload()); }}>Remover</button></div>)}</div>;
}
function Mentees({ data, reload }: { data: PortalData; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<Row<"profiles"> | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const pending = data.profiles.filter((p) => approvalState(p) === "pending");
  const review = async (userId: string, decision: "approve" | "reject") => {
    if (decision === "reject" && !window.confirm("Recusar este mentorado? Ele continuará sem acesso à plataforma.")) return;
    setBusy(true); setMessage("");
    try {
      const result = await reviewMentee({ data: { userId, decision } });
      await reload();
      setMessage(decision === "approve" ?
        (result.needsPasswordEmail ? "Acesso aprovado, mas o e-mail de criação de senha não foi enviado. Oriente o mentorado a usar 'Esqueceu sua senha?'" : "Acesso aprovado! O mentorado poderá entrar após criar sua senha.") :
        "Solicitação recusada. O acesso permanece bloqueado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível analisar a solicitação."); }
    finally { setBusy(false); }
  };
  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try { const f = new FormData(e.currentTarget);
      await inviteMentee({ data: { name: String(f.get("name")), email: String(f.get("email")), cohortIds: [], trainingIds: [], redirectTo: window.location.origin } });
      setMessage("Convite enviado. O mentorado ficará aguardando sua aprovação."); await reload(); (e.target as HTMLFormElement).reset();
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  };
  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!selected) return; setBusy(true);
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("profiles").update({ full_name: String(f.get("name")), status: String(f.get("status")), access_expires_at: String(f.get("expires")) || null }).eq("id", selected.id);
    setMessage(error?.message || "Mentorado atualizado."); if (!error) await reload(); setBusy(false);
  };
  const grant = async (kind: "cohort" | "training", id: string, enabled: boolean) => {
    if (!selected) return;
    const table = kind === "cohort" ? "cohort_members" : "training_grants";
    const fk = kind === "cohort" ? "cohort_id" : "training_id";
    const query = supabase.from(table as "training_grants");
    const { error } = enabled ? await query.insert({ user_id: selected.id, [fk]: id } as never) :
      await query.delete().eq("user_id", selected.id).eq(fk, id);
    setMessage(error?.message || "Permissão atualizada."); if (!error) await reload();
  };
  return <div><Heading title="Mentorados" subtitle="Analise novos cadastros e controle quem pode acessar a plataforma." />
    <section className="surface p-5 mb-6" aria-label="Solicitações aguardando aprovação">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-semibold">Aguardando aprovação</h2>
        <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1">{pending.length} pendente(s)</span>
      </div>
      {pending.length === 0 ? <p className="text-sm text-muted-foreground">Não existem solicitações aguardando sua análise.</p> :
      <div className="space-y-3">{pending.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-4">
        <div className="min-w-0"><p className="font-semibold text-sm">{p.full_name || "Sem nome"}</p><p className="text-xs text-muted-foreground break-all">{p.email} · {formatDate(p.created_at)}</p></div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="portal-button" onClick={() => void review(p.id, "approve")}>Aprovar</button>
          <button type="button" disabled={busy} className="portal-outline text-destructive" onClick={() => void review(p.id, "reject")}>Recusar</button>
        </div>
      </div>)}</div>}
    </section><form onSubmit={invite} className="surface p-5 grid md:grid-cols-3 gap-3"><input className="portal-input" placeholder="Nome do mentorado" name="name" required minLength={2} /><input className="portal-input" placeholder="E-mail" name="email" type="email" required /><button disabled={busy} className="portal-button"><Plus className="size-4" />Enviar convite</button></form><Notice text={message} />{selected && <div className="surface p-6 my-5"><div className="flex justify-between mb-5"><h2 className="font-semibold">Gerenciar {selected.full_name || selected.email}</h2><button onClick={() => setSelected(null)}>Fechar</button></div><form onSubmit={saveProfile} className="grid md:grid-cols-4 gap-3"><input className="portal-input" name="name" defaultValue={selected.full_name} required /><select className="portal-input" name="status" defaultValue={selected.status}><option value="active">Ativo</option><option value="suspended">Suspenso</option></select><input className="portal-input" type="date" name="expires" defaultValue={selected.access_expires_at?.slice(0, 10) || ""} /><button className="portal-button" disabled={busy}>Salvar mentorado</button></form><h3 className="font-semibold mt-6 mb-3">Acesso individual aos treinamentos</h3><div className="grid sm:grid-cols-2 gap-2">{data.trainings.map((t) => <label className="flex items-center gap-3 text-sm p-3 rounded-xl border" key={t.id}><input type="checkbox" checked={data.trainingGrants.some((g) => g.user_id === selected.id && g.training_id === t.id)} onChange={(e) => void grant("training", t.id, e.target.checked)} />{t.title}</label>)}</div><h3 className="font-semibold mt-6 mb-3">Turmas</h3><div className="grid sm:grid-cols-2 gap-2">{data.cohorts.map((c) => <label className="flex items-center gap-3 text-sm p-3 rounded-xl border" key={c.id}><input type="checkbox" checked={data.cohortMembers.some((g) => g.user_id === selected.id && g.cohort_id === c.id)} onChange={(e) => void grant("cohort", c.id, e.target.checked)} />{c.name}</label>)}</div><div className="flex gap-3 mt-6 flex-wrap"><button className="portal-outline" onClick={async () => { try { await resendInvite({ data: { email: selected.email, redirectTo: window.location.origin } }); setMessage("E-mail de acesso enviado."); } catch (e) { setMessage(String(e)); } }}>Reenviar acesso</button><button className="portal-outline text-destructive" onClick={async () => { if (!window.confirm("Excluir permanentemente este mentorado?")) return; try { await deleteMentee({ data: { userId: selected.id } }); setSelected(null); await reload(); setMessage("Mentorado excluído."); } catch (e) { setMessage(String(e)); } }}><Trash2 className="size-4" />Excluir mentorado</button></div></div>}<div className="surface overflow-x-auto mt-5"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-4">Nome</th><th className="p-4">E-mail</th><th className="p-4">Status</th><th className="p-4">Cadastro</th><th className="p-4">Ação</th></tr></thead><tbody>{data.profiles.map((p) => <tr className="border-t" key={p.id}><td className="p-4">{p.full_name || "—"}</td><td className="p-4">{p.email}</td><td className="p-4">{approvalState(p) === "pending" ? "Aguardando aprovação" : approvalState(p) === "rejected" ? "Recusado" : p.status === "active" ? "Ativo" : "Suspenso"}</td><td className="p-4">{formatDate(p.created_at)}</td><td className="p-4"><button className="text-primary" onClick={() => setSelected(p)}>Gerenciar</button></td></tr>)}</tbody></table>{!data.profiles.length && <p className="p-8 text-muted-foreground text-center">Nenhum usuário cadastrado.</p>}</div></div>;
}
function SettingsEditor({ settings, refreshSettings }: { settings: Row<"platform_settings"> | null; refreshSettings: () => Promise<void> }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = { platform_name: String(f.get("platform_name")), primary_color: String(f.get("primary_color")), welcome_message: String(f.get("welcome_message")), login_title: String(f.get("login_title")), login_subtitle: String(f.get("login_subtitle")), logo_url: String(f.get("logo_url")) || null, favicon_url: String(f.get("favicon_url")) || null, login_image_url: String(f.get("login_image_url")) || null, support_email: String(f.get("support_email")) || null, support_whatsapp: String(f.get("support_whatsapp")) || null, updated_at: new Date().toISOString() };
    try {
      const logo = f.get("logo_file"); const loginImage = f.get("login_image_file"); const favicon = f.get("favicon_file");
      if (logo instanceof File && logo.size) payload.logo_url = await uploadMedia(logo, "branding");
      if (loginImage instanceof File && loginImage.size) payload.login_image_url = await uploadMedia(loginImage, "branding");
      if (favicon instanceof File && favicon.size) payload.favicon_url = await uploadMedia(favicon, "branding");
    } catch (e) { setMessage(String(e)); setBusy(false); return; }
    const { error } = await supabase.from("platform_settings").update(payload).eq("id", 1);
    if (!error) await refreshSettings(); setMessage(error?.message || "Configurações atualizadas."); setBusy(false);
  };
  return <><Heading title="Configurações" subtitle="Personalize a identidade visual da plataforma." /><form onSubmit={submit} className="surface p-6 grid md:grid-cols-2 gap-4">{[
    ["platform_name", "Nome da plataforma"], ["primary_color", "Cor principal"], ["welcome_message", "Mensagem de boas-vindas"],
    ["login_title", "Título do login"], ["login_subtitle", "Subtítulo do login"], ["logo_url", "URL do logo"],
    ["favicon_url", "URL do favicon"], ["login_image_url", "Imagem do login"], ["support_email", "E-mail do suporte"],
    ["support_whatsapp", "WhatsApp do suporte"],
  ].map(([key, label]) => <label className="block text-sm" key={key}>{label}<input className="portal-input mt-2" name={key} type={key === "primary_color" ? "color" : "text"} defaultValue={key === "platform_name" ? displayPlatformName(settings?.platform_name) : String(settings?.[key as keyof Row<"platform_settings">] ?? (key === "primary_color" ? "#3B82F6" : ""))} required={["platform_name", "primary_color", "welcome_message", "login_title", "login_subtitle"].includes(key)} /></label>)}<label className="text-sm">Enviar logo<input type="file" accept="image/*" name="logo_file" className="portal-input mt-2" /></label><label className="text-sm">Enviar imagem do login<input type="file" accept="image/*" name="login_image_file" className="portal-input mt-2" /></label><label className="text-sm">Enviar favicon<input type="file" accept="image/*" name="favicon_file" className="portal-input mt-2" /></label><div className="md:col-span-2"><button className="portal-button" disabled={busy}><Save className="size-4" />Salvar configurações</button><Notice text={message} /></div></form></>;
}
