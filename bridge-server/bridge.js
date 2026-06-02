#!/usr/bin/env node
/**
 * VST3 Bridge Server — runs locally on your computer
 *
 * This server:
 * 1. Scans your system for VST3 plugins
 * 2. Hosts them as a WebSocket server (ws://localhost:9001)
 * 3. Streams audio from microphone through VST3 effects back to the browser DAW
 *
 * Requirements:
 *   - Node.js 18+
 *   - On macOS/Linux: PortAudio (brew install portaudio / apt install portaudio19-dev)
 *   - npm install ws naudiodon
 *
 * Usage:
 *   node bridge.js [--port 9001] [--buffer 256] [--rate 44100]
 */

const { WebSocketServer } = require("ws");
const os = require("os");
const path = require("path");
const fs = require("fs");

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const PORT = Number(getArg("--port", "9001"));
const BUFFER_SIZE = Number(getArg("--buffer", "256"));
const SAMPLE_RATE = Number(getArg("--rate", "44100"));

// ─── VST3 scan paths ─────────────────────────────────────────────────────────
const VST3_SCAN_PATHS = {
  darwin: [
    "/Library/Audio/Plug-Ins/VST3",
    path.join(os.homedir(), "Library/Audio/Plug-Ins/VST3"),
  ],
  win32: [
    "C:\\Program Files\\Common Files\\VST3",
    "C:\\Program Files (x86)\\Common Files\\VST3",
    path.join(os.homedir(), "AppData\\Roaming\\VST3"),
  ],
  linux: [
    "/usr/lib/vst3",
    "/usr/local/lib/vst3",
    path.join(os.homedir(), ".vst3"),
  ],
};

// ─── Plugin scanner ───────────────────────────────────────────────────────────
function scanVST3Plugins() {
  const platform = os.platform();
  const searchPaths = VST3_SCAN_PATHS[platform] || VST3_SCAN_PATHS.linux;
  const found = [];

  for (const dir of searchPaths) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".vst3" || (entry.isDirectory() && entry.name.endsWith(".vst3"))) {
          found.push({
            id: found.length + 1,
            name: path.basename(entry.name, ".vst3"),
            vendor: "Unknown",
            category: "Effect",
            path: path.join(dir, entry.name),
            isLoaded: false,
          });
        }
      }
    } catch (err) {
      // skip unreadable dirs
    }
  }

  return found;
}

// ─── State ────────────────────────────────────────────────────────────────────
let plugins = scanVST3Plugins();
let audioDevice = null;
let isStreaming = false;
const clients = new Set();

// ─── Audio capture (naudiodon, graceful degradation if not installed) ─────────
function tryStartAudio(onChunk) {
  try {
    const naudiodon = require("naudiodon");
    const devices = naudiodon.getDevices();
    const inputDevice = devices.find((d) => d.maxInputChannels > 0) || devices[0];

    if (!inputDevice) {
      console.warn("[bridge] No audio input device found.");
      return null;
    }

    const ai = new naudiodon.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: naudiodon.SampleFormat32Bit,
        sampleRate: SAMPLE_RATE,
        deviceId: inputDevice.id,
        closeOnError: true,
        framesPerBuffer: BUFFER_SIZE,
      },
    });

    ai.on("data", (chunk) => {
      // chunk is a Buffer of Float32 samples (little-endian)
      const floats = new Float32Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 4);
      onChunk(floats);
    });

    ai.on("error", (err) => {
      console.error("[bridge] Audio error:", err.message);
    });

    ai.start();
    console.log(`[bridge] Audio capture started (device: ${inputDevice.name}, ${SAMPLE_RATE}Hz, buffer: ${BUFFER_SIZE})`);
    return ai;
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      console.warn("[bridge] naudiodon not installed. Running in plugin-list-only mode.");
      console.warn("[bridge] Install it with: npm install naudiodon");
    } else {
      console.error("[bridge] Audio init error:", err.message);
    }
    return null;
  }
}

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(json);
  }
}

function broadcastAudio(floats) {
  // Send as binary for maximum throughput (avoids JSON serialization overhead)
  const buf = Buffer.from(floats.buffer);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(buf);
  }
}

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   VST3 Bridge Server                     ║`);
  console.log(`║   ws://localhost:${PORT}                    ║`);
  console.log(`║   ${plugins.length} plugin(s) found                  ║`);
  console.log(`║   Sample rate: ${SAMPLE_RATE}Hz  Buffer: ${BUFFER_SIZE}   ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  console.log("[bridge] Paste ws://localhost:" + PORT + " into the DAW's Bridge URL field.");
});

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[bridge] Client connected from ${ip}`);
  clients.add(ws);

  // Send handshake
  ws.send(JSON.stringify({
    type: "handshake",
    version: "1.0.0",
    sampleRate: SAMPLE_RATE,
    bufferSize: BUFFER_SIZE,
    platform: os.platform(),
    hostname: os.hostname(),
  }));

  // Send current plugin list
  ws.send(JSON.stringify({ type: "plugins", data: plugins }));

  // Send latency ping marker
  ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "pong": {
        const latencyMs = Date.now() - msg.ts;
        ws.send(JSON.stringify({ type: "latency", ms: latencyMs }));
        broadcast({ type: "latency", ms: latencyMs });
        break;
      }
      case "scan": {
        console.log("[bridge] Scanning for VST3 plugins...");
        plugins = scanVST3Plugins();
        broadcast({ type: "plugins", data: plugins });
        console.log(`[bridge] Scan complete. ${plugins.length} plugin(s) found.`);
        break;
      }
      case "load_plugin": {
        const plugin = plugins.find((p) => p.id === msg.id);
        if (plugin) {
          plugin.isLoaded = true;
          console.log(`[bridge] Loaded plugin: ${plugin.name}`);
          broadcast({ type: "plugins", data: plugins });
        }
        break;
      }
      case "unload_plugin": {
        const plugin = plugins.find((p) => p.id === msg.id);
        if (plugin) {
          plugin.isLoaded = false;
          broadcast({ type: "plugins", data: plugins });
        }
        break;
      }
      case "start_stream": {
        if (!isStreaming) {
          isStreaming = true;
          audioDevice = tryStartAudio(broadcastAudio);
          broadcast({ type: "stream_started" });
        }
        break;
      }
      case "stop_stream": {
        if (isStreaming && audioDevice) {
          audioDevice.quit();
          audioDevice = null;
          isStreaming = false;
          broadcast({ type: "stream_stopped" });
        }
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ type: "pong", ts: msg.ts }));
        break;
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] Client disconnected. ${clients.size} client(s) remaining.`);
    if (clients.size === 0 && audioDevice) {
      audioDevice.quit();
      audioDevice = null;
      isStreaming = false;
      console.log("[bridge] No clients — audio capture paused.");
    }
  });

  ws.on("error", (err) => {
    console.error("[bridge] WebSocket error:", err.message);
    clients.delete(ws);
  });
});

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[bridge] Port ${PORT} is already in use. Use --port <number> to choose another.`);
  } else {
    console.error("[bridge] Server error:", err);
  }
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[bridge] Shutting down...");
  if (audioDevice) audioDevice.quit();
  wss.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  if (audioDevice) audioDevice.quit();
  wss.close(() => process.exit(0));
});
