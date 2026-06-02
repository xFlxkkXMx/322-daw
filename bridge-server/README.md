# VST3 Bridge Server

This runs **on your computer** (not in the browser) and acts as the host that loads your VST3 plugins and streams audio to the Web DAW.

## Setup

### 1. Prerequisites

| OS | Requirement |
|----|-------------|
| macOS | `brew install portaudio` |
| Linux | `sudo apt install portaudio19-dev` |
| Windows | Download [PortAudio binaries](http://www.portaudio.com/download.html) |

Node.js 18+ required.

### 2. Install dependencies

```bash
cd bridge-server
npm install
```

### 3. Run the bridge

```bash
# Default (port 9001, 44100Hz, buffer 256 frames ~5.8ms)
npm start

# Ultra-low latency (buffer 128 frames ~2.7ms at 48kHz)
npm run start:low-latency

# Custom settings
node bridge.js --port 9001 --buffer 128 --rate 48000
```

### 4. Connect the Web DAW

1. Open the Web DAW in your browser
2. The Bridge status indicator (top right) will show "Disconnected"
3. The default URL `ws://localhost:9001` is pre-filled — click **Connect**
4. Status changes to "Connected" and your VST3 plugins appear in the Plugins tab

## How it works

```
Your Mic → PortAudio → bridge.js → WebSocket → Browser AudioContext → Speakers
                           ↕
                    VST3 Plugin Host
                    (processes audio)
```

The bridge:
- Scans standard VST3 directories on your OS
- Sends plugin list to the browser over WebSocket
- Streams raw Float32 PCM audio with **minimum latency** (no extra encoding/compression)
- Uses the smallest buffer size your audio hardware supports

## VST3 scan paths

| OS | Paths scanned |
|----|--------------|
| macOS | `/Library/Audio/Plug-Ins/VST3`, `~/Library/Audio/Plug-Ins/VST3` |
| Windows | `C:\Program Files\Common Files\VST3`, `%APPDATA%\VST3` |
| Linux | `/usr/lib/vst3`, `~/.vst3` |

## Latency tips

- Use `--buffer 128` or even `--buffer 64` if your hardware supports it
- Use `--rate 48000` for better hardware compatibility
- On macOS, use [BlackHole](https://existential.audio/blackhole/) for near-zero loopback
- On Linux, use JACK audio for lowest system latency
- Close other audio apps before starting the bridge

## Troubleshooting

**"naudiodon not installed"** — run `npm install` in this directory  
**Port in use** — run with `--port 9002` (and update the URL in the DAW)  
**No plugins found** — check that your VST3 files are in the standard paths above  
**High latency** — lower `--buffer` value (try 128 → 64), ensure no other apps use the mic
