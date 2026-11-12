import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecording,
  getRecordingLearning,
  listRecordings,
  publishRecording,
  recordingPlayback,
  saveRecordingNote,
  saveRecordingPosition,
  validateRecordingFile,
  RECORDING_MAX_BYTES,
} from "@/lib/recordings";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), signed: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mock.rpc, storage: { from: mock.from } },
}));
const uid = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000101";
const record = {
  id,
  user_id: uid,
  title: "Call privada",
  description: "Notas da call",
  recorded_on: "2026-11-12",
  file_path: `${uid}/${id}/recording.mp4`,
  file_name: "call.mp4",
  mime_type: "video/mp4" as const,
  size_bytes: 16,
  status: "published" as const,
  created_at: "2026-11-12T00:00:00Z",
};
function video(
  name = "call.mp4",
  bytes = [0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0, 0, 0, 0],
) {
  const file = new File([new Uint8Array(bytes)], name, { type: "video/mp4" });
  Object.defineProperty(file, "slice", {
    value: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }),
  });
  return file;
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.from.mockReturnValue({ createSignedUrl: mock.signed });
  mock.signed.mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/signed" },
    error: null,
  });
});
afterEach(() => vi.restoreAllMocks());
describe("Gravações: arquivos e contratos autenticados", () => {
  it("valida o conteúdo MP4 e não apenas o nome", async () => {
    await expect(validateRecordingFile(video())).resolves.toBe("video/mp4");
    await expect(validateRecordingFile(video("fake.mp4", [1, 2, 3, 4]))).rejects.toThrow("válido");
  });
  it("aceita WebM com assinatura EBML", async () => {
    await expect(validateRecordingFile(video("call.webm", [0x1a, 0x45, 0xdf, 0xa3]))).resolves.toBe(
      "video/webm",
    );
  });
  it("recusa arquivos vazios, extensões não suportadas e acima do limite", async () => {
    await expect(validateRecordingFile(new File([], "a.mp4"))).rejects.toThrow("2 GB");
    await expect(validateRecordingFile(video("a.html"))).rejects.toThrow("válido");
    const file = video();
    Object.defineProperty(file, "size", { value: RECORDING_MAX_BYTES + 1 });
    await expect(validateRecordingFile(file)).rejects.toThrow("2 GB");
  });
  it("pede ao servidor só as gravações do mentorado solicitado", async () => {
    mock.rpc.mockResolvedValue({ data: [record], error: null });
    expect(await listRecordings(uid)).toEqual([record]);
    expect(mock.rpc).toHaveBeenCalledWith("recordings_list", { p_user_id: uid });
  });
  it("propaga a negativa de acesso e não inventa uma lista", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "Acesso negado" } });
    await expect(listRecordings(uid)).rejects.toThrow("Acesso negado");
  });
  it("rejeita retorno inválido do servidor", async () => {
    mock.rpc.mockResolvedValue({ data: [{ title: "vazamento" }], error: null });
    await expect(listRecordings(uid)).rejects.toThrow();
  });
  it("cadastra upload no destinatário correto", async () => {
    mock.rpc.mockResolvedValue({ data: { ...record, status: "uploading" }, error: null });
    await createRecording(uid, " Call privada ", "Assunto", "2026-11-12", video());
    expect(mock.rpc).toHaveBeenCalledWith(
      "recordings_create",
      expect.objectContaining({
        p_user_id: uid,
        p_title: "Call privada",
        p_size_bytes: 16,
        p_mime_type: "video/mp4",
      }),
    );
  });
  it("valida o título antes de cadastrar", async () => {
    await expect(createRecording(uid, " ", "", "2026-11-12", video())).rejects.toThrow("título");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("publica somente por RPC administrativa", async () => {
    mock.rpc.mockResolvedValue({ data: record, error: null });
    await publishRecording(id);
    expect(mock.rpc).toHaveBeenCalledWith("recordings_publish", { p_id: id });
  });
  it("solicita URL curta no bucket privado", async () => {
    expect(await recordingPlayback(record)).toBe("https://storage.example.test/signed");
    expect(mock.from).toHaveBeenCalledWith("mentorship-recordings");
    expect(mock.signed).toHaveBeenCalledWith(record.file_path, 300);
  });
  it("não retorna URL quando Storage nega acesso", async () => {
    mock.signed.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    await expect(recordingPlayback(record)).rejects.toThrow("acesso");
  });
  it("carrega estado privado e grava nota com controle de versão", async () => {
    mock.rpc.mockResolvedValue({
      data: { content: "texto", revision: 2, position_seconds: 90 },
      error: null,
    });
    await getRecordingLearning(id);
    await saveRecordingNote(id, "texto", 1);
    expect(mock.rpc).toHaveBeenCalledWith("recordings_save_note", {
      p_id: id,
      p_content: "texto",
      p_revision: 1,
    });
  });
  it("salva posição sem enviar ou apagar o texto da anotação", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await saveRecordingPosition(id, 35.8);
    expect(mock.rpc).toHaveBeenCalledWith("recordings_save_position", { p_id: id, p_seconds: 35 });
  });
  it("ignora posições inválidas", async () => {
    await saveRecordingPosition(id, NaN);
    await saveRecordingPosition(id, -1);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
