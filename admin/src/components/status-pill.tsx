type Tone = "success" | "warn" | "neutral";

export function StatusPill({ label, tone = "neutral", hint }: { label: string; tone?: Tone; hint?: string }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" aria-hidden />
      <span>{label}</span>
      {hint ? <span style={{ color: "var(--muted)" }}>· {hint}</span> : null}
    </span>
  );
}
