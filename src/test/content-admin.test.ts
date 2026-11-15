import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), remove: vi.fn(), bucket: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mock.from, storage: { from: mock.bucket } },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    type Builder = {
      middleware: () => Builder;
      inputValidator: (parser: typeof validate) => Builder;
      handler: (
        handler: (args: { data: unknown; context: unknown }) => unknown,
      ) => (args: { data: unknown; context: unknown }) => unknown;
    };
    const builder: Builder = {
      middleware: () => builder,
      inputValidator: (parser) => {
        validate = parser;
        return builder;
      },
      handler: (handler) => (args) => handler({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
import {
  deleteExclusiveRecording,
  editExclusiveRecording,
  deleteLessonMaterial,
  editLessonMaterial,
} from "@/lib/content-admin.functions";
const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const lessonId = "33333333-3333-4333-8333-333333333333";
const adminId = "44444444-4444-4444-8444-444444444444";
const recordingPath = `${userId}/${id}/recording.mp4`;
function query(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "update", "delete", "eq", "neq", "limit"])
    q[method] = vi.fn(() => q);
  q["maybeSingle"] = vi.fn(async () => result);
  q["then"] = vi.fn((resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve),
  );
  return q;
}
const run = async (fn: unknown, data: unknown) =>
  (fn as (args: { data: unknown; context: unknown }) => Promise<unknown>)({
    data,
    context: {
      userId: adminId,
      supabase: { rpc: mock.rpc, from: mock.from, storage: { from: mock.bucket } },
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.bucket.mockReturnValue({ remove: mock.remove });
  mock.remove.mockResolvedValue({ data: [], error: null });
});
const changes = {
  id,
  userId,
  title: "Call revisada",
  description: "Novas informações",
  recordedOn: "2026-11-15",
};
describe("Administração de publicações — handlers com backend simulado", () => {
  it.each([
    [editExclusiveRecording, changes],
    [deleteExclusiveRecording, { id, userId }],
    [editLessonMaterial, { id, lessonId, title: "Guia", position: 1, url: null }],
    [deleteLessonMaterial, { id, lessonId }],
  ])("nega edição/exclusão a uma conta sem papel admin", async (fn, args) => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    await expect(run(fn, args)).rejects.toThrow("Somente administradores");
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("falha fechada se a consulta da permissão tiver erro", async () => {
    mock.rpc.mockResolvedValue({ data: true, error: { message: "offline" } });
    await expect(run(deleteExclusiveRecording, { id, userId })).rejects.toThrow(
      "Somente administradores",
    );
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("altera apenas metadados, limitada ao ID e destinatário", async () => {
    const q = query({ data: { id }, error: null });
    mock.from.mockReturnValue(q);
    await expect(
      run(editExclusiveRecording, { ...changes, title: "  Call revisada  " }),
    ).resolves.toEqual({ id });
    expect(q["update"]).toHaveBeenCalledWith({
      title: "Call revisada",
      description: changes.description,
      recorded_on: changes.recordedOn,
    });
    expect(q["eq"]).toHaveBeenCalledWith("id", id);
    expect(q["eq"]).toHaveBeenCalledWith("user_id", userId);
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it.each(["2026-02-30", "invalid", "2026-13-01"])(
    "rejeita a data impossível %s",
    async (recordedOn) => {
      await expect(run(editExclusiveRecording, { ...changes, recordedOn })).rejects.toThrow();
      expect(mock.from).not.toHaveBeenCalled();
    },
  );
  it("rejeita destino de arquivo injetado no pedido", async () => {
    await expect(
      run(deleteExclusiveRecording, { id, userId, file_path: "another/file.mp4" }),
    ).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("não informa sucesso quando não houve registro editado", async () => {
    mock.from.mockReturnValue(query({ data: null, error: null }));
    await expect(run(editExclusiveRecording, changes)).rejects.toThrow("não encontrada");
  });
  it("exclui só o arquivo validado e depois o cadastro da call", async () => {
    const read = query({
      data: { id, user_id: userId, file_path: recordingPath, mime_type: "video/mp4" },
      error: null,
    });
    const remove = query({ data: { id }, error: null });
    mock.from.mockReturnValueOnce(read).mockReturnValueOnce(remove);
    await expect(run(deleteExclusiveRecording, { id, userId })).resolves.toEqual({ id });
    expect(mock.bucket).toHaveBeenCalledWith("mentorship-recordings");
    expect(mock.remove).toHaveBeenCalledWith([recordingPath]);
    expect(remove["eq"]).toHaveBeenCalledWith("user_id", userId);
    expect(remove["eq"]).toHaveBeenCalledWith("file_path", recordingPath);
    expect(mock.remove.mock.invocationCallOrder[0]).toBeLessThan(
      remove["delete"]!.mock.invocationCallOrder[0]!,
    );
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
  it("preserva cadastro se o Storage recusar a exclusão", async () => {
    const q = query({ data: { file_path: recordingPath, mime_type: "video/mp4" }, error: null });
    mock.from.mockReturnValue(q);
    mock.remove.mockResolvedValue({ error: { message: "denied" } });
    await expect(run(deleteExclusiveRecording, { id, userId })).rejects.toThrow("mantida");
    expect(q["delete"]).not.toHaveBeenCalled();
  });
  it("informa exclusão parcial sem afirmar sucesso se o banco falhar", async () => {
    mock.from
      .mockReturnValueOnce(
        query({ data: { file_path: recordingPath, mime_type: "video/mp4" }, error: null }),
      )
      .mockReturnValueOnce(query({ data: null, error: { message: "db failure" } }));
    await expect(run(deleteExclusiveRecording, { id, userId })).rejects.toThrow(
      "vídeo foi removido",
    );
  });
  it("recusa call de outro aluno sem tocar em arquivos", async () => {
    mock.from.mockReturnValue(query({ data: null, error: null }));
    await expect(run(deleteExclusiveRecording, { id, userId })).rejects.toThrow("não encontrada");
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("recusa caminho inconsistente no registro", async () => {
    mock.from.mockReturnValue(
      query({ data: { file_path: "another/recording.mp4", mime_type: "video/mp4" }, error: null }),
    );
    await expect(run(deleteExclusiveRecording, { id, userId })).rejects.toThrow("não corresponde");
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("edita título e ordem de um anexo sem alterar o arquivo", async () => {
    const q = query({ data: { id, file_path: `lesson/${lessonId}/file.pdf` }, error: null });
    mock.from.mockReturnValue(q);
    await run(editLessonMaterial, { id, lessonId, title: "Novo guia", position: 2, url: null });
    expect(q["update"]).toHaveBeenCalledWith({ title: "Novo guia", position: 2 });
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("edita link HTTPS e impede endereço javascript", async () => {
    const q = query({ data: { id, file_path: null }, error: null });
    mock.from.mockReturnValue(q);
    await run(editLessonMaterial, {
      id,
      lessonId,
      title: "Link",
      position: 0,
      url: "https://example.test/material",
    });
    expect(q["update"]).toHaveBeenCalledWith({
      title: "Link",
      position: 0,
      url: "https://example.test/material",
    });
    await expect(
      run(editLessonMaterial, {
        id,
        lessonId,
        title: "Link",
        position: 0,
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow();
  });
  it("não remove arquivo referenciado por outro anexo", async () => {
    const remove = query({ data: { id }, error: null });
    mock.from
      .mockReturnValueOnce(
        query({ data: { id, file_path: `lesson/${lessonId}/shared.pdf` }, error: null }),
      )
      .mockReturnValueOnce(query({ data: [{ id: "other" }], error: null }))
      .mockReturnValueOnce(remove);
    await expect(run(deleteLessonMaterial, { id, lessonId })).resolves.toEqual({ id });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(remove["delete"]).toHaveBeenCalled();
  });
  it("remove arquivo do último anexo pela Storage API", async () => {
    const filePath = `lesson/${lessonId}/only.pdf`;
    mock.from
      .mockReturnValueOnce(query({ data: { id, file_path: filePath }, error: null }))
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ data: { id }, error: null }));
    await expect(run(deleteLessonMaterial, { id, lessonId })).resolves.toEqual({ id });
    expect(mock.remove).toHaveBeenCalledWith([filePath]);
  });
  it("falha da Storage mantém o material", async () => {
    mock.from
      .mockReturnValueOnce(
        query({ data: { id, file_path: `lesson/${lessonId}/only.pdf` }, error: null }),
      )
      .mockReturnValueOnce(query({ data: [], error: null }));
    mock.remove.mockResolvedValue({ error: { message: "offline" } });
    await expect(run(deleteLessonMaterial, { id, lessonId })).rejects.toThrow("mantido");
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
});
