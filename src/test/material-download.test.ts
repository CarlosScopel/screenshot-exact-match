import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMaterial } from "@/lib/media";

const mock = vi.hoisted(() => ({ from: vi.fn(), signed: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: mock.from } },
}));

const url = "https://storage.example.test/signed-material?token=test-only";
const popup = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
const open = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  popup.closed = false;
  popup.opener = {};
  mock.from.mockReturnValue({ createSignedUrl: mock.signed });
  mock.signed.mockResolvedValue({ data: { signedUrl: url }, error: null });
  open.mockReturnValue(popup);
  vi.stubGlobal("window", { open, location: { assign } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Download privado sem bloqueio de pop-up", () => {
  it("abre a janela durante o clique, antes da resposta de autorização", async () => {
    const pending = openMaterial("lesson/test-id/material.pdf");
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).not.toHaveBeenCalled();
    await pending;
    expect(mock.from).toHaveBeenCalledWith("materials");
    expect(mock.signed).toHaveBeenCalledWith("lesson/test-id/material.pdf", 120, {
      download: true,
    });
    expect(popup.location.replace).toHaveBeenCalledWith(url);
  });

  it("não abre o arquivo quando o backend nega acesso", async () => {
    const error = new Error("Acesso negado");
    mock.signed.mockResolvedValue({ data: null, error });
    await expect(openMaterial("lesson/test-id/private.pdf")).rejects.toBe(error);
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("usa a mesma aba quando o navegador recusa a nova janela", async () => {
    open.mockReturnValue(null);
    await openMaterial("library/test-id/material.pdf");
    expect(assign).toHaveBeenCalledWith(url);
  });

  it("fecha a janela vazia e propaga erros de rede", async () => {
    mock.signed.mockRejectedValue(new Error("Conexão indisponível"));
    await expect(openMaterial("library/test-id/material.pdf")).rejects.toThrow("Conexão");
    expect(popup.close).toHaveBeenCalled();
  });
});
