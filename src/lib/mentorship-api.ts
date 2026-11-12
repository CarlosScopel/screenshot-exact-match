import { supabase } from "@/integrations/supabase/client";
import { accountSchema, type PlanInput, type MentorshipReceipt } from "./mentorship";

type RpcResult = { data: unknown; error: { message: string } | null };
// The generated schema stays untouched. New RPC results are validated at this boundary.
const callRpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
async function invoke(name: string, args: Record<string, unknown>) {
  const result = await callRpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function getMentorshipAccount(userId: string) {
  return accountSchema.parse(await invoke("mentorship_account", { p_user_id: userId }));
}
export async function saveMentorshipPlan(input: PlanInput) {
  return invoke("mentorship_save_plan", {
    p_id: input.id, p_user_id: input.userId, p_start_date: input.startDate,
    p_duration_count: input.durationCount, p_duration_unit: input.durationUnit,
    p_total_cents: input.totalCents, p_installment_count: input.installmentCount,
    p_first_due_date: input.firstDueDate, p_expected_revision: input.expectedRevision,
  });
}
export async function confirmInstallment(id: string, paidOn: string, note: string) {
  return invoke("mentorship_confirm_payment", { p_installment_id: id, p_paid_on: paidOn, p_note: note });
}
export async function reviewPaymentReceipt(id: string, decision: "approved" | "rejected", note: string) {
  return invoke("mentorship_review_receipt", { p_receipt_id: id, p_decision: decision, p_note: note });
}
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export async function validateReceiptFile(file: File): Promise<{ extension: string; mime: string }> {
  if (!file.size || file.size > RECEIPT_MAX_BYTES) throw new Error("Envie um PDF, PNG ou JPG com até 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return { extension: "pdf", mime: "application/pdf" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { extension: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: "jpg", mime: "image/jpeg" };
  throw new Error("O arquivo não é um PDF, PNG ou JPG válido.");
}
export async function uploadPaymentReceipt(userId: string, installmentId: string, file: File, paidOn: string) {
  const format = await validateReceiptFile(file);
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) throw new Error("Sua sessão expirou. Entre novamente.");
  const path = `${userId}/${installmentId}/${crypto.randomUUID()}.${format.extension}`;
  const bucket = supabase.storage.from("payment-receipts");
  const upload = await bucket.upload(path, file, { contentType: format.mime, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  try {
    await invoke("mentorship_register_receipt", { p_installment_id: installmentId, p_path: path, p_file_name: file.name.slice(0, 180), p_paid_on: paidOn });
  } catch (error) {
    // RLS allows removing only this user's unregistered upload, never reviewed evidence.
    await bucket.remove([path]).catch(() => undefined);
    throw error;
  }
}
export async function openPaymentReceipt(receipt: MentorshipReceipt) {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  try {
    const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(receipt.file_path, 60);
    if (error || !data?.signedUrl) throw new Error("Não foi possível abrir o comprovante.");
    if (popup && !popup.closed) popup.location.replace(data.signedUrl);
    else throw new Error("O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.");
  } catch (error) {
    popup?.close();
    throw error;
  }
}
