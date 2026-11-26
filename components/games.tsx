'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES, GameType } from '@/lib/games';
import { fmt, sfx, useTicker } from '@/lib/client';
import { Bar, Big, Confetti, Countdown, GolfBall, Medal, Pill, TimerBar, Flag } from './ui';

export type Ctx = {
  st: any;
  serverNow: () => number;
  submit: (kind: 'answer' | 'bet' | 'start', value: any) => Promise<boolean>;
  busy: boolean;
};

const LETTERS = ['①', '②', '③', '④'];

export function RoundStage({ ctx }: { ctx: Ctx }) {
  useTicker(250);
  const r = ctx.st.round;
  const g = r.gameType as GameType;
  if (r.status === 'betting') return <BetStage ctx={ctx} />;
  if (r.status === 'revealed') return <ResultStage ctx={ctx} />;
  const startsAt = Date.parse(r.startsAt);
  if (r.status === 'open' && ctx.serverNow() < startsAt) return <Countdown startsAt={startsAt} serverNow={ctx.serverNow} />;
  if (g === 'P03') return <TenSecStage ctx={ctx} />;
  return <QuestionStage ctx={ctx} />;
}

function RoundHeader({ ctx }: { ctx: Ctx }) {
  const r = ctx.st.round;
  const info = ctx.st.gameInfo;
  return (
    <div className="mb-4 flex items-center justify-between">
      <Pill>{GAMES[r.gameType as GameType].emoji} {GAMES[r.gameType as GameType].title}</Pill>
      <Pill className="font-bold text-gold">{r.roundNo} / {info?.totalRounds ?? '-'}</Pill>
    </div>
  );
}

function Timer({ ctx }: { ctx: Ctx }) {
  const r = ctx.st.round;
  if (r.status !== 'open' && r.status !== 'paused') return null;
  return (
    <div className="mb-5">
      <TimerBar endsAt={Date.parse(r.endsAt)} total={r.timeLimit} serverNow={ctx.serverNow} paused={r.status === 'paused'} pausedRemainingMs={r.pausedRemainingMs} />
    </div>
  );
}

function answerLabel(g: GameType, v: any, payload: any) {
  if (!v) return '';
  if (g === 'T01' || g === 'T04') return `${LETTERS[v.choice]} ${payload?.options?.[v.choice] ?? ''}`;
  if (g === 'T02' || g === 'P01') return `${v.choice === 0 ? 'A' : 'B'}. ${payload?.options?.[v.choice] ?? ''}`;
  if (g === 'T03') return `${fmt(v.number)} ${payload?.unit ?? ''}`;
  if (g === 'P02') return `${v.number}번`;
  return '';
}

function QuestionStage({ ctx }: { ctx: Ctx }) {
  const { st } = ctx;
  const r = st.round;
  const g = r.gameType as GameType;
  const meta = GAMES[g];
  const p = r.payload ?? {};
  const isLeaderGame = !!meta.leaderOnly;
  const canAnswer = isLeaderGame ? st.me.isLeader : true;
  const submitted = isLeaderGame ? r.teamAnswer : r.myAnswer;
  const open = r.status === 'open';
  const [sel, setSel] = useState<any>(null);
  const [num, setNum] = useState('');
  const autoSent = useRef(false);

  useEffect(() => {
    setSel(null);
    setNum('');
    autoSent.current = false;
  }, [r.id]);

  // 시간 종료 직전, 고르기만 하고 제출하지 않은 답 자동 제출
  useEffect(() => {
    if (!open || submitted || !canAnswer || autoSent.current) return;
    const t = setInterval(() => {
      const left = Date.parse(r.endsAt) - ctx.serverNow();
      const val = g === 'T03' ? (num.trim() ? { number: num.replace(/,/g, '') } : null) : sel;
      if (left < 700 && val && !autoSent.current) {
        autoSent.current = true;
        ctx.submit('answer', val);
      }
    }, 150);
    return () => clearInterval(t);
  }, [open, submitted, canAnswer, sel, num, r.endsAt, g, ctx]);

  const send = async () => {
    const val = g === 'T03' ? { number: num.replace(/,/g, '') } : sel;
    if (!val) return;
    sfx('tap');
    await ctx.submit('answer', val);
  };

  return (
    <div>
      <RoundHeader ctx={ctx} />
      <Timer ctx={ctx} />
      {g !== 'P02' && <Big className="mb-4">{p.prompt}</Big>}
      {g === 'P02' && <Big className="mb-2">1~20 중 숫자 하나!</Big>}
      {g === 'P02' && <div className="mb-4 text-lg text-ivory/70">다른 사람과 겹치지 않는 <b className="text-gold">가장 작은 숫자</b>가 1위</div>}
      {p.imageUrl && <img src={p.imageUrl} alt="" className="mb-4 max-h-56 w-full rounded-2xl object-contain bg-forest-deep" />}

      {submitted ? (
        <Submitted ctx={ctx} label={answerLabel(g, submitted, p)} team={isLeaderGame} />
      ) : r.status === 'closed' ? (
        <ClosedBox />
      ) : !canAnswer ? (
        <div className="card text-center">
          <div className="mb-2 text-4xl">🗣️</div>
          <div className="text-2xl font-bold">조원들과 상의하세요!</div>
          <div className="mt-2 text-lg text-ivory/80">
            조장 <b className="text-gold">{st.teamMembers?.find((m: any) => m.isLeader)?.name ?? '(미지정)'}</b>님이 대표로 제출합니다.
          </div>
          {g !== 'T03' && <OptionList options={p.options ?? []} selected={null} disabled onSelect={() => {}} />}
        </div>
      ) : (
        <>
          {(g === 'T01' || g === 'T04') && <OptionList options={p.options ?? []} selected={sel?.choice ?? null} disabled={!open} onSelect={(i) => { sfx('tap'); setSel({ choice: i }); }} />}
          {(g === 'T02' || g === 'P01') && <ABChoice options={p.options ?? []} selected={sel?.choice ?? null} disabled={!open} onSelect={(i) => { sfx('tap'); setSel({ choice: i }); }} />}
          {g === 'T03' && (
            <div className="card">
              <div className="mb-2 text-lg text-ivory/80">조장님, 숫자를 입력하세요</div>
              <div className="flex items-center gap-3">
                <input
                  className="input text-right text-[30px] font-bold"
                  inputMode="decimal"
                  value={num}
                  placeholder="0"
                  onChange={(e) => setNum(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
                <span className="shrink-0 text-2xl font-bold text-gold">{p.unit}</span>
              </div>
            </div>
          )}
          {g === 'P02' && (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  disabled={!open}
                  onClick={() => { sfx('tap'); setSel({ number: n }); }}
                  className={`h-16 rounded-2xl text-[26px] font-black transition ${sel?.number === n ? 'bg-gold text-white scale-105' : 'bg-forest-light text-ivory border border-forest-line'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="sticky bottom-3 mt-5">
            <button className="btn-gold w-full text-[24px]" disabled={!open || ctx.busy || (g === 'T03' ? !num.trim() : !sel)} onClick={send}>
              {ctx.busy ? '제출 중…' : g === 'T03' ? '이 숫자로 제출' : sel ? '이걸로 제출하기' : '답을 골라 주세요'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OptionList({ options, selected, onSelect, disabled }: { options: string[]; selected: number | null; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <div className="mt-3 grid gap-3">
      {options.map((o, i) => (
        <button
          key={i}
          disabled={disabled}
          onClick={() => onSelect(i)}
          className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[22px] font-bold transition ${
            selected === i ? 'border-gold bg-gold text-white' : 'border-forest-line bg-forest-light text-ivory'
          } ${disabled && selected !== i ? 'opacity-70' : ''}`}
        >
          <span className="text-[26px]">{LETTERS[i]}</span>
          <span>{o}</span>
        </button>
      ))}
    </div>
  );
}

function ABChoice({ options, selected, onSelect, disabled }: { options: string[]; selected: number | null; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <div className="relative grid gap-3">
      {[0, 1].map((i) => (
        <button
          key={i}
          disabled={disabled}
          onClick={() => onSelect(i)}
          className={`min-h-[120px] rounded-3xl border-2 p-5 text-center text-[26px] font-extrabold leading-snug transition ${
            selected === i ? 'border-gold bg-gold text-white scale-[1.02]' : 'border-forest-line bg-forest-light text-ivory'
          }`}
        >
          <div className={`mb-1 text-lg ${selected === i ? 'text-forest' : 'text-gold'}`}>{i === 0 ? 'A' : 'B'}</div>
          {options[i]}
        </button>
      ))}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold bg-forest-deep text-lg font-black text-gold">VS</div>
    </div>
  );
}

function Submitted({ ctx, label, team }: { ctx: Ctx; label: string; team?: boolean }) {
  const r = ctx.st.round;
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card text-center">
      <div className="mb-2 text-5xl">⛳</div>
      <div className="text-2xl font-black text-gold">{team ? '우리 조 답안 제출 완료!' : '제출 완료!'}</div>
      {label && <div className="mt-3 rounded-2xl bg-forest-deep px-4 py-3 text-[22px] font-bold">{label}</div>}
      <div className="mt-4 text-lg text-ivory/70">{r.status === 'open' ? '다른 분들을 기다리는 중입니다…' : '사회자가 곧 결과를 발표합니다'}</div>
      {!team && <div className="mt-1 text-base text-ivory/50">응답 {r.answeredCount}명</div>}
    </motion.div>
  );
}

function ClosedBox() {
  return (
    <div className="card text-center">
      <div className="mb-2 text-5xl">🔒</div>
      <div className="text-2xl font-black">답변이 마감되었습니다</div>
      <div className="mt-2 text-lg text-ivory/70">사회자가 곧 결과를 발표합니다</div>
    </div>
  );
}

// ------------------------------------------------------------ 최후의 역전 베팅
function BetStage({ ctx }: { ctx: Ctx }) {
  const { st } = ctx;
  const r = st.round;
  const max = Math.max(0, Math.floor(r.teamScoreForBet ?? 0));
  const [bet, setBet] = useState('');
  const leader = st.teamMembers?.find((m: any) => m.isLeader)?.name ?? '(미지정)';
  return (
    <div>
      <RoundHeader ctx={ctx} />
      <div className="card mb-4 text-center">
        <div className="text-lg text-ivory/70">우리 조 현재 점수</div>
        <div className="gold-text text-5xl font-black">{fmt(max)}점</div>
        <div className="mt-2 text-lg">문제를 보기 전에 <b className="text-gold">걸 점수</b>를 정하세요!</div>
        <div className="text-base text-ivory/60">맞히면 + / 틀리면 − (0점 ~ {fmt(max)}점)</div>
      </div>
      {r.teamBet ? (
        <div className="card text-center">
          <div className="text-2xl font-black text-gold">베팅 완료: {fmt(r.teamBet.bet)}점</div>
          <div className="mt-2 text-lg text-ivory/70">다른 조의 베팅을 기다립니다. 곧 문제가 공개됩니다!</div>
        </div>
      ) : st.me.isLeader ? (
        <div className="card">
          <div className="mb-3 grid grid-cols-4 gap-2">
            {[0, 0.25, 0.5, 1].map((f) => (
              <button key={f} className="btn-dark px-1 text-lg" onClick={() => setBet(String(Math.floor(max * f)))}>
                {f === 0 ? '0' : f === 1 ? '전부' : `${f * 100}%`}
              </button>
            ))}
          </div>
          <input className="input mb-4 text-right text-[30px] font-bold" inputMode="numeric" placeholder="0" value={bet} onChange={(e) => setBet(e.target.value.replace(/[^0-9]/g, ''))} />
          <button className="btn-gold w-full" disabled={ctx.busy || bet === '' || Number(bet) > max} onClick={() => ctx.submit('bet', { bet: Number(bet) })}>
            {Number(bet) > max ? `최대 ${fmt(max)}점까지 가능` : `${fmt(Number(bet || 0))}점 걸기`}
          </button>
        </div>
      ) : (
        <div className="card text-center">
          <div className="mb-2 text-4xl">🤫</div>
          <div className="text-xl font-bold">조장 <span className="text-gold">{leader}</span>님과 상의하세요!</div>
          <div className="mt-1 text-lg text-ivory/70">조장님이 베팅 점수를 입력합니다.</div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 10초의 감각
function TenSecStage({ ctx }: { ctx: Ctx }) {
  const r = ctx.st.round;
  const [running, setRunning] = useState(false);
  const [localDone, setLocalDone] = useState<string | null>(null);
  const t0 = useRef(0);
  const sentInvalid = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    setRunning(false);
    setLocalDone(null);
    sentInvalid.current = false;
    stoppedRef.current = false;
  }, [r.id]);

  // 새로고침 등으로 측정이 끊긴 경우 → 무효
  useEffect(() => {
    if (r.myStart && !r.myAnswer && !running && !stoppedRef.current && !sentInvalid.current && r.status === 'open') {
      sentInvalid.current = true;
      ctx.submit('answer', { invalid: true, reason: 'refresh' });
    }
  }, [r.myStart, r.myAnswer, running, r.status, ctx]);

  useEffect(() => {
    if (!running) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !stoppedRef.current) {
        stoppedRef.current = true;
        setRunning(false);
        setLocalDone('hidden');
        ctx.submit('answer', { invalid: true, reason: 'hidden' });
      }
    };
    const guard = setInterval(() => {
      if (!stoppedRef.current && performance.now() - t0.current >= 30000) {
        stoppedRef.current = true;
        setRunning(false);
        setLocalDone('timeout');
        ctx.submit('answer', { invalid: true, reason: 'timeout' });
      }
    }, 200);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      clearInterval(guard);
    };
  }, [running, ctx]);

  const start = () => {
    unlock();
    t0.current = performance.now();
    stoppedRef.current = false;
    setRunning(true);
    sfx('go');
    ctx.submit('start', {});
  };
  const stop = () => {
    if (stoppedRef.current) return;
    const ms = performance.now() - t0.current;
    stoppedRef.current = true;
    setRunning(false);
    setLocalDone('ok');
    sfx('ding');
    ctx.submit('answer', { ms });
  };
  const unlock = () => {};

  const left = Math.max(0, Date.parse(r.endsAt) - ctx.serverNow());
  const reason = r.myAnswer?.invalid ? r.myAnswer.reason : localDone && localDone !== 'ok' ? localDone : null;

  return (
    <div>
      <RoundHeader ctx={ctx} />
      {!running && !r.myAnswer && !localDone && <Timer ctx={ctx} />}
      {r.myAnswer || localDone ? (
        <div className="card text-center">
          <div className="mb-2 text-5xl">{reason ? '⚠️' : '⏱️'}</div>
          <div className="text-2xl font-black text-gold">{reason ? '무효 처리되었습니다' : '기록 완료!'}</div>
          <div className="mt-2 text-lg text-ivory/70">
            {reason === 'hidden' ? '측정 중 화면이 꺼지거나 다른 앱으로 이동했습니다.' : reason === 'refresh' ? '측정 중 새로고침되었습니다.' : reason === 'timeout' ? '30초가 지나 자동 종료되었습니다.' : '결과는 사회자가 공개합니다. 두근두근!'}
          </div>
        </div>
      ) : running ? (
        <div className="flex flex-col items-center">
          <div className="mb-6 text-center text-2xl font-bold">마음속으로 10초를 세세요…</div>
          <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="mb-8">
            <GolfBall size={110} />
          </motion.div>
          <button onClick={stop} className="h-56 w-56 rounded-full bg-red-600 text-[44px] font-black text-white shadow-[0_8px_0_#991b1b] active:translate-y-1">
            정지!
          </button>
        </div>
      ) : r.status === 'open' ? (
        <div className="flex flex-col items-center">
          <div className="mb-2 text-center text-2xl font-bold">준비되면 시작을 누르세요</div>
          <div className="mb-8 text-center text-lg text-ivory/70">시작 후에는 화면을 끄지 마세요</div>
          <button onClick={start} disabled={left < 1000} className="h-56 w-56 rounded-full bg-gold text-[44px] font-black text-white shadow-[0_8px_0_#072B66] active:translate-y-1 disabled:opacity-40">
            시작
          </button>
        </div>
      ) : (
        <ClosedBox />
      )}
    </div>
  );
}

// ------------------------------------------------------------ 결과
function ResultStage({ ctx }: { ctx: Ctx }) {
  const { st } = ctx;
  const r = st.round;
  const g = r.gameType as GameType;
  const res = r.result ?? {};
  const myTeam = st.me.teamId;
  const played = useRef<string | null>(null);

  const myWin = useMemo(() => {
    if (g === 'T01') return r.myAnswer ? r.myAnswer.choice === res.answer : false;
    if (g === 'P01') return r.myAnswer ? res.winners?.includes(r.myAnswer.choice) : false;
    if (g === 'P02') return res.placements?.some((x: any) => x.participantId === st.me.id);
    if (g === 'T04') return res.teams?.find((t: any) => t.teamId === myTeam)?.correct;
    if (g === 'T03') return res.teams?.find((t: any) => t.teamId === myTeam)?.rank === 1;
    if (g === 'T02') return (res.teams?.find((t: any) => t.teamId === myTeam)?.points ?? 0) > 0;
    if (g === 'P03') return false;
    return false;
  }, [g, r, res, myTeam, st.me.id]);

  useEffect(() => {
    if (played.current === r.id) return;
    played.current = r.id;
    if (g === 'P03') sfx('ding');
    else sfx(myWin ? 'correct' : 'wrong');
  }, [r.id, myWin, g]);

  return (
    <div>
      <RoundHeader ctx={ctx} />
      {myWin && <Confetti burstKey={r.id} />}
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {g === 'T01' && <ResultT01 r={r} res={res} myTeam={myTeam} />}
        {g === 'T02' && <ResultT02 res={res} myTeam={myTeam} r={r} />}
        {g === 'T03' && <ResultT03 res={res} myTeam={myTeam} />}
        {g === 'T04' && <ResultT04 res={res} myTeam={myTeam} />}
        {g === 'P01' && <ResultP01 res={res} r={r} />}
        {g === 'P02' && <ResultP02 res={res} r={r} meId={st.me.id} />}
        {g === 'P03' && <ResultP03 res={res} meId={st.me.id} />}
      </motion.div>
      <div className="mt-6 text-center text-lg text-ivory/60">다음 문제를 기다려 주세요</div>
    </div>
  );
}

function Verdict({ win, text }: { win: boolean; text?: string }) {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className={`mb-4 rounded-3xl p-4 text-center text-[30px] font-black ${win ? 'bg-turf text-white' : 'bg-forest-deep text-ivory/80'}`}>
      {text ?? (win ? '🎉 정답입니다!' : '😅 아쉬워요!')}
    </motion.div>
  );
}

function ResultT01({ r, res, myTeam }: any) {
  const win = r.myAnswer?.choice === res.answer;
  return (
    <>
      <Verdict win={win} text={!r.myAnswer ? '⏰ 미응답' : undefined} />
      <div className="card mb-4">
        <div className="mb-3 text-lg text-ivory/70">{r.payload?.prompt}</div>
        {(res.options ?? []).map((o: string, i: number) => (
          <div key={i} className={`mb-2 flex items-center justify-between rounded-2xl px-4 py-3 text-[20px] font-bold ${i === res.answer ? 'bg-turf text-white' : 'bg-forest-deep text-ivory/70'}`}>
            <span>{LETTERS[i]} {o}</span>
            <span className="text-base">{res.dist?.[i] ?? 0}명</span>
          </div>
        ))}
        {res.explanation && <div className="mt-3 rounded-2xl bg-forest-deep p-3 text-lg">💡 {res.explanation}</div>}
        <div className="mt-3 text-center text-lg">정답률 <b className="text-gold">{res.accuracy}%</b> ({res.correctCount}/{res.expected}명)</div>
      </div>
      <TeamPoints teams={(res.teams ?? []).map((t: any) => ({ ...t, detail: `정답 ${t.correct}명` }))} myTeam={myTeam} />
    </>
  );
}

function TeamPoints({ teams, myTeam }: { teams: any[]; myTeam: string }) {
  return (
    <div className="card">
      <div className="mb-3 text-lg font-bold text-gold">조별 획득 점수</div>
      {teams.map((t) => (
        <div key={t.teamId} className={`mb-2 flex items-center justify-between rounded-2xl px-4 py-3 ${t.teamId === myTeam ? 'border-2 border-gold bg-forest-deep' : 'bg-forest-deep/60'}`}>
          <div>
            <div className="text-[20px] font-bold">{t.name}{t.teamId === myTeam && ' (우리 조)'}</div>
            {t.detail && <div className="text-base text-ivory/70">{t.detail}</div>}
          </div>
          <div className={`text-[26px] font-black tabular-nums ${t.points > 0 ? 'text-turf' : t.points < 0 ? 'text-red-600' : 'text-ivory/50'}`}>
            {t.points > 0 ? '+' : ''}{fmt(t.points)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultT02({ res, myTeam }: any) {
  const opts = res.options ?? [];
  return (
    <>
      <div className="card mb-4 grid grid-cols-2 gap-2 text-center text-lg">
        <div className="rounded-2xl bg-forest-deep p-3"><div className="text-gold">A</div>{opts[0]}</div>
        <div className="rounded-2xl bg-forest-deep p-3"><div className="text-gold">B</div>{opts[1]}</div>
      </div>
      <TeamPoints teams={(res.teams ?? []).map((t: any) => ({ ...t, detail: `A ${t.a}명 / B ${t.b}명 · 조원 ${t.size}명` }))} myTeam={myTeam} />
    </>
  );
}

function ResultT03({ res, myTeam }: any) {
  return (
    <>
      <div className="card mb-4 text-center">
        <div className="text-lg text-ivory/70">정답</div>
        <div className="gold-text text-5xl font-black">{fmt(res.answer)}<span className="ml-1 text-3xl">{res.unit}</span></div>
        {res.explanation && <div className="mt-3 text-lg">{res.explanation}</div>}
        {(res.source || res.baseDate) && <div className="mt-2 text-sm text-ivory/50">출처: {res.source} {res.baseDate && `(${res.baseDate})`}</div>}
      </div>
      <TeamPoints
        teams={[...(res.teams ?? [])].sort((a: any, b: any) => (a.rank ?? 9) - (b.rank ?? 9)).map((t: any) => ({
          ...t, detail: t.value === null ? '미제출' : `${fmt(t.value)}${res.unit ?? ''} · 오차 ${fmt(Math.round(t.error * 100) / 100)} · ${t.rank}위`,
        }))}
        myTeam={myTeam}
      />
    </>
  );
}

function ResultT04({ res, myTeam }: any) {
  return (
    <>
      <div className="card mb-4">
        <div className="mb-2 text-lg text-ivory/70">정답</div>
        <div className="rounded-2xl bg-turf px-4 py-3 text-[22px] font-black text-white">{LETTERS[res.answer]} {res.options?.[res.answer]}</div>
        {res.explanation && <div className="mt-3 text-lg">💡 {res.explanation}</div>}
      </div>
      <TeamPoints
        teams={(res.teams ?? []).map((t: any) => ({
          ...t, detail: `베팅 ${fmt(t.bet)}점 · ${t.choice === null ? '미응답' : t.correct ? '정답' : '오답'} · ${fmt(t.before)} → ${fmt(t.after)}점`,
        }))}
        myTeam={myTeam}
      />
    </>
  );
}

function ResultP01({ res, r }: any) {
  const total = Math.max(1, res.total ?? 0);
  const my = r.myAnswer?.choice;
  const win = my !== undefined && res.winners?.includes(my);
  return (
    <>
      <Verdict win={!!win} text={!r.myAnswer ? '⏰ 미응답' : win ? '🎉 다수 선택! +200점' : '😅 소수 선택'} />
      <div className="card">
        {[0, 1].map((i) => (
          <Bar key={i} label={`${i === 0 ? 'A' : 'B'}. ${res.options?.[i] ?? ''}`} value={i === 0 ? res.a : res.b} max={total} highlight={res.winners?.includes(i)} suffix={`명 (${Math.round(((i === 0 ? res.a : res.b) / total) * 100)}%)`} />
        ))}
        {res.winners?.length === 2 && <div className="mt-2 text-center text-lg text-gold">동률! 모두 200점</div>}
      </div>
    </>
  );
}

function ResultP02({ res, r, meId }: any) {
  const mine = r.myAnswer?.number;
  const place = res.placements?.find((x: any) => x.participantId === meId);
  if (res.void)
    return (
      <div className="card text-center">
        <div className="mb-2 text-5xl">🔁</div>
        <div className="text-2xl font-black">겹치지 않은 숫자가 없어요!</div>
        <div className="mt-2 text-lg text-ivory/70">이번 라운드는 다시 진행합니다.</div>
        <NumberGrid dist={res.distribution} mine={mine} />
      </div>
    );
  return (
    <>
      <Verdict win={!!place} text={place ? `🎉 ${place.place}위! +${place.points}점` : mine ? `${mine}번 · 아쉬워요` : '⏰ 미응답'} />
      <div className="card mb-4">
        {res.placements.map((p: any) => (
          <div key={p.place} className="mb-2 flex items-center gap-3 rounded-2xl bg-forest-deep px-4 py-3">
            <Medal rank={p.place} />
            <div className="flex-1 text-[20px] font-bold">{p.name} <span className="text-base text-ivory/60">{p.teamName}</span></div>
            <div className="text-2xl font-black text-gold">{p.number}번</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="mb-2 text-lg text-ivory/70">숫자별 선택 인원 (금색 = 유일한 숫자)</div>
        <NumberGrid dist={res.distribution} mine={mine} />
      </div>
    </>
  );
}

function NumberGrid({ dist, mine }: { dist: number[]; mine?: number }) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-2">
      {(dist ?? []).map((c, i) => (
        <div key={i} className={`rounded-xl py-2 text-center ${c === 1 ? 'bg-turf text-white' : c > 1 ? 'bg-red-100 text-red-700' : 'bg-forest-deep text-ivory/40'} ${mine === i + 1 ? 'ring-4 ring-gold' : ''}`}>
          <div className="text-xl font-black">{i + 1}</div>
          <div className="text-sm">{c}명</div>
        </div>
      ))}
    </div>
  );
}

function ResultP03({ res, meId }: any) {
  const mine = res.attempts?.find((a: any) => a.participantId === meId);
  const ok = (res.attempts ?? []).filter((a: any) => a.ms !== null);
  return (
    <>
      <div className="card mb-4 text-center">
        <div className="text-lg text-ivory/70">나의 기록</div>
        {mine?.ms !== null && mine?.ms !== undefined ? (
          <>
            <div className="gold-text text-6xl font-black tabular-nums">{(mine.ms / 1000).toFixed(3)}초</div>
            <div className="mt-1 text-xl">오차 {mine.error.toFixed(3)}초</div>
          </>
        ) : (
          <div className="text-2xl font-bold text-ivory/70">{mine?.status === 'none' ? '미참여' : '무효'}</div>
        )}
      </div>
      <div className="card mb-4">
        <div className="mb-2 text-lg font-bold text-gold">이번 라운드 TOP 5</div>
        {ok.slice(0, 5).map((a: any, i: number) => (
          <div key={a.participantId} className={`mb-2 flex items-center gap-3 rounded-2xl px-4 py-2 ${a.participantId === meId ? 'border-2 border-gold' : 'bg-forest-deep'}`}>
            <Medal rank={i + 1} />
            <div className="flex-1 text-lg font-bold">{a.name}</div>
            <div className="text-right tabular-nums"><div className="text-lg font-bold">{(a.ms / 1000).toFixed(3)}초</div><div className="text-sm text-ivory/60">오차 {a.error.toFixed(3)}</div></div>
          </div>
        ))}
      </div>
      {res.standings && (
        <div className="card">
          <div className="mb-2 text-lg font-bold text-gold">누적 순위 ({res.roundsCounted}라운드 평균 오차)</div>
          {res.standings.slice(0, 6).map((s: any) => (
            <div key={s.name} className="flex justify-between py-1 text-lg">
              <span>{s.rank}위 {s.name}</span>
              <span className="tabular-nums text-ivory/80">{s.avgError.toFixed(3)}초 · {fmt(s.points)}점</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ 행운의 골프 빙고
export function BingoStage({ st }: { st: any }) {
  const b = st.bingo;
  const drawn = new Set<number>(b?.drawn ?? []);
  const last = b?.last;
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (last && prev.current !== null && last !== prev.current) {
      setFlash(true);
      if (b.board?.includes(last)) sfx('correct');
      else sfx('ding');
      setTimeout(() => setFlash(false), 1800);
    }
    prev.current = last ?? null;
  }, [last, b?.board]);
  const iWon = (b?.winners ?? []).some((w: any) => w.id === st.me.id) || (b?.pending ?? []).some((w: any) => w.id === st.me.id);
  if (!b?.board) return <div className="card text-center text-xl">빙고판을 준비하고 있습니다…</div>;
  return (
    <div>
      {iWon && <Confetti burstKey={'bingo' + (b.winners?.length ?? 0)} count={60} />}
      <div className="mb-4 flex items-center justify-between">
        <Pill>🎯 행운의 골프 빙고</Pill>
        <Pill className="font-bold text-gold">{b.lines}줄 완성</Pill>
      </div>
      <div className="card mb-4 text-center">
        <div className="text-lg text-ivory/70">방금 뽑힌 번호</div>
        <AnimatePresence mode="popLayout">
          <motion.div key={last ?? 'none'} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }} className="gold-text text-7xl font-black">
            {last ?? '-'}
          </motion.div>
        </AnimatePresence>
        {flash && b.board.includes(last) && <div className="text-xl font-bold text-gold">내 빙고판에 있어요! ⛳</div>}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {b.board.map((n: number, i: number) => {
          const hit = drawn.has(n);
          return (
            <div key={i} className={`relative flex aspect-square items-center justify-center rounded-3xl border-2 text-[40px] font-black ${hit ? 'border-turf bg-turf-pale text-turf' : 'border-forest-line bg-forest-light text-ivory'}`}>
              {n}
              {hit && (
                <motion.div initial={{ y: -80, scale: 0.4, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }} className="absolute bottom-2 right-2">
                  <Flag size={34} />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
      {(b.winners?.length > 0 || b.pending?.length > 0) && (
        <div className="card mb-4 text-center">
          <div className="text-2xl font-black text-gold">🏆 빙고!</div>
          {[...(b.winners ?? []), ...(b.pending ?? [])].map((w: any) => (
            <div key={w.id} className="text-xl font-bold">{w.name} <span className="text-base text-ivory/60">{w.teamName}</span></div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="mb-2 text-lg text-ivory/70">추첨된 번호 ({b.drawn.length}/30)</div>
        <div className="flex flex-wrap gap-2">
          {b.drawn.map((n: number) => (
            <span key={n} className={`rounded-full px-3 py-1 text-lg font-bold ${b.board.includes(n) ? 'bg-gold text-white' : 'bg-forest-deep'}`}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 행운의 홀인원
export function HoleStage({ st, screen = false }: { st: any; screen?: boolean }) {
  const h = st.hole;
  const draws = h?.draws ?? [];
  const latest = draws[draws.length - 1];
  const [anim, setAnim] = useState<{ id: string; pos: number; done: boolean } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const total = h?.totalHoles ?? 18;

  useEffect(() => {
    if (!latest) return;
    if (seen.current.size === 0 && draws.length > 1) draws.slice(0, -1).forEach((d: any) => seen.current.add(d.id));
    if (seen.current.has(latest.id)) return;
    seen.current.add(latest.id);
    const fresh = Date.now() - Date.parse(latest.createdAt) < 20000;
    if (!fresh) return setAnim({ id: latest.id, pos: latest.hole, done: true });
    // 골프공이 홀 사이를 굴러다니다 당첨 홀에 들어가는 연출
    let step = 0;
    const steps = 22;
    sfx('drum');
    const run = () => {
      step++;
      if (step >= steps) {
        setAnim({ id: latest.id, pos: latest.hole, done: true });
        sfx('fanfare');
        return;
      }
      setAnim({ id: latest.id, pos: 1 + Math.floor(Math.random() * total), done: false });
      setTimeout(run, 60 + step * step * 0.9);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  const showing = anim && anim.done ? draws.find((d: any) => d.id === anim.id) : null;
  const iWon = !screen && showing && showing.participantId === st.me?.id;
  return (
    <div>
      {iWon && <Confetti burstKey={showing.id} count={70} />}
      {!screen && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <Pill>⛳ 행운의 홀인원</Pill>
          </div>
          <div className="card mb-4 text-center">
            <div className="text-lg text-ivory/70">나의 홀</div>
            <div className="gold-text text-6xl font-black">{h?.myHole ?? '-'}번 홀</div>
          </div>
        </>
      )}
      <div className="card felt mb-4">
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const isBall = anim?.pos === n;
            const won = draws.some((d: any) => d.hole === n && (anim?.done || d.id !== latest?.id));
            const mine = !screen && h?.myHole === n;
            return (
              <div key={n} className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl text-lg font-black ${mine ? 'border-2 border-gold' : 'border border-forest-line'} ${won ? 'bg-turf text-white' : 'bg-white'}`}>
                {n}
                {isBall && (
                  <motion.div layoutId="ball" className="absolute -top-2" transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                    <GolfBall size={26} />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {showing && (
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`card mb-4 text-center ${iWon ? 'border-gold' : ''} ${screen ? 'text-[1.6em]' : ''}`}>
          <div className="text-xl text-gold">🏆 {showing.hole}번 홀 홀인원!</div>
          <div className="text-4xl font-black">{showing.name}</div>
          <div className="text-lg text-ivory/70">{showing.teamName}</div>
          {iWon && <div className="mt-2 text-2xl font-black text-gold">축하합니다! 당첨되셨습니다!</div>}
        </motion.div>
      )}
      {anim && !anim.done && <div className="mb-4 text-center text-2xl font-black text-gold">공이 굴러갑니다… 🏌️</div>}
      {draws.length > 0 && (
        <div className="card">
          <div className="mb-2 text-lg text-ivory/70">당첨자</div>
          {draws.filter((d: any) => anim?.done || d.id !== latest?.id).map((d: any, i: number) => (
            <div key={d.id} className="py-1 text-lg">{i + 1}. {d.hole}번 홀 — <b>{d.name}</b> <span className="text-ivory/60">{d.teamName}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
