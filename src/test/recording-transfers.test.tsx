import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRecordingTransfers,
  setRecordingUploadOwner,
  startRecordingTransfer,
  pauseRecordingTransfer,
  resumeRecordingTransfer,
  forgetRecordingTransfer,
  useRecordingTransfer,
} from "@/lib/recording-transfers";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  publish: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/recordings", () => ({
  createRecording: mock.create,
  publishRecording: mock.publish,
}));
vi.mock("@/lib/recordings-upload", () => ({
  uploadRecordingFile: mock.upload,
  clearRecordingUpload: mock.clear,
}));
const recording = {
  id: "call-a",
  user_id: "student-a",
  title: "Call A",
  file_path: "student-a/call-a/recording.mp4",
  status: "uploading",
};
const input = () => ({
  userId: "student-a",
  title: "Call A",
  date: "2026-11-15",
  description: "",
  file: new File(["video"], "call.mp4"),
});
function View({ userId = "student-a" }) {
  const state = useRecordingTransfer(userId);
  return <p>{state ? `${state.title}: ${state.status} ${state.progress}%` : "Sem envio"}</p>;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  setRecordingUploadOwner(null);
  vi.resetAllMocks();
  setRecordingUploadOwner("admin-a");
  mock.create.mockResolvedValue(recording);
  mock.upload.mockResolvedValue(undefined);
  mock.publish.mockResolvedValue({ ...recording, status: "published" });
});
afterEach(() => {
  cleanup();
  setRecordingUploadOwner(null);
});
describe("Continuidade do envio fora do formulário", () => {
  it("continua após desmontar a tela e exibe progresso ao voltar", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    const view = render(<View />);
    let task!: Promise<void>;
    act(() => {
      task = startRecordingTransfer(input());
    });
    await screen.findByText("Call A: uploading 0%");
    const options = mock.upload.mock.calls[0]![2];
    view.unmount();
    expect(options.signal.aborted).toBe(false);
    act(() => options.onProgress(3, 4));
    render(<View />);
    expect(screen.getByText("Call A: uploading 75%")).toBeInTheDocument();
    await act(async () => {
      upload.resolve();
      await task;
    });
    expect(screen.getByText("Call A: complete 100%")).toBeInTheDocument();
    expect(mock.publish).toHaveBeenCalledOnce();
  });
  it("não reinicia por foco ou visibilidade e impede dois envios concorrentes para a mesma tela", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    const task = startRecordingTransfer(input());
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    const duplicate = startRecordingTransfer(input());
    expect(duplicate).toBe(task);
    expect(mock.create).toHaveBeenCalledOnce();
    upload.resolve();
    await task;
  });
  it("pausa e retoma com o arquivo em memória sem criar outro registro", async () => {
    mock.upload.mockImplementationOnce(
      (_r, _f, options) =>
        new Promise((_, reject) =>
          options.signal.addEventListener("abort", () => reject(options.signal.reason)),
        ),
    );
    const fileInput = input();
    const task = startRecordingTransfer(fileInput);
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    pauseRecordingTransfer("student-a");
    await task;
    expect(getRecordingTransfers()[0]?.status).toBe("paused");
    mock.publish.mockRejectedValueOnce(
      new Error("Envio incompleto: arquivo ainda não disponível."),
    );
    await resumeRecordingTransfer("student-a");
    expect(mock.create).toHaveBeenCalledOnce();
    expect(mock.upload.mock.calls[1]![1]).toBe(fileInput.file);
    expect(getRecordingTransfers()[0]).toMatchObject({ status: "complete", hasFile: false });
  });
  it("preserva o rascunho se pausar durante a criação", async () => {
    let resolve!: (value: unknown) => void;
    mock.create.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const task = startRecordingTransfer(input());
    pauseRecordingTransfer("student-a");
    resolve(recording);
    await task;
    expect(getRecordingTransfers()[0]).toMatchObject({ status: "paused", recording });
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("interrompe e apaga estado local ao sair da conta sem publicar", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    const task = startRecordingTransfer(input());
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    const signal = mock.upload.mock.calls[0]![2].signal;
    setRecordingUploadOwner(null);
    expect(signal.aborted).toBe(true);
    expect(getRecordingTransfers()).toEqual([]);
    upload.resolve();
    await task;
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("trocar de usuário autenticado não transfere a tarefa para outra sessão", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    const task = startRecordingTransfer(input());
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    setRecordingUploadOwner("admin-b");
    upload.resolve();
    await task;
    expect(getRecordingTransfers()).toEqual([]);
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("mantém arquivo para tentar novamente em caso de erro e não publica", async () => {
    mock.upload.mockRejectedValue(new Error("Rede indisponível"));
    await startRecordingTransfer(input());
    expect(getRecordingTransfers()[0]).toMatchObject({
      status: "error",
      hasFile: true,
      message: "Rede indisponível",
    });
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.clear).not.toHaveBeenCalled();
  });
  it("não reenvia bytes se o servidor já concluiu o upload anterior", async () => {
    await startRecordingTransfer({ ...input(), recording: recording as never });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.publish).toHaveBeenCalledWith("call-a");
  });
  it("não mistura tarefas de destinatários diferentes", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    mock.create.mockImplementation(async (userId: string, title: string) => ({
      ...recording,
      id: userId,
      user_id: userId,
      title,
    }));
    const a = startRecordingTransfer(input());
    const b = startRecordingTransfer({ ...input(), userId: "student-b", title: "Call B" });
    await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(2));
    render(<View userId="student-b" />);
    expect(screen.getByText("Call B: uploading 0%")).toBeInTheDocument();
    expect(screen.queryByText(/Call A/)).not.toBeInTheDocument();
    upload.resolve();
    await Promise.all([a, b]);
    forgetRecordingTransfer("student-a");
    expect(getRecordingTransfers().map((s) => s.userId)).toEqual(["student-b"]);
  });
  it("avisa antes de fechar durante envio e remove aviso após concluir", async () => {
    const upload = deferred();
    mock.upload.mockReturnValue(upload.promise);
    const task = startRecordingTransfer(input());
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    const active = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(active);
    expect(active.defaultPrevented).toBe(true);
    upload.resolve();
    await task;
    const ended = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ended);
    expect(ended.defaultPrevented).toBe(false);
  });
  it("não inicia sem sessão ou retoma arquivo de outro mentorado", () => {
    expect(() =>
      startRecordingTransfer({
        ...input(),
        recording: { ...recording, user_id: "other" } as never,
      }),
    ).toThrow("outro mentorado");
    setRecordingUploadOwner(null);
    expect(() => startRecordingTransfer(input())).toThrow("Entre novamente");
  });
});
