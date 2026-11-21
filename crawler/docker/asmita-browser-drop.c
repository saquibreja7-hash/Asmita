/*
 * asmita-browser-drop — the WP25 setuid helper for the crawler's container
 * image. The browser worker (node dist/browser-worker.js, which hosts
 * Chromium) must run as a different OS user from the crawler: a renderer
 * exploit then cannot read the service key file, which is owned by the
 * crawler's user with mode 0400, nor the parent's /proc/<pid>/environ.
 * A non-root process cannot switch uids by itself, so the image carries
 * this tiny setuid-root binary — the same pattern Chromium's own
 * chrome-sandbox helper uses — and the crawler spawns the worker through
 * it (CRAWLER_BROWSER_WORKER_HELPER in the image's environment).
 *
 * It runs no attacker-controlled code as root: the only things it does as
 * root are dropping all supplementary groups and switching to the
 * compile-time-fixed WORKER_UID/WORKER_GID, and only then execvp() of the
 * argv it was handed. A caller that abused it could only start a process
 * as the browser-worker user — something it is allowed to do anyway — and
 * it refuses to hand out uid 0 at compile time. It preserves the caller's
 * environment and file descriptors untouched: the parent passes the IPC
 * channel (NODE_CHANNEL_FD, fd 3) through it, and node picks the channel up
 * after the exec (verified in the WP25 progress notes), with one repair:
 * argv[1] is the worker's temp directory, which it puts back into TMPDIR —
 * glibc's secure-exec scrub (unsecure environment variables, in effect for
 * every setuid-root binary) deletes TMPDIR when this helper starts, and
 * without it Chromium would write its shared-memory files into /tmp, which
 * the image holds read-only.
 *
 * Usage: asmita-browser-drop <tmpdir> <program> [args...]
 */
#define _GNU_SOURCE
#include <errno.h>
#include <grp.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#if !defined(WORKER_UID) || !defined(WORKER_GID)
#error "WORKER_UID and WORKER_GID must be given at compile time"
#endif
#if WORKER_UID == 0 || WORKER_GID == 0
#error "the browser worker must never run as root"
#endif

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "asmita-browser-drop: usage: asmita-browser-drop <tmpdir> -- <program> [args]\n");
    return 2;
  }
  /* Not setuid root: refuse rather than run the worker as the crawler's user
   * (the runtime may block setuid, e.g. a nosuid mount; the parent treats the
   * failure as a failed launch and rendering fails closed). */
  if (geteuid() != 0) {
    fprintf(stderr, "asmita-browser-drop: not setuid root\n");
    return 3;
  }
  if (setgroups(0, NULL) != 0) {
    perror("asmita-browser-drop: setgroups");
    return 4;
  }
  if (setgid(WORKER_GID) != 0 || setuid(WORKER_UID) != 0) {
    perror("asmita-browser-drop: setuid/setgid");
    return 5;
  }
  if (getuid() != WORKER_UID || geteuid() != WORKER_UID || getgid() != WORKER_GID) {
    fprintf(stderr, "asmita-browser-drop: id change did not hold\n");
    return 6;
  }
  /* Restore the TMPDIR glibc's secure-exec scrub deleted when this setuid
   * binary started (see the header). After the drop the exec is ordinary,
   * so nothing scrubs it again. */
  if (setenv("TMPDIR", argv[1], 1) != 0) {
    perror("asmita-browser-drop: setenv");
    return 8;
  }
  execvp(argv[2], argv + 2);
  perror("asmita-browser-drop: execvp");
  return 7;
}
