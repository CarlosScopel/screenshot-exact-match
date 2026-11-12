import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Gauge,
  ListVideo,
  LoaderCircle,
  LockKeyhole,
  NotebookPen,
  Play,
  RotateCw,
  Save,
  Upload,
  Video,
} from "lucide-react";
import {
  createRecording,
  getRecordingLearning,
  listRecordings,
  publishRecording,
  recordingDate,
  recordingPlayback,
  saveRecordingNote,
  saveRecordingPosition,
  type CallRecording,
} from "@/lib/recordings";
import { clearRecordingUpload, uploadRecordingFile } from "@/lib/recordings-upload";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export function RecordingsPanel({ userId, admin = false }: { userId: string; admin?: boolean }) {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [selected, setSelected] = useState<CallRecording | null>(null);
  const [resume, setResume] = useState<CallRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [speed, setSpeed] = useState("1");
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await listRecordings(userId);
      if (version === request.current) setRecordings(result);
    } catch (e) {
      if (version === request.current) {
        setError(messageOf(e));
        setRecordings([]);
        setSelected(null);
      }
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    setSelected(null);
    setResume(null);
    setDirty(false);
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  // Build a stable chronological sequence without changing the server data or admin ordering.
  const sequence = recordings
    .filter((recording) => recording.status === "published" && recording.user_id === userId)
    .slice()
    .sort(
      (a, b) =>
        a.recorded_on.localeCompare(b.recorded_on) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  const active = admin
    ? selected
    : sequence.find((recording) => recording.id === selected?.id) || sequence[0] || null;
  const activeIndex = sequence.findIndex((recording) => recording.id === active?.id);
  const choose = (recording: CallRecording) => {
    if (active?.id === recording.id) return;
    if (
      dirty &&
      !window.confirm("Há anotações não salvas. Trocar de gravação e descartar esse texto?")
    )
      return;
    setDirty(false);
    setSelected(recording);
  };
  if (!admin)
    return (
      <section className="min-w-0 space-y-6" aria-label="Minhas gravações">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-primary">
              ACOMPANHAMENTO INDIVIDUAL
            </p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Minhas gravações</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Sua mentoria, encontro por encontro. Reassista, organize suas ideias e continue
              evoluindo.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5 text-primary" aria-hidden="true" />
            Seu espaço exclusivo
          </span>
        </header>
        {loading && (
          <div
            role="status"
            className="surface flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-5 animate-spin text-primary" />
            Organizando seus encontros...
          </div>
        )}
        {!loading && error && (
          <div role="alert" className="surface p-6">
            <h3 className="font-semibold">Não foi possível carregar suas gravações</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button type="button" className="portal-outline mt-4" onClick={() => void load()}>
              <RotateCw className="size-4" />
              Tentar novamente
            </button>
          </div>
        )}
        {!loading && !error && !sequence.length && (
          <div className="surface flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Video className="size-6" />
            </span>
            <h3 className="text-lg font-semibold">Sua jornada começa aqui</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              As gravações das suas calls aparecerão neste espaço, organizadas pela data de cada
              encontro.
            </p>
          </div>
        )}
        {!loading && !error && active && (
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <aside
              className="surface min-w-0 overflow-hidden xl:order-2 xl:sticky xl:top-24"
              aria-label="Sequência de encontros"
            >
              <div className="border-b p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ListVideo className="size-4 text-primary" />
                    Seus encontros
                  </h3>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">
                    {sequence.length}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Do primeiro ao mais recente.</p>
              </div>
              <ol className="max-h-60 space-y-1 overflow-y-auto overscroll-contain p-2 xl:max-h-[65vh]">
                {sequence.map((recording, index) => {
                  const current = active.id === recording.id;
                  return (
                    <li key={recording.id}>
                      <button
                        type="button"
                        aria-label={`Assistir encontro ${String(index + 1).padStart(2, "0")}: ${recording.title}`}
                        aria-current={current ? "true" : undefined}
                        onClick={() => choose(recording)}
                        className={
                          "group flex w-full min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                          (current
                            ? "border-primary/25 bg-primary/10"
                            : "border-transparent hover:bg-muted/60")
                        }
                      >
                        <span
                          className={
                            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums " +
                            (current
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground")
                          }
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              "block text-[10px] font-semibold uppercase tracking-wider " +
                              (current ? "text-primary" : "text-muted-foreground")
                            }
                          >
                            {current
                              ? "Selecionado"
                              : `Encontro ${String(index + 1).padStart(2, "0")}`}
                          </span>
                          <span className="mt-1 block line-clamp-2 break-words text-sm font-medium leading-snug">
                            {recording.title}
                          </span>
                          <span className="mt-2 block text-xs text-muted-foreground">
                            {recordingDate(recording.recorded_on)}
                          </span>
                        </span>
                        <ChevronRight
                          className={
                            "mt-3 size-4 shrink-0 " +
                            (current ? "text-primary" : "text-muted-foreground/40")
                          }
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center gap-2 border-t px-5 py-3 text-[11px] text-muted-foreground">
                <LockKeyhole className="size-3 shrink-0" />
                Gravações privadas da sua mentoria
              </div>
            </aside>
            <div className="min-w-0 xl:order-1">
              <RecordingPlayer
                key={active.id}
                recording={active}
                admin={false}
                onDirty={setDirty}
                speed={speed}
                onSpeedChange={setSpeed}
                navigation={{
                  index: activeIndex,
                  total: sequence.length,
                  previous: sequence[activeIndex - 1],
                  next: sequence[activeIndex + 1],
                  onChoose: choose,
                }}
              />
            </div>
          </div>
        )}
      </section>
    );
  return (
    <section
      className="space-y-5 min-w-0"
      aria-label={admin ? "Gravações exclusivas do mentorado" : "Minhas gravações"}
    >
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Video className="size-5 text-primary" />
          {admin ? "Gravações exclusivas" : "Minhas gravações"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {admin
            ? "Envie as calls semanais deste mentorado. Apenas ele e a administração podem assisti-las."
            : "Reassista às suas calls, retome de onde parou e registre suas anotações privadas."}
        </p>
      </div>
      {admin && (
        <RecordingUpload
          key={resume?.id || "new"}
          userId={userId}
          resume={resume}
          onDone={async () => {
            setResume(null);
            await load();
          }}
          onRefresh={load}
        />
      )}
      {error && (
        <div role="alert" className="surface p-4">
          <p>{error}</p>
          <button type="button" className="portal-outline mt-3" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground flex gap-2">
          <LoaderCircle className="size-4 animate-spin" />
          Carregando gravações...
        </p>
      )}
      {!loading && !error && !recordings.length && (
        <div className="surface p-8 text-center text-muted-foreground">
          {admin
            ? "Nenhuma gravação enviada para este mentorado."
            : "Suas gravações aparecerão aqui quando forem disponibilizadas pelo administrador."}
        </div>
      )}
      {!!recordings.length && (
        <div className="grid gap-3 sm:grid-cols-2">
          {recordings.map((recording) => (
            <div
              className={
                "surface p-4 min-w-0 " + (selected?.id === recording.id ? "border-primary/50" : "")
              }
              key={recording.id}
            >
              <h3 className="font-semibold break-words">{recording.title}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                <CalendarDays className="size-3" />
                {recordingDate(recording.recorded_on)} ·{" "}
                {(recording.size_bytes / 1024 / 1024).toFixed(1)} MB
              </p>
              {recording.status === "published" ? (
                <button
                  type="button"
                  className="portal-outline mt-4"
                  onClick={() => choose(recording)}
                >
                  <Play className="size-4" />
                  Assistir gravação
                </button>
              ) : (
                admin && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">
                      Envio pendente — ainda não visível para o aluno.
                    </p>
                    <button
                      type="button"
                      className="portal-outline mt-2"
                      onClick={() => setResume(recording)}
                    >
                      Retomar envio
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {selected && (
        <RecordingPlayer
          key={selected.id}
          recording={selected}
          admin={admin}
          onDirty={setDirty}
          speed={speed}
          onSpeedChange={setSpeed}
        />
      )}
    </section>
  );
}
function RecordingUpload({
  userId,
  resume,
  onDone,
  onRefresh,
}: {
  userId: string;
  resume: CallRecording | null;
  onDone: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(resume?.title || "");
  const [date, setDate] = useState(resume?.recorded_on || today());
  const [description, setDescription] = useState(resume?.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<CallRecording | null>(resume);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    if (!file) {
      setNotice("Selecione o arquivo da gravação.");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNotice("");
    setProgress(0);
    try {
      let target = draft;
      if (!target) {
        target = await createRecording(userId, title, description, date, file);
        if (alive.current) setDraft(target);
      }
      controller.signal.throwIfAborted();
      let published = false;
      if (draft) {
        try {
          await publishRecording(target.id);
          published = true;
        } catch (error) {
          if (!messageOf(error).startsWith("Envio incompleto")) throw error;
        }
      }
      if (!published) {
        await uploadRecordingFile(target, file, {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (alive.current) setProgress(Math.floor((done / total) * 100));
          },
        });
        controller.signal.throwIfAborted();
        await publishRecording(target.id);
      }
      clearRecordingUpload(target.file_path);
      if (alive.current) {
        setNotice("Gravação publicada no espaço exclusivo do mentorado.");
        setDraft(null);
        setFile(null);
        setTitle("");
        setDescription("");
        setDate(today());
        form.reset();
        await onDone();
      }
    } catch (e) {
      if (alive.current) {
        setNotice(
          controller.signal.aborted
            ? "Envio pausado. Selecione o mesmo arquivo e retome quando desejar."
            : messageOf(e),
        );
        await onRefresh();
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      aria-label="Enviar gravação exclusiva"
      className="surface p-5 grid gap-4 sm:grid-cols-2"
    >
      <label className="text-sm min-w-0">
        Título da gravação
        <input
          className="portal-input mt-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          disabled={busy || !!draft}
        />
      </label>
      <label className="text-sm min-w-0">
        Data da call
        <input
          type="date"
          className="portal-input mt-2"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          disabled={busy || !!draft}
        />
      </label>
      <label className="text-sm sm:col-span-2 min-w-0">
        Descrição ou assuntos abordados
        <textarea
          className="portal-input mt-2 min-h-20"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={8000}
          disabled={busy || !!draft}
        />
      </label>
      <label className="text-sm sm:col-span-2 min-w-0">
        Arquivo da call (MP4 ou WebM)
        <input
          type="file"
          accept="video/mp4,video/webm,.mp4,.webm"
          className="portal-input mt-2"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        MP4 H.264/AAC ou WebM, até 2 GB, sujeito ao limite do armazenamento. O envio usa blocos e
        pode ser retomado nesta aba com o mesmo arquivo. Mantenha a página aberta até concluir.
      </p>
      {draft && (
        <p className="text-xs text-muted-foreground sm:col-span-2 break-all">
          Arquivo esperado: {draft.file_name}
        </p>
      )}
      {busy && (
        <div className="sm:col-span-2">
          <progress
            aria-label="Progresso do envio"
            value={progress}
            max={100}
            className="w-full h-2"
          />
          <p role="status" className="text-sm mt-2">
            {progress === 100
              ? "Conferindo e publicando gravação..."
              : `Enviando gravação: ${progress}%`}
          </p>
        </div>
      )}
      <div className="sm:col-span-2 flex flex-wrap gap-3">
        <button type="submit" className="portal-button" disabled={busy || !file}>
          <Upload className="size-4" />
          {busy ? "Enviando..." : draft ? "Retomar envio" : "Enviar gravação"}
        </button>
        {busy && (
          <button type="button" className="portal-outline" onClick={() => abort.current?.abort()}>
            Pausar envio
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm sm:col-span-2 break-words">
          {notice}
        </p>
      )}
    </form>
  );
}
function RecordingPlayer({
  recording,
  admin,
  onDirty,
  speed,
  onSpeedChange,
  navigation,
}: {
  recording: CallRecording;
  admin: boolean;
  onDirty: (dirty: boolean) => void;
  speed: string;
  onSpeedChange: (speed: string) => void;
  navigation?: {
    index: number;
    total: number;
    previous: CallRecording | undefined;
    next: CallRecording | undefined;
    onChoose: (recording: CallRecording) => void;
  };
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const position = useRef(0),
    lastWrite = useRef(0),
    wasPlaying = useRef(false);
  const queue = useRef(Promise.resolve());
  const live = useRef(true);
  const dirty = note !== savedNote;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    live.current = true;
    let alive = true;
    void Promise.all([
      recordingPlayback(recording),
      admin ? Promise.resolve(null) : getRecordingLearning(recording.id),
    ])
      .then(([source, learning]) => {
        if (!alive) return;
        if (learning) {
          setNote(learning.content);
          setSavedNote(learning.content);
          setRevision(learning.revision);
          position.current = learning.position_seconds;
        }
        setUrl(source);
        setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setError(messageOf(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      live.current = false;
    };
  }, [recording, admin]);
  const storePosition = (seconds: number) => {
    if (admin || !Number.isFinite(seconds)) return;
    lastWrite.current = Date.now();
    queue.current = queue.current
      .then(() => saveRecordingPosition(recording.id, seconds))
      .catch(() => {
        if (live.current)
          setNotice("Não foi possível salvar o ponto de reprodução. Tente novamente.");
      });
  };
  const refreshVideo = async () => {
    setError("");
    setLoading(true);
    if (video.current) {
      position.current = video.current.currentTime;
      wasPlaying.current = !video.current.paused;
    }
    try {
      const source = await recordingPlayback(recording);
      if (live.current) setUrl(source);
    } catch (e) {
      if (live.current) setError(messageOf(e));
    } finally {
      if (live.current) setLoading(false);
    }
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setNotice("");
    const text = note;
    try {
      const result = await saveRecordingNote(recording.id, text, revision);
      if (live.current) {
        setSavedNote(text);
        setRevision(result.revision);
        setNotice("Anotações salvas.");
      }
    } catch (e) {
      if (live.current) setNotice(messageOf(e));
    } finally {
      if (live.current) setSaving(false);
    }
  };
  return (
    <article className="min-w-0 space-y-5" aria-label={`Assistindo: ${recording.title}`}>
      <div className="surface min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Play className="size-3.5" aria-hidden="true" />
            {navigation
              ? `Encontro ${String(navigation.index + 1).padStart(2, "0")}`
              : "Gravação exclusiva"}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {recordingDate(recording.recorded_on)}
          </span>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {!url && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">
              {loading ? (
                <span role="status" className="flex items-center gap-2">
                  <LoaderCircle className="size-5 animate-spin" />
                  Carregando gravação...
                </span>
              ) : (
                <span>Recarregue o vídeo para tentar novamente.</span>
              )}
            </div>
          )}
          {url && (
            <video
              ref={video}
              src={url}
              aria-label={`Gravação: ${recording.title}`}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full"
              onLoadedMetadata={(event) => {
                const player = event.currentTarget;
                player.playbackRate = Number(speed);
                if (position.current > 0 && position.current < player.duration - 2)
                  player.currentTime = position.current;
                if (wasPlaying.current) {
                  wasPlaying.current = false;
                  void player.play().catch(() => undefined);
                }
              }}
              onTimeUpdate={(event) => {
                position.current = event.currentTarget.currentTime;
                if (Date.now() - lastWrite.current >= 30000 && !event.currentTarget.paused)
                  storePosition(position.current);
              }}
              onPause={(event) => storePosition(event.currentTarget.currentTime)}
              onEnded={() => storePosition(0)}
              onError={() =>
                setError(
                  "O vídeo não carregou ou o link de reprodução expirou. Recarregue para renovar o acesso. Para MP4, use H.264/AAC.",
                )
              }
            />
          )}
          {loading && url && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 text-sm text-white"
            >
              <LoaderCircle className="size-5 animate-spin" />
              Renovando acesso ao vídeo...
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="border-b bg-destructive/5 p-5 text-sm">
            <p>{error}</p>
            <button
              type="button"
              className="portal-outline mt-3"
              onClick={() => void refreshVideo()}
            >
              Recarregar vídeo
            </button>
          </div>
        )}
        {url && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Gauge className="size-3.5" aria-hidden="true" />
                Velocidade de reprodução
              </span>
              <div
                role="group"
                aria-label="Velocidade de reprodução"
                className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-background/60 p-1"
              >
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    aria-label={`Velocidade ${rate}×`}
                    aria-pressed={Number(speed) === rate}
                    onClick={() => {
                      onSpeedChange(String(rate));
                      if (video.current) video.current.playbackRate = rate;
                    }}
                    className={
                      "min-h-10 min-w-10 rounded-lg px-2.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                      (Number(speed) === rate
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground")
                    }
                  >
                    {rate}×
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              aria-label="Renovar reprodução"
              title="Renovar o acesso ao vídeo"
              disabled={loading}
              onClick={() => void refreshVideo()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <RotateCw
                className={"size-3.5 " + (loading ? "animate-spin" : "")}
                aria-hidden="true"
              />
              Renovar acesso
            </button>
          </div>
        )}
        <div className="p-5 sm:p-6">
          <h3 className="break-words text-xl font-semibold leading-snug sm:text-2xl">
            {recording.title}
          </h3>
          {recording.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {recording.description}
            </p>
          )}
        </div>
        {navigation && (
          <nav aria-label="Navegação entre encontros" className="border-t px-5 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Continue sua sequência</span>
              <span className="tabular-nums">
                {navigation.index + 1} de {navigation.total} encontros
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-label="Encontro anterior"
                disabled={!navigation.previous}
                onClick={() => {
                  if (navigation.previous) navigation.onChoose(navigation.previous);
                }}
                className="flex min-w-0 items-center gap-2 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">Anterior</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {navigation.previous?.title || "Primeiro encontro"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label="Próximo encontro"
                disabled={!navigation.next}
                onClick={() => {
                  if (navigation.next) navigation.onChoose(navigation.next);
                }}
                className="flex min-w-0 items-center justify-end gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-right transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">Próximo</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {navigation.next?.title || "Último encontro"}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0" />
              </button>
            </div>
          </nav>
        )}
      </div>
      {!admin && url && (
        <section className="surface overflow-hidden" aria-label="Anotações do encontro">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <NotebookPen className="size-4" />
              </span>
              <div>
                <h4 className="text-sm font-semibold">Minhas anotações</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ideias e próximos passos deste encontro.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <LockKeyhole className="size-3" />
              Só você pode ler
            </span>
          </div>
          <div className="p-5 sm:p-6">
            <label htmlFor={`recording-note-${recording.id}`} className="sr-only">
              Minhas anotações privadas
            </label>
            <textarea
              id={`recording-note-${recording.id}`}
              className="portal-input min-h-48 resize-y text-sm leading-relaxed"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={50000}
              disabled={saving || loading}
              placeholder="O que ficou desta call? Registre aprendizados, decisões e as ações que você vai colocar em prática..."
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p
                  className={
                    "flex items-center gap-1.5 text-xs " +
                    (dirty ? "text-warning" : "text-muted-foreground")
                  }
                >
                  {dirty ? (
                    <>
                      <span className="size-1.5 rounded-full bg-warning" />
                      Alterações ainda não salvas
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5 text-success" />
                      Tudo salvo
                    </>
                  )}
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {note.length.toLocaleString("pt-BR")} / 50.000 caracteres
                </p>
              </div>
              <button
                type="button"
                className="portal-button"
                disabled={saving || !dirty || loading}
                onClick={() => void save()}
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "Salvando..." : "Salvar anotações"}
              </button>
            </div>
          </div>
        </section>
      )}
      {admin && (
        <p className="text-xs text-muted-foreground">
          As anotações do mentorado são privadas e não aparecem para a administração.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
    </article>
  );
}
