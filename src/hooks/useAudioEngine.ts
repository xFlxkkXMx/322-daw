import { useState, useRef, useCallback, useEffect } from "react";
import { BUILTIN_PLUGINS, type BuiltinPluginNode } from "@/lib/builtinPlugins";

export type EngineState = "stopped" | "playing" | "recording";

export interface TrackState {
  id: number;
  armed: boolean;
  muted: boolean;
  soloed: boolean;
  volume: number;
  pan: number;
  level: number;
  activePluginId: string | null;
}

export interface RecordedClip {
  trackId: number;
  blob: Blob;
  url: string;
  duration: number;
  startTime: number;
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaRecordersRef = useRef<Map<number, MediaRecorder>>(new Map());
  const pluginNodesRef = useRef<Map<string, BuiltinPluginNode>>(new Map());
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const chunksRef = useRef<Map<number, Blob[]>>(new Map());

  const [state, setState] = useState<EngineState>("stopped");
  const [elapsed, setElapsed] = useState(0);
  const [trackStates, setTrackStates] = useState<Map<number, TrackState>>(new Map());
  const [clips, setClips] = useState<RecordedClip[]>([]);
  const [micGranted, setMicGranted] = useState(false);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const getTrack = useCallback((id: number): TrackState => {
    return trackStates.get(id) ?? {
      id,
      armed: false,
      muted: false,
      soloed: false,
      volume: 0.8,
      pan: 0,
      level: 0,
      activePluginId: null,
    };
  }, [trackStates]);

  const setTrack = useCallback((id: number, patch: Partial<TrackState>) => {
    setTrackStates(prev => {
      const next = new Map(prev);
      const existing = next.get(id) ?? { id, armed: false, muted: false, soloed: false, volume: 0.8, pan: 0, level: 0, activePluginId: null };
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const initTracks = useCallback((ids: number[]) => {
    setTrackStates(prev => {
      const next = new Map(prev);
      for (const id of ids) {
        if (!next.has(id)) {
          next.set(id, { id, armed: false, muted: false, soloed: false, volume: 0.8, pan: 0, level: 0, activePluginId: null });
        }
      }
      return next;
    });
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 1,
        }
      });
      micStreamRef.current = stream;
      setMicGranted(true);
      return true;
    } catch {
      setMicGranted(false);
      return false;
    }
  }, []);

  const startRecording = useCallback(async (armedTrackIds: number[]) => {
    if (armedTrackIds.length === 0) return;

    const ctx = getCtx();
    let stream = micStreamRef.current;
    if (!stream) {
      const ok = await requestMic();
      if (!ok) return;
      stream = micStreamRef.current!;
    }

    micSourceRef.current = ctx.createMediaStreamSource(stream);
    analyserRef.current = ctx.createAnalyser();
    analyserRef.current.fftSize = 256;
    micSourceRef.current.connect(analyserRef.current);

    startTimeRef.current = ctx.currentTime;
    chunksRef.current = new Map();

    for (const trackId of armedTrackIds) {
      const track = getTrack(trackId);
      const gainNode = ctx.createGain();
      gainNode.gain.value = track.volume;

      let lastNode: AudioNode = micSourceRef.current;

      // Apply plugin if active
      if (track.activePluginId) {
        const existing = pluginNodesRef.current.get(`${trackId}-${track.activePluginId}`);
        if (existing) {
          lastNode.connect(existing.input);
          lastNode = existing.output;
        }
      }

      lastNode.connect(gainNode);

      const dest = ctx.createMediaStreamDestination();
      gainNode.connect(dest);

      const mr = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks: Blob[] = [];
      chunksRef.current.set(trackId, chunks);

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.start(100);
      mediaRecordersRef.current.set(trackId, mr);
    }

    setState("recording");
    startTimeRef.current = performance.now();

    const tick = () => {
      setElapsed(performance.now() - startTimeRef.current);
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        for (const id of armedTrackIds) {
          setTrack(id, { level: avg });
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [getCtx, getTrack, requestMic, setTrack]);

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);

    const duration = (performance.now() - startTimeRef.current) / 1000;
    const newClips: RecordedClip[] = [];

    for (const [trackId, mr] of mediaRecordersRef.current) {
      mr.stop();
      const chunks = chunksRef.current.get(trackId) ?? [];
      const blob = new Blob(chunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      newClips.push({ trackId, blob, url, duration, startTime: 0 });
    }

    setClips(prev => [...prev, ...newClips]);
    mediaRecordersRef.current.clear();

    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }

    setState("stopped");
    setElapsed(0);

    for (const [, ts] of trackStates) {
      setTrack(ts.id, { level: 0 });
    }
  }, [trackStates, setTrack]);

  const toggleArm = useCallback((id: number) => {
    const current = getTrack(id);
    setTrack(id, { armed: !current.armed });
    if (!current.armed && !micGranted) {
      requestMic();
    }
  }, [getTrack, setTrack, micGranted, requestMic]);

  const toggleMute = useCallback((id: number) => {
    const current = getTrack(id);
    setTrack(id, { muted: !current.muted });
  }, [getTrack, setTrack]);

  const toggleSolo = useCallback((id: number) => {
    const current = getTrack(id);
    setTrack(id, { soloed: !current.soloed });
  }, [getTrack, setTrack]);

  const setVolume = useCallback((id: number, value: number) => {
    setTrack(id, { volume: value });
  }, [setTrack]);

  const assignPlugin = useCallback((trackId: number, pluginId: string | null) => {
    if (pluginId) {
      const def = BUILTIN_PLUGINS.find(p => p.id === pluginId);
      if (def) {
        const ctx = getCtx();
        const key = `${trackId}-${pluginId}`;
        if (!pluginNodesRef.current.has(key)) {
          pluginNodesRef.current.set(key, def.createNode(ctx));
        }
      }
    }
    setTrack(trackId, { activePluginId: pluginId });
  }, [getCtx, setTrack]);

  const play = useCallback(() => {
    getCtx();
    setState("playing");
    startTimeRef.current = performance.now();
    const tick = () => {
      setElapsed(performance.now() - startTimeRef.current);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [getCtx]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (state === "recording") {
      stopRecording();
    } else {
      setState("stopped");
      setElapsed(0);
    }
  }, [state, stopRecording]);

  const record = useCallback(() => {
    if (state === "recording") {
      stopRecording();
      return;
    }
    const armed = Array.from(trackStates.values()).filter(t => t.armed).map(t => t.id);
    startRecording(armed);
  }, [state, trackStates, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      for (const [, node] of pluginNodesRef.current) node.destroy();
    };
  }, []);

  const formatTime = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
  };

  return {
    state,
    elapsed,
    formattedTime: formatTime(elapsed),
    trackStates,
    clips,
    micGranted,
    initTracks,
    getTrack,
    play,
    stop,
    record,
    toggleArm,
    toggleMute,
    toggleSolo,
    setVolume,
    assignPlugin,
    requestMic,
  };
}
