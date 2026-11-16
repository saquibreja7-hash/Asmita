// Interim guidance for the analyst. The written procedure (POCSO protocol)
// is not final: this wording is a placeholder until it is.
export function SafetyNote() {
  return (
    <aside aria-labelledby="safety-note-title" className="a-card mt-6 p-4 text-sm">
      <h2 id="safety-note-title">Before you look</h2>
      <p className="muted mt-1 text-xs">Interim guidance, pending the written procedure.</p>
      <ul className="mt-3 grid list-disc gap-2 pl-5">
        <li>A match is a lead, not proof. Distance and quality only say two images look alike.</li>
        <li>Do not open the address on a personal device or personal account. Use only the equipment set aside for this work.</li>
        <li>This console never opens, loads or previews the address for you. You see it as text only.</li>
        <li>
          If the page appears to involve a child: stop, do not save, copy or share anything, and tell the SUPER_ADMIN
          straight away.
        </li>
      </ul>
    </aside>
  );
}
