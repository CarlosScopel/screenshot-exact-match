import { useState, type FormEvent } from "react";
import { Pencil, Save, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { deleteLessonMaterial, editLessonMaterial } from "@/lib/content-admin.functions";

export function LessonMaterialActions({
  material,
  reload,
  disabled = false,
}: {
  material: Tables<"lesson_materials">;
  reload: () => Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState(material.title);
  const [position, setPosition] = useState(material.position);
  const [url, setUrl] = useState(material.url || "");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setMessage("");
    try {
      await editLessonMaterial({
        data: {
          id: material.id,
          lessonId: material.lesson_id,
          title: title.trim(),
          position,
          url: material.file_path ? null : url.trim() || null,
        },
      });
      setEditing(false);
      setMessage("Material atualizado.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o material.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy || disabled) return;
    if (
      !window.confirm(
        `Excluir o material “${material.title}”? Ele será removido desta aula para todos os alunos com acesso. Esta ação não poderá ser desfeita.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await deleteLessonMaterial({ data: { id: material.id, lessonId: material.lesson_id } });
      setEditing(false);
      setMessage("Material excluído.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o material.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={`Material: ${material.title}`} className="border-t py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 break-words font-medium">{material.title}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="portal-outline"
            disabled={busy || disabled}
            onClick={() => {
              setTitle(material.title);
              setPosition(material.position);
              setUrl(material.url || "");
              setMessage("");
              setEditing(true);
            }}
          >
            <Pencil className="size-4" /> Editar
          </button>
          <button
            type="button"
            className="portal-outline text-destructive"
            disabled={busy || disabled || editing}
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" /> Excluir
          </button>
        </div>
      </div>
      {editing && (
        <form
          aria-label="Editar material"
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={save}
        >
          <label>
            Título do material
            <input
              className="portal-input mt-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </label>
          <label>
            Ordem do material
            <input
              type="number"
              className="portal-input mt-2"
              value={position}
              min={0}
              max={100000}
              step={1}
              onChange={(e) => setPosition(Number(e.target.value))}
              required
              disabled={busy}
            />
          </label>
          {!material.file_path && (
            <label className="sm:col-span-2">
              Link do material
              <input
                type="url"
                className="portal-input mt-2"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                required
                disabled={busy}
              />
            </label>
          )}
          {material.file_path && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              O arquivo permanece o mesmo. Para substituí-lo, envie o novo material e depois exclua
              o antigo.
            </p>
          )}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="submit" className="portal-button" disabled={busy}>
              <Save className="size-4" />
              {busy ? "Salvando..." : "Salvar material"}
            </button>
            <button
              type="button"
              className="portal-outline"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancelar edição
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
