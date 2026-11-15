import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, LockKeyhole, MessageSquareText, Save, Trash2 } from "lucide-react";
import {
  BILLING_OBSERVATION_LIMIT,
  getBillingObservation,
  saveBillingObservation,
  type BillingObservationValue,
} from "@/lib/billing-observation";

type Props = { userId: string; admin?: boolean };
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível carregar a observação.";

export function BillingObservation({ userId, admin = false }: Props) {
  // Changing recipient or role must never reuse another member's note or unfinished draft.
  return <Observation key={`${userId}:${admin}`} userId={userId} admin={admin} />;
}

function Observation({ userId, admin }: Required<Props>) {
  const inputId = useId();
  const [saved, setSaved] = useState<BillingObservationValue | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const dirty = !!saved && draft.trim() !== saved.content;
  const reload = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      const value = await getBillingObservation(userId);
      if (mounted.current && version === request.current) {
        setSaved(value);
        setDraft(value.content);
        setError("");
      }
    } catch (cause) {
      if (mounted.current && version === request.current) setError(messageOf(cause));
    } finally {
      if (mounted.current && version === request.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    // Students can see a new message when returning to this page; admin drafts stay untouched.
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    if (!admin) window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      request.current += 1;
      window.removeEventListener("focus", refresh);
    };
  }, [reload, admin]);
  useEffect(() => {
    if (!admin || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [admin, dirty]);
  const save = async (content: string) => {
    if (!admin || !saved || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const value = await saveBillingObservation(userId, content, saved.revision);
      if (mounted.current) {
        setSaved(value);
        setDraft(value.content);
        setNotice(value.content ? "Observação salva para este mentorado." : "Observação removida.");
      }
    } catch (cause) {
      if (mounted.current) setError(messageOf(cause));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  if (!admin && !loading && !error && !saved?.content) return null;
  return (
    <section className="surface p-4 sm:p-5 space-y-3 min-w-0" aria-label="Observação de pagamentos">
      <div className="flex items-start gap-3">
        <MessageSquareText className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-semibold">
            {admin ? "Observação para este mentorado" : "Observação sobre seu plano e pagamentos"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            <LockKeyhole className="size-3 inline mr-1" aria-hidden="true" />
            {admin
              ? "Visível somente para este mentorado e para a administração."
              : "Mensagem da administração, exclusiva para você."}
          </p>
        </div>
      </div>
      {loading && !saved && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Carregando observação...
        </p>
      )}
      {admin && saved && (
        <>
          <label htmlFor={inputId} className="block text-sm font-medium">
            Observação
          </label>
          <textarea
            id={inputId}
            className="portal-input min-h-32 resize-y"
            rows={4}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setNotice("");
            }}
            maxLength={BILLING_OBSERVATION_LIMIT}
            disabled={saving || loading}
            placeholder="Ex.: Conforme combinado, o vencimento da próxima parcela será no dia 10."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {draft.length}/{BILLING_OBSERVATION_LIMIT} caracteres
              {dirty ? " · Alterações não salvas" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {!!saved.content && (
                <button
                  type="button"
                  className="portal-outline text-destructive"
                  disabled={saving || loading}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remover a observação deste mentorado? Ela deixará de aparecer para ele.",
                      )
                    )
                      void save("");
                  }}
                >
                  <Trash2 className="size-4" /> Remover observação
                </button>
              )}
              <button
                type="button"
                className="portal-button"
                disabled={saving || loading || !dirty}
                onClick={() => void save(draft)}
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "Salvando..." : "Salvar observação"}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta mensagem não altera valores, parcelas ou o prazo de acesso.
          </p>
        </>
      )}
      {!admin && !!saved?.content && (
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed">
          {saved.content}
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <button
            type="button"
            disabled={saving || loading}
            className="portal-outline"
            onClick={() => {
              if (!dirty || window.confirm("Descartar o rascunho e carregar a observação salva?"))
                void reload();
            }}
          >
            Recarregar observação
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
    </section>
  );
}
