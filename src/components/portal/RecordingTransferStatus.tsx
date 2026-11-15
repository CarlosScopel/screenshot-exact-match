import {
  forgetRecordingTransfer,
  pauseRecordingTransfer,
  resumeRecordingTransfer,
  transferIsActive,
  useRecordingTransfers,
} from "@/lib/recording-transfers";

/** Remains visible while the administrator navigates away from a member's form. */
export function RecordingTransferStatus({ ownerId }: { ownerId: string }) {
  const transfers = useRecordingTransfers().filter((item) => item.ownerId === ownerId);
  if (!transfers.length) return null;
  return (
    <aside
      aria-label="Envios de gravações"
      className="fixed bottom-4 right-4 z-40 max-h-[40vh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto space-y-3"
    >
      {transfers.map((item) => (
        <div className="surface p-4 shadow-lg" key={item.userId}>
          <p className="text-sm font-semibold break-words">{item.title}</p>
          <p role="status" className="mt-1 text-xs text-muted-foreground break-words">
            {item.message} {transferIsActive(item) && `${item.progress}%`}
          </p>
          {transferIsActive(item) && (
            <progress
              aria-label={`Envio de ${item.title}`}
              className="mt-2 w-full"
              value={item.progress}
              max={100}
            />
          )}
          <div className="mt-3 flex gap-2 flex-wrap">
            {transferIsActive(item) ? (
              <button
                type="button"
                disabled={item.status === "publishing"}
                className="portal-outline text-xs"
                onClick={() => pauseRecordingTransfer(item.userId)}
              >
                Pausar envio
              </button>
            ) : (
              <>
                {item.hasFile && (
                  <button
                    type="button"
                    className="portal-button text-xs"
                    onClick={() => void resumeRecordingTransfer(item.userId)}
                  >
                    Retomar envio
                  </button>
                )}
                <button
                  type="button"
                  className="portal-outline text-xs"
                  onClick={() => forgetRecordingTransfer(item.userId)}
                >
                  Fechar aviso
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </aside>
  );
}
