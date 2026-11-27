'use client';
// 프로젝터용 진행 화면 (/screen, /screen?e=demo)
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Trophy, Volume2, Wifi } from 'lucide-react';
import { api, fmt, sfx, unlockAudio, useLive, useTicker } from '@/lib/client';
import { GAMES, GameType, PRIZE_CATEGORIES } from '@/lib/games';
import { Confetti, Flag, GolfBall, Medal, TimerBar } from './ui';
import { HoleStage } from './games';

const LETTERS = ['①', '②', '③', '④'];

export default function Screen() {
  const [slug, setSlug] = useState<'main' | 'demo' | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => setSlug(new URL(window.location.href).searchParams.get('e') === 'demo' ? 'demo' : 'main'), []);
  if (!slug) return null;
  if (!started)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 text-center">
        <div className="gold-text text-7xl font-black">PHD PLAY 2026</div>
        <div className="text-2xl text-ivory/70">프로젝터 진행 화면{slug === 'demo' && ' (데모)'}</div>
        <button className="btn-gold px-12 text-3xl" onClick={() => { unlockAudio(); sfx('ding'); setStarted(true); document.documentElement.requestFullscreen?.().catch(() => {}); }}>
          <Volume2 /> 화면 시작 (소리 켜기 · 전체화면)
        </button>
      </main>
    );
  return <Live slug={slug} />;
}

function Live({ slug }: { slug: string }) {
  const fetcher = useCallback(() => api(`/api/screen?e=${slug}`), [slug]);
  const { data: st, serverNow, online } = useLive<any>(fetcher, [slug], 1500);
  useTicker(250);
  if (!st) return <div className="flex min-h-[100dvh] items-center justify-center text-4xl">연결 중…</div>;
  const s = st.session;
  const r = st.round;
  const meta = s.game ? GAMES[s.game as GameType] : null;

  let body: React.ReactNode;
  if (s.overlay === 'ceremony') body = <Ceremony d={s.overlayData} />;
  else if (s.overlay?.startsWith('ranking')) body = <Ranking st={st} kind={s.overlay === 'ranking_team' ? 'team' : 'individual'} />;
  else if (s.game === 'P04') body = <Bingo b={st.bingo} />;
  else if (s.game === 'P05') body = <div className="mx-auto w-full max-w-5xl text-[1.6vw]"><HoleStage st={{ hole: st.hole }} screen /></div>;
  else if (s.game && r) body = <RoundView st={st} serverNow={serverNow} />;
  else if (s.game) body = <Intro type={s.game} />;
  else body = <Lobby st={st} slug={slug} />;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-forest-line bg-white px-[2vw] py-[1vh]">
        <div className="flex items-center gap-3 text-[2vw] font-black">
          <Flag size={36} />
          <span className="gold-text">PHD PLAY 2026</span>
          {meta && <span className="ml-4 text-ivory">{meta.emoji} {meta.title}</span>}
          {st.gameInfo && r && <span className="ml-2 rounded-full bg-gold px-4 py-1 text-[1.4vw] text-white">{r.roundNo} / {st.gameInfo.totalRounds}</span>}
        </div>
        <div className="flex items-center gap-4 text-[1.4vw]">
          {st.teams.map((t: any) => (
            <span key={t.id} className="font-bold" style={{ color: t.color }}>{t.name} {t.online}/{t.size}</span>
          ))}
          <span className="flex items-center gap-2 rounded-full bg-forest-deep px-4 py-1"><Wifi size={22} className={online ? 'text-turf' : 'text-red-600'} /> {st.counts.online}/{st.counts.total}</span>
        </div>
      </header>
      <section className="flex flex-1 items-center justify-center overflow-hidden px-[3vw] py-[2vh]">
        <AnimatePresence mode="wait">
          <motion.div key={`${s.overlay}-${s.game}-${r?.id}-${r?.status}-${s.overlayData?.step}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="flex h-full w-full items-center justify-center">
            {body}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
}

function Lobby({ st, slug }: { st: any; slug: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(`${window.location.origin}${slug === 'demo' ? '/demo' : '/'}`), [slug]);
  const rk = st.rankings;
  const offline: string[] = st.offline ?? [];
  const Offline = () =>
    offline.length > 0 ? (
      <div className="mt-4 rounded-2xl bg-amber-50 px-5 py-3 text-[1.5vw] text-amber-800">
        아직 접속 전: <b>{offline.slice(0, 12).join(', ')}</b>{offline.length > 12 && ` 외 ${offline.length - 12}명`}
      </div>
    ) : null;
  if (!rk)
    return (
      <div className="grid w-full max-w-7xl grid-cols-[auto_1fr] items-center gap-[4vw]">
        <div className="rounded-3xl border-4 border-gold bg-white p-6 shadow-xl">{url && <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.42)} />}</div>
        <div>
          <div className="text-[2vw] font-bold text-ivory/70">{st.event.name}</div>
          <div className="gold-text text-[5.5vw] font-black leading-tight">휴대폰으로 입장하세요!</div>
          <div className="mt-4 break-all text-[2.4vw] font-black text-gold">{url.replace(/^https?:\/\//, '')}</div>
          <div className="mt-8 flex items-end gap-4">
            <span className="text-[2vw]">현재 접속</span>
            <span className="text-[6vw] font-black leading-none text-turf">{st.counts.online}</span>
            <span className="text-[3vw] font-bold text-ivory/60">/ {st.counts.total}명</span>
          </div>
          <Offline />
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-6 text-[1.6vw] text-ivory/60">사회자가 곧 게임을 시작합니다 ⛳</motion.div>
        </div>
      </div>
    );
  // 게임이 끝난 뒤 대기 화면: 마지막으로 공개한 순위표
  return (
    <div className="grid h-full w-full max-w-[96vw] grid-cols-[1fr_1.35fr] gap-[3vw]">
      <div className="flex flex-col">
        <div className="mb-3 flex items-center gap-3 text-[2.4vw] font-black text-gold"><Trophy size={40} /> 조별 순위</div>
        <div className="grid gap-3">
          {rk.team.map((t: any, i: number) => (
            <motion.div key={t.id} initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-4 rounded-3xl border-2 bg-white px-6 py-[1.6vh] shadow" style={{ borderColor: t.rank === 1 ? '#C9A227' : '#D3DEEA' }}>
              <Medal rank={t.rank} />
              <span className="flex-1 text-[2.8vw] font-black" style={{ color: t.color }}>{t.name}</span>
              <span className="text-[3vw] font-black tabular-nums">{fmt(t.total)}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-4 pt-4">
          <div className="rounded-2xl border-2 border-gold bg-white p-2">{url && <QRCodeSVG value={url} size={Math.round(window.innerHeight * 0.16)} />}</div>
          <div className="text-[1.5vw]">
            <div>현재 접속 <b className="text-[2.4vw] text-turf">{st.counts.online}</b> / {st.counts.total}명</div>
            <div className="text-ivory/60">다음 게임을 준비 중입니다 ⛳</div>
          </div>
        </div>
        <Offline />
      </div>
      <div className="flex flex-col">
        <div className="mb-3 text-[2.4vw] font-black text-turf">개인 순위</div>
        <div className="grid grid-flow-col grid-cols-2 grid-rows-9 gap-x-4 gap-y-[0.6vh]">
          {rk.individual.slice(0, 18).map((x: any, i: number) => (
            <motion.div key={x.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.04 }} className={`flex items-center gap-2 rounded-xl px-3 py-[0.5vh] text-[1.5vw] ${x.rank <= 3 ? 'bg-white font-black shadow' : 'bg-white/60'}`}>
              <Medal rank={x.rank} />
              <span className="flex-1 truncate">{x.name} <span className="text-[1.1vw]" style={{ color: x.color }}>{x.teamName}</span></span>
              {x.delta ? <span className={`text-[1.1vw] font-bold ${x.delta > 0 ? 'text-turf' : 'text-red-600'}`}>{x.delta > 0 ? '▲' : '▼'}{Math.abs(x.delta)}</span> : null}
              <span className="font-black tabular-nums">{fmt(x.total)}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-2 text-right text-[1.1vw] text-ivory/50">{new Date(rk.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 발표 기준</div>
      </div>
    </div>
  );
}

function Intro({ type }: { type: string }) {
  const m = GAMES[type as GameType];
  return (
    <div className="w-full max-w-6xl text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="text-[8vw]">{m.emoji}</motion.div>
      <div className="text-[1.8vw] font-bold tracking-widest text-turf">{m.kind === 'team' ? '조별 대항전' : m.kind === 'individual' ? '개인전' : '행운 추첨'}</div>
      <div className="gold-text mb-[3vh] text-[5.5vw] font-black leading-tight">{m.title}</div>
      <div className="mx-auto grid max-w-5xl gap-[1.5vh] text-left">
        {m.rules.map((r, i) => (
          <motion.div key={i} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.2 }} className="flex items-center gap-4 rounded-2xl bg-white px-6 py-[1.4vh] text-[2.2vw] font-bold shadow">
            <span className="flex h-[3.2vw] w-[3.2vw] shrink-0 items-center justify-center rounded-full bg-gold text-[1.8vw] text-white">{i + 1}</span>
            {r}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function RoundView({ st, serverNow }: { st: any; serverNow: () => number }) {
  const r = st.round;
  const g = r.gameType as GameType;
  const meta = GAMES[g];
  const p = r.payload ?? {};
  const startsAt = Date.parse(r.startsAt);
  const last = useRef<number | null>(null);
  const n = r.status === 'open' ? Math.ceil((startsAt - serverNow()) / 1000) : 0;
  useEffect(() => {
    if (n !== last.current) {
      if (n > 0 && n <= 3) sfx('tick');
      if (n <= 0 && last.current !== null && last.current > 0) sfx('go');
      last.current = n;
    }
  }, [n]);
  const revealedFor = useRef<string | null>(null);
  useEffect(() => {
    if (r.status === 'revealed' && revealedFor.current !== r.id) {
      revealedFor.current = r.id;
      sfx('fanfare');
    }
  }, [r.status, r.id]);

  if (r.status === 'betting')
    return (
      <div className="w-full max-w-6xl text-center">
        <div className="gold-text mb-4 text-[4.5vw] font-black">각 조 베팅 중!</div>
        <div className="mb-8 text-[2vw] text-ivory/70">조장님이 걸 점수를 입력합니다 · 문제는 베팅 후 공개</div>
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${st.teams.length}, minmax(0, 1fr))` }}>
          {st.teams.map((t: any) => {
            const done = r.teamsBet.includes(t.id);
            return (
              <div key={t.id} className={`rounded-3xl border-4 p-8 ${done ? 'border-turf bg-turf-pale' : 'border-forest-line bg-white'}`}>
                <div className="text-[3vw] font-black" style={{ color: t.color }}>{t.name}</div>
                <div className={`mt-2 text-[2.4vw] font-bold ${done ? 'text-turf' : 'text-ivory/40'}`}>{done ? '✓ 베팅 완료' : '고민 중…'}</div>
              </div>
            );
          })}
        </div>
      </div>
    );

  if (r.status === 'open' && serverNow() < startsAt)
    return (
      <div className="text-center">
        <div className="mb-4 text-[3vw] font-bold text-ivory/70">준비하세요!</div>
        <AnimatePresence mode="popLayout">
          <motion.div key={n} initial={{ scale: 2.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} className="gold-text text-[22vw] font-black leading-none">
            {Math.max(1, Math.min(3, n))}
          </motion.div>
        </AnimatePresence>
      </div>
    );

  if (r.status === 'revealed') return <Result st={st} />;

  const leader = !!meta.leaderOnly;
  return (
    <div className="flex h-full w-full max-w-7xl flex-col justify-center">
      {(r.status === 'open' || r.status === 'paused') && (
        <div className="mb-[3vh] text-[1.6vw]">
          <TimerBar endsAt={Date.parse(r.endsAt)} total={r.timeLimit} serverNow={serverNow} paused={r.status === 'paused'} pausedRemainingMs={r.pausedRemainingMs} />
        </div>
      )}
      {g === 'P02' ? (
        <div className="text-center">
          <div className="gold-text text-[5vw] font-black">1 ~ 20 중 숫자 하나!</div>
          <div className="mt-2 text-[2.4vw] font-bold">다른 사람과 겹치지 않는 <span className="text-turf">가장 작은 숫자</span>가 1위</div>
        </div>
      ) : g === 'P03' ? (
        <div className="text-center">
          <GolfBall size={160} className="mx-auto mb-6" />
          <div className="gold-text text-[5vw] font-black">마음속으로 10초!</div>
          <div className="mt-2 text-[2.2vw] text-ivory/70">휴대폰에서 [시작] → 10초라고 생각할 때 [정지]</div>
        </div>
      ) : (
        <>
          <div className="mb-[3vh] text-[3.4vw] font-black leading-snug">{p.prompt}</div>
          {p.imageUrl && <img src={p.imageUrl} alt="" className="mx-auto mb-4 max-h-[28vh] rounded-2xl" />}
          {(g === 'T01' || g === 'T04') && (
            <div className="grid grid-cols-2 gap-4">
              {(p.options ?? []).map((o: string, i: number) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl border-2 border-forest-line bg-white px-6 py-[2vh] text-[2.6vw] font-bold shadow">
                  <span className="text-gold">{LETTERS[i]}</span>{o}
                </div>
              ))}
            </div>
          )}
          {(g === 'T02' || g === 'P01') && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
              {[0, 1].map((i) => (
                <div key={i} className={`rounded-3xl border-4 bg-white p-[3vh] text-center text-[3vw] font-black shadow ${i === 0 ? 'order-1 border-gold' : 'order-3 border-turf'}`}>
                  <div className={`text-[2vw] ${i === 0 ? 'text-gold' : 'text-turf'}`}>{i === 0 ? 'A' : 'B'}</div>
                  {p.options?.[i]}
                </div>
              ))}
              <div className="order-2 text-[3vw] font-black text-ivory/40">VS</div>
            </div>
          )}
          {g === 'T03' && <div className="text-center text-[2.4vw] text-ivory/70">조원과 상의 후 조장님이 숫자 입력 (단위: <b className="text-gold">{p.unit}</b>)</div>}
        </>
      )}
      <div className="mt-[4vh] flex items-center justify-center gap-8 text-[2vw]">
        {r.status === 'closed' && <span className="font-black text-red-600">🔒 답변 마감! 곧 결과 발표</span>}
        {r.status === 'paused' && <span className="font-black text-amber-600">⏸ 잠시 멈춤</span>}
        {leader ? (
          st.teams.map((t: any) => (
            <span key={t.id} className={`rounded-full px-5 py-2 font-bold ${r.teamsAnswered.includes(t.id) ? 'bg-turf text-white' : 'bg-forest-deep text-ivory/50'}`}>{t.name} {r.teamsAnswered.includes(t.id) ? '제출 ✓' : '상의 중'}</span>
          ))
        ) : (
          <span className="rounded-full bg-forest-deep px-6 py-2 font-bold">응답 <b className="text-turf">{r.answeredCount}</b> / {r.expected}명</span>
        )}
      </div>
    </div>
  );
}

function TeamCards({ teams, detail }: { teams: any[]; detail: (t: any) => React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, teams.length)}, minmax(0, 1fr))` }}>
      {teams.map((t: any, i: number) => (
        <motion.div key={t.teamId} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.25 }} className="rounded-3xl border-2 border-forest-line bg-white p-6 text-center shadow-lg">
          <div className="text-[2.4vw] font-black">{t.name}</div>
          <div className="my-2 text-[1.6vw] text-ivory/70">{detail(t)}</div>
          <div className={`text-[4vw] font-black ${t.points > 0 ? 'text-turf' : t.points < 0 ? 'text-red-600' : 'text-ivory/40'}`}>{t.points > 0 ? '+' : ''}{fmt(t.points)}</div>
        </motion.div>
      ))}
    </div>
  );
}

function Result({ st }: { st: any }) {
  const r = st.round;
  const g = r.gameType as GameType;
  const res = r.result ?? {};
  const p = r.payload ?? {};
  return (
    <div className="w-full max-w-7xl">
      <Confetti burstKey={r.id} count={50} />
      {g === 'T01' && (
        <>
          <div className="mb-4 text-[2.4vw] font-bold">{p.prompt}</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {(res.options ?? []).map((o: string, i: number) => (
              <div key={i} className={`flex justify-between rounded-2xl px-6 py-[1.6vh] text-[2.2vw] font-bold ${i === res.answer ? 'bg-turf text-white' : 'bg-white text-ivory/50'}`}>
                <span>{LETTERS[i]} {o}</span><span>{res.dist?.[i] ?? 0}명</span>
              </div>
            ))}
          </div>
          <div className="mb-6 text-center text-[1.8vw]">정답률 <b className="text-turf">{res.accuracy}%</b> · {res.explanation}</div>
          <TeamCards teams={res.teams ?? []} detail={(t) => `정답 ${t.correct}/${t.size ?? '-'}명`} />
        </>
      )}
      {g === 'T02' && (
        <>
          <div className="mb-6 text-center text-[2.6vw] font-black">A. {res.options?.[0]} <span className="text-ivory/40">vs</span> B. {res.options?.[1]}</div>
          <TeamCards teams={res.teams ?? []} detail={(t) => <span className="text-[2.2vw] font-bold">A {t.a}명 · B {t.b}명</span>} />
        </>
      )}
      {g === 'T03' && (
        <>
          <div className="mb-6 text-center">
            <div className="text-[2vw] text-ivory/70">정답</div>
            <div className="gold-text text-[7vw] font-black leading-none">{fmt(res.answer)}<span className="text-[3vw]"> {res.unit}</span></div>
            <div className="mt-2 text-[1.6vw]">{res.explanation}</div>
          </div>
          <TeamCards teams={res.teams ?? []} detail={(t) => (t.value === null ? '미제출' : <span className="text-[2vw] font-bold">{fmt(t.value)}{res.unit} · {t.rank}위</span>)} />
        </>
      )}
      {g === 'T04' && (
        <>
          <div className="mb-2 text-center text-[2vw]">{p.prompt}</div>
          <div className="mx-auto mb-6 w-fit rounded-2xl bg-turf px-8 py-3 text-[2.8vw] font-black text-white">{LETTERS[res.answer]} {res.options?.[res.answer]}</div>
          <TeamCards teams={res.teams ?? []} detail={(t) => <span className="text-[1.8vw]">베팅 {fmt(t.bet)} · {t.choice === null ? '미응답' : t.correct ? '정답' : '오답'}<br />{fmt(t.before)} → <b>{fmt(t.after)}</b></span>} />
        </>
      )}
      {g === 'P01' && (
        <div className="grid grid-cols-2 gap-8">
          {[0, 1].map((i) => {
            const v = i === 0 ? res.a : res.b;
            const pct = res.total ? Math.round((v / res.total) * 100) : 0;
            const win = res.winners?.includes(i);
            return (
              <div key={i} className={`rounded-3xl border-4 bg-white p-8 text-center shadow-lg ${win ? 'border-turf' : 'border-forest-line'}`}>
                <div className="text-[2.6vw] font-black">{i === 0 ? 'A' : 'B'}. {res.options?.[i]}</div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 }} className={`text-[9vw] font-black leading-none ${win ? 'text-turf' : 'text-ivory/40'}`}>{pct}%</motion.div>
                <div className="text-[2vw]">{v}명 {win && '· 다수 +200점'}</div>
              </div>
            );
          })}
        </div>
      )}
      {g === 'P02' && (
        <>
          {res.void ? (
            <div className="mb-6 text-center text-[4vw] font-black text-red-600">겹치지 않은 숫자가 없어요! 다시 진행합니다</div>
          ) : (
            <div className="mb-6 grid grid-cols-3 gap-6">
              {res.placements.map((x: any) => (
                <div key={x.place} className="rounded-3xl bg-white p-6 text-center shadow-lg">
                  <Medal rank={x.place} />
                  <div className="text-[5vw] font-black text-turf">{x.number}번</div>
                  <div className="text-[2.2vw] font-bold">{x.name} <span className="text-[1.4vw] text-ivory/60">{x.teamName}</span></div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-10 gap-2">
            {(res.distribution ?? []).map((c: number, i: number) => (
              <div key={i} className={`rounded-xl py-2 text-center ${c === 1 ? 'bg-turf text-white' : c > 1 ? 'bg-red-100 text-red-700' : 'bg-white text-ivory/30'}`}>
                <div className="text-[2vw] font-black">{i + 1}</div><div className="text-[1.2vw]">{c}명</div>
              </div>
            ))}
          </div>
        </>
      )}
      {g === 'P03' && (
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="mb-3 text-[2.2vw] font-black text-gold">이번 라운드 TOP 5</div>
            {(res.attempts ?? []).filter((a: any) => a.ms !== null).slice(0, 5).map((a: any, i: number) => (
              <motion.div key={a.participantId} initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.2 }} className="mb-2 flex items-center gap-4 rounded-2xl bg-white px-5 py-3 text-[2vw] shadow">
                <Medal rank={i + 1} /><span className="flex-1 font-bold">{a.name}</span><span className="font-black tabular-nums">{(a.ms / 1000).toFixed(3)}초</span>
              </motion.div>
            ))}
          </div>
          {res.standings && (
            <div>
              <div className="mb-3 text-[2.2vw] font-black text-turf">누적 순위 (평균 오차)</div>
              {res.standings.slice(0, 5).map((x: any) => (
                <div key={x.name} className="mb-2 flex justify-between rounded-2xl bg-white px-5 py-3 text-[1.8vw] shadow"><span>{x.rank}위 {x.name}</span><span className="tabular-nums">{x.avgError.toFixed(3)}초</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bingo({ b }: { b: any }) {
  const drawn = new Set<number>(b?.drawn ?? []);
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    if (b?.last && lastRef.current !== null && b.last !== lastRef.current) sfx('ding');
    lastRef.current = b?.last ?? null;
  }, [b?.last]);
  const winners = [...(b?.winners ?? []), ...(b?.pending ?? [])];
  return (
    <div className="grid w-full max-w-7xl grid-cols-[1fr_1.4fr] items-center gap-[4vw]">
      <div className="text-center">
        <div className="text-[2.2vw] text-ivory/70">방금 뽑힌 번호</div>
        <AnimatePresence mode="popLayout">
          <motion.div key={b?.last ?? 'x'} initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }} className="mx-auto flex h-[22vw] w-[22vw] items-center justify-center rounded-full bg-white text-[11vw] font-black text-gold shadow-2xl ring-8 ring-turf">
            {b?.last ?? '-'}
          </motion.div>
        </AnimatePresence>
        {winners.length > 0 && (
          <div className="mt-6">
            <Confetti burstKey={'b' + winners.length} count={60} />
            <div className="text-[3vw] font-black text-turf">🏆 빙고!</div>
            <div className="text-[2.6vw] font-black">{winners.map((w: any) => w.name).join(' · ')}</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
          <div key={n} className={`flex aspect-square items-center justify-center rounded-2xl text-[2.6vw] font-black ${n === b?.last ? 'bg-gold text-white ring-4 ring-turf' : drawn.has(n) ? 'bg-turf text-white' : 'bg-white text-ivory/30'}`}>{n}</div>
        ))}
      </div>
    </div>
  );
}

function Ranking({ st, kind }: { st: any; kind: 'team' | 'individual' }) {
  const rk = st.rankings;
  useEffect(() => sfx('fanfare'), [rk?.at]);
  if (!rk) return null;
  if (kind === 'team')
    return (
      <div className="w-full max-w-6xl text-center">
        <Trophy className="mx-auto text-gold" size={70} />
        <div className="gold-text mb-8 text-[4.5vw] font-black">조별 순위</div>
        <div className="flex items-end justify-center gap-8">
          {[...rk.team].sort((a: any, b: any) => (a.rank === 1 ? 0 : a.rank === 2 ? -1 : 1) - (b.rank === 1 ? 0 : b.rank === 2 ? -1 : 1)).map((t: any, i: number) => (
            <motion.div key={t.id} initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + (3 - t.rank) * 0.6, type: 'spring' }} className="flex w-[22vw] flex-col items-center">
              <div className="text-[3vw] font-black" style={{ color: t.color }}>{t.name}</div>
              <div className="text-[3.4vw] font-black tabular-nums">{fmt(t.total)}</div>
              <div className={`mt-2 flex w-full items-start justify-center rounded-t-3xl pt-4 text-[4vw] font-black text-white ${t.rank === 1 ? 'h-[30vh] bg-[#C9A227]' : t.rank === 2 ? 'h-[22vh] bg-silver' : 'h-[15vh] bg-bronze'}`}>{t.rank}위</div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  const list = rk.individual.slice(0, 18);
  return (
    <div className="w-full max-w-7xl">
      <div className="gold-text mb-4 text-center text-[3.6vw] font-black">개인 순위</div>
      <div className="grid grid-flow-col grid-cols-2 grid-rows-9 gap-x-8 gap-y-[0.8vh]">
        {list.map((x: any, i: number) => (
          <motion.div key={x.id} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.06 }} className={`flex items-center gap-3 rounded-xl px-4 py-[0.6vh] text-[1.7vw] ${x.rank <= 3 ? 'bg-white font-black shadow' : 'bg-white/60'}`}>
            <Medal rank={x.rank} />
            <span className="flex-1 truncate">{x.name} <span className="text-[1.2vw]" style={{ color: x.color }}>{x.teamName}</span></span>
            {x.delta ? <span className={`text-[1.3vw] font-bold ${x.delta > 0 ? 'text-turf' : 'text-red-600'}`}>{x.delta > 0 ? '▲' : '▼'}{Math.abs(x.delta)}</span> : null}
            <span className="w-[7vw] text-right font-black tabular-nums">{fmt(x.total)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Ceremony({ d }: { d: any }) {
  const step = Number(d?.step ?? 0);
  const c = d?.ceremony ?? {};
  useEffect(() => {
    if (step === 0) return;
    sfx('drum');
    const t = setTimeout(() => sfx('fanfare'), 1100);
    return () => clearTimeout(t);
  }, [step]);
  const ind = (rank: number) => c.individual?.find((x: any) => x.rank === rank)?.people ?? [];
  return (
    <div className="w-full max-w-6xl text-center">
      {step >= 1 && <Confetti burstKey={'c' + step} count={80} />}
      <Trophy className="mx-auto text-gold" size={80} />
      <div className="gold-text mb-6 text-[4vw] font-black">최종 시상식</div>
      {step === 0 && <div className="text-[3vw] font-bold">오늘 함께해 주셔서 감사합니다!<div className="mt-4 text-[2vw] text-ivory/60">잠시 후 수상자를 발표합니다 🥁</div></div>}
      {step >= 1 && step <= 3 && (
        <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring' }}>
          <div className={`text-[5vw] font-black ${step === 3 ? 'text-[#C9A227]' : step === 2 ? 'text-silver' : 'text-bronze'}`}>개인 종합 {4 - step}위</div>
          <div className="flex flex-wrap items-baseline justify-center gap-x-8">
            {ind(4 - step).map((p: any) => (
              <div key={p.name} className="mt-2"><span className={`${ind(4 - step).length > 2 ? 'text-[3.6vw]' : 'text-[7vw]'} font-black`}>{p.name}</span><span className="ml-3 text-[1.8vw] text-ivory/70">{p.teamName} · {fmt(p.total)}점</span></div>
            ))}
          </div>
          {c.prizes?.[`ind${4 - step}`]?.name && <div className="mt-4 text-[2.4vw] text-turf">🎁 {c.prizes[`ind${4 - step}`].name}</div>}
        </motion.div>
      )}
      {step === 4 && (
        <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring' }}>
          <div className="text-[3vw] font-bold text-ivory/70">조별 종합 우승</div>
          {c.team?.map((t: any) => (
            <div key={t.name}>
              <div className="text-[8vw] font-black leading-tight" style={{ color: t.color }}>{t.name}</div>
              <div className="text-[2.6vw] font-bold">{fmt(t.total)}점</div>
              <div className="mt-4 flex flex-wrap justify-center gap-3">{t.members.map((m: string) => <span key={m} className="rounded-full bg-turf-pale px-5 py-2 text-[2vw] font-bold text-turf">{m}</span>)}</div>
            </div>
          ))}
        </motion.div>
      )}
      {step >= 5 && (
        <div>
          <div className="mb-4 text-[2.6vw] font-black text-turf">행운의 주인공들</div>
          <div className="mx-auto grid max-w-4xl gap-3">
            {(c.lucky ?? []).map((w: any, i: number) => (
              <div key={i} className="flex justify-between rounded-2xl bg-white px-6 py-3 text-[2vw] shadow"><span className="text-ivory/60">{w.label}</span><b>{w.name}</b></div>
            ))}
          </div>
          <div className="mt-8 text-[3.4vw] font-black">모두 수고하셨습니다! ⛳</div>
        </div>
      )}
    </div>
  );
}
