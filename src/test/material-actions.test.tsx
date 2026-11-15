import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonMaterialActions } from "@/components/portal/LessonMaterialActions";
const mock = vi.hoisted(() => ({ edit: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/content-admin.functions", () => ({
  editLessonMaterial: mock.edit,
  deleteLessonMaterial: mock.remove,
}));
const material = {
  id: "11111111-1111-4111-8111-111111111111",
  lesson_id: "22222222-2222-4222-8222-222222222222",
  title: "Guia PDF",
  file_path: "lesson/id/file.pdf",
  url: null,
  position: 0,
  created_at: "2026-11-15T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.edit.mockResolvedValue({ id: material.id });
  mock.remove.mockResolvedValue({ id: material.id });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Materiais: controles administrativos", () => {
  it("permite salvar título e ordem preservando o arquivo", async () => {
    const reload = vi.fn(async () => {});
    render(<LessonMaterialActions material={material} reload={reload} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Título do material"), {
      target: { value: "Guia atualizado" },
    });
    fireEvent.change(screen.getByLabelText("Ordem do material"), { target: { value: "2" } });
    fireEvent.submit(screen.getByRole("form", { name: "Editar material" }));
    await screen.findByText("Material atualizado.");
    expect(mock.edit).toHaveBeenCalledWith({
      data: {
        id: material.id,
        lessonId: material.lesson_id,
        title: "Guia atualizado",
        position: 2,
        url: null,
      },
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("permite editar endereço somente para material de link", () => {
    render(
      <LessonMaterialActions
        material={{ ...material, file_path: null, url: "https://example.test" }}
        reload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Link do material")).toHaveValue("https://example.test");
  });
  it("cancelar edição não salva", () => {
    render(<LessonMaterialActions material={material} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edição" }));
    expect(mock.edit).not.toHaveBeenCalled();
  });
  it("cancelar exclusão não altera backend", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LessonMaterialActions material={material} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("exclusão confirmada informa aula e atualiza lista", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const reload = vi.fn(async () => {});
    render(<LessonMaterialActions material={material} reload={reload} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Material excluído.");
    expect(mock.remove).toHaveBeenCalledWith({
      data: { id: material.id, lessonId: material.lesson_id },
    });
    expect(reload).toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("todos os alunos"));
  });
  it("falha não apaga a linha nem perde texto editado", async () => {
    mock.edit.mockRejectedValue(new Error("Sem conexão"));
    render(<LessonMaterialActions material={material} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Título do material"), {
      target: { value: "Texto novo" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Editar material" }));
    await screen.findByText("Sem conexão");
    expect(screen.getByLabelText("Título do material")).toHaveValue("Texto novo");
  });
  it("trava os controles enquanto exclui", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mock.remove.mockImplementation(() => new Promise(() => {}));
    render(<LessonMaterialActions material={material} reload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toBeDisabled());
  });
});
