// Best-effort wipe of everything this tab holds for Asmita. Quick Exit, the
// idle sign-out and Close Dashboard call this BEFORE location.replace(): the
// keepalive logout request may never finish (offline, tab closed mid-flight),
// so the tab must not count on the server's Clear-Site-Data header arriving.
// The survivor flow keeps everything in sessionStorage (tests/unit/
// flow-state.test.ts), which is exactly what this clears; the admin
// keyboard-shortcut preference in localStorage goes via the admin logout
// route's Clear-Site-Data header instead.
export function clearTabStorage() {
  try {
    sessionStorage.clear();
  } catch {
    // Private mode or storage disabled: nothing was stored.
  }
}
