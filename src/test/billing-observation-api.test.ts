import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingObservation, saveBillingObservation } from "@/lib/billing-observation";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
const uid = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
beforeEach(() => {
  vi.resetAllMocks();
  mock.rpc.mockResolvedValue({
    data: {
      user_id: uid,
      content: "Acordo individual",
      revision: 1,
      updated_at: "2026-11-15T12:00:00Z",
    },
    error: null,
  });
});
describe("Observação financeira privada: contrato da API", () => {
  it("consulta somente o destinatário informado", async () => {
    expect((await getBillingObservation(uid)).content).toBe("Acordo individual");
    expect(mock.rpc).toHaveBeenCalledWith("mentorship_get_observation", { p_user_id: uid });
  });
  it("salva mensagem e revisão sem enviar valores ou parcelas", async () => {
    await saveBillingObservation(uid, "  Acordo individual  ", 1);
    expect(mock.rpc).toHaveBeenCalledWith("mentorship_save_observation", {
      p_user_id: uid,
      p_content: "Acordo individual",
      p_expected_revision: 1,
    });
  });
  it("remove a mensagem salvando texto vazio", async () => {
    await saveBillingObservation(uid, "", 1);
    expect(mock.rpc).toHaveBeenCalledWith("mentorship_save_observation", {
      p_user_id: uid,
      p_content: "",
      p_expected_revision: 1,
    });
  });
  it("recusa dados retornados de outro mentorado", async () => {
    mock.rpc.mockResolvedValue({
      data: { user_id: other, content: "segredo", revision: 1, updated_at: null },
      error: null,
    });
    await expect(getBillingObservation(uid)).rejects.toThrow("não pertence");
  });
  it("propaga bloqueio do servidor sem simular sucesso", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "Acesso não autorizado" } });
    await expect(saveBillingObservation(uid, "texto", 0)).rejects.toThrow("Acesso não autorizado");
  });
  it("rejeita texto acima do limite antes de enviar", () => {
    expect(() => saveBillingObservation(uid, "a".repeat(5001), 0)).toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejeita destinatário ou revisão inválidos", () => {
    expect(() => getBillingObservation("invalid")).toThrow();
    expect(() => saveBillingObservation(uid, "texto", -1)).toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
