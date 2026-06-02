import { useState, useRef, useCallback, useEffect } from "react";

export type ScaleType = "chromatic" | "major" | "minor" | "pentatonic" | "dorian";

export const ROOT_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;
export type RootNote = typeof ROOT_NOTES[number];

export interface PitchInfo {
  freq: number;
  target: number;
  note: string;
  targetNote: string;
  ratio: number;
  cents: number;        // how far off in cents (±50 = half semitone)
  correcting: boolean;
}

export interface PitchMonitorState {
  active: boolean;
  loading: boolean;
  error: string | null;
  pitch: PitchInfo | null;
  strength: number;
  speed: number;
  scale: ScaleType;
  root: RootNote;
  micGranted: boolean;
}

const WORKLET_URL = "/worklets/pitch-processor.js";

export function usePitchMonitor() {
  const ctxRef      = useRef<AudioContext | null>(null);
  const workletRef  = useRef<AudioWorkletNode | null>(null);
  const sourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const gainRef     = useRef<GainNode | null>(null);

  const [active,     setActive]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [pitch,      setPitch]      = useState<PitchInfo | null>(null);
  const [strength,   setStrength]   = useState(0.85);
  const [speed,      setSpeed]      = useState(0.12);
  const [scale,      setScaleState] = useState<ScaleType>("chromatic");
  const [root,       setRootState]  = useState<RootNote>("C");
  const [micGranted, setMicGranted] = useState(false);

  // ── Send param to worklet ──────────────────────────────────────────────────
  const sendParam = useCallback((key: string, value: unknown) => {
    workletRef.current?.port.postMessage({ [key]: value });
  }, []);

  // ── Start monitoring ──────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (active || loading) return;
    setLoading(true);
    setError(null);

    try {
      // Request mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          sampleRate:       48000,
        },
      });
      streamRef.current = stream;
      setMicGranted(true);

      // Create AudioContext
      const ctx = new AudioContext({
        latencyHint: "interactive",
        sampleRate:  48000,
      });
      ctxRef.current = ctx;

      // Load worklet
      await ctx.audioWorklet.addModule(WORKLET_URL);

      // Wire: mic → worklet → speakers
      const source  = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "322-pitch-processor", {
        numberOfInputs:  1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      // Output gain (unity — direct monitoring to speakers)
      const gain = ctx.createGain();
      gain.gain.value = 0.95;

      source.connect(worklet);
      worklet.connect(gain);
      gain.connect(ctx.destination);

      sourceRef.current  = source;
      workletRef.current = worklet;
      gainRef.current    = gain;

      // Send initial params
      worklet.port.postMessage({ strength, speed, scale, root: ROOT_NOTES.indexOf(root), active: true });

      // Listen for pitch data from worklet
      worklet.port.onmessage = ({ data }) => {
        if (!data.freq) return;
        const cents = Math.round(1200 * Math.log2(data.freq / data.target));
        setPitch({
          freq:       data.freq,
          target:     data.target,
          note:       data.note,
          targetNote: data.targetNote,
          ratio:      data.ratio,
          cents,
          correcting: Math.abs(cents) > 5,
        });
      };

      setActive(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start monitor";
      setError(
        msg.includes("Permission")
          ? "Microphone permission denied. Please allow mic access."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [active, loading, strength, speed, scale, root]);

  // ── Stop monitoring ───────────────────────────────────────────────────────
  const stop = useCallback(() => {
    workletRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    gainRef.current?.disconnect();
    gainRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setActive(false);
    setPitch(null);
    setError(null);
  }, []);

  // ── Param setters (sync to worklet) ──────────────────────────────────────
  const setStrengthParam = useCallback((v: number) => {
    setStrength(v);
    sendParam("strength", v);
  }, [sendParam]);

  const setSpeedParam = useCallback((v: number) => {
    setSpeed(v);
    sendParam("speed", v);
  }, [sendParam]);

  const setScale = useCallback((v: ScaleType) => {
    setScaleState(v);
    sendParam("scale", v);
  }, [sendParam]);

  const setRoot = useCallback((v: RootNote) => {
    setRootState(v);
    sendParam("root", ROOT_NOTES.indexOf(v));
  }, [sendParam]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => { stop(); }, [stop]);

  return {
    active, loading, error, pitch, micGranted,
    strength, speed, scale, root,
    start, stop,
    setStrength: setStrengthParam,
    setSpeed:    setSpeedParam,
    setScale,
    setRoot,
  };
}
