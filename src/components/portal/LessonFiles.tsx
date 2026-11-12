import { useEffect, useState } from "react";
import { Download, ExternalLink, LoaderCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { openMaterial } from "@/lib/media";
import { loadMaterialPreview, materialPreviewType } from "@/lib/material-preview";
import { safeHttps } from "@/lib/portal";

type PreviewState =
  | { key: string; kind: "text"; text: string }
  | { key: string; kind: "pdf" | "image" | "audio" | "video"; url: string };

/** One private attachment at a time, without changing the lesson's completion or notes. */
export function LessonFiles({ materials }: { materials: Tables<"lesson_materials">[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const selected =
    materials.find((item) => item.id === selectedId) ??
    materials.find((item) => materialPreviewType(item.file_path)) ??
    materials[0];
  const path = selected?.file_path ?? null;
  const key = `${selected?.id ?? ""}:${path ?? ""}`;
  const supported = !!materialPreviewType(path);
  const content = preview?.key === key ? preview : null;
  const error = failure?.key === key ? failure.message : "";

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setPreview(null);
    setFailure(null);
    setDownloadError("");
    if (!path || !materialPreviewType(path)) return;
    void loadMaterialPreview(path)
      .then((result) => {
        if (!alive) return;
        if (result.kind === "text") {
          setPreview({ key, kind: "text", text: result.text });
        } else {
          objectUrl = URL.createObjectURL(result.blob);
          setPreview({ key, kind: result.kind, url: objectUrl });
        }
      })
      .catch((reason: unknown) => {
        if (alive)
          setFailure({
            key,
            message:
              reason instanceof Error ? reason.message : "Não foi possível visualizar o arquivo.",
          });
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, key, attempt]);

  if (!selected) return null;
  const externalUrl = !path ? safeHttps(selected.url) : undefined;
  const mediaError = () =>
    setFailure({
      key,
      message: "O navegador não conseguiu exibir este arquivo. Tente novamente ou use o download.",
    });
  const download = async () => {
    if (!path || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await openMaterial(path);
    } catch (reason) {
      setDownloadError(
        reason instanceof Error ? reason.message : "Não foi possível baixar o arquivo.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="surface p-4 sm:p-6 space-y-4" aria-label="Arquivos da aula">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Arquivos da aula</h2>
        <div className="flex flex-wrap gap-2">
          {content && content.kind !== "text" && !error && (
            <a
              className="portal-outline"
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" /> Abrir em nova aba
            </a>
          )}
          {path && (
            <button
              type="button"
              className="portal-outline"
              disabled={downloading}
              onClick={() => void download()}
            >
              <Download className="size-4" /> {downloading ? "Preparando..." : "Baixar arquivo"}
            </button>
          )}
          {externalUrl && (
            <a
              className="portal-outline"
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" /> Abrir material
            </a>
          )}
        </div>
      </div>
      {materials.length > 1 ? (
        <label className="block text-sm">
          Escolha o arquivo
          <select
            className="portal-input mt-2"
            aria-label="Arquivo da aula"
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground break-words">{selected.title}</p>
      )}
      {downloadError && (
        <p role="alert" className="text-sm text-destructive">
          {downloadError}
        </p>
      )}
      {!supported ? (
        <p className="text-sm text-muted-foreground">
          {externalUrl
            ? "Este material é um link externo. Use Abrir material para acessá-lo."
            : path
              ? "Este formato não possui visualização integrada. Baixe o arquivo para abrir em um aplicativo compatível."
              : "Arquivo indisponível."}
        </p>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <button
            type="button"
            className="portal-outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : !content ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <LoaderCircle className="size-4 animate-spin" /> Carregando arquivo...
        </p>
      ) : content.kind === "pdf" ? (
        <object
          title={`Visualização de ${selected.title}`}
          data={content.url}
          type="application/pdf"
          className="w-full h-[70vh] min-h-96 rounded-lg bg-white"
          onError={mediaError}
        >
          <p className="p-4 text-sm text-black">
            Este navegador não exibe PDFs incorporados. Use Abrir em nova aba para visualizar o
            documento.
          </p>
        </object>
      ) : content.kind === "image" ? (
        <img
          src={content.url}
          alt={selected.title}
          className="mx-auto max-w-full max-h-[70vh] object-contain rounded-lg"
          onError={mediaError}
        />
      ) : content.kind === "text" ? (
        <pre
          className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm"
          aria-label={`Conteúdo de ${selected.title}`}
        >
          {content.text}
        </pre>
      ) : content.kind === "audio" ? (
        <audio
          aria-label={selected.title}
          controls
          preload="metadata"
          src={content.url}
          className="w-full"
          onError={mediaError}
        />
      ) : (
        <video
          aria-label={selected.title}
          controls
          preload="metadata"
          src={content.url}
          className="w-full max-h-[70vh] rounded-lg bg-black"
          onError={mediaError}
        />
      )}
    </section>
  );
}
