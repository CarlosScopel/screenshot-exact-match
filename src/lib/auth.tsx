import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Settings = Tables<"platform_settings">;

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  isAdmin: boolean;
  loading: boolean;
  settings: Settings | null;
  refresh: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  requiresPasswordSetup: boolean;
  clearPasswordSetup: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function hexToApply(hex?: string | null) {
  if (typeof document === "undefined") return;
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) document.documentElement.style.setProperty("--primary", hex);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);

  const loadUser = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", s.user.id),
    ]);
    setProfile(p.data ?? null);
    setRoles((r.data ?? []).map((x) => x.role));
  }, []);

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase.from("platform_settings").select("*").eq("id", 1).maybeSingle();
    setSettings(data ?? null);
    hexToApply(data?.primary_color);
  }, []);

  useEffect(() => {
    const linkType = new URLSearchParams(window.location.hash.slice(1)).get("type") || new URLSearchParams(window.location.search).get("type");
    if (linkType === "invite" || linkType === "recovery") setRequiresPasswordSetup(true);
    refreshSettings();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRequiresPasswordSetup(true);
      if (event === "SIGNED_OUT") setRequiresPasswordSetup(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "SIGNED_OUT") {
        setTimeout(() => loadUser(s), 0);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadUser(data.session);
      setLoading(false);
      if (data.session) supabase.rpc("touch_last_seen");
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser, refreshSettings]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const theme = localStorage.getItem("theme");
    document.documentElement.classList.toggle("light", theme === "light");
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        roles,
        isAdmin: roles.includes("admin"),
        loading,
        settings,
        refresh: () => loadUser(session),
        refreshSettings,
        requiresPasswordSetup,
        clearPasswordSetup: () => setRequiresPasswordSetup(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

export function isMemberBlocked(p: Profile | null) {
  if (!p) return false;
  if (p.status === "suspended") return true;
  return !!p.access_expires_at && new Date(p.access_expires_at) <= new Date();
}

export function firstName(name?: string | null) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
