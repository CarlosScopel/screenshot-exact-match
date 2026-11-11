import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, ArrowRight, LoaderCircle, Mail, ShieldCheck, BookOpen, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createFirstAdmin, getSetupState, requestMenteeAccess } from "@/lib/admin.functions";
import { useMedia } from "@/lib/media";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

export function AccessScreen({ name, title, subtitle, logo, image, forceRecovery = false, onSuccess, onDemo }: {
  name: string; title?: string; subtitle?: string; logo?: string | null; image?: string | null; forceRecovery?: boolean; onSuccess: () => void; onDemo?: () => void;
}) {
  const coverUrl = useMedia(image);
  const logoUrl = useMedia(logo);
  const [mode, setMode] = useState<"login" | "forgot" | "setup" | "recovery" | "request">(forceRecovery ? "recovery" : "login");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmation: "" });
  useEffect(() => {
    let alive = true;
    const token = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("type") || new URLSearchParams(window.location.hash.slice(1)).get("type")) : null;
    if (token === "invite" || token === "recovery") setMode("recovery");
    getSetupState().then((state) => {
      if (alive && !state.hasAdmin && !forceRecovery && token !== "recovery" && token !== "invite") setMode("setup");
    }).catch(() => {
      if (alive) setFeedback("Não foi possível verificar a configuração do servidor.");
    }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);
  const edit = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    setBusy(true);
    try {
      if (mode === "setup") {
        await createFirstAdmin({ data: { name: form.name, email: form.email, password: form.password } });
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
        onSuccess();
      } else if (mode === "request") {
        await requestMenteeAccess({ data: { name: form.name, email: form.email } });
        setFeedback("Solicitação recebida! Aguarde a aprovação do administrador. Se aprovada, você receberá um e-mail para definir sua senha.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setFeedback("Se este e-mail estiver cadastrado, você receberá instruções de recuperação.");
      } else if (mode === "recovery") {
        if (form.password !== form.confirmation) throw new Error("As senhas não coincidem.");
        const { error } = await supabase.auth.updateUser({ password: form.password });
        if (error) throw error;
        window.history.replaceState({}, "", window.location.pathname);
        onSuccess();
      } else if (onDemo && form.email.trim().toLowerCase() === DEMO_EMAIL && form.password === DEMO_PASSWORD) {
        // Demonstration does not authenticate, create a session, or query private data.
        onDemo();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
        onSuccess();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background">
      <div className="hidden lg:flex flex-col justify-between p-14 bg-[#0a1426] relative overflow-hidden border-r border-white/10">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_15%_35%,#2462cc44,transparent_60%)]" />{coverUrl && <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />}
        <div className="relative z-10 flex items-center gap-3 text-white font-bold text-xl">
          <span className="bg-blue-600 rounded-xl p-2.5">{logoUrl ? <img className="size-6 object-contain" src={logoUrl} alt="" /> : <GraduationCap className="size-6" />}</span>{name}
        </div>
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex gap-2 px-3 py-1.5 border border-blue-400/30 rounded-full text-blue-300 text-xs mb-8"><ShieldCheck className="size-4" /> ACESSO EXCLUSIVO</div>
          <h1 className="text-5xl leading-[1.15] font-semibold text-white mb-6">Seu próximo nível começa aqui.</h1>
          <p className="text-lg text-slate-400 leading-relaxed">Aulas, materiais e ferramentas reunidos em uma experiência de aprendizado privada e organizada.</p>
          <div className="flex gap-4 mt-12"><div className="rounded-2xl bg-white/5 border border-white/10 p-5"><BookOpen className="text-blue-400 mb-3" /><span className="text-sm text-slate-300">Conteúdo exclusivo</span></div><div className="rounded-2xl bg-white/5 border border-white/10 p-5"><ShieldCheck className="text-blue-400 mb-3" /><span className="text-sm text-slate-300">Ambiente protegido</span></div></div>
        </div>
        <p className="relative z-10 text-sm text-slate-500">Ambiente privado de mentoria</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 text-lg font-semibold mb-12"><GraduationCap className="text-blue-500" />{name}</div>
          <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-7"><LockKeyhole className="size-6" /></div>
          <h2 className="text-3xl font-semibold mb-2">{mode === "setup" ? "Configuração inicial" : mode === "forgot" ? "Recuperar acesso" : mode === "recovery" ? "Definir senha" : mode === "request" ? "Solicite sua entrada" : title || "Bem-vindo de volta"}</h2>
          <p className="text-muted-foreground mb-9">{mode === "setup" ? "Crie a primeira conta administrativa da plataforma." : mode === "forgot" ? "Enviaremos um link para seu e-mail cadastrado." : mode === "recovery" ? "Escolha uma senha segura para sua conta." : mode === "request" ? "Informe seus dados. Sua entrada em A ORDEM depende de aprovação." : subtitle || "Acesse seu ambiente exclusivo de mentoria."}</p>
          {checking ? <div className="text-muted-foreground flex gap-2 items-center"><LoaderCircle className="animate-spin size-4" /> Verificando acesso...</div> : (
          <form onSubmit={submit} className="space-y-5">
            {(mode === "setup" || mode === "request") && <label className="block text-sm font-medium">Seu nome<input className="portal-input mt-2" required minLength={2} value={form.name} onChange={(e) => edit("name", e.target.value)} placeholder="Nome completo" /></label>}
            {(mode === "login" || mode === "setup" || mode === "forgot" || mode === "request") && <label className="block text-sm font-medium">E-mail<div className="relative mt-2"><Mail className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" /><input className="portal-input pl-11" type="email" autoComplete="email" required value={form.email} onChange={(e) => edit("email", e.target.value)} placeholder="voce@exemplo.com" /></div></label>}
            {(mode === "login" || mode === "setup" || mode === "recovery") && <label className="block text-sm font-medium">Senha<input className="portal-input mt-2" type="password" minLength={mode === "login" ? 1 : 8} required value={form.password} onChange={(e) => edit("password", e.target.value)} placeholder="Sua senha" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
            {mode === "recovery" && <label className="block text-sm font-medium">Confirmar senha<input className="portal-input mt-2" type="password" minLength={8} required value={form.confirmation} onChange={(e) => edit("confirmation", e.target.value)} placeholder="Repita a senha" /></label>}
            {feedback && <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{feedback}</div>}
            <button disabled={busy} className="portal-button w-full justify-center py-3">{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === "setup" ? "Criar minha conta" : mode === "forgot" ? "Enviar instruções" : mode === "recovery" ? "Salvar nova senha" : mode === "request" ? "Solicitar aprovação" : "Entrar na plataforma"}<ArrowRight className="size-4" /></button>
            {mode === "login" && <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setMode("forgot"); setFeedback(""); }}>Esqueceu sua senha?</button>}
            {mode === "setup" && onDemo && <button type="button" className="portal-outline w-full" onClick={() => { setMode("login"); setFeedback(""); }}>Visualizar como mentorado de teste</button>}
            {mode === "login" && onDemo && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2"><p className="text-sm font-semibold">Visualizar como mentorado</p><p className="text-xs text-muted-foreground">Acesso de demonstração, com conteúdos fictícios e sem acesso ao banco real.</p><button type="button" className="portal-outline w-full" onClick={() => { setForm((f) => ({ ...f, email: DEMO_EMAIL, password: DEMO_PASSWORD })); setFeedback(""); }}>Preencher login de teste</button></div>}
            {mode === "login" && <button type="button" className="block text-sm text-primary hover:underline" onClick={() => { setMode("request"); setFeedback(""); }}>Quero fazer parte de A ORDEM</button>}
            {(mode === "forgot" || mode === "request") && <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setMode("login"); setFeedback(""); }}>Voltar ao login</button>}
          </form>)}
          <p className="text-center text-xs text-muted-foreground mt-12">A entrada é sujeita à aprovação do administrador.</p>
        </div>
      </div>
    </div>
  );
}
