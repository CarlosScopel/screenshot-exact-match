import type { Tables } from "@/integrations/supabase/types";

/**
 * Reuse the existing protected profile columns to track admission requests.
 * Only administrators may change status/admin_notes (enforced by RLS and trigger).
 */
export const PENDING_APPROVAL = "A_ORDEM:AWAITING_APPROVAL";
export const APPLICATION_PENDING = "A_ORDEM:AWAITING_APPLICATION_APPROVAL";
export const REJECTED_APPROVAL = "A_ORDEM:ACCESS_REJECTED";

export function approvalState(
  profile: Pick<Tables<"profiles">, "status" | "admin_notes">,
): "pending" | "rejected" | "active" | "suspended" {
  if (profile.status === "active") return "active";
  if (profile.admin_notes === PENDING_APPROVAL || profile.admin_notes === APPLICATION_PENDING)
    return "pending";
  if (profile.admin_notes === REJECTED_APPROVAL) return "rejected";
  return "suspended";
}
