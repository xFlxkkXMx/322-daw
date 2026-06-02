import { useListRecordings } from "@workspace/api-client-react";
import { useRef, useEffect, useState } from "react";

function WaveformCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(0,255,204,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const amp = 0.3 + Math.random() * 0.6;
      const y = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * amp;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);
  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={40}
      style={{ width: "100%", height: "40px" }}
    />
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Recordings() {
  const { data: recordings, isLoading } = useListRecordings();
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (id: number, url?: string | null) => {
    if (!url) return;
    if (playing === id) {
      audioRef.current?.pause();
      setPlaying(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(url);
      audioRef.current.play();
      audioRef.current.onended = () => setPlaying(null);
      setPlaying(id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="section-header">
        <div>
          <div className="section-header__title">Recordings</div>
          <div className="section-header__sub">Captured audio clips from all sessions</div>
        </div>
        {recordings && recordings.length > 0 && (
          <span className="plugin-row__tag plugin-row__tag--builtin">{recordings.length} CLIPS</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {isLoading ? (
          <div className="empty-state">
            <div className="empty-state__title" style={{ color: "rgba(0,255,204,0.4)" }}>LOADING...</div>
          </div>
        ) : !recordings || recordings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon" style={{ color: "rgba(0,255,204,0.2)" }}>◎</div>
            <div className="empty-state__title">No Recordings Yet</div>
            <div className="empty-state__text">
              Go to Workspace, arm a track (●) and press record.<br />
              No bridge needed — mic recording works in the browser.
            </div>
          </div>
        ) : (
          <div className="recordings-grid">
            {recordings.map(rec => (
              <div key={rec.id} className="recording-card" onClick={() => togglePlay(rec.id, rec.url)}>
                <div className="recording-card__waveform">
                  <WaveformCanvas />
                  <div style={{
                    position: "absolute", inset: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", background: "rgba(0,0,0,0.5)",
                    opacity: playing === rec.id ? 1 : 0, transition: "opacity 0.15s",
                    fontSize: "1rem", color: "#00ffcc",
                  }}>
                    ⏸
                  </div>
                </div>
                <div className="recording-card__name">{rec.name}</div>
                <div className="recording-card__meta">
                  {formatDuration(rec.duration)} · {formatDate(rec.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
