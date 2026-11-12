import { useState, type FormEvent } from "react";
import { CalendarDays, CreditCard, FileCheck, LoaderCircle, Plus, Upload } from "lucide-react";
import { useMentorshipAccount } from "@/lib/use-mentorship";
import { addCalendarMonths, billingTotals, dateLabel, money, parseAmount, planState, saoPauloDate, splitInstallments, type MentorshipAccount as Account, type MentorshipPlan as Plan, type MentorshipInstallment as Installment, type MentorshipReceipt as Receipt } from "@/lib/mentorship";
import { confirmInstallment, openPaymentReceipt, reviewPaymentReceipt, saveMentorshipPlan, uploadPaymentReceipt } from "@/lib/mentorship-api";

type Props = { userId: string; admin?: boolean; onChanged?: () => Promise<void> };
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";

export function MentorshipPanel({ userId, admin = false, onChanged }: Props) {
  const { account, loading, error, now, refresh } = useMentorshipAccount(userId);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const updated = async () => { await refresh(); await onChanged?.(); };
  if (loading && !account) return <div className="surface p-6 flex gap-2 items-center"><LoaderCircle className="size-4 animate-spin" />Carregando plano e pagamentos...</div>;
  if (!account) return <div className="surface p-6"><p role="alert">{error || "Não foi possível carregar o plano."}</p><button className="portal-outline mt-3" onClick={() => void refresh()}>Tentar novamente</button></div>;
  const totals = billingTotals(account.installments);
  const today = saoPauloDate(now);
  const lastEnd = account.plans.reduce((last, item) => item.end_date > last ? item.end_date : last, today);
  const active = account.plans.find((plan) => planState(plan, now) === "active");
  const next = [...account.plans].reverse().find((plan) => planState(plan, now) === "scheduled");
  const pending = account.receipts.filter((receipt) => receipt.status === "pending").length;
  return <section className="space-y-5 text-left" aria-label={admin ? "Plano e pagamentos do mentorado" : "Meu plano e pagamentos"}>
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-semibold">{admin ? "Plano e pagamentos" : "Meu plano e pagamentos"}</h2><p className="text-sm text-muted-foreground mt-1">Prazo da mentoria, parcelas e comprovantes em um só lugar.</p></div>{admin && <button type="button" className="portal-button" onClick={() => { setNotice(""); setEditing("new"); }}><Plus className="size-4" />{account.plans.length ? "Novo plano / renovação" : "Cadastrar plano"}</button>}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-xl border p-3 text-sm">{notice}</p>}
    <div className="grid sm:grid-cols-3 gap-3"><Summary title="Valor contratado" amount={totals.total} /><Summary title="Pagamento confirmado" amount={totals.paid} /><Summary title="Saldo a pagar" amount={totals.remaining} /></div>
    <p className="text-xs text-muted-foreground">Valores em reais (BRL). Comprovantes em análise não abatem o saldo. Parcelas mensais; o pagamento não renova o prazo automaticamente.</p>
    {!!pending && <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"><FileCheck className="inline size-4 mr-2" />{pending} comprovante(s) aguardando {admin ? "sua análise" : "confirmação do administrador"}.</div>}
    {active ? <div className="surface p-4 flex items-start gap-3"><CalendarDays className="text-primary size-5 shrink-0" /><div><p className="font-medium">{Math.max(0, Math.ceil((Date.parse(active.ends_at) - now) / 86_400_000))} dia(s) restantes de mentoria</p><p className="text-sm text-muted-foreground">De {dateLabel(active.start_date)} até o vencimento em {dateLabel(active.end_date)}, às 00h de Brasília.</p></div></div> : account.plans.length ? <div className="surface p-4"><p className="font-medium">{next ? `Mentoria programada para ${dateLabel(next.start_date)}` : "Prazo da mentoria encerrado"}</p><p className="text-sm text-muted-foreground mt-1">{next ? "O conteúdo é liberado no início do plano, após a aprovação do cadastro." : "O conteúdo fica bloqueado até o administrador cadastrar a renovação. Seus pagamentos e comprovantes permanecem disponíveis aqui."}</p></div> : <div className="surface p-5"><p className="font-medium">Nenhum plano financeiro cadastrado</p><p className="text-sm text-muted-foreground mt-1">{admin ? "Defina o início, a duração, o valor total e a forma de pagamento. O acesso anterior permanece como estava até o cadastro do primeiro plano." : "O administrador ainda precisa cadastrar os dados da sua mentoria."}</p></div>}
    {account.status !== "active" && <p className="text-sm text-destructive">A conta também está suspensa ou aguardando aprovação. Cadastrar ou pagar um plano não altera essa restrição.</p>}
    {editing && admin && <PlanEditor key={editing === "new" ? `new-${userId}` : editing.id} userId={userId} plan={editing === "new" ? undefined : editing} account={account} initialDate={lastEnd} today={today} onCancel={() => setEditing(null)} onSaved={async () => { await updated(); setEditing(null); setNotice("Plano salvo. O prazo de acesso foi atualizado sem alterar pagamentos anteriores."); }} />}
    {account.plans.map((plan) => <div key={plan.id} className="surface p-4 sm:p-6 space-y-4"><div className="flex flex-wrap justify-between items-start gap-3"><div><h3 className="font-semibold">Mentoria de {plan.duration_count} {plan.duration_unit === "months" ? "mês(es)" : "ano(s)"}</h3><p className="text-sm text-muted-foreground mt-1">Início: {dateLabel(plan.start_date)} · Vencimento: {dateLabel(plan.end_date)} · {planState(plan, now) === "active" ? "Em andamento" : planState(plan, now) === "scheduled" ? "Programada" : "Encerrada"}</p><p className="text-sm mt-2">{money(plan.total_cents)} · {plan.installment_count === 1 ? "À vista" : `${plan.installment_count} parcelas mensais`}</p></div>{admin && <button type="button" className="portal-outline" onClick={() => setEditing(plan)}>Editar plano</button>}</div>
      {account.installments.filter((item) => item.plan_id === plan.id).sort((a, b) => a.number - b.number).map((item) => <InstallmentRow key={item.id} item={item} receipts={account.receipts.filter((receipt) => receipt.installment_id === item.id)} userId={userId} admin={admin} today={today} refresh={updated} />)}
    </div>)}
  </section>;
}
function Summary({ title, amount }: { title: string; amount: number }) { return <div className="surface p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold mt-2">{money(amount)}</p></div>; }

function PlanEditor({ userId, plan, account, initialDate, today, onCancel, onSaved }: { userId: string; plan?: Plan | undefined; account: Account; initialDate: string; today: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [id] = useState(() => plan?.id || crypto.randomUUID());
  const [start, setStart] = useState(plan?.start_date || initialDate);
  const [count, setCount] = useState(plan?.duration_count || 6);
  const [unit, setUnit] = useState<"months" | "years">(plan?.duration_unit || "months");
  const [amount, setAmount] = useState(plan ? (plan.total_cents / 100).toFixed(2) : "");
  const [payment, setPayment] = useState(plan && plan.installment_count > 1 ? "installments" : "single");
  const [parts, setParts] = useState(plan?.installment_count || 2);
  const [firstDue, setFirstDue] = useState(plan?.first_due_date || today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const financialLocked = !!plan && account.installments.some((item) => item.plan_id === plan.id && (item.paid_at || account.receipts.some((receipt) => receipt.installment_id === item.id)));
  const installments = payment === "single" ? 1 : parts;
  const end = addCalendarMonths(start, count * (unit === "years" ? 12 : 1));
  let preview: number[] = [];
  try { preview = splitInstallments(parseAmount(amount), installments); } catch { /* Incomplete form. */ }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      await saveMentorshipPlan({ id, userId, startDate: start, durationCount: count, durationUnit: unit, totalCents: parseAmount(amount), installmentCount: installments, firstDueDate: firstDue, expectedRevision: plan?.revision || 0 });
      await onSaved();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="surface border-primary/30 p-5 space-y-4" aria-label="Configurar plano de mentoria"><h3 className="font-semibold">{plan ? "Editar plano" : "Cadastrar plano / renovação"}</h3><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <label className="text-sm">Data de início<input className="portal-input mt-2" type="date" min="2000-01-01" max="2100-01-01" required value={start} onChange={(event) => setStart(event.target.value)} disabled={busy} /></label>
    <label className="text-sm">Duração<input className="portal-input mt-2" type="number" min="1" max={unit === "years" ? 10 : 120} step="1" required value={count || ""} onChange={(event) => setCount(Number(event.target.value))} disabled={busy} /></label>
    <label className="text-sm">Unidade de duração<select className="portal-input mt-2" value={unit} onChange={(event) => setUnit(event.target.value as "months" | "years")} disabled={busy}><option value="months">Meses</option><option value="years">Anos</option></select></label>
    <label className="text-sm">Valor total cobrado (R$)<input className="portal-input mt-2" type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" required placeholder="5000,00" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || financialLocked} /></label>
    <label className="text-sm">Forma de pagamento<select className="portal-input mt-2" value={payment} onChange={(event) => setPayment(event.target.value)} disabled={busy || financialLocked}><option value="single">À vista</option><option value="installments">Parcelado</option></select></label>
    {payment === "installments" && <label className="text-sm">Quantidade de parcelas<input className="portal-input mt-2" type="number" min="2" max="60" step="1" required value={parts || ""} onChange={(event) => setParts(Number(event.target.value))} disabled={busy || financialLocked} /></label>}
    <label className="text-sm">{payment === "single" ? "Vencimento do pagamento" : "Vencimento da primeira parcela"}<input className="portal-input mt-2" type="date" min="2000-01-01" max="2100-01-01" required value={firstDue} onChange={(event) => setFirstDue(event.target.value)} disabled={busy || financialLocked} /></label>
  </div><div className="text-sm text-muted-foreground space-y-1"><p>Vencimento da mentoria: <strong className="text-foreground">{end ? dateLabel(end) : "—"}</strong>, às 00h de Brasília. O conteúdo será bloqueado automaticamente.</p>{preview.length > 0 && <p>{preview.length} parcela(s), de {money(Math.min(...preview))}{Math.max(...preview) !== Math.min(...preview) ? ` a ${money(Math.max(...preview))}` : ""}. Centavos são distribuídos sem alterar o total.</p>}{financialLocked && <p>Os valores e vencimentos estão protegidos porque já existem pagamentos ou comprovantes. Você ainda pode ajustar o período da mentoria.</p>}<p>A renovação cria um novo plano e preserva o histórico anterior. Nenhuma parcela é marcada como paga ao salvar.</p></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex gap-3"><button disabled={busy} className="portal-button">{busy ? "Salvando..." : "Salvar plano"}</button><button type="button" disabled={busy} className="portal-outline" onClick={onCancel}>Cancelar</button></div></form>;
}

function InstallmentRow({ item, receipts, userId, admin, today, refresh }: { item: Installment; receipts: Receipt[]; userId: string; admin: boolean; today: string; refresh: () => Promise<void> }) {
  const [action, setAction] = useState<"upload" | "confirm" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = receipts.find((receipt) => receipt.status === "pending");
  const run = async (operation: () => Promise<unknown>, success: string) => {
    if (busy) return; setBusy(true); setNotice("");
    try { await operation(); await refresh(); setAction(null); setNotice(success); } catch (cause) { setNotice(errorText(cause)); } finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (action === "upload") {
      const file = form.get("receipt");
      if (!(file instanceof File) || !file.size) { setNotice("Selecione um comprovante."); return; }
      void run(() => uploadPaymentReceipt(userId, item.id, file, String(form.get("paidOn"))), "Comprovante enviado para análise. Aguarde a confirmação do administrador.");
    } else if (action === "confirm") {
      if (!window.confirm(`Confirmar o recebimento de ${money(item.amount_cents)} referente à parcela ${item.number}?`)) return;
      void run(() => confirmInstallment(item.id, String(form.get("paidOn")), String(form.get("note") || "")), "Pagamento confirmado.");
    } else if (action === "reject" && pending) {
      void run(() => reviewPaymentReceipt(pending.id, "rejected", String(form.get("note") || "")), "Comprovante recusado. O mentorado pode enviar outro.");
    }
  };
  return <article className="border-t pt-4 space-y-3"><div className="flex flex-wrap justify-between items-center gap-3"><div><p className="font-medium"><CreditCard className="inline size-4 mr-2" />Parcela {item.number} · {money(item.amount_cents)}</p><p className="text-sm text-muted-foreground mt-1">Vencimento: {dateLabel(item.due_date)} · {item.paid_at ? `Pago em ${dateLabel(item.paid_on || item.paid_at)}` : pending ? "Comprovante em análise" : item.due_date < today ? "Em atraso" : "Em aberto"}</p></div>{!item.paid_at && !pending && <button type="button" disabled={busy} className="portal-outline" onClick={() => { setNotice(""); setAction(admin ? "confirm" : "upload"); }}>{admin ? "Confirmar pagamento" : "Enviar comprovante"}</button>}</div>
    {receipts.map((receipt) => <div key={receipt.id} className="rounded-xl bg-muted/30 border p-3"><div className="flex flex-wrap justify-between items-center gap-2"><div className="min-w-0"><p className="text-sm break-all">{receipt.file_name}</p><p className="text-xs text-muted-foreground mt-1">{receipt.status === "pending" ? "Em análise" : receipt.status === "approved" ? "Aprovado" : "Recusado"} · Data informada: {dateLabel(receipt.paid_on)}</p>{receipt.review_note && <p className="text-sm mt-2">Observação: {receipt.review_note}</p>}</div><button type="button" className="portal-outline text-xs" onClick={() => void openPaymentReceipt(receipt).catch((cause) => setNotice(errorText(cause)))}>Abrir comprovante</button></div>{admin && receipt.status === "pending" && !item.paid_at && <div className="flex flex-wrap gap-2 mt-3"><button type="button" disabled={busy} className="portal-button" onClick={() => { if (window.confirm(`Você conferiu o recebimento de ${money(item.amount_cents)}?`)) void run(() => reviewPaymentReceipt(receipt.id, "approved", ""), "Comprovante aprovado e parcela quitada."); }}>Aprovar comprovante</button><button type="button" disabled={busy} className="portal-outline" onClick={() => setAction("reject")}>Recusar comprovante</button></div>}</div>)}
    {action && !item.paid_at && <form onSubmit={submit} className="rounded-xl border p-4 space-y-3" aria-label={`Pagamento da parcela ${item.number}`}>
      {action === "upload" && <><label className="block text-sm">Comprovante (PDF, PNG ou JPG, até 10 MB)<input className="portal-input mt-2" type="file" name="receipt" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" required disabled={busy} /></label><p className="text-xs text-muted-foreground">O arquivo fica privado, visível somente para você e a administração. Enviar não confirma o pagamento nem renova o acesso.</p></>}
      {action !== "reject" && <label className="block text-sm">Data do pagamento<input className="portal-input mt-2" type="date" name="paidOn" min="2000-01-01" max={today} defaultValue={today} required disabled={busy} /></label>}
      {action !== "upload" && <label className="block text-sm">{action === "reject" ? "Motivo da recusa" : "Observação (opcional)"}<textarea className="portal-input mt-2" name="note" maxLength={500} required={action === "reject"} disabled={busy} /></label>}
      <div className="flex gap-2"><button className="portal-button" disabled={busy}>{action === "upload" && <Upload className="size-4" />}{busy ? "Processando..." : action === "upload" ? "Enviar para análise" : action === "reject" ? "Confirmar recusa" : "Registrar pagamento"}</button><button type="button" className="portal-outline" disabled={busy} onClick={() => setAction(null)}>Cancelar</button></div>
    </form>}{notice && <p role="status" className="text-sm rounded-xl border p-3">{notice}</p>}
  </article>;
}
