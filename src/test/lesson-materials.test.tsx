import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "@/components/portal/AdminPage";
import { createDemoPortalData } from "@/lib/demo";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  single: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
vi.mock("@/lib/admin.functions", () => ({
  inviteMentee: vi.fn(),
  resendInvite: vi.fn(),
  deleteMentee: vi.fn(),
  reviewMentee: vi.fn(),
}));
vi.mock("@/lib/media", () => ({ uploadMaterial: mock.upload, uploadMedia: vi.fn() }));
const newLessonId = "11111111-1111-4111-8111-111111111111";
const file = () => new File(["material de teste"], "guia.pdf", { type: "application/pdf" });

function openModule(data = createDemoPortalData()) {
  const props = {
    data,
    reload: vi.fn(async () => {}),
    go: vi.fn(),
    settings: null,
    refreshSettings: vi.fn(async () => {}),
  };
  const view = render(<AdminPage page="manage-trainings" {...props} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
  fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]!);
  return { props, view };
}
function selectLesson(id: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Aula do material" }), {
    target: { value: id },
  });
}
function chooseFile(selected = file(), forcedLesson?: string) {
  const input = screen.getByLabelText("Arquivo");
  fireEvent.change(input, { target: { files: [selected] } });
  const NativeFormData = globalThis.FormData;
  // jsdom does not serialize synthetic input.files; preserve native text/select serialization.
  vi.stubGlobal(
    "FormData",
    class extends NativeFormData {
      constructor(form?: HTMLFormElement) {
        super(form);
        if (form?.contains(input)) {
          this.set("file", selected);
          if (forcedLesson !== undefined) this.set("lesson", forcedLesson);
        }
      }
    },
  );
  return selected;
}
function submitMaterial() {
  fireEvent.submit(screen.getByRole("form", { name: "Enviar material da aula" }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.single.mockResolvedValue({ data: { id: newLessonId }, error: null });
  const q = { upsert: mock.upsert, select: vi.fn(), single: mock.single };
  mock.upsert.mockReturnValue(q);
  q.select.mockReturnValue(q);
  mock.insert.mockResolvedValue({ error: null });
  mock.from.mockImplementation((table: string) =>
    table === "lessons" ? q : { insert: mock.insert },
  );
  mock.upload.mockImplementation(
    async (_file: File, _scope: string, id: string) => `lesson/${id}/guia.pdf`,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Materiais complementares: seleção e envio", () => {
  it("desativa a seleção vazia e oferece criar a primeira aula", () => {
    const data = createDemoPortalData();
    data.lessons = [];
    openModule(data);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByLabelText("Arquivo")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
    expect(screen.getByText(/Este módulo ainda não tem aulas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar primeira aula" }));
    expect(screen.getByLabelText("Título da aula")).toHaveFocus();
    expect(mock.upload).not.toHaveBeenCalled();
  });

  it("cria a primeira aula, seleciona o registro salvo e envia o arquivo para essa aula", async () => {
    const data = createDemoPortalData();
    const lesson = {
      ...data.lessons[0]!,
      id: newLessonId,
      title: "Aula de SPY",
      status: "draft" as const,
    };
    data.lessons = [];
    const { props, view } = openModule(data);
    props.reload.mockImplementation(async () => {
      props.data = { ...props.data, lessons: [lesson] };
      view.rerender(<AdminPage page="manage-trainings" {...props} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar primeira aula" }));
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: lesson.title } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue(newLessonId),
    );
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: lesson.title, module_id: "demo-module-1" }),
    );
    const selected = chooseFile();
    submitMaterial();
    await screen.findByText("Material adicionado.");
    expect(mock.upload).toHaveBeenCalledWith(selected, "lesson", newLessonId);
    expect(mock.insert).toHaveBeenCalledWith({
      lesson_id: newLessonId,
      title: "guia.pdf",
      file_path: `lesson/${newLessonId}/guia.pdf`,
    });
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue(newLessonId);
  });

  it("permite escolher entre várias aulas e preserva a escolha após o envio", async () => {
    openModule();
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeDisabled();
    selectLesson("demo-lesson-2");
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "Meu material" },
    });
    chooseFile();
    submitMaterial();
    await screen.findByText("Material adicionado.");
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: "demo-lesson-2", title: "Meu material" }),
    );
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue("demo-lesson-2");
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("");
  });

  it("seleciona automaticamente a única aula disponível", () => {
    const data = createDemoPortalData();
    data.lessons = [data.lessons[0]!];
    openModule(data);
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue("demo-lesson-1");
    expect(screen.getByRole("button", { name: "Enviar arquivo" })).toBeEnabled();
  });

  it.each(["", "demo-lesson-3"])(
    "não envia para uma aula ausente ou de outro módulo: %s",
    async (id) => {
      openModule();
      chooseFile(file(), id);
      submitMaterial();
      await screen.findByText(/Crie ou selecione uma aula deste módulo/);
      expect(mock.upload).not.toHaveBeenCalled();
      expect(mock.insert).not.toHaveBeenCalled();
    },
  );

  it("mantém os campos e permite tentar novamente quando o armazenamento recusa o arquivo", async () => {
    openModule();
    selectLesson("demo-lesson-2");
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "Preservar título" },
    });
    chooseFile();
    mock.upload.mockRejectedValueOnce(new Error("Upload indisponível"));
    submitMaterial();
    await screen.findByText(/Upload indisponível/);
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("Preservar título");
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue("demo-lesson-2");
    expect(mock.insert).not.toHaveBeenCalled();
    submitMaterial();
    await screen.findByText("Material adicionado.");
    expect(mock.upload).toHaveBeenCalledTimes(2);
  });

  it("não exibe sucesso quando o banco recusa a referência do material", async () => {
    openModule();
    selectLesson("demo-lesson-1");
    chooseFile();
    mock.insert.mockResolvedValueOnce({ error: new Error("Referência recusada") });
    submitMaterial();
    await screen.findByText(/Referência recusada/);
    expect(screen.queryByText("Material adicionado.")).not.toBeInTheDocument();
  });

  it("seleciona a nova aula salva mesmo quando outra estava selecionada", async () => {
    const { props, view } = openModule();
    selectLesson("demo-lesson-1");
    const lesson = { ...props.data.lessons[0]!, id: newLessonId, title: "Nova aula" };
    props.reload.mockImplementation(async () => {
      props.data = { ...props.data, lessons: [...props.data.lessons, lesson] };
      view.rerender(<AdminPage page="manage-trainings" {...props} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: lesson.title } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue(newLessonId),
    );
  });

  it("limpa o formulário ao trocar de módulo e lista somente as aulas dele", () => {
    openModule();
    selectLesson("demo-lesson-2");
    fireEvent.change(screen.getByPlaceholderText("Título do material"), {
      target: { value: "Não reutilizar" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Módulos" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]!);
    expect(screen.getByRole("combobox", { name: "Aula do material" })).toHaveValue("demo-lesson-3");
    expect(
      screen.queryByRole("option", { name: "Organizando sua Jornada" }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Título do material")).toHaveValue("");
  });
});
