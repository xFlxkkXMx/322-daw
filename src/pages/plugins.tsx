import { useListPlugins, useScanPlugins, useGetBridgeStatus } from "@workspace/api-client-react";
import { BUILTIN_PLUGINS } from "@/lib/builtinPlugins";

export default function Plugins() {
  const { data: bridgePlugins, isLoading, refetch } = useListPlugins();
  const { data: bridgeStatus } = useGetBridgeStatus();
  const scanPlugins = useScanPlugins();

  const handleScan = () => {
    scanPlugins.mutate(undefined, { onSuccess: () => refetch() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

      {/* Built-in plugins section */}
      <div className="section-header">
        <div>
          <div className="section-header__title">Built-in Plugins</div>
          <div className="section-header__sub">
            Native Web Audio processors — no bridge required
          </div>
        </div>
        <span className="plugin-row__tag plugin-row__tag--builtin">
          {BUILTIN_PLUGINS.length} INCLUDED
        </span>
      </div>

      <div className="plugin-rack" style={{ borderBottom: "1px solid rgba(0,255,204,0.06)", marginBottom: "0" }}>
        {BUILTIN_PLUGINS.map(plugin => (
          <div key={plugin.id} className="plugin-row">
            <div className="plugin-row__icon">
              {plugin.category === "EQ" ? "EQ" :
               plugin.category === "Dynamics" ? "DY" :
               plugin.category === "Reverb" ? "RV" :
               plugin.category === "Delay" ? "DL" :
               plugin.category === "Distortion" ? "DX" : "FX"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="plugin-row__name">{plugin.name}</div>
              <div className="plugin-row__vendor">{plugin.description}</div>
            </div>
            <span className="plugin-row__tag plugin-row__tag--builtin">{plugin.category}</span>
            <span className="plugin-row__tag plugin-row__tag--loaded">READY</span>
          </div>
        ))}
      </div>

      {/* VST3 Bridge section */}
      <div className="section-header" style={{ marginTop: "0" }}>
        <div>
          <div className="section-header__title">VST3 Bridge</div>
          <div className="section-header__sub">
            External plugins loaded via local bridge server
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: bridgeStatus?.connected ? "#00ffcc" : "#ff003c",
              boxShadow: bridgeStatus?.connected ? "0 0 6px #00ffcc" : "0 0 6px #ff003c",
            }} />
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase", color: bridgeStatus?.connected ? "#00ffcc" : "rgba(255,0,60,0.7)" }}>
              {bridgeStatus?.connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
          <button
            className="bridge-panel__btn"
            onClick={handleScan}
            disabled={!bridgeStatus?.connected || scanPlugins.isPending}
            style={{ opacity: bridgeStatus?.connected ? 1 : 0.4, cursor: bridgeStatus?.connected ? "pointer" : "not-allowed" }}
          >
            {scanPlugins.isPending ? "SCANNING..." : "SCAN SYSTEM"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {!bridgeStatus?.connected ? (
          <div className="empty-state">
            <div className="empty-state__icon" style={{ color: "rgba(255,0,60,0.4)" }}>⬡</div>
            <div className="empty-state__title">Bridge Not Connected</div>
            <div className="empty-state__text">
              Run the bridge server on your computer to scan and load VST3 plugins.
              <br /><br />
              <code style={{ color: "rgba(0,255,204,0.6)", fontSize: "0.65rem" }}>
                node bridge.js --port 9001
              </code>
              <br /><br />
              Then click CONNECT in the nav bar above.
            </div>
          </div>
        ) : isLoading ? (
          <div className="empty-state">
            <div className="empty-state__title" style={{ color: "rgba(0,255,204,0.4)" }}>SCANNING...</div>
          </div>
        ) : !bridgePlugins || bridgePlugins.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">⬡</div>
            <div className="empty-state__title">No VST3 Plugins Found</div>
            <div className="empty-state__text">
              No plugins were found in the standard VST3 directories.<br />
              Click SCAN SYSTEM to search your computer.
            </div>
          </div>
        ) : (
          <div className="plugin-rack">
            {bridgePlugins.map(plugin => (
              <div key={plugin.id} className="plugin-row">
                <div className="plugin-row__icon">V3</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="plugin-row__name">{plugin.name}</div>
                  <div className="plugin-row__vendor">{plugin.vendor}</div>
                </div>
                <span className="plugin-row__tag plugin-row__tag--bridge">{plugin.category}</span>
                {plugin.isLoaded ? (
                  <span className="plugin-row__tag plugin-row__tag--loaded">LOADED</span>
                ) : (
                  <span className="plugin-row__tag" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    AVAILABLE
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
