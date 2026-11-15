import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { activateOwnerAccess } from "@/lib/owner.functions";
import { loadPlatformSettings } from "@/lib/platform-settings";
import { setRecordingUploadOwner } from "@/lib/recording-transfers";

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
  if (hex && /^#[0-9a-f]{6}$/i.test(hex))
    document.documentElement.style.setProperty("--primary", hex);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);
  const [accessError, setAccessError] = useState("");
  const loadVersion = useRef(0);
  const settingsVersion = useRef(0);
  const signedIn = useRef(false);
  const sessionUserId = useRef<string | null>(null);

  const loadUser = useCallback(async (s: Session | null) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setAccessError("");
    if (!s) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }
    try {
      // The server verifies the authenticated email before granting the owner role.
      await activateOwnerAccess();
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", s.user.id),
      ]);
      if (version !== loadVersion.current) return;
      if (p.error || r.error) throw new Error("Não foi possível carregar suas permissões.");
      setProfile(p.data ?? null);
      setRoles((r.data ?? []).map((x) => x.role));
    } catch (error) {
      if (version !== loadVersion.current) return;
      setProfile(null);
      setRoles([]);
      setAccessError(
        error instanceof Error ? error.message : "Não foi possível verificar o acesso.",
      );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const version = ++settingsVersion.current;
    const data = await loadPlatformSettings(signedIn.current);
    if (version !== settingsVersion.current) return;
    setSettings(data ?? null);
    hexToApply(data?.primary_color);
  }, []);

  useEffect(() => {
    let alive = true;
    let authEvents = 0;
    const linkType =
      new URLSearchParams(window.location.hash.slice(1)).get("type") ||
      new URLSearchParams(window.location.search).get("type");
    if (linkType === "invite" || linkType === "recovery") setRequiresPasswordSetup(true);
    refreshSettings();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      authEvents++;
      const nextUserId = s?.user.id ?? null;
      const sameUser = sessionUserId.current === nextUserId;
      sessionUserId.current = nextUserId;
      setRecordingUploadOwner(nextUserId);
      signedIn.current = !!s;
      setSession(s);
      // Supabase emits SIGNED_IN when a tab regains focus. Do not tear down an
      // unchanged user's forms/uploads or reload permissions on token refresh.
      if (sameUser && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) return;
      if (!sameUser) {
        ++loadVersion.current;
        setProfile(null);
        setRoles([]);
        setLoading(!!s);
      }
      ++settingsVersion.current;
      setSettings(null);
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRequiresPasswordSetup(true);
      if (event === "SIGNED_OUT") setRequiresPasswordSetup(false);
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        event === "SIGNED_OUT" ||
        event === "PASSWORD_RECOVERY"
      ) {
        setTimeout(() => {
          if (!alive || sessionUserId.current !== nextUserId) return;
          loadUser(s);
          refreshSettings();
        }, 0);
      }
    });
    const initialEvents = authEvents;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!alive || authEvents !== initialEvents) return;
        sessionUserId.current = data.session?.user.id ?? null;
        setRecordingUploadOwner(sessionUserId.current);
        signedIn.current = !!data.session;
        setSession(data.session);
        await refreshSettings();
        if (
          !alive ||
          authEvents !== initialEvents ||
          sessionUserId.current !== (data.session?.user.id ?? null)
        )
          return;
        await loadUser(data.session);
        if (data.session) supabase.rpc("touch_last_seen");
      })
      .catch(() => {
        if (!alive || authEvents !== initialEvents) return;
        setAccessError("Não foi possível recuperar a sessão. Tente entrar novamente.");
        setLoading(false);
      });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      setRecordingUploadOwner(null);
      ++loadVersion.current;
      ++settingsVersion.current;
    };
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
      {accessError ? (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="surface p-6 max-w-md text-center">
            <h1 className="text-xl font-semibold">Verificação de acesso</h1>
            <p role="alert" className="text-sm text-muted-foreground mt-3">
              {accessError}
            </p>
            <button
              className="portal-outline mt-5"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) setAccessError("Não foi possível sair. Tente novamente.");
                else {
                  setAccessError("");
                  setSession(null);
                  setProfile(null);
                  setRoles([]);
                }
              }}
            >
              Voltar ao login
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

export function isMemberBlocked(p: Profile | null) {
  if (!p) return true;
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
