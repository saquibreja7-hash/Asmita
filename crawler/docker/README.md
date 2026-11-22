# crawler/docker — the browser sandbox's container pieces (WP25)

Everything here is used by `crawler/Dockerfile` (and nothing else):

- `asmita-browser-drop.c` — the tiny setuid-root helper the crawler spawns
  the browser worker through. It drops all supplementary groups, switches
  to the compile-time-fixed uid/gid 30000 (`browser-worker`) and then
  execs its argv (argv[1] is the worker's temp directory, which it puts
  back into TMPDIR: glibc's secure-exec scrub deletes TMPDIR for every
  setuid-root binary, and Chromium would otherwise write its
  shared-memory files into /tmp, read-only in the image); it runs no
  attacker-controlled code as root, the same pattern as Chromium's own
  `chrome-sandbox` helper. A non-root process cannot switch uids by
  itself, so without it the worker would have to run as the crawler's
  user and a renderer exploit could read the key file. The worker's IPC
  channel survives the exec chain: `spawn` wires `NODE_CHANNEL_FD` into
  the child's environment whatever the binary, and node's bootstrap picks
  the channel up after the helper's `execvp`.
- `entrypoint.sh` — runs the crawler. When the container starts as root it
  hands the mounted key file to the crawler's user (owner `node`, mode
  0400 — so the `browser-worker` user cannot read it) and drops privileges
  once with `setpriv`; nothing keeps root afterwards. When the container
  starts non-root (the image default, Cloudflare Containers) it just
  execs the crawler.
- `seccomp-userns.json` — Docker's default seccomp profile (from
  https://github.com/moby/profiles, `profiles/seccomp/default.json`,
  Apache-2.0) plus one rule: `clone`, `clone3` and `unshare` are allowed
  unconditionally, which lets Chromium create the unprivileged user
  namespace its sandbox needs. Without it (Docker's default profile)
  those syscalls are allowed only with `CAP_SYS_ADMIN`, which a non-root
  container user never has — so Chromium's sandbox cannot start and the
  crawler disables rendering for the run (fail closed, WP25). Everything
  else keeps the default profile's rules. Pass it with:
  `--security-opt seccomp=crawler/docker/seccomp-userns.json`

`scripts/docker-sandbox-check.sh` (run from the repository root) builds the
image and proves both modes against real Docker.
