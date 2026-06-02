import { usePitchMonitor, ROOT_NOTES, type ScaleType, type RootNote } from "@/hooks/usePitchMonitor";
import { useEffect, useRef } from "react";

// ── Tuner needle arc ─────────────────────────────────────────────────────────
function TunerArc({ cents }: { cents: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Arc background
    ctx.strokeStyle = "rgba(0,255,204,0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H, H * 0.9, Math.PI, 0, false);
    ctx.stroke();

    // Center marker
    ctx.strokeStyle = "rgba(0,255,204,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, H - H * 0.7);
    ctx.lineTo(W / 2, H - H * 0.9);
    ctx.stroke();

    if (cents === null) return;

    // Clamp needle to ±50 cents
    const clampedCents = Math.max(-50, Math.min(50, cents));
    const angle = Math.PI + (clampedCents / 50) * (Math.PI / 2);

    // Needle color: green if close, yellow if a bit off, red if far
    const abs = Math.abs(clampedCents);
    const color = abs < 8 ? "#00ffcc" : abs < 20 ? "#ffdc00" : "#ff003c";

    // Draw needle
    const r = H * 0.88;
    const nx = W / 2 + r * Math.cos(angle);
    const ny = H      + r * Math.sin(angle);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dot at center
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(W / 2, H, 4, 0, Math.PI * 2);
    ctx.fill();

  }, [cents]);

  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={80}
      style={{ width: "180px", height: "80px" }}
    />
  );
}

// ── Cents bar ────────────────────────────────────────────────────────────────
function CentsBar({ cents }: { cents: number }) {
  const pct = Math.max(-50, Math.min(50, cents)) / 50; // -1 to 1
  const abs  = Math.abs(pct);
  const color = abs < 0.15 ? "#00ffcc" : abs < 0.4 ? "#ffdc00" : "#ff003c";

  return (
    <div style={{
      width: "100%", height: "6px", background: "rgba(255,255,255,0.06)",
      borderRadius: "3px", position: "relative", overflow: "hidden",
    }}>
      {/* Center marker */}
      <div style={{
        position: "absolute", left: "50%", top: 0, width: "1px", height: "100%",
        background: "rgba(0,255,204,0.3)",
      }} />
      {/* Bar */}
      <div style={{
        position: "absolute",
        left:   pct >= 0 ? "50%" : `${50 + pct * 50}%`,
        width:  `${abs * 50}%`,
        height: "100%",
        background: color,
        boxShadow: `0 0 6px ${color}`,
        borderRadius: "3px",
        transition: "all 0.05s ease-out",
      }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PitchMonitor() {
  const m = usePitchMonitor();

  const SCALES: { id: ScaleType; label: string }[] = [
    { id: "chromatic",  label: "Cromática" },
    { id: "major",      label: "Mayor" },
    { id: "minor",      label: "Menor" },
    { id: "pentatonic", label: "Pentatónica" },
    { id: "dorian",     label: "Dórico" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 0,
      background: "#060606",
      borderTop: "1px solid rgba(0,255,204,0.08)",
      fontFamily: "Menlo, monospace",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.5rem 1rem",
        borderBottom: "1px solid rgba(0,255,204,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: m.active ? "#00ffcc" : "rgba(255,255,255,0.15)",
            boxShadow: m.active ? "0 0 6px #00ffcc" : "none",
            transition: "all 0.3s",
          }} />
          <span style={{ fontSize: "0.6rem", letterSpacing: "0.25em", textTransform: "uppercase", color: "rgba(0,255,204,0.7)" }}>
            322.PITCH — Monitor
          </span>
          {m.active && m.pitch?.correcting && (
            <span style={{ fontSize: "0.5rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#ffdc00", marginLeft: "0.25rem" }}>
              CORRIGIENDO
            </span>
          )}
        </div>

        <button
          onClick={m.active ? m.stop : m.start}
          disabled={m.loading}
          style={{
            fontFamily: "Menlo, monospace",
            fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase",
            padding: "0.25rem 0.75rem",
            border: `1px solid ${m.active ? "rgba(255,0,60,0.4)" : "rgba(0,255,204,0.3)"}`,
            background: "transparent",
            color: m.active ? "#ff003c" : "#00ffcc",
            cursor: m.loading ? "wait" : "pointer",
            borderRadius: "2px",
            transition: "all 0.15s",
          }}
        >
          {m.loading ? "INICIANDO..." : m.active ? "DETENER" : "ACTIVAR MONITOR"}
        </button>
      </div>

      {/* Error */}
      {m.error && (
        <div style={{ padding: "0.5rem 1rem", fontSize: "0.65rem", color: "#ff003c", background: "rgba(255,0,60,0.05)" }}>
          {m.error}
        </div>
      )}

      {/* Body */}
      <div style={{ display: "flex", gap: 0 }}>

        {/* Left — Tuner + pitch display */}
        <div style={{
          width: "200px", flexShrink: 0,
          borderRight: "1px solid rgba(0,255,204,0.06)",
          padding: "0.75rem",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
        }}>
          <TunerArc cents={m.pitch?.cents ?? null} />

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.8rem", fontWeight: 700, letterSpacing: "0.05em", color: "#00ffcc", lineHeight: 1 }}>
              {m.active ? (m.pitch?.targetNote ?? "—") : "—"}
            </div>
            <div style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", marginTop: "2px" }}>
              {m.active && m.pitch ? `${m.pitch.note} → ${m.pitch.targetNote}` : "sin señal"}
            </div>
          </div>

          {m.active && m.pitch && (
            <CentsBar cents={m.pitch.cents} />
          )}

          {m.active && m.pitch && (
            <div style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}>
              {m.pitch.freq > 0 ? `${m.pitch.freq} Hz → ${m.pitch.target} Hz` : "—"}
            </div>
          )}
        </div>

        {/* Right — Controls */}
        <div style={{ flex: 1, padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

          {/* Scale + Root */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: "100px" }}>
              <span style={{ fontSize: "0.5rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(0,255,204,0.4)" }}>
                Escala
              </span>
              <select
                value={m.scale}
                onChange={e => m.setScale(e.target.value as ScaleType)}
                style={{
                  fontFamily: "Menlo, monospace", fontSize: "0.65rem",
                  background: "rgba(0,0,0,0.5)", border: "1px solid rgba(0,255,204,0.15)",
                  color: "#e0e0e0", padding: "0.2rem 0.4rem", borderRadius: "2px", outline: "none",
                }}
              >
                {SCALES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.5rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(0,255,204,0.4)" }}>
                Tónica
              </span>
              <select
                value={m.root}
                onChange={e => m.setRoot(e.target.value as RootNote)}
                style={{
                  fontFamily: "Menlo, monospace", fontSize: "0.65rem",
                  background: "rgba(0,0,0,0.5)", border: "1px solid rgba(0,255,204,0.15)",
                  color: "#e0e0e0", padding: "0.2rem 0.4rem", borderRadius: "2px", outline: "none",
                }}
              >
                {ROOT_NOTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Strength */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.5rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(0,255,204,0.4)" }}>
                Corrección
              </span>
              <span style={{ fontSize: "0.55rem", color: "#00ffcc" }}>
                {Math.round(m.strength * 100)}%
              </span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={m.strength}
              onChange={e => m.setStrength(parseFloat(e.target.value))}
              className="track-fader"
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.5rem", color: "rgba(255,255,255,0.2)" }}>
              <span>Natural</span><span>Auto-Tune</span>
            </div>
          </div>

          {/* Speed */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.5rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(0,255,204,0.4)" }}>
                Velocidad
              </span>
              <span style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.5)" }}>
                {m.speed < 0.2 ? "Rápida" : m.speed < 0.5 ? "Media" : "Lenta"}
              </span>
            </div>
            <input
              type="range" min={0.01} max={0.95} step={0.01}
              value={m.speed}
              onChange={e => m.setSpeed(parseFloat(e.target.value))}
              className="track-fader"
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.5rem", color: "rgba(255,255,255,0.2)" }}>
              <span>T-Pain</span><span>Coral</span>
            </div>
          </div>

          {/* Latency info */}
          <div style={{
            padding: "0.4rem 0.6rem",
            background: "rgba(0,255,204,0.03)",
            border: "1px solid rgba(0,255,204,0.08)",
            borderRadius: "2px",
            fontSize: "0.55rem",
            color: "rgba(255,255,255,0.25)",
            lineHeight: 1.6,
          }}>
            <span style={{ color: "rgba(0,255,204,0.4)" }}>Latencia estimada: </span>
            Android ~30ms · iOS ~50ms · Desktop ~15ms
          </div>
        </div>
      </div>
    </div>
  );
}
