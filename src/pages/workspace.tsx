import { useState, useEffect, useRef } from "react";
import {
  useListProjects, useCreateProject,
  useListTracks, useCreateTrack,
} from "@workspace/api-client-react";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { PitchMonitor } from "@/components/monitor/PitchMonitor";

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function VuMeter({ level }: { level: number }) {
  const bars = 8;
  return (
    <div className="vu-meter">
      {[...Array(bars)].map((_, i) => {
        const threshold = i / bars;
        const active = level > threshold;
        const color = i < 5 ? "#00ffcc" : i < 7 ? "#ffdc00" : "#ff003c";
        return (
          <div
            key={i}
            className="vu-meter__bar"
            style={{
              height: `${((i + 1) / bars) * 100}%`,
              background: active ? color : "rgba(255,255,255,0.06)",
              boxShadow: active ? `0 0 4px ${color}40` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function WaveformCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,255,204,0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const y = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.7;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [url]);
  return <canvas ref={canvasRef} width={200} height={32} style={{ width: "100%", height: "32px", borderRadius: "1px" }} />;
}

export default function Workspace() {
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const createProject = useCreateProject();
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (projects && projects.length > 0 && !activeProjectId) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  const { data: tracks, isLoading: tracksLoading } = useListTracks(activeProjectId || 0, {
    query: { enabled: !!activeProjectId }
  });
  const createTrack = useCreateTrack();

  const engine = useAudioEngine();

  useEffect(() => {
    if (tracks) engine.initTracks(tracks.map(t => t.id));
  }, [tracks]);

  const handleRecord = () => {
    if (engine.state === "recording") {
      engine.stop();
    } else {
      engine.record();
    }
  };

  const activeProject = projects?.find(p => p.id === activeProjectId);

  if (projectsLoading) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state__title" style={{ color: "rgba(0,255,204,0.4)" }}>LOADING SESSION...</div>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state__icon">◈</div>
        <div className="empty-state__title">No Sessions</div>
        <div className="empty-state__text">Create a session to start recording and using plugins.</div>
        <button
          className="bridge-panel__btn"
          style={{ marginTop: "0.5rem", padding: "0.4rem 1.2rem" }}
          onClick={() => createProject.mutate({ data: { name: "Session 01", bpm: 120 } })}
        >
          + NEW SESSION
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Transport */}
      <div className="transport">
        <select
          className="bridge-panel__input"
          style={{ width: "160px" }}
          value={activeProjectId?.toString() ?? ""}
          onChange={e => setActiveProjectId(parseInt(e.target.value))}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id.toString()}>{p.name}</option>
          ))}
        </select>

        <button
          className="bridge-panel__btn"
          style={{ fontSize: "0.55rem", padding: "0.3rem 0.5rem" }}
          onClick={() => createProject.mutate({ data: { name: `Session ${(projects?.length ?? 0) + 1}`.padStart(2, "0"), bpm: 120 } })}
        >
          + SESSION
        </button>

        <div className="transport__controls" style={{ marginLeft: "1rem" }}>
          <button
            className="transport__btn"
            onClick={engine.stop}
            title="Stop"
          >
            ■
          </button>
          <button
            className={`transport__btn${engine.state === "playing" ? " transport__btn--recording" : ""}`}
            onClick={engine.state === "playing" ? engine.stop : engine.play}
            title="Play"
          >
            ▶
          </button>
          <button
            className={`transport__btn transport__btn--record${engine.state === "recording" ? " transport__btn--recording recording-pulse" : ""}`}
            onClick={handleRecord}
            title="Record"
          >
            ●
          </button>
        </div>

        <div className="transport__readout">
          <div className="transport__readout-block">
            <span className="transport__readout-label">BPM</span>
            <span className="transport__readout-value">{activeProject?.bpm ?? 120}</span>
          </div>
          <div style={{ width: "1px", height: "24px", background: "rgba(0,255,204,0.12)" }} />
          <div className="transport__readout-block">
            <span className="transport__readout-label">TIME</span>
            <span className="transport__readout-value">{formatTime(engine.elapsed)}</span>
          </div>
          {engine.state !== "stopped" && (
            <>
              <div style={{ width: "1px", height: "24px", background: "rgba(0,255,204,0.12)" }} />
              <div className="transport__readout-block">
                <span className="transport__readout-label">STATUS</span>
                <span className="transport__readout-value" style={{ color: engine.state === "recording" ? "#ff003c" : "#00ffcc", fontSize: "0.65rem" }}>
                  {engine.state.toUpperCase()}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="workspace">
        {/* Track sidebar */}
        <div className="tracks-sidebar">
          <div className="tracks-sidebar__header">
            <span className="tracks-sidebar__title">Tracks</span>
            <button
              className="tracks-sidebar__add"
              onClick={() => {
                if (!activeProjectId) return;
                createTrack.mutate({
                  id: activeProjectId,
                  data: { name: `Track ${(tracks?.length ?? 0) + 1}`, type: "audio" }
                });
              }}
            >
              +
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {tracksLoading ? (
              <div className="empty-state__text" style={{ padding: "1rem", textAlign: "center" }}>Loading...</div>
            ) : !tracks || tracks.length === 0 ? (
              <div className="empty-state" style={{ flex: "none", padding: "2rem 1rem" }}>
                <div className="empty-state__text">No tracks.<br />Click + to add one.</div>
              </div>
            ) : (
              tracks.map(track => {
                const ts = engine.getTrack(track.id);
                return (
                  <div
                    key={track.id}
                    className={`track-strip${ts.armed ? " track-strip--selected" : ""}`}
                  >
                    <div className="track-strip__row">
                      <div
                        className="track-strip__color"
                        style={{ background: track.color ?? "#00ffcc" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="track-strip__name">{track.name}</div>
                        <div className="track-strip__type">{track.type}</div>
                      </div>
                    </div>
                    <div className="track-strip__row" style={{ gap: "0.25rem" }}>
                      <button
                        className={`track-btn${ts.muted ? " track-btn--muted" : ""}`}
                        onClick={() => engine.toggleMute(track.id)}
                        title="Mute"
                      >M</button>
                      <button
                        className={`track-btn${ts.soloed ? " track-btn--soloed" : ""}`}
                        onClick={() => engine.toggleSolo(track.id)}
                        title="Solo"
                      >S</button>
                      <button
                        className={`track-btn${ts.armed ? " track-btn--armed" : ""}`}
                        onClick={() => engine.toggleArm(track.id)}
                        title="Arm for recording"
                        style={{ marginLeft: "auto" }}
                      >●</button>
                    </div>
                    <input
                      type="range"
                      className="track-fader"
                      min={0} max={1} step={0.01}
                      value={ts.volume}
                      onChange={e => engine.setVolume(track.id, parseFloat(e.target.value))}
                    />
                    {ts.armed && <VuMeter level={ts.level} />}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Arrangement */}
        <div className="arrangement">
          {/* Ruler */}
          <div className="arrangement__ruler">
            {[...Array(32)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(i + 1) * 80}px`,
                  bottom: 0,
                  height: i % 4 === 3 ? "12px" : "6px",
                  width: "1px",
                  background: i % 4 === 3 ? "rgba(0,255,204,0.3)" : "rgba(0,255,204,0.1)",
                }}
              />
            ))}
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(i + 1) * 320}px`,
                  bottom: "10px",
                  fontSize: "0.5rem",
                  color: "rgba(0,255,204,0.4)",
                  letterSpacing: "0.1em",
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Lanes + clips */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tracks?.map(track => {
              const trackClips = engine.clips.filter(c => c.trackId === track.id);
              return (
                <div key={track.id} className="arrangement__lane">
                  {trackClips.map((clip, idx) => (
                    <div
                      key={idx}
                      className="clip"
                      style={{ left: `${clip.startTime * 80 + 4}px`, width: `${Math.max(40, clip.duration * 80)}px` }}
                    >
                      <WaveformCanvas url={clip.url} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pitch Monitor — always visible at bottom */}
      <PitchMonitor />
    </div>
  );
}
