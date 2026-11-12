import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const RECORDING_BUCKET = "mentorship-recordings";
export const RECORDING_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const recordingSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  recorded_on: z.string(),
  file_path: z.string(),
  file_name: z.string(),
  mime_type: z.enum(["video/mp4", "video/webm"]),
  size_bytes: z.number().int().positive(),
  status: z.enum(["uploading", "published"]),
  created_at: z.string(),
});
export type CallRecording = z.infer<typeof recordingSchema>;
export const learningSchema = z.object({
  content: z.string(),
  revision: z.number().int().nonnegative(),
  position_seconds: z.number().int().nonnegative(),
});
export type RecordingLearning = z.infer<typeof learningSchema>;
type RpcResult = { data: unknown; error: { message: string } | null };
async function invoke(name: string, args: Record<string, unknown>) {
  // Do not edit Supabase's generated schema; validate new RPC contracts here.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function listRecordings(userId: string) {
  return recordingSchema.array().parse(await invoke("recordings_list", { p_user_id: userId }));
}
export async function validateRecordingFile(file: File): Promise<"video/mp4" | "video/webm"> {
  if (!file.size || file.size > RECORDING_MAX_BYTES)
    throw new Error("Escolha uma gravação MP4 ou WebM de até 2 GB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (
    ext === "mp4" &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return "video/mp4";
  if (
    ext === "webm" &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  throw new Error("O arquivo não é um MP4 ou WebM válido. Exporte a call como MP4 (H.264/AAC).");
}
export async function createRecording(
  userId: string,
  title: string,
  description: string,
  recordedOn: string,
  file: File,
) {
  const mime = await validateRecordingFile(file);
  if (!title.trim() || title.trim().length > 160)
    throw new Error("Informe um título com até 160 caracteres.");
  return recordingSchema.parse(
    await invoke("recordings_create", {
      p_user_id: userId,
      p_title: title.trim(),
      p_description: description,
      p_recorded_on: recordedOn,
      p_file_name: file.name.slice(0, 180),
      p_size_bytes: file.size,
      p_mime_type: mime,
    }),
  );
}
export async function publishRecording(id: string) {
  return recordingSchema.parse(await invoke("recordings_publish", { p_id: id }));
}
export async function recordingPlayback(recording: CallRecording) {
  // Short-lived URL; Storage checks the account, recording ownership and current plan.
  const { data, error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(recording.file_path, 300);
  if (error || !data?.signedUrl)
    throw new Error("Não foi possível abrir a gravação. Verifique seu acesso e tente novamente.");
  return data.signedUrl;
}
export async function getRecordingLearning(id: string) {
  return learningSchema.parse(await invoke("recordings_learning", { p_id: id }));
}
export async function saveRecordingNote(id: string, content: string, revision: number) {
  return learningSchema.parse(
    await invoke("recordings_save_note", { p_id: id, p_content: content, p_revision: revision }),
  );
}
export async function saveRecordingPosition(id: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  await invoke("recordings_save_position", {
    p_id: id,
    p_seconds: Math.min(604800, Math.floor(seconds)),
  });
}
export function recordingDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
