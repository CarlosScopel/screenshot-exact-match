import { supabase } from "@/integrations/supabase/client";
import { RECORDING_BUCKET, validateRecordingFile, type CallRecording } from "./recordings";

export const RECORDING_CHUNK_BYTES = 6 * 1024 * 1024;
type UploadOptions = { signal: AbortSignal; onProgress: (done: number, total: number) => void };
type Resume = { url: string; name: string; size: number; modified: number };
const key = (path: string) => `ordem:call-upload:${path}`;
function stored(path: string): Resume | null {
  try {
    return JSON.parse(sessionStorage.getItem(key(path)) || "null") as Resume | null;
  } catch {
    return null;
  }
}
function remember(path: string, data: Resume) {
  try {
    sessionStorage.setItem(key(path), JSON.stringify(data));
  } catch {
    /* Upload still works without session storage. */
  }
}
export function clearRecordingUpload(path: string) {
  try {
    sessionStorage.removeItem(key(path));
  } catch {
    /* No persistent upload state. */
  }
}
/**
 * A trusted POST response may advertise the storage service's internal host/path.
 * Use only its TUS resource identifier, never its origin, as an authenticated target.
 * Cached URLs remain strictly same-origin and are not granted this normalization.
 */
export function safeUploadLocation(value: string, endpoint: string, serverResponse = false) {
  const invalid = () => new Error("O servidor retornou um endereço de upload inválido.");
  try {
    const base = new URL(endpoint);
    const root = base.pathname.replace(/\/+$/, "");
    const input = value.trim();
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !root.endsWith("/storage/v1/upload/resumable") ||
      !input ||
      Array.from(input).some(
        (character) => character.charCodeAt(0) <= 32 || [92, 127].includes(character.charCodeAt(0)),
      )
    )
      throw invalid();
    // Bare resource IDs are relative to the collection; other references follow URL rules.
    const bareId = /^[A-Za-z0-9_~.%+=-]+$/.test(input) && input !== "." && input !== "..";
    const url = new URL(input, base.origin + root + (bareId ? "/" : ""));
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (!serverResponse && url.origin !== base.origin)
    )
      throw invalid();
    const prefixes = serverResponse
      ? [root + "/", "/storage/v1/upload/resumable/", "/upload/resumable/"]
      : [root + "/"];
    const prefix = prefixes.find((candidate) => url.pathname.startsWith(candidate));
    if (!prefix) throw invalid();
    const resource = url.pathname.slice(prefix.length);
    // Supabase resource IDs may contain base64 characters, including encoded /, + and =.
    if (!resource || !/^(?:[A-Za-z0-9_~.+=/-]|%2[bBfF]|%3[dD])+$/.test(resource)) throw invalid();
    const parts = decodeURIComponent(resource).split("/");
    if (parts.some((part) => part === "." || part === "..")) throw invalid();
    const target = new URL(base.origin + root + "/" + resource);
    if (target.origin !== base.origin || !target.pathname.startsWith(root + "/")) throw invalid();
    return target.href;
  } catch {
    throw invalid();
  }
}
function errorFor(status: number) {
  if (status === 413)
    return new Error(
      "O armazenamento recusou o tamanho do vídeo. O limite global do provedor pode ser menor que 2 GB; reduza o arquivo ou ajuste esse limite no backend.",
    );
  if (status === 401 || status === 403)
    return new Error(
      "Sua sessão ou permissão de upload expirou. Entre novamente como administrador.",
    );
  return new Error(
    `Não foi possível enviar a gravação (HTTP ${status}). O envio pode ser retomado.`,
  );
}
async function pause(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Envio pausado", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Envio pausado", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** Minimal TUS 1.0 client: sequential 6 MB chunks, authoritative offsets and retry without overwrite. */
export async function tusRecordingUpload(
  file: File,
  path: string,
  mime: string,
  endpoint: string,
  headers: () => Promise<Record<string, string>>,
  options: UploadOptions,
) {
  const { signal, onProgress } = options;
  signal.throwIfAborted();
  const resume = stored(path);
  let url =
    resume &&
    resume.name === file.name &&
    resume.size === file.size &&
    resume.modified === file.lastModified
      ? safeUploadLocation(resume.url, endpoint)
      : "";
  const request = async (target: string, init: RequestInit) => {
    signal.throwIfAborted();
    return fetch(target, {
      ...init,
      signal,
      redirect: "error",
      headers: { ...(await headers()), "Tus-Resumable": "1.0.0", ...init.headers },
    });
  };
  const getOffset = async () => {
    const response = await request(url, { method: "HEAD" });
    if (!response.ok) throw errorFor(response.status);
    const raw = response.headers.get("Upload-Offset");
    const value = raw === null ? NaN : Number(raw);
    if (!Number.isSafeInteger(value) || value < 0 || value > file.size)
      throw new Error("O servidor retornou uma posição de upload inválida.");
    return value;
  };
  let offset = 0;
  if (url) {
    const response = await request(url, { method: "HEAD" });
    if (response.status === 404 || response.status === 410) {
      clearRecordingUpload(path);
      url = "";
    } else if (!response.ok) throw errorFor(response.status);
    else {
      const raw = response.headers.get("Upload-Offset");
      offset = raw === null ? NaN : Number(raw);
    }
  }
  if (!url) {
    const metadata = Object.entries({
      bucketName: RECORDING_BUCKET,
      objectName: path,
      contentType: mime,
      cacheControl: "0",
    })
      .map(([k, v]) => `${k} ${btoa(v)}`)
      .join(",");
    const response = await request(endpoint, {
      method: "POST",
      headers: { "Upload-Length": String(file.size), "Upload-Metadata": metadata },
    });
    if (response.status !== 201) throw errorFor(response.status);
    const location = response.headers.get("Location");
    if (!location) throw new Error("O servidor não forneceu o endereço para continuar o upload.");
    url = safeUploadLocation(location, endpoint, true);
    remember(path, { url, name: file.name, size: file.size, modified: file.lastModified });
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size)
    throw new Error("Posição de upload inválida.");
  onProgress(offset, file.size);
  let failures = 0;
  while (offset < file.size) {
    signal.throwIfAborted();
    const end = Math.min(offset + RECORDING_CHUNK_BYTES, file.size);
    try {
      const response = await request(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        },
        body: file.slice(offset, end),
      });
      if ([401, 403, 404, 410, 413, 415].includes(response.status))
        throw Object.assign(errorFor(response.status), { terminal: true });
      if (response.status !== 204) throw errorFor(response.status);
      const raw = response.headers.get("Upload-Offset"),
        next = raw === null ? NaN : Number(raw);
      if (next !== end) throw new Error("O upload precisa sincronizar a posição com o servidor.");
      offset = next;
      failures = 0;
      onProgress(offset, file.size);
    } catch (error) {
      if (signal.aborted || (error instanceof Error && "terminal" in error) || ++failures > 3)
        throw error;
      await pause(1000 * 2 ** (failures - 1), signal);
      offset = await getOffset();
      onProgress(offset, file.size);
    }
  }
}
export async function uploadRecordingFile(
  recording: CallRecording,
  file: File,
  options: UploadOptions,
) {
  const mime = await validateRecordingFile(file);
  if (
    file.size !== recording.size_bytes ||
    file.name.slice(0, 180) !== recording.file_name ||
    mime !== recording.mime_type
  )
    throw new Error("Para retomar, selecione o mesmo arquivo usado no início do envio.");
  const base = String(import.meta.env["VITE_SUPABASE_URL"] || "").replace(/\/+$/, "");
  if (!base) throw new Error("Armazenamento não configurado.");
  await tusRecordingUpload(
    file,
    recording.file_path,
    mime,
    `${base}/storage/v1/upload/resumable`,
    async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session)
        throw new Error("Entre novamente como administrador para enviar a gravação.");
      return {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: String(import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || ""),
      };
    },
    options,
  );
}
