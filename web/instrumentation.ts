// Runs once when the server process starts (Next instrumentation hook). Starts
// the headless server-side backfill loop — but only in the Node runtime and only
// when a cookie encryption key is configured (i.e. the user opted into the
// server-side fetch mode). Otherwise it's a no-op and no worker runs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { serverCaptureEnabled } = await import("./lib/cookieStore");
  if (!serverCaptureEnabled()) return;

  const { backfillTick } = await import("./lib/serverBackfill");
  const periodMs = Math.max(5, Number(process.env.NEWSHUB_BACKFILL_MIN) || 15) * 60_000;
  console.log("[newshub] server-side backfill worker started, every", periodMs / 60_000, "min");

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await backfillTick();
    } catch (err) {
      console.error("[backfill]", err);
    } finally {
      running = false;
    }
  };

  // First pass shortly after boot, then on the interval.
  setTimeout(run, 15_000);
  setInterval(run, periodMs);
}
