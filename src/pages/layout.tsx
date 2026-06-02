import { Link, useLocation } from "wouter";
import { useState } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [wsUrl, setWsUrl] = useState("ws://localhost:9001");
  const [connected, setConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const toggleBridge = () => {
    if (ws) {
      ws.close();
      setWs(null);
      setConnected(false);
      return;
    }
    try {
      const sock = new WebSocket(wsUrl);
      sock.onopen = () => setConnected(true);
      sock.onclose = () => { setConnected(false); setWs(null); };
      sock.onerror = () => { setConnected(false); setWs(null); };
      setWs(sock);
    } catch {
      setConnected(false);
    }
  };

  return (
    <div className="daw-layout">
      <nav className="daw-nav">
        <div className="daw-nav__brand">
          322.BOOTH <span>// DAW</span>
        </div>

        <div className="daw-nav__links">
          <Link href="/">
            <span className={`daw-nav__link${location === "/" ? " daw-nav__link--active" : ""}`}>
              Workspace
            </span>
          </Link>
          <Link href="/plugins">
            <span className={`daw-nav__link${location === "/plugins" ? " daw-nav__link--active" : ""}`}>
              Plugins
            </span>
          </Link>
          <Link href="/recordings">
            <span className={`daw-nav__link${location === "/recordings" ? " daw-nav__link--active" : ""}`}>
              Recordings
            </span>
          </Link>
        </div>

        <div className="bridge-panel">
          <div className={`daw-nav__bridge-dot${connected ? " daw-nav__bridge-dot--connected" : ""}`} />
          <span style={{
            fontSize: "0.55rem",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: connected ? "#00ffcc" : "rgba(255,255,255,0.25)",
          }}>
            {connected ? "BRIDGE LIVE" : "BRIDGE"}
          </span>
          {!connected && (
            <input
              className="bridge-panel__input"
              value={wsUrl}
              onChange={e => setWsUrl(e.target.value)}
              placeholder="ws://localhost:9001"
              spellCheck={false}
            />
          )}
          <button className="bridge-panel__btn" onClick={toggleBridge}>
            {connected ? "DISCONNECT" : "CONNECT"}
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </main>
    </div>
  );
}
