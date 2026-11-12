from pathlib import Path
import hashlib

p = Path('src/components/portal/RecordingsPanel.tsx')
s = p.read_text()
b = s.encode()
assert hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest() == '18a95a3624564b92b6fb22f278c5f60ef7b95d38', 'Unexpected source version'

def replace_once(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new, 1)

replace_once('import { CalendarDays, LoaderCircle, Play, Upload, Video } from "lucide-react";', '''import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Gauge, ListVideo, LoaderCircle, LockKeyhole, NotebookPen, Play, RotateCw, Save, Upload, Video } from "lucide-react";''')
replace_once('  const [dirty, setDirty] = useState(false);', '  const [dirty, setDirty] = useState(false);\n  const [speed, setSpeed] = useState("1");')
replace_once('  const choose = (recording: CallRecording) => {\n    if (selected?.id === recording.id) return;', '''  // Build a stable chronological sequence without changing the server data or admin ordering.
  const sequence = recordings
    .filter((recording) => recording.status === "published" && recording.user_id === userId)
    .slice()
    .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const active = admin ? selected : sequence.find((recording) => recording.id === selected?.id) || sequence[0] || null;
  const activeIndex = sequence.findIndex((recording) => recording.id === active?.id);
  const choose = (recording: CallRecording) => {
    if (active?.id === recording.id) return;''')
anchor = '  return (\n    <section\n      className="space-y-5 min-w-0"'
assert s.count(anchor) == 1
student = '''  if (!admin) return (
    <section className="min-w-0 space-y-6" aria-label="Minhas gravações">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-primary">ACOMPANHAMENTO INDIVIDUAL</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Minhas gravações</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Sua mentoria, encontro por encontro. Reassista, organize suas ideias e continue evoluindo.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" />Seu espaço exclusivo</span>
      </header>
      {loading && <div role="status" className="surface flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />Organizando seus encontros...</div>}
      {!loading && error && <div role="alert" className="surface p-6"><h3 className="font-semibold">Não foi possível carregar suas gravações</h3><p className="mt-2 text-sm text-muted-foreground">{error}</p><button type="button" className="portal-outline mt-4" onClick={() => void load()}><RotateCw className="size-4" />Tentar novamente</button></div>}
      {!loading && !error && !sequence.length && <div className="surface flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Video className="size-6" /></span><h3 className="text-lg font-semibold">Sua jornada começa aqui</h3><p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">As gravações das suas calls aparecerão neste espaço, organizadas pela data de cada encontro.</p></div>}
      {!loading && !error && active && <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <aside className="surface min-w-0 overflow-hidden xl:order-2 xl:sticky xl:top-24" aria-label="Sequência de encontros">
          <div className="border-b p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><ListVideo className="size-4 text-primary" />Seus encontros</h3><span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">{sequence.length}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">Do primeiro ao mais recente.</p>
          </div>
          <ol className="max-h-60 space-y-1 overflow-y-auto overscroll-contain p-2 xl:max-h-[65vh]">
            {sequence.map((recording, index) => {
              const current = active.id === recording.id;
              return <li key={recording.id}><button type="button" aria-label={`Assistir encontro ${String(index + 1).padStart(2, "0")}: ${recording.title}`} aria-current={current ? "true" : undefined} onClick={() => choose(recording)} className={"group flex w-full min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " + (current ? "border-primary/25 bg-primary/10" : "border-transparent hover:bg-muted/60")}>
                <span className={"mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums " + (current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1"><span className={"block text-[10px] font-semibold uppercase tracking-wider " + (current ? "text-primary" : "text-muted-foreground")}>{current ? "Selecionado" : `Encontro ${String(index + 1).padStart(2, "0")}`}</span><span className="mt-1 block line-clamp-2 break-words text-sm font-medium leading-snug">{recording.title}</span><span className="mt-2 block text-xs text-muted-foreground">{recordingDate(recording.recorded_on)}</span></span>
                <ChevronRight className={"mt-3 size-4 shrink-0 " + (current ? "text-primary" : "text-muted-foreground/40")} aria-hidden="true" />
              </button></li>;
            })}
          </ol>
          <div className="flex items-center gap-2 border-t px-5 py-3 text-[11px] text-muted-foreground"><LockKeyhole className="size-3 shrink-0" />Gravações privadas da sua mentoria</div>
        </aside>
        <div className="min-w-0 xl:order-1"><RecordingPlayer key={active.id} recording={active} admin={false} onDirty={setDirty} speed={speed} onSpeedChange={setSpeed} navigation={{ index: activeIndex, total: sequence.length, previous: sequence[activeIndex - 1], next: sequence[activeIndex + 1], onChoose: choose }} /></div>
      </div>}
    </section>
  );
'''
s = s.replace(anchor, student + anchor, 1)
replace_once('<RecordingPlayer key={selected.id} recording={selected} admin={admin} onDirty={setDirty} />', '<RecordingPlayer key={selected.id} recording={selected} admin={admin} onDirty={setDirty} speed={speed} onSpeedChange={setSpeed} />')
replace_once('''  onDirty,
}: {
  recording: CallRecording;
  admin: boolean;
  onDirty: (dirty: boolean) => void;
}) {''', '''  onDirty,
  speed,
  onSpeedChange,
  navigation,
}: {
  recording: CallRecording;
  admin: boolean;
  onDirty: (dirty: boolean) => void;
  speed: string;
  onSpeedChange: (speed: string) => void;
  navigation?: { index: number; total: number; previous?: CallRecording; next?: CallRecording; onChoose: (recording: CallRecording) => void };
}) {''')
replace_once('  const [speed, setSpeed] = useState("1");\n  const video', '  const video')
# Only replace the presentational return of RecordingPlayer; keep upload and persistence intact.
start = s.index('  return (\n    <article\n', s.index('function RecordingPlayer('))
s = s[:start] + '''  return (
    <article className="min-w-0 space-y-5" aria-label={`Assistindo: ${recording.title}`}>
      <div className="surface min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Play className="size-3.5" aria-hidden="true" />{navigation ? `Encontro ${String(navigation.index + 1).padStart(2, "0")}` : "Gravação exclusiva"}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" />{recordingDate(recording.recorded_on)}</span>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {!url && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">{loading ? <span role="status" className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" />Carregando gravação...</span> : <span>Recarregue o vídeo para tentar novamente.</span>}</div>}
          {url && <video
            ref={video} src={url} aria-label={`Gravação: ${recording.title}`} controls playsInline preload="metadata" className="h-full w-full"
            onLoadedMetadata={(event) => {
              const player = event.currentTarget;
              player.playbackRate = Number(speed);
              if (position.current > 0 && position.current < player.duration - 2) player.currentTime = position.current;
              if (wasPlaying.current) { wasPlaying.current = false; void player.play().catch(() => undefined); }
            }}
            onTimeUpdate={(event) => { position.current = event.currentTarget.currentTime; if (Date.now() - lastWrite.current >= 30000 && !event.currentTarget.paused) storePosition(position.current); }}
            onPause={(event) => storePosition(event.currentTarget.currentTime)}
            onEnded={() => storePosition(0)}
            onError={() => setError("O vídeo não carregou ou o link de reprodução expirou. Recarregue para renovar o acesso. Para MP4, use H.264/AAC.")}
          />}
          {loading && url && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 text-sm text-white"><LoaderCircle className="size-5 animate-spin" />Renovando acesso ao vídeo...</div>}
        </div>
        {error && <div role="alert" className="border-b bg-destructive/5 p-5 text-sm"><p>{error}</p><button type="button" className="portal-outline mt-3" onClick={() => void refreshVideo()}>Recarregar vídeo</button></div>}
        {url && <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3 sm:px-6">
          <div className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Gauge className="size-3.5" aria-hidden="true" />Velocidade de reprodução</span><div role="group" aria-label="Velocidade de reprodução" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-background/60 p-1">
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => <button key={rate} type="button" aria-label={`Velocidade ${rate}×`} aria-pressed={Number(speed) === rate} onClick={() => { onSpeedChange(String(rate)); if (video.current) video.current.playbackRate = rate; }} className={"min-h-10 min-w-10 rounded-lg px-2.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " + (Number(speed) === rate ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{rate}×</button>)}
          </div></div>
          <button type="button" aria-label="Renovar reprodução" title="Renovar o acesso ao vídeo" disabled={loading} onClick={() => void refreshVideo()} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><RotateCw className={"size-3.5 " + (loading ? "animate-spin" : "")} aria-hidden="true" />Renovar acesso</button>
        </div>}
        <div className="p-5 sm:p-6"><h3 className="break-words text-xl font-semibold leading-snug sm:text-2xl">{recording.title}</h3>{recording.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{recording.description}</p>}</div>
        {navigation && <nav aria-label="Navegação entre encontros" className="border-t px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>Continue sua sequência</span><span className="tabular-nums">{navigation.index + 1} de {navigation.total} encontros</span></div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" aria-label="Encontro anterior" disabled={!navigation.previous} onClick={() => { if (navigation.previous) navigation.onChoose(navigation.previous); }} className="flex min-w-0 items-center gap-2 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="size-4 shrink-0" /><span className="min-w-0"><span className="block text-xs font-semibold">Anterior</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{navigation.previous?.title || "Primeiro encontro"}</span></span></button>
            <button type="button" aria-label="Próximo encontro" disabled={!navigation.next} onClick={() => { if (navigation.next) navigation.onChoose(navigation.next); }} className="flex min-w-0 items-center justify-end gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-right transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:opacity-40"><span className="min-w-0"><span className="block text-xs font-semibold">Próximo</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{navigation.next?.title || "Último encontro"}</span></span><ArrowRight className="size-4 shrink-0" /></button>
          </div>
        </nav>}
      </div>
      {!admin && url && <section className="surface overflow-hidden" aria-label="Anotações do encontro">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5 sm:px-6"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><NotebookPen className="size-4" /></span><div><h4 className="text-sm font-semibold">Minhas anotações</h4><p className="mt-0.5 text-xs text-muted-foreground">Ideias e próximos passos deste encontro.</p></div></div><span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole className="size-3" />Só você pode ler</span></div>
        <div className="p-5 sm:p-6"><label htmlFor={`recording-note-${recording.id}`} className="sr-only">Minhas anotações privadas</label><textarea id={`recording-note-${recording.id}`} className="portal-input min-h-48 resize-y text-sm leading-relaxed" value={note} onChange={(event) => setNote(event.target.value)} maxLength={50000} disabled={saving || loading} placeholder="O que ficou desta call? Registre aprendizados, decisões e as ações que você vai colocar em prática..." />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className={"flex items-center gap-1.5 text-xs " + (dirty ? "text-warning" : "text-muted-foreground")}>{dirty ? <><span className="size-1.5 rounded-full bg-warning" />Alterações ainda não salvas</> : <><Check className="size-3.5 text-success" />Tudo salvo</>}</p><p className="text-[10px] tabular-nums text-muted-foreground">{note.length.toLocaleString("pt-BR")} / 50.000 caracteres</p></div><button type="button" className="portal-button" disabled={saving || !dirty || loading} onClick={() => void save()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Salvando..." : "Salvar anotações"}</button></div>
        </div>
      </section>}
      {admin && <p className="text-xs text-muted-foreground">As anotações do mentorado são privadas e não aparecem para a administração.</p>}
      {notice && <p role="status" className="rounded-xl border bg-card p-3 text-sm">{notice}</p>}
    </article>
  );
}
'''
p.write_text(s)

p = Path('src/test/recordings-panel.test.tsx')
s = p.read_text()
s = s.replace('  fireEvent.click(await screen.findByRole("button", { name: "Assistir gravação" }));', '  if (admin) fireEvent.click(await screen.findByRole("button", { name: "Assistir gravação" }));')
s = s.replace('    await screen.findByText("Call semanal 1");', '    await screen.findByRole("button", { name: /Assistir encontro 01:/ });', 1)
s = s.replace('    fireEvent.change(screen.getByLabelText("Velocidade"), { target: { value: "1.5" } });', '    fireEvent.click(screen.getByRole("button", { name: "Velocidade 1.5×" }));')
s = s.replace('    const buttons = await screen.findAllByRole("button", { name: "Assistir gravação" });', '    const buttons = await screen.findAllByRole("button", { name: /Assistir encontro/ });')
s += '''

describe("Experiência organizada do mentorado", () => {
  const second = { ...record, id: "00000000-0000-4000-8000-000000000102", title: "Revisão da estratégia", recorded_on: "2026-11-19" };
  const third = { ...record, id: "00000000-0000-4000-8000-000000000103", title: "Plano de execução", recorded_on: "2026-11-26" };
  async function journey() {
    mocks.list.mockResolvedValue([third, record, second]);
    render(<RecordingsPanel userId={uid} />);
    await screen.findByLabelText(`Gravação: ${record.title}`);
  }
  it("ordena encontros por data e abre o primeiro sem reprodução automática", async () => {
    await journey();
    const items = screen.getAllByRole("button", { name: /Assistir encontro/ });
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      `Assistir encontro 01: ${record.title}`, `Assistir encontro 02: ${second.title}`, `Assistir encontro 03: ${third.title}`,
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
    expect(screen.getByRole("button", { name: `Assistir encontro 02: ${second.title}` })).toHaveAttribute("aria-current", "true");
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
    mocks.list.mockResolvedValue([record, {...second, status: "uploading"}, {...third, user_id: "another-user"}]);
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
      expect(screen.getByRole("button", { name: `Velocidade ${rate}×` })).toHaveAttribute("aria-pressed", "true");
    }
  });
  it("mantém a velocidade escolhida ao abrir o próximo encontro", async () => {
    await journey();
    fireEvent.click(screen.getByRole("button", { name: "Velocidade 1.5×" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo encontro" }));
    const player = await screen.findByLabelText(`Gravação: ${second.title}`);
    fireEvent.loadedMetadata(player);
    expect((player as HTMLVideoElement).playbackRate).toBe(1.5);
    expect(screen.getByRole("button", { name: "Velocidade 1.5×" })).toHaveAttribute("aria-pressed", "true");
  });
  it("mantém a anotação e o encontro atual quando a troca é cancelada", async () => {
    await journey();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {target: {value: "Decisão importante"}});
    fireEvent.click(screen.getByRole("button", {name: "Próximo encontro"}));
    expect(screen.getByLabelText(`Gravação: ${record.title}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Decisão importante");
    expect(mocks.learning).toHaveBeenCalledTimes(1);
  });
  it("troca apenas após confirmar descarte e busca a anotação do encontro correto", async () => {
    await journey();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {target: {value: "Rascunho da primeira"}});
    mocks.learning.mockResolvedValue({content: "Anotação da segunda", revision: 1, position_seconds: 0});
    fireEvent.click(screen.getByRole("button", {name: "Próximo encontro"}));
    await screen.findByLabelText(`Gravação: ${second.title}`);
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Anotação da segunda");
    expect(mocks.learning).toHaveBeenLastCalledWith(second.id);
  });
  it("não pede descarte ao selecionar novamente a mesma call", async () => {
    await journey();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.change(screen.getByLabelText("Minhas anotações privadas"), {target: {value: "Ainda editando"}});
    fireEvent.click(screen.getByRole("button", {name: `Assistir encontro 01: ${record.title}`}));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Minhas anotações privadas")).toHaveValue("Ainda editando");
  });
  it("mostra um estado vazio sem controles de reprodução", async () => {
    mocks.list.mockResolvedValue([]);
    render(<RecordingsPanel userId={uid} />);
    await screen.findByText("Sua jornada começa aqui");
    expect(screen.queryByRole("group", {name: "Velocidade de reprodução"})).not.toBeInTheDocument();
    expect(mocks.playback).not.toHaveBeenCalled();
  });
  it("oculta dados anteriores ao trocar o usuário destinatário", async () => {
    const {rerender} = render(<RecordingsPanel userId={uid} />);
    await screen.findByLabelText(`Gravação: ${record.title}`);
    mocks.list.mockResolvedValue([]);
    rerender(<RecordingsPanel userId="other-user" />);
    await screen.findByText("Sua jornada começa aqui");
    expect(screen.queryByLabelText(`Gravação: ${record.title}`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Minhas anotações privadas")).not.toBeInTheDocument();
  });
});
'''
p.write_text(s)
