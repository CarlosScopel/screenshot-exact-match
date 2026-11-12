const PUBLISHED_ORIGIN = "https://pixel-perfect-replay-54723.lovable.app";
const PREVIEW_ORIGIN = "https://id-preview--fe5f8730-9053-4efb-acbc-09b0dca41d85.lovable.app";

/** Auth emails may return only to this project's published or preview origin. */
export function authRedirectUrl(value?: string, type: "invite" | "recovery" = "recovery") {
  let origin = PUBLISHED_ORIGIN;
  try {
    const candidate = new URL(value || PUBLISHED_ORIGIN);
    if (
      !candidate.username &&
      !candidate.password &&
      (candidate.origin === PUBLISHED_ORIGIN || candidate.origin === PREVIEW_ORIGIN)
    ) {
      origin = candidate.origin;
    }
  } catch {
    // Never copy an arbitrary or malformed return URL into an authentication email.
  }
  const callback = new URL(type === "recovery" ? "/reset-password" : "/", origin);
  callback.searchParams.set("type", type);
  return callback.href;
}
