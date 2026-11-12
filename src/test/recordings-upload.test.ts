import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecordingUpload,
  RECORDING_CHUNK_BYTES,
  safeUploadLocation,
  tusRecordingUpload,
} from "@/lib/recordings-upload";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const endpoint = "https://storage.example.test/storage/v1/upload/resumable";
const path = "student/record/recording.mp4";
const headers = async () => ({ Authorization: "Bearer test-session" });
const response = (status: number, values: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name: string) => values[name] ?? null },
});
const fetchMock = vi.fn();
function options() {
  return { signal: new AbortController().signal, onProgress: vi.fn() };
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Upload TUS de gravações", () => {
  it("recusa Location externa para não expor a sessão", () => {
    expect(() => safeUploadLocation("https://attacker.example.test/path", endpoint)).toThrow(
      "inválido",
    );
    expect(() => safeUploadLocation("/auth/", endpoint)).toThrow();
    expect(safeUploadLocation(endpoint + "/upload-id", endpoint)).toBe(endpoint + "/upload-id");
  });
  it("cria upload privado e envia blocos sem sobrescrever", async () => {
    const file = new File([new Uint8Array(RECORDING_CHUNK_BYTES + 10)], "call.mp4");
    const opts = options();
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: endpoint + "/id" }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": String(RECORDING_CHUNK_BYTES) }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": String(file.size) }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint, headers, opts);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1].headers["Upload-Length"]).toBe(String(file.size));
    expect(fetchMock.mock.calls[1]?.[1].body.size).toBe(RECORDING_CHUNK_BYTES);
    expect(fetchMock.mock.calls[2]?.[1].headers["Upload-Offset"]).toBe(
      String(RECORDING_CHUNK_BYTES),
    );
    expect(opts.onProgress).toHaveBeenLastCalledWith(file.size, file.size);
    expect(fetchMock.mock.calls[0]?.[1].headers["x-upsert"]).toBeUndefined();
  });
  it("retoma a posição guardada sem reenviar blocos confirmados", async () => {
    const file = new File([new Uint8Array(20)], "call.mp4", { lastModified: 100 });
    sessionStorage.setItem(
      `ordem:call-upload:${path}`,
      JSON.stringify({ url: endpoint + "/id", name: file.name, size: 20, modified: 100 }),
    );
    fetchMock
      .mockResolvedValueOnce(response(200, { "Upload-Offset": "10" }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": "20" }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options());
    expect(fetchMock.mock.calls[0]?.[1].method).toBe("HEAD");
    expect(fetchMock.mock.calls[1]?.[1].body.size).toBe(10);
  });
  it("retoma após a resposta de um bloco se perder", async () => {
    vi.useFakeTimers();
    const file = new File([new Uint8Array(12)], "call.mp4");
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: endpoint + "/id" }))
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(response(200, { "Upload-Offset": "12" }));
    const upload = tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options());
    await vi.runAllTimersAsync();
    await upload;
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["POST", "PATCH", "HEAD"]);
  });
  it("respeita cancelamento antes do primeiro pedido", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      tusRecordingUpload(new File(["a"], "call.mp4"), path, "video/mp4", endpoint, headers, {
        signal: controller.signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("explica o limite real do provedor sem publicar o arquivo", async () => {
    fetchMock.mockResolvedValue(response(413));
    await expect(
      tusRecordingUpload(
        new File(["a"], "call.mp4"),
        path,
        "video/mp4",
        endpoint,
        headers,
        options(),
      ),
    ).rejects.toThrow("limite global");
  });
  it("não aceita offsets inválidos", async () => {
    const file = new File(["hello"], "call.mp4", { lastModified: 100 });
    sessionStorage.setItem(
      `ordem:call-upload:${path}`,
      JSON.stringify({ url: endpoint + "/id", name: file.name, size: file.size, modified: 100 }),
    );
    fetchMock.mockResolvedValue(response(200, { "Upload-Offset": "99999" }));
    await expect(
      tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options()),
    ).rejects.toThrow("inválida");
  });
  it("remove apenas a referência temporária do upload", () => {
    sessionStorage.setItem(`ordem:call-upload:${path}`, "test");
    sessionStorage.setItem("other", "keep");
    clearRecordingUpload(path);
    expect(sessionStorage.getItem(`ordem:call-upload:${path}`)).toBeNull();
    expect(sessionStorage.getItem("other")).toBe("keep");
  });
});

describe("Endereços TUS atrás do proxy de armazenamento", () => {
  const locations = [
    endpoint + "/proxy-id",
    "/storage/v1/upload/resumable/proxy-id",
    "/upload/resumable/proxy-id",
    "resumable/proxy-id",
    "proxy-id",
    "http://storage:5000/upload/resumable/proxy-id",
    "http://storage:5000/storage/v1/upload/resumable/proxy-id",
    "https://internal-storage.example.test/storage/v1/upload/resumable/proxy-id",
    "http://storage.example.test/storage/v1/upload/resumable/proxy-id",
  ];
  it.each(locations)("conclui o envio usando somente o destino público: %s", async (location) => {
    const file = new File(["video-fixture"], "call.mp4");
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: location }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": String(file.size) }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(endpoint + "/proxy-id");
    for (const [target, init] of fetchMock.mock.calls) {
      expect(new URL(target).origin).toBe(new URL(endpoint).origin);
      expect(init.redirect).toBe("error");
    }
    expect(JSON.parse(sessionStorage.getItem(`ordem:call-upload:${path}`)!)).toMatchObject({
      url: endpoint + "/proxy-id",
    });
  });
  it("normaliza a barra final do endpoint antes de continuar", async () => {
    const file = new File(["a"], "call.mp4");
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: endpoint + "/id" }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": "1" }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint + "/", headers, options());
    expect(fetchMock.mock.calls[1]?.[0]).toBe(endpoint + "/id");
  });
  it("preserva o prefixo público do projeto ao receber um caminho interno", async () => {
    const prefixed = "https://gateway.example.test/project/storage/v1/upload/resumable";
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: "http://storage:5000/upload/resumable/id" }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": "1" }));
    await tusRecordingUpload(
      new File(["a"], "call.mp4"),
      path,
      "video/mp4",
      prefixed,
      headers,
      options(),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(prefixed + "/id");
  });
  it("preserva identificadores codificados sem usá-los como caminho de outro serviço", async () => {
    const id = "YWJj%2FZGVm%2BZw%3D%3D";
    fetchMock
      .mockResolvedValueOnce(
        response(201, { Location: "http://storage:5000/upload/resumable/" + id }),
      )
      .mockResolvedValueOnce(response(204, { "Upload-Offset": "1" }));
    await tusRecordingUpload(
      new File(["a"], "call.mp4"),
      path,
      "video/mp4",
      endpoint,
      headers,
      options(),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(endpoint + "/" + id);
  });
  it.each([
    "https://attacker.example.test/collect",
    "https://user:password@storage.example.test/storage/v1/upload/resumable/id",
    "/auth/v1/user",
    "/upload/resumable/../auth",
    "/upload/resumable/%2e%2e/auth",
    "/upload/resumable/%252e%252e%252fauth",
    "/upload/resumable/",
    "/upload/resumable/id?redirect=https://attacker.example.test",
    "/upload/resumable/id#fragment",
    "javascript:alert(1)",
    "https://[invalid",
    "\\\\attacker.example.test\\upload\\resumable\\id",
  ])("recusa destinos que não identificam um recurso TUS: %s", async (location) => {
    fetchMock.mockResolvedValueOnce(response(201, { Location: location }));
    await expect(
      tusRecordingUpload(
        new File(["a"], "call.mp4"),
        path,
        "video/mp4",
        endpoint,
        headers,
        options(),
      ),
    ).rejects.toThrow("inválido");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(`ordem:call-upload:${path}`)).toBeNull();
  });
  it("nunca confia em um domínio externo recuperado do sessionStorage", async () => {
    const file = new File(["a"], "call.mp4", { lastModified: 100 });
    sessionStorage.setItem(
      `ordem:call-upload:${path}`,
      JSON.stringify({
        url: "https://attacker.example.test/storage/v1/upload/resumable/id",
        name: file.name,
        size: file.size,
        modified: 100,
      }),
    );
    await expect(
      tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options()),
    ).rejects.toThrow("inválido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retoma no endereço público normalizado sem criar outro upload", async () => {
    const file = new File(["abc"], "call.mp4", { lastModified: 100 });
    fetchMock
      .mockResolvedValueOnce(response(201, { Location: "http://storage:5000/upload/resumable/id" }))
      .mockResolvedValueOnce(response(204, { "Upload-Offset": "3" }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options());
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response(200, { "Upload-Offset": "3" }));
    await tusRecordingUpload(file, path, "video/mp4", endpoint, headers, options());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoint + "/id");
    expect(fetchMock.mock.calls[0]?.[1].method).toBe("HEAD");
  });
});
