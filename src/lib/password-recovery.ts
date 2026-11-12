import { supabase } from "@/integrations/supabase/client";

export const INVALID_RECOVERY_LINK =
  "Este link é inválido, expirou ou já foi utilizado. Solicite um novo link para definir sua senha.";

/** Wait for the auth client to process the callback, then validate its identity. */
export async function validatePasswordRecovery(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if (query.has("error") || fragment.has("error") || fragment.has("error_description")) {
    return false;
  }
  const { data, error } = await supabase.auth.getUser();
  return !error && !!data.user;
}

export async function saveRecoveredPassword(password: string) {
  if (!(await validatePasswordRecovery(window.location.search, window.location.hash))) {
    throw new Error(INVALID_RECOVERY_LINK);
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.name === "AuthSessionMissingError") throw new Error(INVALID_RECOVERY_LINK);
    throw error;
  }
}