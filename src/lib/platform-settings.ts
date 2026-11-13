import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Public branding never needs permission to read private support settings. */
export async function loadPlatformSettings(signedIn: boolean): Promise<Tables<"platform_settings"> | null> {
  if (signedIn) {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) return data;
  }
  const { data } = await supabase.rpc("get_public_branding");
  return data
    ? ({ ...(data as object), support_email: null, support_whatsapp: null } as Tables<"platform_settings">)
    : null;
}