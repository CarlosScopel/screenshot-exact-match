import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertContentAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Somente administradores podem alterar conteúdos.");
}

const recordingTarget = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).strict();
const recordedOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Data da call inválida.");

/** Only metadata changes: recipient, stored file, upload state and private notes stay intact. */
export const editExclusiveRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    recordingTarget
      .extend({
        title: z.string().trim().min(1).max(160),
        description: z.string().max(8000),
        recordedOn,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertContentAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // This table is installed by the private-recordings setup, not in the generated schema.
    const database = supabaseAdmin as SupabaseClient;
    const { data: updated, error } = await database
      .from("mentorship_recordings")
      .update({ title: data.title, description: data.description, recorded_on: data.recordedOn })
      .eq("id", data.id)
      .eq("user_id", data.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível salvar a gravação. Tente novamente.");
    if (!updated) throw new Error("Gravação não encontrada para este mentorado. Atualize a lista.");
    return { id: data.id };
  });

/** Storage must be removed through the Storage API, never by deleting storage metadata. */
export const deleteExclusiveRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordingTarget.parse(input))
  .handler(async ({ data, context }) => {
    await assertContentAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const database = supabaseAdmin as SupabaseClient;
    const { data: row, error: readError } = await database
      .from("mentorship_recordings")
      .select("id,user_id,file_path,mime_type")
      .eq("id", data.id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (readError) throw new Error("Não foi possível consultar a gravação para exclusão.");
    if (!row) throw new Error("Gravação não encontrada para este mentorado. Atualize a lista.");
    const extension =
      row.mime_type === "video/mp4" ? "mp4" : row.mime_type === "video/webm" ? "webm" : null;
    const expectedPath = `${data.userId}/${data.id}/recording.${extension}`;
    if (!extension || row.file_path !== expectedPath)
      throw new Error("O arquivo não corresponde à gravação selecionada. Exclusão cancelada.");
    const { error: storageError } = await supabaseAdmin.storage
      .from("mentorship-recordings")
      .remove([expectedPath]);
    if (storageError)
      throw new Error("Não foi possível remover o vídeo. A gravação foi mantida; tente novamente.");
    const { data: removed, error: deleteError } = await database
      .from("mentorship_recordings")
      .delete()
      .eq("id", data.id)
      .eq("user_id", data.userId)
      .eq("file_path", expectedPath)
      .select("id")
      .maybeSingle();
    if (deleteError || !removed)
      throw new Error(
        "O vídeo foi removido, mas a exclusão do cadastro não foi concluída. Atualize a lista e tente excluir novamente.",
      );
    // Existing FK removes only this recording's learning notes and progress.
    return { id: data.id };
  });

const materialTarget = z.object({ id: z.string().uuid(), lessonId: z.string().uuid() }).strict();
export const editLessonMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    materialTarget
      .extend({
        title: z.string().trim().min(1).max(200),
        position: z.number().int().min(0).max(100000),
        url: z
          .string()
          .url()
          .refine((value) => new URL(value).protocol === "https:")
          .nullable(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertContentAdmin(context);
    const { data: row, error: readError } = await context.supabase
      .from("lesson_materials")
      .select("id,file_path")
      .eq("id", data.id)
      .eq("lesson_id", data.lessonId)
      .maybeSingle();
    if (readError || !row) throw new Error("Material não encontrado nesta aula.");
    if (!row.file_path && !data.url) throw new Error("Informe o link HTTPS do material.");
    const { data: updated, error } = await context.supabase
      .from("lesson_materials")
      .update({
        title: data.title,
        position: data.position,
        ...(row.file_path ? {} : { url: data.url }),
      })
      .eq("id", data.id)
      .eq("lesson_id", data.lessonId)
      .select("id")
      .maybeSingle();
    if (error || !updated) throw new Error("Não foi possível salvar o material. Tente novamente.");
    return { id: data.id };
  });

export const deleteLessonMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => materialTarget.parse(input))
  .handler(async ({ data, context }) => {
    await assertContentAdmin(context);
    const { data: row, error: readError } = await context.supabase
      .from("lesson_materials")
      .select("id,file_path")
      .eq("id", data.id)
      .eq("lesson_id", data.lessonId)
      .maybeSingle();
    if (readError || !row) throw new Error("Material não encontrado nesta aula.");
    if (row.file_path) {
      if (!row.file_path.startsWith(`lesson/${data.lessonId}/`) || row.file_path.includes(".."))
        throw new Error("O arquivo não corresponde à aula selecionada. Exclusão cancelada.");
      // A repeated attachment must not lose its underlying file while still in use.
      const { data: references, error: referenceError } = await context.supabase
        .from("lesson_materials")
        .select("id")
        .eq("file_path", row.file_path)
        .neq("id", data.id)
        .limit(1);
      if (referenceError) throw new Error("Não foi possível verificar os vínculos do arquivo.");
      if (!references?.length) {
        const { error: storageError } = await context.supabase.storage
          .from("materials")
          .remove([row.file_path]);
        if (storageError)
          throw new Error("Não foi possível remover o arquivo. O material foi mantido.");
      }
    }
    const { data: removed, error } = await context.supabase
      .from("lesson_materials")
      .delete()
      .eq("id", data.id)
      .eq("lesson_id", data.lessonId)
      .select("id")
      .maybeSingle();
    if (error || !removed)
      throw new Error(
        "Não foi possível concluir a exclusão do material. Atualize a lista e tente novamente.",
      );
    return { id: data.id };
  });
