import { supabase } from "@/integrations/supabase/client";

export type MaterialPreviewType = {
  kind: "pdf" | "image" | "text" | "audio" | "video";
  mime: string;
};

const formats: Record<string, MaterialPreviewType> = {
  pdf: { kind: "pdf", mime: "application/pdf" },
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  gif: { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
  avif: { kind: "image", mime: "image/avif" },
  txt: { kind: "text", mime: "text/plain" },
  md: { kind: "text", mime: "text/plain" },
  csv: { kind: "text", mime: "text/plain" },
  json: { kind: "text", mime: "text/plain" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  wav: { kind: "audio", mime: "audio/wav" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  mp4: { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
};

/** Classify storage paths only; never embed HTML, SVG, Office viewers or arbitrary URLs. */
export function materialPreviewType(path?: string | null): MaterialPreviewType | null {
  if (!path || !path.startsWith("lesson/")) return null;
  const extension = path.split("/").pop()?.split(".").pop()?.toLowerCase();
  return extension && Object.hasOwn(formats, extension) ? formats[extension]! : null;
}

export type MaterialPreview =
  { kind: "text"; text: string } | { kind: "pdf" | "image" | "audio" | "video"; blob: Blob };

/** Fetch privately using the current user's session and existing storage access policies. */
export async function loadMaterialPreview(path: string): Promise<MaterialPreview> {
  const format = materialPreviewType(path);
  if (!format) throw new Error("Este formato não possui visualização integrada.");
  const { data, error } = await supabase.storage.from("materials").download(path);
  if (error || !data)
    throw new Error("Não foi possível abrir o arquivo. Verifique seu acesso e tente novamente.");
  const limit = format.kind === "text" ? 2 * 1024 * 1024 : 50 * 1024 * 1024;
  if (data.size > limit)
    throw new Error("Este arquivo é muito grande para a visualização. Use o botão de download.");
  if (format.kind === "text") return { kind: "text", text: await data.text() };
  if (format.kind === "pdf" && !(await data.slice(0, 1024).text()).includes("%PDF-")) {
    throw new Error("O arquivo não é um PDF válido. Confira o arquivo enviado.");
  }
  // Use a local object URL with a known MIME type, so storage attachment headers do not
  // force a download. No private URL or file is shared with an external document viewer.
  return { kind: format.kind, blob: new Blob([data], { type: format.mime }) };
}
