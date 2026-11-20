// Shown on the Lab pages when the deployment switch is off. While it is off
// the lab API refuses every change with 503 lab_disabled; history stays
// readable, and the public /lab page shows no numbers.
export function LabOffBanner() {
  return (
    <div className="a-card mt-6 p-4 text-sm" role="status">
      <p className="font-medium">The AI Lab is switched off.</p>
      <p className="muted mt-1">
        Adding or editing services, chokepoints and reports is unavailable until it is switched on
        (<code>ENABLE_LAB</code>). What was recorded so far can still be read.
      </p>
    </div>
  );
}
