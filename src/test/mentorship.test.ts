import { describe, expect, it } from "vitest";
import { accountCanAccess, addCalendarMonths, billingTotals, parseAmount, planState, saoPauloDate, splitInstallments, type MentorshipAccount, type MentorshipPlan } from "@/lib/mentorship";
const plan: MentorshipPlan = { id: "00000000-0000-4000-8000-000000000101", user_id: "00000000-0000-4000-8000-000000000002", start_date: "2026-11-12", end_date: "2027-05-12", starts_at: "2026-11-12T03:00:00Z", ends_at: "2027-05-12T03:00:00Z", duration_count: 6, duration_unit: "months", total_cents: 500000, installment_count: 3, first_due_date: "2026-11-12", revision: 1 };
const account: MentorshipAccount = { user_id: plan.user_id, server_now: "2026-11-12T12:00:00Z", status: "active", legacy_expires_at: plan.ends_at, has_access: true, plans: [plan], installments: [], receipts: [] };
describe("Prazos e valores da mentoria", () => {
  it.each([["5000",500000],["5000.00",500000],["0.01",1],["49.90",4990],["10000000",1000000000]])("converte %s sem perda de centavos", (value, expected) => expect(parseAmount(String(value))).toBe(expected));
  it.each(["0","-1","1.001","1e4","5000,00","","NaN","10000000.01"])("recusa valor inválido %s", (value) => expect(() => parseAmount(value)).toThrow());
  it("divide cinco mil em três parcelas sem perder um centavo", () => { const parts=splitInstallments(500000,3); expect(parts).toEqual([166667,166667,166666]); expect(parts.reduce((a,b)=>a+b,0)).toBe(500000); });
  it("à vista corresponde a uma parcela", () => expect(splitInstallments(500000,1)).toEqual([500000]));
  it("não produz parcelas de valor zero", () => expect(() => splitInstallments(2,3)).toThrow());
  it("usa meses de calendário e não dias fixos", () => { expect(addCalendarMonths("2024-01-31",1)).toBe("2024-02-29"); expect(addCalendarMonths("2024-01-31",2)).toBe("2024-03-31"); expect(addCalendarMonths("2024-02-29",12)).toBe("2025-02-28"); });
  it("respeita a virada do dia de Brasília", () => { expect(saoPauloDate(Date.parse("2026-11-12T02:59:59Z"))).toBe("2026-11-11"); expect(saoPauloDate(Date.parse("2026-11-12T03:00:00Z"))).toBe("2026-11-12"); });
  it("bloqueia exatamente no instante de vencimento", () => { const end=Date.parse(plan.ends_at); expect(accountCanAccess(account,end-1)).toBe(true); expect(accountCanAccess(account,end)).toBe(false); expect(planState(plan,end)).toBe("expired"); });
  it("não libera antes da data de início", () => { const start=Date.parse(plan.starts_at); expect(accountCanAccess(account,start-1)).toBe(false); expect(accountCanAccess(account,start)).toBe(true); });
  it("não libera conta suspensa mesmo com plano vigente", () => expect(accountCanAccess({...account,status:"suspended"},Date.parse(account.server_now))).toBe(false));
  it("preserva o acesso anterior quando ainda não há plano", () => { expect(accountCanAccess({...account,plans:[],legacy_expires_at:null},Date.now())).toBe(true); expect(accountCanAccess({...account,plans:[],legacy_expires_at:"2020-01-01T00:00:00Z"},Date.now())).toBe(false); });
  it("renovação futura não libera o intervalo entre contratos", () => { const future={...plan,id:"00000000-0000-4000-8000-000000000102",starts_at:"2027-06-12T03:00:00Z",ends_at:"2028-06-12T03:00:00Z"}; const renewal={...account,legacy_expires_at:future.ends_at,plans:[plan,future]}; expect(accountCanAccess(renewal,Date.parse("2027-05-20T12:00:00Z"))).toBe(false); expect(accountCanAccess(renewal,Date.parse("2026-12-20T12:00:00Z"))).toBe(true); });
  it("saldo só desconta pagamento confirmado", () => { const base={id:"x",plan_id:plan.id,number:1,amount_cents:10000,due_date:"2026-11-12",paid_on:null,paid_at:null,payment_note:""}; expect(billingTotals([base,{...base,id:"y",paid_at:"2026-11-12T13:00:00Z"}])).toEqual({total:20000,paid:10000,remaining:10000,unpaid:1}); });
});
