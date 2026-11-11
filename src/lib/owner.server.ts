import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// The owner is configured by the repository, never by signup metadata or form input.
export const OWNER_EMAIL = "dudu.escopelcarlos253@gmail.com";
const VERIFIED_OWNER_KEY = "a_ordem_verified_owner_email";
const EMAIL_PROOF_TTL_SECONDS = 15 * 60;

type OwnerIdentity = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  phone?: string;
  app_metadata?: Record<string, unknown>;
};
type VerifiedClaims = { sub?: string; email?: string; phone?: string; amr?: unknown };
type AdminClient = SupabaseClient<Database>;

export function isOwnerEmail(email: unknown): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === OWNER_EMAIL;
}

/** Claims must come from requireSupabaseAuth, which validates the JWT signature. */
export function canActivateOwner(
  user: OwnerIdentity,
  claims: VerifiedClaims,
  now = Date.now(),
): boolean {
  if (
    !isOwnerEmail(user.email) ||
    !user.email_confirmed_at ||
    claims.sub !== user.id ||
    !isOwnerEmail(claims.email)
  )
    return false;
  if (user.app_metadata?.[VERIFIED_OWNER_KEY] === OWNER_EMAIL) return true;
  if (!Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || typeof timestamp !== "number" || !Number.isFinite(timestamp))
      return false;
    const emailMethod = [
      "invite",
      "recovery",
      "magiclink",
      "email/signup",
      "email_change",
    ].includes(method);
    // A generic OTP may be an SMS. Do not treat phone authentication as email proof.
    const emailOtp = method === "otp" && !user.phone && !claims.phone;
    const age = now / 1000 - timestamp;
    return (emailMethod || emailOtp) && age >= -30 && age <= EMAIL_PROOF_TTL_SECONDS;
  });
}

/** Send a link, not a password or an already-authenticated administrator session. */
export async function sendOwnerAccess(admin: AdminClient, input: { name: string; email: string }) {
  if (!isOwnerEmail(input.email))
    throw new Error("Este e-mail não está autorizado para a administração.");
  const { error } = await admin.auth.admin.inviteUserByEmail(OWNER_EMAIL, {
    data: { full_name: input.name },
  });
  if (error) {
    // Existing accounts prove ownership again instead of having their password overwritten.
    if (!["email_exists", "user_already_exists"].includes(error.code ?? "")) {
      throw new Error(
        "Não foi possível enviar o acesso. Verifique a configuração de e-mail do servidor.",
      );
    }
    const { error: otpError } = await admin.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: { shouldCreateUser: false },
    });
    if (otpError)
      throw new Error("Não foi possível enviar o link de acesso. Tente novamente mais tarde.");
  }
  return { verificationRequired: true };
}

/** Grant the role only to the authenticated, verified owner; never to a submitted user ID. */
export async function activateVerifiedOwner(
  admin: AdminClient,
  userId: string,
  claims: VerifiedClaims,
) {
  if (!isOwnerEmail(claims.email)) return { activated: false };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user || data.user.id !== userId) {
    throw new Error("Não foi possível verificar a conta administrativa.");
  }
  const user = data.user;
  if (!isOwnerEmail(user.email)) return { activated: false };
  if (!canActivateOwner(user, claims)) {
    throw new Error("Confirme seu e-mail pelo link enviado em 'Ativar acesso de administrador'.");
  }
  if (user.app_metadata?.[VERIFIED_OWNER_KEY] !== OWNER_EMAIL) {
    const { error: markError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...user.app_metadata, [VERIFIED_OWNER_KEY]: OWNER_EMAIL },
    });
    if (markError) throw new Error("Não foi possível registrar a confirmação do administrador.");
  }
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ status: "active", access_expires_at: null })
    .eq("id", userId)
    .select("id")
    .single();
  if (profileError || !profile)
    throw new Error("Não foi possível ativar o perfil do administrador.");
  const { error: roleError } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleError) throw new Error("Não foi possível salvar a permissão administrativa.");
  return { activated: true };
}
