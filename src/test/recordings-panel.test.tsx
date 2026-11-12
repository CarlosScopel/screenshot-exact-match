import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingsPanel } from "@/components/portal/RecordingsPanel";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
  playback: vi.fn(),
  learning: vi.fn(),
  note: vi.fn(),
  position: vi.fn(),
  upload: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/recordings", () => ({
  listRecordings: mocks.list,
  createRecording: mocks.create,
  publishRecording: mocks.publish,
  recordingPlayback: mocks.playback,
  getRecordingLearning: mocks.learning,
  saveRecordingNote: mocks.note,
  saveRecordingPosition: mocks.position,
  recordingDate: (date: string) => date,
}));
vi.mock("@/lib/recordings-upload", () => ({
  uploadRecordingFile: mocks.upload,
  clearRecordingUpload: mocks.clear,
}));
const uid = "00000000-0000-4000-8000-000000000002";
const record = {
  id: "00000000-0000-4000-8000-000000000101",
  user_id: uid,
  title: "Call semanal 1",
  description: "Próximos passos",
  recorded_on: "2026-11-12",
  file_path: "student/call/recording.mp4",
  file_name: "call.mp4",
  mime_type: "video/mp4",
  size_bytes: 8,
  status: "published",
  created_at: "2026-11-12T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([record]);
  mocks.playback.mockResolvedValue("https://example.test/video");
  mocks.learning.mockResolvedValue({
    content: "Anotação anterior",
    revision: 2,
    position_seconds: 45,
  });
  mocks.note.mockResolvedValue({ content: "Nova anotação", revision: 3, position_seconds: 45 });
  mocks.position.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ ...record, status: "uploading" });
  mocks.publish.mockResolvedValue(record);
  mocks.upload.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function watch(admin = false) {
  render(<RecordingsPanel userId={uid} admin={admin} />);
  if (admin) fireEvent.click(await screen.findByRole("button", { name: "Assistir gravação" }));
  await screen.findByLabelText(`Gravação: ${record.title}`);
}
describe("Espaço exclusivo de calls", () => {
  it("mostra somente a lista do destinatário solicitado", async () => {
    render(<RecordingsPanel userId={uid} />);
    await screen.findByRole("button", { name: /Assistir encontro 01:/ });
    expect(mocks.list).toHaveBeenCalledWith(uid);
    expect(
      screen.queryByRole("form", { name: "Enviar gravação exclusiva" }),
    ).not.toBeInTheDocument();
  });
  it("aluno pode assistir e recuperar suas anotações", async () => {
    await watch();
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Anotação anterior");
    expect(mocks.learning).toHaveBeenCalledWith(record.id);
    expect(screen.getByLabelText(`Gravação: ${record.title}`)).toHaveAttribute("controls");
  });
  it("salva notas exclusivamente na gravação selecionada", async () => {
    await watch();
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Nova anotação" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar anotações" }));
    await screen.findByText("Anotações salvas.");
    expect(mocks.note).toHaveBeenCalledWith(record.id, "Nova anotação", 2);
  });
  it("preserva texto digitado quando salvar falha", async () => {
    mocks.note.mockRejectedValue(new Error("Falha de conexão"));
    await watch();
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Não perder este texto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar anotações" }));
    await screen.findByText("Falha de conexão");
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Não perder este texto");
  });
  it("não expõe anotações privadas para a administração", async () => {
    await watch(true);
    expect(mocks.learning).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Minhas anotações privadas")).not.toBeInTheDocument();
  });
  it("salva o ponto de reprodução ao pausar", async () => {
    await watch();
    const player = screen.getByLabelText(`Gravação: ${record.title}`);
    Object.defineProperty(player, "currentTime", { value: 90, writable: true });
    fireEvent.pause(player);
    await waitFor(() => expect(mocks.position).toHaveBeenCalledWith(record.id, 90));
  });
  it("permite alterar velocidade", async () => {
    await watch();
    fireEvent.click(screen.getByRole("button", { name: "Velocidade 1.5×" }));
    expect(
      (screen.getByLabelText(`Gravação: ${record.title}`) as HTMLVideoElement).playbackRate,
    ).toBe(1.5);
  });
  it("carrega endereço novo sem perder a anotação", async () => {
    await watch();
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Rascunho" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Renovar reprodução" }));
    await waitFor(() => expect(mocks.playback).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Rascunho");
  });
  it("oferece recuperação de erro e não mostra dados de uma consulta negada", async () => {
    mocks.list.mockRejectedValue(new Error("Acesso não autorizado"));
    render(<RecordingsPanel userId={uid} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Call semanal 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
  it("protege notas não salvas ao trocar de call", async () => {
    mocks.list.mockResolvedValue([
      record,
      { ...record, id: "00000000-0000-4000-8000-000000000102", title: "Call 2" },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RecordingsPanel userId={uid} />);
    const buttons = await screen.findAllByRole("button", { name: /Assistir encontro/ });
    fireEvent.click(buttons[0]!);
    await screen.findByLabelText("Minhas anotações privadas");
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Rascunho" },
    });
    fireEvent.click(buttons[1]!);
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Rascunho");
    expect(mocks.learning).toHaveBeenCalledTimes(1);
  });
  it("administrador cadastra, envia e só então publica a call", async () => {
    render(<RecordingsPanel userId={uid} admin />);
    await screen.findByText("Call semanal 1");
    fireEvent.change(screen.getByLabelText("Título da gravação"), {
      target: { value: "Call semanal 2" },
    });
    const file = new File(["test"], "call.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Arquivo da call (MP4 ou WebM)"), {
      target: { files: [file] },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Enviar gravação exclusiva" }));
    await screen.findByText("Gravação publicada no espaço exclusivo do mentorado.");
    expect(mocks.create).toHaveBeenCalledWith(uid, "Call semanal 2", "", expect.any(String), file);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: record.id }),
      file,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.publish).toHaveBeenCalledWith(record.id);
    expect(mocks.clear).toHaveBeenCalledWith(record.file_path);
  });
  it("upload com falha não publica nem remove a seleção do arquivo", async () => {
    mocks.upload.mockRejectedValue(new Error("Envio interrompido"));
    render(<RecordingsPanel userId={uid} admin />);
    fireEvent.change(screen.getByLabelText("Título da gravação"), { target: { value: "Call" } });
    fireEvent.change(screen.getByLabelText("Arquivo da call (MP4 ou WebM)"), {
      target: { files: [new File(["test"], "call.mp4")] },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Enviar gravação exclusiva" }));
    await screen.findByText("Envio interrompido");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retomar envio" })).toBeEnabled();
  });
});

describe("Experiência organizada do mentorado", () => {
  const second = {
    ...record,
    id: "00000000-0000-4000-8000-000000000102",
    title: "Revisão da estratégia",
    recorded_on: "2026-11-19",
  };
  const third = {
    ...record,
    id: "00000000-0000-4000-8000-000000000103",
    title: "Plano de execução",
    recorded_on: "2026-11-26",
  };
  async function journey() {
    mocks.list.mockResolvedValue([third, record, second]);
    render(<RecordingsPanel userId={uid} />);
    await screen.findByLabelText(`Gravação: ${record.title}`);
  }
  it("ordena encontros por data e abre o primeiro sem reprodução automática", async () => {
    await journey();
    const items = screen.getAllByRole("button", { name: /Assistir encontro/ });
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      `Assistir encontro 01: ${record.title}`,
      `Assistir encontro 02: ${second.title}`,
      `Assistir encontro 03: ${third.title}`,
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByLabelText(`Gravação: ${record.title}`)).not.toHaveAttribute("autoplay");
    expect(screen.getByRole("button", { name: "Encontro anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próximo encontro" })).toBeEnabled();
  });
  it("navega para a próxima call e volta pela sequência sem sair da página", async () => {
    await journey();
    fireEvent.click(screen.getByRole("button", { name: "Próximo encontro" }));
    await screen.findByLabelText(`Gravação: ${second.title}`);
    expect(
      screen.getByRole("button", { name: `Assistir encontro 02: ${second.title}` }),
    ).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Encontro anterior" }));
    await screen.findByLabelText(`Gravação: ${record.title}`);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
  it("desabilita avançar no último encontro", async () => {
    await journey();
    fireEvent.click(screen.getByRole("button", { name: `Assistir encontro 03: ${third.title}` }));
    await screen.findByLabelText(`Gravação: ${third.title}`);
    expect(screen.getByRole("button", { name: "Próximo encontro" })).toBeDisabled();
    expect(screen.getByText("3 de 3 encontros")).toBeInTheDocument();
  });
  it("não mostra gravações incompletas nem de outro mentorado", async () => {
    mocks.list.mockResolvedValue([
      record,
      { ...second, status: "uploading" },
      { ...third, user_id: "another-user" },
    ]);
    render(<RecordingsPanel userId={uid} />);
    await screen.findByLabelText(`Gravação: ${record.title}`);
    expect(screen.getAllByRole("button", { name: /Assistir encontro/ })).toHaveLength(1);
    expect(screen.queryByText(second.title)).not.toBeInTheDocument();
    expect(screen.queryByText(third.title)).not.toBeInTheDocument();
    expect(mocks.playback).toHaveBeenCalledTimes(1);
  });
  it("usa botões acessíveis de velocidade em vez do seletor nativo", async () => {
    await watch();
    expect(screen.getByRole("group", { name: "Velocidade de reprodução" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const player = screen.getByLabelText(`Gravação: ${record.title}`) as HTMLVideoElement;
    for (const rate of [0.75, 1, 1.25, 1.5, 2]) {
      fireEvent.click(screen.getByRole("button", { name: `Velocidade ${rate}×` }));
      expect(player.playbackRate).toBe(rate);
      expect(screen.getByRole("button", { name: `Velocidade ${rate}×` })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });
  it("mantém a velocidade escolhida ao abrir o próximo encontro", async () => {
    await journey();
    fireEvent.click(screen.getByRole("button", { name: "Velocidade 1.5×" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo encontro" }));
    const player = await screen.findByLabelText(`Gravação: ${second.title}`);
    fireEvent.loadedMetadata(player);
    expect((player as HTMLVideoElement).playbackRate).toBe(1.5);
    expect(screen.getByRole("button", { name: "Velocidade 1.5×" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("mantém a anotação e o encontro atual quando a troca é cancelada", async () => {
    await journey();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Decisão importante" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próximo encontro" }));
    expect(screen.getByLabelText(`Gravação: ${record.title}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Decisão importante");
    expect(mocks.learning).toHaveBeenCalledTimes(1);
  });
  it("troca apenas após confirmar descarte e busca a anotação do encontro correto", async () => {
    await journey();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Rascunho da primeira" },
    });
    mocks.learning.mockResolvedValue({
      content: "Anotação da segunda",
      revision: 1,
      position_seconds: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Próximo encontro" }));
    await screen.findByLabelText(`Gravação: ${second.title}`);
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Anotação da segunda");
    expect(mocks.learning).toHaveBeenLastCalledWith(second.id);
  });
  it("não pede descarte ao selecionar novamente a mesma call", async () => {
    await journey();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {
      target: { value: "Ainda editando" },
    });
    fireEvent.click(screen.getByRole("button", { name: `Assistir encontro 01: ${record.title}` }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Ainda editando");
  });
  it("mostra um estado vazio sem controles de reprodução", async () => {
    mocks.list.mockResolvedValue([]);
    render(<RecordingsPanel userId={uid} />);
    await screen.findByText("Sua jornada começa aqui");
    expect(
      screen.queryByRole("group", { name: "Velocidade de reprodução" }),
    ).not.toBeInTheDocument();
    expect(mocks.playback).not.toHaveBeenCalled();
  });
  it("oculta dados anteriores ao trocar o usuário destinatário", async () => {
    const { rerender } = render(<RecordingsPanel userId={uid} />);
    await screen.findByLabelText(`Gravação: ${record.title}`);
    mocks.list.mockResolvedValue([]);
    rerender(<RecordingsPanel userId="other-user" />);
    await screen.findByText("Sua jornada começa aqui");
    expect(screen.queryByLabelText(`Gravação: ${record.title}`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Minhas anotações privadas")).not.toBeInTheDocument();
  });
});
