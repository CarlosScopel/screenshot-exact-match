import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Row<K extends keyof import("@/integrations/supabase/types").Database["public"]["Tables"]> = Tables<K>;

export type PortalData = {
  trainings: Row<"trainings">[];
  modules: Row<"modules">[];
  lessons: Row<"lessons">[];
  materials: Row<"lesson_materials">[];
  progress: Row<"lesson_progress">[];
  notes: Row<"lesson_notes">[];
  library: Row<"library_items">[];
  categories: Row<"library_categories">[];
  tools: Row<"tools">[];
  announcements: Row<"announcements">[];
  cohorts: Row<"cohorts">[];
  cohortMembers: Row<"cohort_members">[];
  trainingCohorts: Row<"training_cohorts">[];
  trainingGrants: Row<"training_grants">[];
  profiles: Row<"profiles">[];
};

export async function loadPortalData(userId: string, isAdmin: boolean): Promise<PortalData> {
  const results = await Promise.all([
    supabase.from("trainings").select("*").order("position"),
    supabase.from("modules").select("*").order("position"),
    supabase.from("lessons").select("*").order("position"),
    supabase.from("lesson_materials").select("*").order("position"),
    supabase.from("lesson_progress").select("*").eq("user_id", userId),
    supabase.from("lesson_notes").select("*").eq("user_id", userId),
    supabase.from("library_items").select("*").order("created_at", { ascending: false }),
    supabase.from("library_categories").select("*").order("position"),
    supabase.from("tools").select("*").order("position"),
    supabase.from("announcements").select("*").order("published_at", { ascending: false }),
    supabase.from("cohorts").select("*"),
    supabase.from("cohort_members").select("*"),
    isAdmin ? supabase.from("training_cohorts").select("*") : Promise.resolve({ data: [], error: null }),
    supabase.from("training_grants").select("*"),
    isAdmin ? supabase.from("profiles").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ] as const);
  const bad = results.find((item) => item.error);
  if (bad?.error) throw new Error(bad.error.message);
  return {
    trainings: results[0].data ?? [], modules: results[1].data ?? [],
    lessons: results[2].data ?? [], materials: results[3].data ?? [],
    progress: results[4].data ?? [], notes: results[5].data ?? [],
    library: results[6].data ?? [], categories: results[7].data ?? [],
    tools: results[8].data ?? [], announcements: results[9].data ?? [],
    cohorts: results[10].data ?? [], cohortMembers: results[11].data ?? [],
    trainingCohorts: results[12].data ?? [], trainingGrants: results[13].data ?? [],
    profiles: results[14].data ?? [],
  };
}

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

export function videoSource(url?: string | null): { kind: "video" | "iframe" | "external"; src: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (["youtu.be", "www.youtube.com", "youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      const id = host === "youtu.be" ? parsed.pathname.slice(1) :
        (parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean).pop());
      if (id && /^[\w-]{11}$/.test(id)) {
        return { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/" + id };
      }
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = parsed.pathname.match(/\d+/)?.[0];
      if (id) return { kind: "iframe", src: "https://player.vimeo.com/video/" + id };
    }
    if (/\.(mp4|webm|ogg)$/i.test(parsed.pathname)) return { kind: "video", src: url };
    return { kind: "external", src: url };
  } catch {
    return null;
  }
}

export function safeHttps(value?: string | null): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).protocol === "https:" ? value : undefined; }
  catch { return undefined; }
}

/** Treat the initial template value as the new brand until an admin customizes it. */
export function displayPlatformName(value?: string | null): string {
  const name = value?.trim();
  return !name || name === "Portal da Mentoria" ? "A ORDEM" : name;
}

export const emptyData: PortalData = {
  trainings: [], modules: [], lessons: [], materials: [], progress: [],
  notes: [], library: [], categories: [], tools: [], announcements: [],
  cohorts: [], cohortMembers: [], trainingCohorts: [], trainingGrants: [], profiles: [],
};
