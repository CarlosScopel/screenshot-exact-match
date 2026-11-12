import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "@/components/portal/AdminPage";
import { APPLICATION_PENDING } from "@/lib/approval";
import { createDemoPortalData } from "@/lib/demo";
import type { Row } from "@/lib/portal";

const mock = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), review: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
vi.mock("@/lib/admin.functions", () => ({
  inviteMentee: vi.fn(),
  resendInvite: vi.fn(),
  deleteMentee: vi.fn(),
  reviewMentee: mock.review,
}));
vi.mock("@/lib/media", () => ({ uploadMaterial: vi.fn(), uploadMedia: vi.fn() }));
vi.mock("@/components/portal/MentorshipPanel", () => ({
  MentorshipPanel: ({ userId }: { userId: string }) => (
    <section aria-label="Plano e pagamentos" data-user-id={userId}>
      Plano do mentorado selecionado
    </section>
  ),
}));
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
] as const;
function profile(id: string, full_name: string, email: string, pending = false): Row<"profiles"> {
  return {
    id,
    full_name,
    email,
    status: pending ? "suspended" : "active",
    admin_notes: pending ? APPLICATION_PENDING : null,
    access_expires_at: null,
    last_seen_at: null,
    avatar_url: null,
    created_at: "2026-11-12T12:00:00Z",
  };
}
function mount() {
  const data = createDemoPortalData();
  data.profiles = [
    profile(ids[0], "Ana Teste", "ana@example.invalid"),
    profile(ids[1], "Bruno Teste", "bruno@example.invalid"),
    profile(ids[2], "Carla Pendente", "carla@example.invalid", true),
  ];
  const props = {
    data,
    reload: vi.fn(async () => {}),
    go: vi.fn(),
    settings: null,
    refreshSettings: vi.fn(async () => {}),
  };
  render(<AdminPage page="mentees" {...props} />);
  return props;
}
function manage(email: string) {
  const row = screen.getByText(email).closest("tr");
  if (!row) throw new Error("Mentorado não encontrado na tabela");
  fireEvent.click(within(row).getByRole("button", { name: "Gerenciar" }));
}
function expectGeneralList() {
  expect(screen.getByRole("heading", { name: "Mentorados", level: 1 })).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Solicitações aguardando aprovação" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enviar convite" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Nome do mentorado")).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
}
function expectOnlySelected(id: string) {
  expect(
    screen.queryByRole("region", { name: "Solicitações aguardando aprovação" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enviar convite" })).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText("Nome do mentorado")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Plano e pagamentos" })).toHaveAttribute(
    "data-user-id",
    id,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.from.mockReturnValue({ update: mock.update });
  mock.update.mockReturnValue({ eq: mock.eq });
  mock.eq.mockResolvedValue({ error: null });
  mock.review.mockResolvedValue({ ok: true, needsPasswordEmail: false });
});
afterEach(cleanup);

describe("Gestão individual de mentorados", () => {
  it("mantém aprovações, convites e tabela na visão geral", () => {
    mount();
    expectGeneralList();
    expect(screen.queryByRole("region", { name: "Plano e pagamentos" })).not.toBeInTheDocument();
  });
  it("oculta a visão geral ao gerenciar um mentorado", () => {
    mount();
    manage("ana@example.invalid");
    expectOnlySelected(ids[0]);
    expect(screen.getByRole("heading", { name: "Gerenciar Ana Teste" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.invalid")).toBeInTheDocument();
    expect(screen.queryByText("bruno@example.invalid")).not.toBeInTheDocument();
    expect(screen.queryByText("Carla Pendente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar mentorado" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Acesso individual aos treinamentos" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Turmas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar acesso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir mentorado" })).toBeInTheDocument();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("volta para a lista e abre outro mentorado sem misturar os dados", () => {
    mount();
    manage("ana@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos mentorados" }));
    expectGeneralList();
    expect(screen.queryByRole("region", { name: "Plano e pagamentos" })).not.toBeInTheDocument();
    manage("bruno@example.invalid");
    expectOnlySelected(ids[1]);
    expect(screen.getByDisplayValue("Bruno Teste")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Ana Teste")).not.toBeInTheDocument();
    expect(screen.queryByText("ana@example.invalid")).not.toBeInTheDocument();
  });
  it("preserva a gravação do perfil e mantém somente o mentorado selecionado", async () => {
    const props = mount();
    manage("ana@example.invalid");
    fireEvent.change(screen.getByDisplayValue("Ana Teste"), {
      target: { value: "Ana Atualizada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar mentorado" }));
    await waitFor(() => expect(props.reload).toHaveBeenCalled());
    expect(mock.from).toHaveBeenCalledWith("profiles");
    expect(mock.update).toHaveBeenCalledWith({ full_name: "Ana Atualizada", status: "active" });
    expect(mock.eq).toHaveBeenCalledWith("id", ids[0]);
    expectOnlySelected(ids[0]);
  });
  it("não leva avisos da lista para dentro de outro cadastro", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar", exact: false } as never));
    await screen.findByText("Acesso aprovado! O mentorado poderá entrar após criar sua senha.");
    manage("ana@example.invalid");
    expect(
      screen.queryByText("Acesso aprovado! O mentorado poderá entrar após criar sua senha."),
    ).not.toBeInTheDocument();
    expectOnlySelected(ids[0]);
  });
});
