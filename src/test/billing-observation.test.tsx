import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingObservation } from "@/components/portal/BillingObservation";
const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/billing-observation", () => ({
  BILLING_OBSERVATION_LIMIT: 5000,
  getBillingObservation: mock.get,
  saveBillingObservation: mock.save,
}));
const uid = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const value = (id = uid, content = "Vencimento combinado para dia 10.", revision = 1) => ({
  user_id: id,
  content,
  revision,
  updated_at: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.get.mockResolvedValue(value());
  mock.save.mockImplementation(async (id: string, content: string, revision: number) =>
    value(id, content.trim(), revision + 1),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Observação individual em plano e pagamentos", () => {
  it("admin pode editar e salvar sem alterar o destinatário", async () => {
    render(<BillingObservation userId={uid} admin />);
    const input = await screen.findByLabelText("Observação", { exact: true });
    fireEvent.change(input, { target: { value: "Pagamento dividido conforme combinado." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação", exact: true }));
    await screen.findByText("Observação salva para este mentorado.");
    expect(mock.save).toHaveBeenCalledWith(uid, "Pagamento dividido conforme combinado.", 1);
  });
  it("membro vê sua mensagem sem controles de edição", async () => {
    render(<BillingObservation userId={uid} />);
    await screen.findByText("Vencimento combinado para dia 10.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar observação" })).not.toBeInTheDocument();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("mensagem vazia não ocupa espaço para o aluno", async () => {
    mock.get.mockResolvedValue(value(uid, "", 0));
    render(<BillingObservation userId={uid} />);
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
  });
  it("admin pode cadastrar observação mesmo sem mensagem anterior", async () => {
    mock.get.mockResolvedValue(value(uid, "", 0));
    render(<BillingObservation userId={uid} admin />);
    fireEvent.change(await screen.findByLabelText("Observação", { exact: true }), {
      target: { value: "Condição inicial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação" }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith(uid, "Condição inicial", 0));
  });
  it("confirma a remoção e salva somente texto vazio", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BillingObservation userId={uid} admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover observação" }));
    await screen.findByText("Observação removida.");
    expect(mock.save).toHaveBeenCalledWith(uid, "", 1);
    expect(screen.queryByRole("button", { name: "Remover observação" })).not.toBeInTheDocument();
  });
  it("cancelar a remoção mantém a mensagem", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BillingObservation userId={uid} admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover observação" }));
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("falha ou conflito ao salvar preserva o texto digitado", async () => {
    mock.save.mockRejectedValue(new Error("A observação mudou em outra aba."));
    render(<BillingObservation userId={uid} admin />);
    fireEvent.change(await screen.findByLabelText("Observação", { exact: true }), {
      target: { value: "Não perder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Observação", { exact: true })).toHaveValue("Não perder");
    expect(screen.queryByText("Observação salva para este mentorado.")).not.toBeInTheDocument();
  });
  it("troca de mentorado limpa imediatamente a mensagem e o rascunho anteriores", async () => {
    const { rerender } = render(<BillingObservation userId={uid} admin />);
    fireEvent.change(await screen.findByLabelText("Observação", { exact: true }), {
      target: { value: "Rascunho do A" },
    });
    mock.get.mockResolvedValue(value(other, "Mensagem do B", 2));
    rerender(<BillingObservation userId={other} admin />);
    expect(screen.queryByDisplayValue("Rascunho do A")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("Mensagem do B")).toBeInTheDocument();
    expect(mock.get).toHaveBeenLastCalledWith(other);
  });
  it("resposta atrasada de outro aluno não aparece na conta atual", async () => {
    let finish!: (result: ReturnType<typeof value>) => void;
    mock.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(<BillingObservation userId={uid} />);
    mock.get.mockResolvedValue(value(other, "Somente B"));
    rerender(<BillingObservation userId={other} />);
    await screen.findByText("Somente B");
    finish(value(uid, "Somente A"));
    await waitFor(() => expect(screen.queryByText("Somente A")).not.toBeInTheDocument());
  });
  it("exibe conteúdo como texto sem executar HTML", async () => {
    mock.get.mockResolvedValue(value(uid, '<img src=x onerror="alert(1)">\nOutra linha'));
    render(<BillingObservation userId={uid} />);
    await screen.findByText(/<img src=x/);
    expect(document.querySelector("img")).toBeNull();
  });
  it("atualizar a conta em segundo plano não apaga rascunho do admin", async () => {
    render(<BillingObservation userId={uid} admin />);
    fireEvent.change(await screen.findByLabelText("Observação", { exact: true }), {
      target: { value: "Rascunho" },
    });
    fireEvent(window, new Event("focus"));
    expect(mock.get).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Observação", { exact: true })).toHaveValue("Rascunho");
  });
  it("erro de leitura oferece tentar novamente sem expor controles de salvar", async () => {
    mock.get.mockRejectedValueOnce(new Error("Sem acesso"));
    render(<BillingObservation userId={uid} admin />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recarregar observação" }));
    await screen.findByLabelText("Observação", { exact: true });
  });
});
