import { useEffect, useRef, useState } from 'react';
import type { RaceData } from './types';

export interface Alert {
  id: string;
  text: string;
  at: number;
}

/**
 * Watches for leadership changes and UF flips between polls.
 * Sound is opt-in (browser autoplay policy requires a gesture anyway).
 */
export function useAlerts(national: RaceData | null, ufResults: Map<string, RaceData>) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const prevLeader = useRef<string | null>(null);
  const prevUFLeaders = useRef<Map<string, string>>(new Map());
  const audioCtx = useRef<AudioContext | null>(null);

  // national leadership change
  useEffect(() => {
    const leader = national?.candidates[0];
    if (!leader || national!.candidates.length < 2) return;
    if (prevLeader.current && prevLeader.current !== leader.id) {
      push(`${leader.ballotName} (${leader.party}) assume a liderança nacional`);
    }
    prevLeader.current = leader.id;
  }, [national]);

  // UF leadership flips
  useEffect(() => {
    const flips: string[] = [];
    for (const [uf, res] of ufResults) {
      const leader = res.candidates[0];
      if (!leader || res.candidates.length < 2) continue;
      const prev = prevUFLeaders.current.get(uf);
      if (prev && prev !== leader.id) {
        flips.push(`${uf}: ${leader.ballotName} (${leader.party}) na frente`);
      }
      prevUFLeaders.current.set(uf, leader.id);
    }
    if (flips.length > 0) flips.forEach(push);
  }, [ufResults]);

  function push(text: string) {
    const a: Alert = { id: `${Date.now()}:${Math.random().toString(36).slice(2, 6)}`, text, at: Date.now() };
    setAlerts((prev) => [a, ...prev].slice(0, 5));
    if (soundOn) beep();
  }

  function beep() {
    try {
      audioCtx.current ??= new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* no audio available */
    }
  }

  function toggleSound() {
    setSoundOn((s) => {
      if (!s) beep(); // gesture -> unlock audio
      return !s;
    });
  }

  return { alerts, soundOn, toggleSound, dismiss: (id: string) => setAlerts((p) => p.filter((a) => a.id !== id)) };
}
