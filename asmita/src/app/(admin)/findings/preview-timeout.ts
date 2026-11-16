// The notice preview shows both addresses and holds the PDF bytes, so it is
// cleared after a short period of inactivity, like the 30-second address
// reveal. Plain timers, no React, so the logic is tested with fake timers
// (tests/unit/admin-notice-preview-timeout.test.ts).

/** Seconds of inactivity after which the preview (and its PDF bytes) is dropped. */
export const PREVIEW_IDLE_SECONDS = 120;

export type IdleTimer = {
  /** Activity on the preview: restart the countdown. Ignored once expired. */
  touch(): void;
  /** Seconds until the preview is hidden (0 once expired). */
  secondsLeft(): number;
  expired(): boolean;
  /** Stop without expiring (the preview was replaced, sent or unmounted). */
  stop(): void;
};

/**
 * Calls onTick with the seconds left about once a second and onExpire once,
 * after idleSeconds without touch(). Never expires twice; after stop() it
 * never calls anything again.
 */
export function startIdleTimer(opts: {
  idleSeconds?: number;
  onExpire: () => void;
  onTick?: (secondsLeft: number) => void;
  now?: () => number;
}): IdleTimer {
  const idleMs = (opts.idleSeconds ?? PREVIEW_IDLE_SECONDS) * 1000;
  const now = opts.now ?? (() => Date.now());
  let deadline = now() + idleMs;
  let done = false;
  let expiredFlag = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const left = () => (done ? 0 : Math.max(0, Math.ceil((deadline - now()) / 1000)));
  const finish = () => {
    if (done) return;
    done = true;
    expiredFlag = true;
    clearInterval(tick);
    clearTimeout(expiry);
    opts.onTick?.(0);
    opts.onExpire();
  };
  const arm = () => {
    clearTimeout(expiry);
    expiry = setTimeout(finish, Math.max(0, deadline - now()));
  };
  const tick = setInterval(() => {
    if (done) return;
    if (now() >= deadline) finish();
    else opts.onTick?.(left());
  }, 1000);
  arm();
  return {
    touch() {
      if (done) return;
      deadline = now() + idleMs;
      arm();
      opts.onTick?.(left());
    },
    secondsLeft: left,
    expired: () => expiredFlag,
    stop() {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(expiry);
    },
  };
}
