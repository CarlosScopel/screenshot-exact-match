import fs from 'node:fs';
import { createHash } from 'node:crypto';
const path = 'src/components/portal/AdminPage.tsx';
let source = fs.readFileSync(path, 'utf8');
const bytes = Buffer.from(source);
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if (sha !== '41e81d6badc8bedd7f46b719980850d3619c8b18') throw new Error('Inspected file changed; refusing to apply patch.');
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error('Missing or ambiguous anchor: ' + before.slice(0, 100));
  source = source.replace(before, after);
}
replaceOnce(`          <LessonMaterials
            lessonIds=`, `          <LessonMaterials
            key={module}
            moduleId={module}
            lessonIds=`);
const start = source.indexOf('function LessonMaterials({');
const end = source.indexOf('function LibraryUpload(', start);
if (start < 0 || end < 0) throw new Error('Materials component boundaries not found.');
source = source.slice(0, start) + `function LessonMaterials({
  moduleId,
  lessonIds,
  data,
  reload,
}: {
  moduleId: string;
  lessonIds: { id: string; title: string }[];
  data: PortalData;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  // A single lesson needs no extra selection. Never keep an ID from a removed lesson.
  const lessonId = lessonIds.some((lesson) => lesson.id === selectedLessonId)
    ? selectedLessonId
    : lessonIds.length === 1
      ? lessonIds[0]!.id
      : "";
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(formElement);
      const id = String(form.get("lesson") || "");
      if (!id || !lessonIds.some((lesson) => lesson.id === id))
        throw new Error("Selecione uma aula deste módulo antes de enviar o material.");
      const file = form.get("file");
      const title = String(form.get("title") || "").trim();
      if (!(file instanceof File) || !file.size) throw new Error("Selecione um arquivo.");
      const path = await uploadMaterial(file, "lesson", id);
      const { error } = await supabase
        .from("lesson_materials")
        .insert({ lesson_id: id, title: title || file.name, file_path: path });
      if (error) throw error;
      await reload();
      formElement.reset();
      setSelectedLessonId(id);
      setMessage("Material adicionado.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="surface p-6 mt-6">
      <h3 className="font-semibold mb-4">Materiais complementares das aulas</h3>
      {!lessonIds.length && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Este módulo ainda não tem aulas. Crie a primeira aula aqui para anexar o material.
            Você pode deixá-la como rascunho e adicionar o vídeo depois.
          </p>
          {!creatingLesson && (
            <button
              type="button"
              className="portal-outline"
              onClick={() => setCreatingLesson(true)}
            >
              <Plus className="size-4" />
              Criar aula neste módulo
            </button>
          )}
        </div>
      )}
      {creatingLesson && (
        <EditPanel
          table="lessons"
          title="Criar aula para anexar material"
          fields={lessonFields}
          extra={{ module_id: moduleId }}
          afterSave={async (id) => {
            await reload();
            setSelectedLessonId(id);
          }}
          onClose={() => setCreatingLesson(false)}
        />
      )}
      <form className="grid md:grid-cols-4 gap-3" onSubmit={add}>
        <select
          name="lesson"
          aria-label="Aula do material"
          className="portal-input"
          required
          disabled={busy || !lessonIds.length}
          value={lessonId}
          onChange={(event) => setSelectedLessonId(event.target.value)}
        >
          <option value="" disabled>
            {lessonIds.length ? "Selecione a aula" : "Crie uma aula para continuar"}
          </option>
          {lessonIds.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <input
          name="title"
          placeholder="Título do material"
          className="portal-input"
          disabled={busy || !lessonIds.length}
        />
        <input
          name="file"
          aria-label="Arquivo"
          type="file"
          required
          className="portal-input"
          disabled={busy || !lessonIds.length}
        />
        <button className="portal-button" disabled={busy || !lessonId}>
          <Upload className="size-4" />
          {busy ? "Enviando..." : "Enviar arquivo"}
        </button>
      </form>
      <Notice text={message} />
      {data.materials
        .filter((m) => lessonIds.some((l) => l.id === m.lesson_id))
        .map((m) => (
          <div className="flex justify-between items-center border-t py-3 text-sm" key={m.id}>
            <span>{m.title}</span>
            <button
              className="text-destructive"
              onClick={() => {
                if (window.confirm("Excluir referência a este material?"))
                  void supabase
                    .from("lesson_materials")
                    .delete()
                    .eq("id", m.id)
                    .then(() => reload());
              }}
            >
              Excluir
            </button>
          </div>
        ))}
    </div>
  );
}
` + source.slice(end);
fs.writeFileSync(path, source);
console.log('Changed only LessonMaterials and its module-scoped props.');
