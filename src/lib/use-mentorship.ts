import { useCallback, useEffect, useRef, useState } from "react";
import { getMentorshipAccount } from "./mentorship-api";
import { type MentorshipAccount } from "./mentorship";

export function useMentorshipAccount(userId: string | null, enabled = true) {
  const [account, setAccount] = useState<MentorshipAccount | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const offset = useRef(0);
  const refresh = useCallback(async () => {
    if (!userId || !enabled) return;
    const current = ++generation.current;
    try {
      const value = await getMentorshipAccount(userId);
      if (current !== generation.current) return;
      offset.current = Date.parse(value.server_now) - Date.now();
      setNow(Date.now() + offset.current);
      setAccount(value);
      setError("");
    } catch (cause) {
      if (current === generation.current)
        setError(cause instanceof Error ? cause.message : "Não foi possível verificar o plano.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [userId, enabled]);
  useEffect(() => {
    setAccount(null);
    setError("");
    setLoading(!!userId && enabled);
    if (!userId || !enabled) return;
    void refresh();
    const tick = window.setInterval(() => {
      setNow(Date.now() + offset.current);
      void refresh();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      generation.current += 1;
      window.clearInterval(tick);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, enabled, refresh]);
  useEffect(() => {
    if (!account || !enabled) return;
    const boundaries = account.plans.flatMap((plan) => [
      Date.parse(plan.starts_at),
      Date.parse(plan.ends_at),
    ]);
    if (account.legacy_expires_at) boundaries.push(Date.parse(account.legacy_expires_at));
    const next = Math.min(...boundaries.filter((time) => time > now));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(
      () => setNow(Date.now() + offset.current),
      Math.min(next - now + 50, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [account, enabled, now]);
  return { account: account?.user_id === userId ? account : null, error, loading, now, refresh };
}
