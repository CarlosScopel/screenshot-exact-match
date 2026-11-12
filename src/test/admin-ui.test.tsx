import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "@/components/portal/AdminPage";
import { createDemoPortalData } from "@/lib/demo";
import { APPLICATION_PENDING } from "@/lib/approval";
const mock = vi.hoisted(() => ({ from: vi.fn(), review: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
vi.mock("@/lib/admin.functions", () => ({
  reviewMentee: mock.review,
  inviteMentee: vi.fn(),
  resendInvite: vi.fn(),
  deleteMentee: vi.fn(),
}));
vi.mock("@/lib/media", () => ({ uploadMaterial: mock.upload, uploadMedia: vi.fn() }));
const uid = "11111111-1111-4111-8111-111111111111";
const reload = vi.fn(async () => {});
function query(result = { data: { id: uid }, error: null as Error | null }) {
  type Query = {
    insert: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (resolve: (value: typeof result) => unknown) => Promise<unknown>;
  };
  const q: Query = {
    insert: vi.fn(() => q),
    upsert: vi.fn(() => q),
    update: vi.fn(() => q),
    eq: vi.fn(() => q),
    select: vi.fn(() => q),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return q;
}
const props = () => ({
  data: createDemoPortalData(),
  reload,
  go: vi.fn(),
  settings: null,
  refreshSettings: vi.fn(async () => {}),
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.review.mockResolvedValue({ ok: true, needsPasswordEmail: false });
  mock.upload.mockResolvedValue(`library/${uid}/teste.pdf`);
  mock.from.mockImplementation(() => query());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Painel administrativo com persistência simulada (sem dados reais)", () => {
  it("cria e publica um treinamento pelo formulário", async () => {
    const q = query();
    mock.from.mockReturnValue(q);
    render(<AdminPage page="manage-trainings" {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Novo treinamento" }));
    fireEvent.change(screen.getByLabelText("Título", { exact: true }), {
      target: { value: "Treinamento de teste" },
    });
    fireEvent.change(screen.getByLabelText("Status", { exact: true }), {
      target: { value: "published" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mock.from).toHaveBeenCalledWith("trainings");
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Treinamento de teste",
        status: "published",
        position: 0,
        published_at: expect.any(String),
      }),
    );
  });
  it("mostra erro sem fechar o formulário quando o banco rejeita a gravação", async () => {
    mock.from.mockReturnValue(
      query({ data: { id: uid }, error: new Error("Falha controlada no banco") }),
    );
    render(<AdminPage page="manage-trainings" {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Novo treinamento" }));
    fireEvent.change(screen.getByLabelText("Título", { exact: true }), {
      target: { value: "Teste" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Falha controlada no banco");
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título", { exact: true })).toHaveValue("Teste");
  });
  it("permite cadastrar uma aula no módulo selecionado", async () => {
    const q = query();
    mock.from.mockReturnValue(q);
    render(<AdminPage page="manage-trainings" {...props()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Título da aula"), {
      target: { value: "Aula de teste" },
    });
    fireEvent.change(screen.getByLabelText("URL HTTPS do vídeo"), {
      target: { value: "https://example.test/aula.mp4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mock.from).toHaveBeenCalledWith("lessons");
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Aula de teste",
        module_id: "demo-module-1",
        video_url: "https://example.test/aula.mp4",
        status: "draft",
      }),
    );
  });
  it("envia material como rascunho privado e grava a referência do arquivo", async () => {
    const insert = query(),
      update = query();
    mock.from.mockReturnValueOnce(insert).mockReturnValueOnce(update);
    render(<AdminPage page="manage-library" {...props()} />);
    const file = new File(["conteúdo de teste"], "teste.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Arquivo privado");
    fireEvent.change(input, { target: { files: [file] } });
    // jsdom does not serialize a synthetic input.files assignment into FormData.
    // Preserve native FormData for text fields, explicitly supplying the selected test file.
    const NativeFormData = globalThis.FormData;
    vi.stubGlobal(
      "FormData",
      class extends NativeFormData {
        constructor(form?: HTMLFormElement) {
          super(form);
          if (form?.contains(input)) this.set("file", file);
        }
      },
    );
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(/Arquivo enviado como rascunho/);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft", kind: "file", file_name: "teste.pdf" }),
    );
    expect(mock.upload).toHaveBeenCalledWith(file, "library", uid);
    expect(update.update).toHaveBeenCalledWith({ file_path: `library/${uid}/teste.pdf` });
  });
  it("aprova uma solicitação pelo botão do painel", async () => {
    const p = props();
    p.data.profiles.push({
      id: uid,
      full_name: "Aluno Teste",
      email: "aluno@example.test",
      status: "suspended",
      admin_notes: APPLICATION_PENDING,
      access_expires_at: null,
      last_seen_at: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
    });
    render(<AdminPage page="mentees" {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mock.review).toHaveBeenCalledWith({ data: { userId: uid, decision: "approve" } });
  });
  it("não recusa um mentorado se o administrador cancelar a confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const p = props();
    p.data.profiles.push({
      id: uid,
      full_name: "Aluno Teste",
      email: "aluno@example.test",
      status: "suspended",
      admin_notes: APPLICATION_PENDING,
      access_expires_at: null,
      last_seen_at: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
    });
    render(<AdminPage page="mentees" {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(mock.review).not.toHaveBeenCalled();
  });
});

describe("Materiais complementares no módulo selecionado", () => {
  beforeEach(() => {
    reload.mockImplementation(async () => {});
    mock.upload.mockImplementation(
      async (_file: File, scope: string, id: string) => `${scope}/${id}/checklist.pdf`,
    );
  });
  function openMaterials(empty = false) {
    const p = props();
    if (empty) p.data.lessons = p.data.lessons.filter((l) => l.module_id !== "demo-module-1");
    const view = render(<AdminPage page="manage-trainings" {...p} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
    return { p, view };
  }
  function attachFile() {
    const file = new File(["material de teste"], "checklist.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Arquivo");
    fireEvent.change(input, { target: { files: [file] } });
    const NativeFormData = globalThis.FormData;
    vi.stubGlobal(
      "FormData",
      class extends NativeFormData {
        constructor(form?: HTMLFormElement) {
          super(form);
          if (form?.contains(input)) this.set("file", file);
        }
      },
    );
    return { file, form: input.closest("form")! };
  }
  it("oferece criar a primeira aula, em vez de deixar um seletor vazio clicável", () => {
    openMaterials(true);
    expect(screen.getByLabelText("Aula do material")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
    expect(screen.getByLabelText("Arquivo")).toBeDisabled();
    expect(screen.getByText(/Este módulo ainda não tem aulas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar aula neste módulo" }));
    expect(
      screen.getByRole("heading", { name: "Criar aula para anexar material" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Título da aula")).toBeInTheDocument();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("cria uma aula em rascunho no módulo, seleciona e permite anexar o material", async () => {
    const q = query();
    mock.from.mockReturnValue(q);
    const { p, view } = openMaterials(true);
    reload.mockImplementationOnce(async () => {
      p.data = {
        ...p.data,
        lessons: [
          ...p.data.lessons,
          {
            ...createDemoPortalData().lessons[0]!,
            id: uid,
            module_id: "demo-module-1",
            title: "Aula para material",
            status: "draft",
          },
        ],
      };
      view.rerender(<AdminPage page="manage-trainings" {...p} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula neste módulo" }));
    fireEvent.change(screen.getByLabelText("Título da aula"), {
      target: { value: "Aula para material" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(screen.getByLabelText("Aula do material")).toHaveValue(uid));
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        module_id: "demo-module-1",
        title: "Aula para material",
        status: "draft",
        video_url: null,
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Criar aula para anexar material" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeEnabled();
    const { file, form } = attachFile();
    fireEvent.submit(form);
    await screen.findByText("Material adicionado.");
    expect(mock.upload).toHaveBeenCalledWith(file, "lesson", uid);
    expect(q.insert).toHaveBeenCalledWith({
      lesson_id: uid,
      title: "checklist.pdf",
      file_path: `lesson/${uid}/checklist.pdf`,
    });
    expect(screen.getByLabelText("Aula do material")).toHaveValue(uid);
  });
  it("mantém a criação aberta quando o banco rejeita a nova aula", async () => {
    mock.from.mockReturnValue(
      query({ data: { id: uid }, error: new Error("Não foi possível criar a aula") }),
    );
    openMaterials(true);
    fireEvent.click(screen.getByRole("button", { name: "Criar aula neste módulo" }));
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Nova aula" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Não foi possível criar a aula");
    expect(screen.getByLabelText("Título da aula")).toHaveValue("Nova aula");
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("lista apenas as aulas do módulo e exige seleção antes de enviar", async () => {
    openMaterials();
    const select = screen.getByLabelText("Aula do material");
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Organizando sua Jornada" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Estrutura de uma Operação" }),
    ).not.toBeInTheDocument();
    const { form } = attachFile();
    fireEvent.submit(form);
    await screen.findByText(/Selecione uma aula deste módulo antes de enviar/);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("anexa à aula selecionada e preserva a seleção após o envio", async () => {
    const q = query();
    mock.from.mockReturnValue(q);
    openMaterials();
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: "demo-lesson-2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "  Checklist  " },
    });
    const { file, form } = attachFile();
    fireEvent.submit(form);
    await screen.findByText("Material adicionado.");
    expect(mock.upload).toHaveBeenCalledWith(file, "lesson", "demo-lesson-2");
    expect(q.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: "demo-lesson-2", title: "Checklist" }),
    );
    expect(screen.getByLabelText("Aula do material")).toHaveValue("demo-lesson-2");
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("");
  });
  it("mantém os dados preenchidos para tentar novamente se o upload falhar", async () => {
    mock.upload.mockRejectedValueOnce(new Error("Upload indisponível"));
    openMaterials();
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: "demo-lesson-2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "Meu material" },
    });
    const { form } = attachFile();
    fireEvent.submit(form);
    await screen.findByText(/Upload indisponível/);
    expect(screen.getByLabelText("Aula do material")).toHaveValue("demo-lesson-2");
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("Meu material");
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeEnabled();
    expect(mock.from).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await screen.findByText("Material adicionado.");
  });
  it("descarta a seleção anterior ao trocar de módulo e seleciona sua única aula", () => {
    openMaterials();
    fireEvent.change(screen.getByLabelText("Aula do material"), {
      target: { value: "demo-lesson-2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "Outro módulo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Módulos" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]!);
    expect(screen.getByLabelText("Aula do material")).toHaveValue("demo-lesson-3");
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("");
    expect(
      screen.queryByRole("option", { name: "Organizando sua Jornada" }),
    ).not.toBeInTheDocument();
  });
});
