'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '@/lib/client';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`flex items-center gap-2 whitespace-nowrap ${small ? 'text-xl' : 'text-[34px]'} font-black tracking-tight`}>
        <Flag size={small ? 22 : 40} />
        <span className="gold-text">PHD PLAY</span>
        <span className="text-turf">2026</span>
      </div>
      {!small && <div className="mt-2 whitespace-nowrap text-sm tracking-[0.18em] text-ivory/60">GOLF CLUB YEAR-END PARTY</div>}
    </div>
  );
}

export function Flag({ size = 32, color = '#15803D' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <line x1="12" y1="4" x2="12" y2="36" stroke="#0B3D91" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 5 L32 11 L13 17 Z" fill={color} />
      <ellipse cx="12" cy="36" rx="9" ry="2.5" fill="#BFD8C7" />
    </svg>
  );
}

export function GolfBall({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <radialGradient id="gb" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#DCE4EE" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#gb)" stroke="#B8C6D6" strokeWidth="1.2" />
      {[[14, 12], [22, 10], [28, 16], [12, 20], [20, 18], [27, 24], [16, 27], [23, 29]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#AEBBCB" />
      ))}
    </svg>
  );
}

export function TeamChip({ name, color }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-base font-bold" style={{ borderColor: color ?? '#0B3D91', color: color ?? '#0B3D91' }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color ?? '#0B3D91' }} />
      {name}
    </span>
  );
}

export function Medal({ rank }: { rank: number }) {
  const c = rank === 1 ? '#C9A227' : rank === 2 ? '#8A96A3' : rank === 3 ? '#B0683A' : null;
  if (!c) return <span className="inline-flex h-10 w-10 items-center justify-center text-xl font-bold text-ivory/70">{rank}</span>;
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-black text-white shadow" style={{ background: c }}>
      {rank}
    </span>
  );
}

/** 3초 카운트다운 */
export function Countdown({ startsAt, serverNow }: { startsAt: number; serverNow: () => number }) {
  const [n, setN] = useState(Math.ceil((startsAt - serverNow()) / 1000));
  const last = useRef<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setN(Math.ceil((startsAt - serverNow()) / 1000)), 100);
    return () => clearInterval(t);
  }, [startsAt, serverNow]);
  useEffect(() => {
    if (n !== last.current) {
      if (n > 0 && n <= 3) sfx('tick');
      if (n <= 0 && last.current !== null && last.current > 0) sfx('go');
      last.current = n;
    }
  }, [n]);
  const show = Math.min(3, Math.max(1, n));
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <div className="mb-6 text-2xl text-ivory/80">준비하세요!</div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={show}
          initial={{ scale: 2.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="gold-text text-[140px] font-black leading-none"
        >
          {show}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** 남은 시간 막대 */
export function TimerBar({ endsAt, total, serverNow, paused, pausedRemainingMs }: { endsAt: number; total: number; serverNow: () => number; paused?: boolean; pausedRemainingMs?: number | null }) {
  const [rem, setRem] = useState(0);
  const lastSec = useRef(-1);
  useEffect(() => {
    const f = () => {
      const r = paused ? (pausedRemainingMs ?? 0) : Math.max(0, endsAt - serverNow());
      setRem(r);
      const s = Math.ceil(r / 1000);
      if (!paused && s !== lastSec.current) {
        if (s > 0 && s <= 5) sfx('tick');
        lastSec.current = s;
      }
    };
    f();
    const t = setInterval(f, 100);
    return () => clearInterval(t);
  }, [endsAt, serverNow, paused, pausedRemainingMs]);
  const pct = Math.max(0, Math.min(100, (rem / (total * 1000)) * 100));
  const sec = Math.ceil(rem / 1000);
  const urgent = sec <= 5;
  return (
    <div className="w-full">
      <div className="mb-1 flex items-end justify-between">
        <span className="text-base text-ivory/70">{paused ? '⏸ 잠시 멈춤' : '남은 시간'}</span>
        <span className={`text-3xl font-black tabular-nums ${urgent ? 'text-red-600' : 'text-gold'}`}>{sec}초</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-forest-deep">
        <div className={`h-full rounded-full transition-[width] duration-100 ${urgent ? 'bg-red-500' : 'bg-turf'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 축하 효과 (골프공 + 금색 조각) */
export function Confetti({ count = 40, burstKey }: { count?: number; burstKey?: any }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      x: Math.random() * 100, d: 1.8 + Math.random() * 1.8, r: Math.random() * 720 - 360, delay: Math.random() * 0.5,
      ball: i % 6 === 0, c: ['#0B3D91', '#15803D', '#2F6FD6', '#22A355'][i % 4], s: 8 + Math.random() * 10,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, burstKey]
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" key={String(burstKey)}>
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, x: `${p.x}vw`, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.r, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.d, delay: p.delay, ease: 'easeIn' }}
          className="absolute top-0"
          style={{ left: 0 }}
        >
          {p.ball ? <GolfBall size={22} /> : <div style={{ width: p.s, height: p.s * 0.5, background: p.c, borderRadius: 2 }} />}
        </motion.div>
      ))}
    </div>
  );
}

export function Big({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[26px] font-extrabold leading-snug ${className}`}>{children}</div>;
}

export function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full bg-forest-deep px-3 py-1 text-base text-ivory/80 ${className}`}>{children}</span>;
}

export function Bar({ label, value, max, highlight = false, suffix = '' }: { label: React.ReactNode; value: number; max: number; highlight?: boolean; suffix?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-lg">
        <span className={highlight ? 'font-bold text-gold' : ''}>{label}</span>
        <span className="font-bold tabular-nums">{value}{suffix}</span>
      </div>
      <div className="h-5 overflow-hidden rounded-full bg-forest-deep">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${highlight ? 'bg-turf' : 'bg-gold/30'}`} />
      </div>
    </div>
  );
}
