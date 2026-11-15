import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const BILLING_OBSERVATION_LIMIT = 5000;
const userIdSchema = z.string().uuid();
const observationSchema = z.object({
  user_id: userIdSchema,
  content: z.string().max(BILLING_OBSERVATION_LIMIT),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
});
export type BillingObservationValue = z.infer<typeof observationSchema>;
type RpcResult = { data: unknown; error: { message: string } | null };

async function invoke(name: string, args: Record<string, unknown>, userId: string) {
  // Preserve the generated schema; validate this additive RPC contract at the boundary.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  const value = observationSchema.parse(data);
  if (value.user_id !== userId) throw new Error("A observação não pertence a este mentorado.");
  return value;
}

export function getBillingObservation(userId: string) {
  userIdSchema.parse(userId);
  return invoke("mentorship_get_observation", { p_user_id: userId }, userId);
}

export function saveBillingObservation(userId: string, content: string, revision: number) {
  userIdSchema.parse(userId);
  z.string().max(BILLING_OBSERVATION_LIMIT).parse(content);
  z.number().int().nonnegative().parse(revision);
  return invoke(
    "mentorship_save_observation",
    { p_user_id: userId, p_content: content.trim(), p_expected_revision: revision },
    userId,
  );
}
