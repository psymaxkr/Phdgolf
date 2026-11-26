'use client';
// 브라우저 공용: API 호출, 실시간 동기화 훅, 서버 시각 보정, 효과음
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let sb: SupabaseClient | null = null;
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!sb) sb = createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } });
  return sb;
}

export class ApiError extends Error {
  status: number;
  constructor(m: string, s: number) {
    super(m);
    this.status = s;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; token?: string | null } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { 'x-phd-token': opts.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? '요청에 실패했습니다.', res.status);
  return data as T;
}

/** 서버 상태를 실시간으로 유지: Supabase Realtime 신호 + 주기적 확인(자동 재연결 대체 경로) */
export function useLive<T extends { serverNow?: number }>(fetcher: () => Promise<T>, deps: any[], fastMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [online, setOnline] = useState(true);
  const offsetRef = useRef(0);
  const bestRtt = useRef(Infinity);
  const inflight = useRef(false);
  const again = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const realtimeOk = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    const t0 = Date.now();
    try {
      const d = await fetcherRef.current();
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (d?.serverNow && (rtt <= bestRtt.current * 1.5 || rtt < 300)) {
        bestRtt.current = Math.min(bestRtt.current, rtt);
        offsetRef.current = d.serverNow - (t0 + t1) / 2;
      }
      setData(d);
      setError(null);
      setOnline(true);
    } catch (e: any) {
      setError(e);
      if (!(e instanceof ApiError)) setOnline(false);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(load, 50);
      }
    }
  }, []);

  useEffect(() => {
    load();
    let timer: any;
    const tick = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await load();
        tick();
      }, realtimeOk.current ? Math.max(fastMs * 2, 4000) : fastMs);
    };
    tick();
    const onVis = () => document.visibilityState === 'visible' && load();
    const onOnline = () => load();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);

    const client = supabase();
    let channel: any = null;
    if (client) {
      channel = client
        .channel('phd-sync-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sync' }, () => load())
        .subscribe((status: string) => {
          realtimeOk.current = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') load();
        });
    }
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
      if (channel && client) client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  return { data, error, online, reload: load, serverNow };
}

/** 화면 갱신용 현재 시각 */
export function useTicker(ms = 200) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// ------------------------------------------------------------ 효과음 (파일 없이 WebAudio로 생성)
let ctx: AudioContext | null = null;
export function isMuted() {
  try {
    return localStorage.getItem('phd_mute') === '1';
  } catch {
    return false;
  }
}
export function setMuted(v: boolean) {
  try {
    localStorage.setItem('phd_mute', v ? '1' : '0');
  } catch {}
}
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}
export function sfx(kind: 'tick' | 'go' | 'tap' | 'correct' | 'wrong' | 'fanfare' | 'drum' | 'ding') {
  if (isMuted()) return;
  unlockAudio();
  if (!ctx) return;
  switch (kind) {
    case 'tick': tone(660, 0, 0.12, 'square', 0.06); break;
    case 'go': tone(990, 0, 0.35, 'square', 0.08); break;
    case 'tap': tone(520, 0, 0.08, 'triangle', 0.08); break;
    case 'ding': tone(1320, 0, 0.5, 'sine', 0.12); tone(1760, 0.08, 0.5, 'sine', 0.08); break;
    case 'correct': tone(784, 0, 0.18, 'triangle'); tone(1047, 0.15, 0.35, 'triangle'); break;
    case 'wrong': tone(220, 0, 0.3, 'sawtooth', 0.06); tone(180, 0.2, 0.35, 'sawtooth', 0.06); break;
    case 'drum': for (let i = 0; i < 10; i++) tone(120 + (i % 2) * 20, i * 0.09, 0.08, 'square', 0.05); break;
    case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.4, 'triangle', 0.12)); tone(1047, 0.6, 0.8, 'triangle', 0.12); break;
  }
}

export function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '-';
  return Number(n).toLocaleString('ko-KR');
}
