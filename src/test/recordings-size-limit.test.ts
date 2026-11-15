import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECORDING_MAX_BYTES, validateRecordingFile } from "@/lib/recordings";
import { RECORDING_CHUNK_BYTES, tusRecordingUpload } from "@/lib/recordings-upload";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const GB = 1024 ** 3;
function sizedFile(size: number, webm = false): File {
  const bytes = webm
    ? [0x1a, 0x45, 0xdf, 0xa3]
    : [0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 0, 0, 0, 0];
  // Simulated file size: no multi-gigabyte allocation or production upload.
  return {
    name: webm ? "call.webm" : "call.mp4",
    size,
    lastModified: 100,
    slice: vi.fn((start: number, end: number) => {
      if (start === 0 && end === 16)
        return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
      return new Blob([new Uint8Array(end - start)]);
    }),
  } as unknown as File;
}
const reply = (status: number, values: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name: string) => values[name] ?? null },
});
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Limite de gravação de 5 GB", () => {
  it("define exatamente cinco vezes o tamanho usado por GB no projeto", () => {
    expect(RECORDING_MAX_BYTES).toBe(5 * GB);
  });
  it.each([2 * GB + 1, 4 * GB + 1, 5 * GB - 1, 5 * GB])(
    "aceita MP4 com %i bytes lendo somente o cabeçalho",
    async (size) => {
      const file = sizedFile(size);
      await expect(validateRecordingFile(file)).resolves.toBe("video/mp4");
      expect(file.slice).toHaveBeenCalledExactlyOnceWith(0, 16);
    },
  );
  it("aceita WebM exatamente no limite", async () => {
    await expect(validateRecordingFile(sizedFile(5 * GB, true))).resolves.toBe("video/webm");
  });
  it.each([0, 5 * GB + 1, 10 * GB])("recusa %i bytes antes de ler o arquivo", async (size) => {
    const file = sizedFile(size);
    await expect(validateRecordingFile(file)).rejects.toThrow("5 GB");
    expect(file.slice).not.toHaveBeenCalled();
  });
  it("preserva offsets e progresso acima de 32 bits ao retomar arquivo de 5 GB", async () => {
    const endpoint = "https://storage.example.test/storage/v1/upload/resumable";
    const path = "student/recording/recording.mp4";
    const file = sizedFile(5 * GB);
    const offset = file.size - RECORDING_CHUNK_BYTES - 9;
    const onProgress = vi.fn();
    sessionStorage.setItem(
      `ordem:call-upload:${path}`,
      JSON.stringify({ url: endpoint + "/id", name: file.name, size: file.size, modified: 100 }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { "Upload-Offset": String(offset) }))
      .mockResolvedValueOnce(reply(204, { "Upload-Offset": String(file.size - 9) }))
      .mockResolvedValueOnce(reply(204, { "Upload-Offset": String(file.size) }));
    vi.stubGlobal("fetch", fetchMock);
    await tusRecordingUpload(file, path, "video/mp4", endpoint, async () => ({}), {
      signal: new AbortController().signal,
      onProgress,
    });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["HEAD", "PATCH", "PATCH"]);
    expect(fetchMock.mock.calls[1][1].headers["Upload-Offset"]).toBe(String(offset));
    expect(fetchMock.mock.calls[1][1].body.size).toBe(RECORDING_CHUNK_BYTES);
    expect(fetchMock.mock.calls[2][1].headers["Upload-Offset"]).toBe(String(file.size - 9));
    expect(fetchMock.mock.calls[2][1].body.size).toBe(9);
    expect(onProgress).toHaveBeenLastCalledWith(5 * GB, 5 * GB);
  });
});
