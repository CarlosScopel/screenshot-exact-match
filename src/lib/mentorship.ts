import { z } from "zod";

export const planSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  duration_count: z.number().int().positive(),
  duration_unit: z.enum(["months", "years"]),
  total_cents: z.number().int().positive(),
  installment_count: z.number().int().positive(),
  first_due_date: z.string(),
  revision: z.number().int(),
});
export const installmentSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  number: z.number().int(),
  amount_cents: z.number().int(),
  due_date: z.string(),
  paid_at: z.string().nullable(),
  paid_on: z.string().nullable(),
  payment_note: z.string(),
});
export const receiptSchema = z.object({
  id: z.string().uuid(),
  installment_id: z.string().uuid(),
  user_id: z.string().uuid(),
  file_path: z.string(),
  file_name: z.string(),
  paid_on: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  review_note: z.string(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
});
export const accountSchema = z.object({
  user_id: z.string().uuid(),
  server_now: z.string(),
  status: z.string(),
  legacy_expires_at: z.string().nullable(),
  has_access: z.boolean(),
  plans: z.array(planSchema),
  installments: z.array(installmentSchema),
  receipts: z.array(receiptSchema),
});
export type MentorshipAccount = z.infer<typeof accountSchema>;
export type MentorshipPlan = z.infer<typeof planSchema>;
export type MentorshipInstallment = z.infer<typeof installmentSchema>;
export type MentorshipReceipt = z.infer<typeof receiptSchema>;
export type PlanInput = {
  id: string;
  userId: string;
  startDate: string;
  durationCount: number;
  durationUnit: "months" | "years";
  totalCents: number;
  installmentCount: number;
  firstDueDate: string;
  expectedRevision: number;
};

export function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
export function parseAmount(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Informe um valor válido com até duas casas decimais.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1_000_000_000)
    throw new Error("O valor deve estar entre R$ 0,01 e R$ 10.000.000,00.");
  return cents;
}
export function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
export function saoPauloDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  return ["year", "month", "day"]
    .map((name) => parts.find((part) => part.type === name)?.value)
    .join("-");
}
/** Calendar months, anchored to the original day (Jan 31 -> Feb 28 -> Mar 31). */
export function addCalendarMonths(isoDate: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(months)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last)))
    .toISOString()
    .slice(0, 10);
}
export function splitInstallments(totalCents: number, count: number): number[] {
  if (
    !Number.isInteger(totalCents) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 60 ||
    totalCents < count
  )
    throw new Error("Valor e número de parcelas inválidos.");
  return Array.from(
    { length: count },
    (_, i) => Math.floor(totalCents / count) + (i < totalCents % count ? 1 : 0),
  );
}
export function planState(plan: MentorshipPlan, now: number): "scheduled" | "active" | "expired" {
  if (now < Date.parse(plan.starts_at)) return "scheduled";
  return now >= Date.parse(plan.ends_at) ? "expired" : "active";
}
export function accountCanAccess(account: MentorshipAccount, now: number) {
  if (account.status !== "active") return false;
  if (account.legacy_expires_at && now >= Date.parse(account.legacy_expires_at)) return false;
  return !account.plans.length || account.plans.some((plan) => planState(plan, now) === "active");
}
export function billingTotals(installments: MentorshipInstallment[]) {
  const total = installments.reduce((sum, item) => sum + item.amount_cents, 0);
  const paid = installments.reduce((sum, item) => sum + (item.paid_at ? item.amount_cents : 0), 0);
  return {
    total,
    paid,
    remaining: total - paid,
    unpaid: installments.filter((item) => !item.paid_at).length,
  };
}
