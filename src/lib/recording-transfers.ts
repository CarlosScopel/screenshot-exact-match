import { useSyncExternalStore } from "react";
import { createRecording, publishRecording, type CallRecording } from "./recordings";
import { clearRecordingUpload, uploadRecordingFile } from "./recordings-upload";

export type TransferStatus =
  "preparing" | "uploading" | "publishing" | "paused" | "error" | "complete";
export type RecordingTransfer = {
  userId: string;
  ownerId: string;
  title: string;
  fileName: string;
  recording: CallRecording | null;
  status: TransferStatus;
  progress: number;
  message: string;
  hasFile: boolean;
};
type Input = {
  userId: string;
  title: string;
  description: string;
  date: string;
  file: File;
  recording?: CallRecording | null;
};
type Job = {
  input: Omit<Input, "file">;
  state: RecordingTransfer;
  file: File | null;
  controller: AbortController;
  promise: Promise<void>;
};
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const empty: readonly RecordingTransfer[] = [];
let snapshot: readonly RecordingTransfer[] = empty;
let ownerId: string | null = null;
let warningAttached = false;
export const transferIsActive = (transfer?: RecordingTransfer | null) =>
  !!transfer && ["preparing", "uploading", "publishing"].includes(transfer.status);
const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = "";
};
function emit() {
  snapshot = [...jobs.values()].map((job) => job.state);
  const active = snapshot.some(transferIsActive);
  if (typeof window !== "undefined" && active !== warningAttached) {
    if (active) window.addEventListener("beforeunload", warnBeforeLeaving);
    else window.removeEventListener("beforeunload", warnBeforeLeaving);
    warningAttached = active;
  }
  listeners.forEach((listener) => listener());
}
function update(job: Job, change: Partial<RecordingTransfer>) {
  if (jobs.get(job.state.userId) !== job || ownerId !== job.state.ownerId) return;
  job.state = { ...job.state, ...change };
  emit();
}
function assertCurrent(job: Job) {
  job.controller.signal.throwIfAborted();
  if (jobs.get(job.state.userId) !== job || ownerId !== job.state.ownerId)
    throw new DOMException("Sessão alterada", "AbortError");
}
/** Called synchronously by AuthProvider. Real logout/account changes stop and clear every task. */
export function setRecordingUploadOwner(next: string | null) {
  if (ownerId === next) return;
  ownerId = next;
  for (const job of jobs.values()) {
    job.controller.abort();
    job.file = null;
  }
  jobs.clear();
  emit();
}
async function run(job: Job, resuming: boolean) {
  try {
    assertCurrent(job);
    if (!job.file) throw new Error("Selecione o mesmo arquivo para retomar o envio.");
    let recording = job.state.recording;
    if (!recording) {
      recording = await createRecording(
        job.input.userId,
        job.input.title,
        job.input.description,
        job.input.date,
        job.file,
      );
      // Keep the created row for a later resume even when paused during preparation.
      update(job, { recording });
      assertCurrent(job);
    }
    let published = false;
    if (resuming) {
      try {
        await publishRecording(recording.id);
        published = true;
      } catch (error) {
        assertCurrent(job);
        if (!(error instanceof Error) || !error.message.startsWith("Envio incompleto")) throw error;
      }
    }
    if (!published) {
      assertCurrent(job);
      update(job, { status: "uploading", message: "Enviando gravação..." });
      await uploadRecordingFile(recording, job.file, {
        signal: job.controller.signal,
        expectedUserId: job.state.ownerId,
        onProgress: (done, total) => update(job, { progress: Math.floor((done / total) * 100) }),
      });
      assertCurrent(job);
      update(job, { status: "publishing", message: "Conferindo e publicando gravação..." });
      await publishRecording(recording.id);
    }
    assertCurrent(job);
    clearRecordingUpload(recording.file_path);
    job.file = null;
    update(job, {
      recording: { ...recording, status: "published" },
      status: "complete",
      progress: 100,
      hasFile: false,
      message: "Gravação publicada no espaço exclusivo do mentorado.",
    });
  } catch (error) {
    update(job, {
      status: job.controller.signal.aborted ? "paused" : "error",
      message: job.controller.signal.aborted
        ? "Envio pausado. Clique em Retomar envio para continuar."
        : error instanceof Error
          ? error.message
          : "Não foi possível enviar a gravação. Tente retomar o envio.",
    });
  }
}
export function startRecordingTransfer(input: Input): Promise<void> {
  if (!ownerId) throw new Error("Entre novamente como administrador para enviar a gravação.");
  const previous = jobs.get(input.userId);
  if (previous && transferIsActive(previous.state)) return previous.promise;
  if (input.recording && input.recording.user_id !== input.userId)
    throw new Error("A gravação pertence a outro mentorado.");
  const { file, ...metadata } = input;
  const job: Job = {
    input: metadata,
    file,
    controller: new AbortController(),
    promise: Promise.resolve(),
    state: {
      userId: input.userId,
      ownerId,
      title: input.recording?.title || input.title,
      fileName: input.file.name,
      recording: input.recording || null,
      status: "preparing",
      progress: 0,
      message: "Preparando envio...",
      hasFile: true,
    },
  };
  jobs.set(input.userId, job);
  emit();
  job.promise = run(job, !!input.recording);
  return job.promise;
}
export function pauseRecordingTransfer(userId: string) {
  const job = jobs.get(userId);
  if (job && job.state.status !== "publishing") job.controller.abort();
}
export function resumeRecordingTransfer(userId: string): Promise<void> {
  const job = jobs.get(userId);
  if (!job || !job.file || job.state.ownerId !== ownerId)
    throw new Error("Selecione o mesmo arquivo para retomar o envio.");
  if (transferIsActive(job.state)) return job.promise;
  job.controller = new AbortController();
  update(job, { status: "preparing", message: "Retomando envio..." });
  job.promise = run(job, !!job.state.recording);
  return job.promise;
}
export function forgetRecordingTransfer(userId: string, recordingId?: string) {
  const job = jobs.get(userId);
  if (
    !job ||
    transferIsActive(job.state) ||
    (recordingId && job.state.recording?.id !== recordingId)
  )
    return;
  job.file = null;
  jobs.delete(userId);
  emit();
}
export const getRecordingTransfers = () => snapshot;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useRecordingTransfers() {
  return useSyncExternalStore(subscribe, getRecordingTransfers, () => empty);
}
export function useRecordingTransfer(userId: string) {
  return useRecordingTransfers().find((transfer) => transfer.userId === userId);
}
