import { Blob as NodeBlob } from "node:buffer";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonFiles } from "@/components/portal/LessonFiles";
import { loadMaterialPreview, materialPreviewType } from "@/lib/material-preview";
import type { Tables } from "@/integrations/supabase/types";

const mock = vi.hoisted(() => ({ from: vi.fn(), download: vi.fn(), open: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: mock.from } } }));
vi.mock("@/lib/media", () => ({ openMaterial: mock.open }));
const OriginalURL = globalThis.URL;
const pdf = () => new Blob(["%PDF-1.7\nTest document"], { type: "application/octet-stream" });
function material(id: string, extension: string): Tables<"lesson_materials"> {
  return { id, lesson_id: "lesson-1", title: `Material ${id}`, file_path: `lesson/lesson-1/${id}.${extension}`, url: null, position: 0, created_at: "2026-11-12T00:00:00Z" };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("URL", class extends OriginalURL {
    static createObjectURL = mock.create;
    static revokeObjectURL = mock.revoke;
  });
  mock.from.mockReturnValue({ download: mock.download });
  mock.download.mockResolvedValue({ data: pdf(), error: null });
  mock.open.mockResolvedValue(undefined);
  let number = 0;
  mock.create.mockImplementation(() => `blob:preview-${++number}`);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Tipos e acesso privado aos arquivos de aula", () => {
  it.each([
    ["pdf", "pdf"], ["PDF", "pdf"], ["png", "image"], ["jpeg", "image"],
    ["webp", "image"], ["txt", "text"], ["md", "text"], ["csv", "text"],
    ["mp3", "audio"], ["mp4", "video"],
  ])("reconhece %s para visualização %s", (extension, kind) => {
    expect(materialPreviewType(`lesson/id/arquivo.${extension}`)?.kind).toBe(kind);
  });
  it.each(["lesson/id/file.html", "lesson/id/file.svg", "lesson/id/file.docx", "lesson/id/file.zip", "https://example.com/file.pdf", null])("não incorpora formato ou endereço não permitido: %s", (path) => {
    expect(materialPreviewType(path)).toBeNull();
  });
  it("busca no bucket privado, com as permissões da sessão, e normaliza o tipo PDF", async () => {
    const result = await loadMaterialPreview("lesson/id/test.pdf");
    expect(mock.from).toHaveBeenCalledWith("materials");
    expect(mock.download).toHaveBeenCalledWith("lesson/id/test.pdf");
    expect(result.kind).toBe("pdf");
    if (result.kind !== "text") expect(result.blob.type).toBe("application/pdf");
    expect(mock.open).not.toHaveBeenCalled();
  });
  it("não tenta buscar formatos sem visualização", async () => {
    await expect(loadMaterialPreview("lesson/id/archive.zip")).rejects.toThrow("formato");
    expect(mock.download).not.toHaveBeenCalled();
  });
  it("não renderiza HTML renomeado como PDF", async () => {
    mock.download.mockResolvedValue({ data: new Blob(["<script>alert(1)</script>"]), error: null });
    await expect(loadMaterialPreview("lesson/id/test.pdf")).rejects.toThrow("PDF válido");
  });
  it("respeita o bloqueio de acesso e não tenta contornar as permissões", async () => {
    mock.download.mockResolvedValue({ data: null, error: new Error("RLS denied") });
    await expect(loadMaterialPreview("lesson/id/test.pdf")).rejects.toThrow("Verifique seu acesso");
    expect(mock.download).toHaveBeenCalledTimes(1);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("limita textos grandes antes de tentar renderizá-los", async () => {
    mock.download.mockResolvedValue({ data: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), error: null });
    await expect(loadMaterialPreview("lesson/id/test.txt")).rejects.toThrow("muito grande");
  });
});

describe("Visualizador de arquivos do mentorado", () => {
  it("abre PDF automaticamente na aula sem acionar download manual", async () => {
    const { unmount } = render(<LessonFiles materials={[material("one", "pdf")]} />);
    const object = await screen.findByTitle("Visualização de Material one");
    expect(object).toHaveAttribute("data", "blob:preview-1");
    expect(object).toHaveAttribute("type", "application/pdf");
    expect(screen.getByRole("link", { name: "Abrir em nova aba" })).toHaveAttribute("href", "blob:preview-1");
    expect(mock.open).not.toHaveBeenCalled();
    unmount();
    expect(mock.revoke).toHaveBeenCalledWith("blob:preview-1");
  });
  it("mantém o download separado da prévia", async () => {
    render(<LessonFiles materials={[material("one", "pdf")]} />);
    await screen.findByTitle("Visualização de Material one");
    fireEvent.click(screen.getByRole("button", { name: "Baixar arquivo" }));
    await waitFor(() => expect(mock.open).toHaveBeenCalledWith("lesson/lesson-1/one.pdf"));
  });
  it("mostra texto como texto, sem executar HTML", async () => {
    mock.download.mockResolvedValue({ data: new Blob(["<script>alert(1)</script>\nAula em texto"]), error: null });
    const { container } = render(<LessonFiles materials={[material("text", "txt")]} />);
    expect(await screen.findByLabelText("Conteúdo de Material text")).toHaveTextContent("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("permite escolher outro arquivo e libera a memória da prévia anterior", async () => {
    render(<LessonFiles materials={[material("one", "pdf"), material("two", "png")]} />);
    await screen.findByTitle("Visualização de Material one");
    mock.download.mockResolvedValue({ data: new Blob(["image bytes"]), error: null });
    fireEvent.change(screen.getByRole("combobox", { name: "Arquivo da aula" }), { target: { value: "two" } });
    expect(await screen.findByRole("img", { name: "Material two" })).toHaveAttribute("src", "blob:preview-2");
    expect(screen.queryByTitle("Visualização de Material one")).not.toBeInTheDocument();
    expect(mock.revoke).toHaveBeenCalledWith("blob:preview-1");
  });
  it("prefere um arquivo visualizável quando o primeiro é um ZIP", async () => {
    render(<LessonFiles materials={[material("zip", "zip"), material("pdf", "pdf")]} />);
    await screen.findByTitle("Visualização de Material pdf");
    expect(mock.download).toHaveBeenCalledWith("lesson/lesson-1/pdf.pdf");
  });
  it("mantém download e explica formatos não suportados sem enviar a terceiros", () => {
    render(<LessonFiles materials={[material("doc", "docx")]} />);
    expect(screen.getByText(/não possui visualização integrada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar arquivo" })).toBeEnabled();
    expect(mock.download).not.toHaveBeenCalled();
  });
  it("permite tentar novamente após uma falha de acesso", async () => {
    mock.download.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    render(<LessonFiles materials={[material("one", "pdf")]} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByTitle("Visualização de Material one");
    expect(mock.download).toHaveBeenCalledTimes(2);
  });
  it("não recria URL de arquivo que terminou de carregar depois de sair da aula", async () => {
    let resolve: (value: { data: Blob; error: null }) => void = () => {};
    mock.download.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { unmount } = render(<LessonFiles materials={[material("one", "pdf")]} />);
    unmount();
    resolve({ data: pdf(), error: null });
    await new Promise((done) => setTimeout(done, 0));
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("mantém links externos fora do visualizador privado", () => {
    render(<LessonFiles materials={[{ ...material("link", "pdf"), file_path: null, url: "https://example.com/material" }]} />);
    expect(screen.getByRole("link", { name: "Abrir material" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(mock.download).not.toHaveBeenCalled();
  });
});
