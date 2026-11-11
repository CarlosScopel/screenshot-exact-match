import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Media values are either full https URLs or "media:<path>" references to the private media bucket. */
const cache = new Map<string, { url: string; exp: number }>();

export async function resolveMedia(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith("media:")) return value;
  const path = value.slice(6);
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 6);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 1000 * 60 * 60 * 5 });
  return data.signedUrl;
}

export function useMedia(value?: string | null) {
  const [url, setUrl] = useState<string | null>(value && !value.startsWith("media:") ? value : null);
  useEffect(() => {
    let alive = true;
    resolveMedia(value).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [value]);
  return url;
}

function safeName(name: string) {
  return name.normalize("NFD").replace(/[^\w.-]+/g, "-").toLowerCase();
}

export async function uploadMedia(file: File, folder: string) {
  const path = `${folder}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
  if (error) throw error;
  return `media:${path}`;
}

/** Private materials: path must start with lesson/<id>/ or library/<id>/ (enforced by storage policies). */
export async function uploadMaterial(file: File, scope: "lesson" | "library", id: string) {
  const path = `${scope}/${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from("materials").upload(path, file);
  if (error) throw error;
  return path;
}

export async function openMaterial(path: string) {
  const { data, error } = await supabase.storage.from("materials").createSignedUrl(path, 120, { download: true });
  if (error || !data) throw error ?? new Error("Arquivo indisponível");
  window.open(data.signedUrl, "_blank", "noopener");
}
