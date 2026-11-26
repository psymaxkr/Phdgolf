'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX, Trophy, ChevronLeft, Wifi, WifiOff } from 'lucide-react';
import { api, ApiError, fmt, isMuted, setMuted, sfx, unlockAudio, useLive } from '@/lib/client';
import { GAMES, GameType, PRIZE_CATEGORIES } from '@/lib/games';
import { Confetti, Flag, GolfBall, Logo, Medal, Pill, TeamChip } from './ui';
import { BingoStage, HoleStage, RoundStage } from './games';

export default function Participant({ slug }: { slug: 'main' | 'demo' }) {
  const key = `phd_token_${slug}`;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(key));
    } catch {}
    setReady(true);
  }, [key]);

  const onJoined = (t: string) => {
    try {
      localStorage.setItem(key, t);
    } catch {}
    setNotice(null);
    setToken(t);
  };
  const onKicked = (msg: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setToken(null);
    setNotice(msg);
  };

  if (!ready) return null;
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[560px] px-4 pb-10 pt-4">
      {slug === 'demo' && <div className="mb-3 rounded-xl bg-amber-100 px-3 py-1 text-center text-sm text-amber-800">데모 모드 · 실제 행사와 분리된 테스트 화면입니다</div>}
      {token ? <Game slug={slug} token={token} onKicked={onKicked} /> : <Join slug={slug} onJoined={onJoined} notice={notice} />}
    </main>
  );
}

// ------------------------------------------------------------ 입장
function Join({ slug, onJoined, notice }: { slug: string; onJoined: (t: string) => void; notice: string | null }) {
  const [info, setInfo] = useState<any>(null);
  const [step, setStep] = useState<'intro' | 'name' | 'code'>('intro');
  const [who, setWho] = useState<any>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/names?e=${slug}`).then(setInfo).catch((e) => setErr(e.message));
  }, [slug]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api(`/api/join?e=${slug}`, { body: { participantId: who.id, code } });
      sfx('fanfare');
      onJoined(r.token);
    } catch (e: any) {
      setErr(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'intro')
    return (
      <div className="flex min-h-[85dvh] flex-col items-center justify-center text-center">
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <Logo />
        </motion.div>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="my-10">
          <GolfBall size={96} />
        </motion.div>
        <div className="mb-2 text-2xl font-bold">{info?.event?.name ?? 'PHD Golf Club Year-End Party'}</div>
        <div className="mb-10 text-lg text-ivory/70">2026년 11월 27일 · 송년회 게임쇼</div>
        {err && <div className="mb-4 rounded-2xl bg-red-50 text-red-700 border border-red-200 px-4 py-3 text-lg">{err}</div>}
        <button className="btn-gold w-full max-w-sm text-[26px]" onClick={() => { unlockAudio(); setStep('name'); }}>
          입장하기
        </button>
      </div>
    );

  if (step === 'name')
    return (
      <div>
        <button className="mb-4 flex items-center gap-1 text-lg text-ivory/70" onClick={() => setStep('intro')}><ChevronLeft /> 처음으로</button>
        <div className="mb-1 text-[28px] font-black">본인 이름을 눌러 주세요</div>
        <div className="mb-5 text-lg text-ivory/70">이름이 없으면 사회자에게 말씀해 주세요</div>
        {!info && <div className="text-lg">불러오는 중…</div>}
        {info && info.participants.length === 0 && <div className="card text-lg">아직 등록된 참석자가 없습니다.</div>}
        <div className="grid grid-cols-2 gap-3">
          {info?.participants.map((p: any) => (
            <button key={p.id} className="btn-dark min-h-[64px] text-[22px]" onClick={() => { setWho(p); setCode(''); setErr(null); setStep('code'); }}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <button className="mb-4 flex items-center gap-1 text-lg text-ivory/70" onClick={() => setStep('name')}><ChevronLeft /> 이름 다시 선택</button>
      <div className="mb-1 text-[28px] font-black"><span className="text-gold">{who?.name}</span>님, 반갑습니다!</div>
      <div className="mb-5 text-lg text-ivory/70">안내받은 입장 코드를 눌러 주세요</div>
      <div className="mb-4 flex h-20 items-center justify-center rounded-3xl border-2 border-gold/50 bg-forest-deep text-[44px] font-black tracking-[0.4em] text-gold">
        {code.replace(/./g, '●') || <span className="text-2xl tracking-normal text-ivory/30">입장 코드</span>}
      </div>
      {err && <div className="mb-4 rounded-2xl bg-red-50 text-red-700 border border-red-200 px-4 py-3 text-center text-lg">{err}</div>}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '지움', '0', '←'].map((k) => (
          <button
            key={k}
            className={`h-[68px] rounded-2xl text-[30px] font-bold ${k.length > 1 ? 'bg-forest-deep text-lg text-ivory/70' : 'bg-white border-2 border-forest-line'}`}
            onClick={() => {
              sfx('tap');
              if (k === '지움') setCode('');
              else if (k === '←') setCode((c) => c.slice(0, -1));
              else setCode((c) => (c.length < 8 ? c + k : c));
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <button className="btn-gold mt-5 w-full text-[24px]" disabled={code.length < 1 || busy} onClick={submit}>
        {busy ? '확인 중…' : '입장'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------ 게임 본 화면
function Game({ slug, token, onKicked }: { slug: string; token: string; onKicked: (m: string) => void }) {
  const fetcher = useCallback(() => api(`/api/state?e=${slug}`, { token }), [slug, token]);
  const { data: st, error, online, reload, serverNow } = useLive<any>(fetcher, [slug, token], 2000);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMute] = useState(false);
  const [view, setView] = useState<'main' | 'rank'>('main');

  useEffect(() => setMute(isMuted()), []);
  useEffect(() => {
    if (st?.kicked) onKicked('다른 기기에서 입장했거나 사회자가 접속을 초기화했습니다. 다시 입장해 주세요.');
  }, [st?.kicked, onKicked]);
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onKicked(error.message);
  }, [error, onKicked]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = useCallback(
    async (kind: 'answer' | 'bet' | 'start', value: any) => {
      if (!st?.round) return false;
      if (kind !== 'start') setBusy(true);
      try {
        await api(`/api/respond?e=${slug}`, { token, body: { roundId: st.round.id, kind, value } });
        await reload();
        return true;
      } catch (e: any) {
        if (kind !== 'start') setToast(e.message);
        await reload();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [st?.round?.id, slug, token, reload] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!st || st.kicked) return <div className="flex min-h-[80dvh] items-center justify-center text-xl">접속 중…</div>;
  const s = st.session;
  const ctx = { st, serverNow, submit, busy };

  let body: React.ReactNode;
  if (s.overlay === 'ceremony') body = <Ceremony st={st} />;
  else if (s.overlay?.startsWith('ranking')) body = <Rankings st={st} kind={s.overlay === 'ranking_team' ? 'team' : 'individual'} live />;
  else if (view === 'rank') body = <RankTabs st={st} onBack={() => setView('main')} />;
  else if (s.game === 'P04') body = <BingoStage st={st} />;
  else if (s.game === 'P05') body = <HoleStage st={st} />;
  else if (s.game && st.round) body = <RoundStage ctx={ctx} />;
  else if (s.game) body = <Intro st={st} />;
  else body = <Lobby st={st} onRank={() => setView('rank')} />;

  return (
    <div>
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Flag size={26} />
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{st.me.name}</div>
            <div className="text-sm" style={{ color: st.me.teamColor }}>{st.me.teamName}{st.me.isLeader && ' · 조장'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-forest-deep px-3 py-1 text-right">
            <div className="text-xs text-ivory/60">내 점수</div>
            <div className="text-lg font-black text-gold tabular-nums">{fmt(st.myScore)}</div>
          </div>
          <button aria-label="소리" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-deep" onClick={() => { setMuted(!muted); setMute(!muted); if (muted) { unlockAudio(); sfx('tap'); } }}>
            {muted ? <VolumeX className="text-ivory/50" /> : <Volume2 className="text-gold" />}
          </button>
        </div>
      </header>
      {!online && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-red-100 text-red-700/60 px-3 py-2 text-base">
          <WifiOff size={18} /> 연결이 끊겼습니다. 자동으로 다시 연결 중…
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={`${s.overlay}-${s.game}-${st.round?.id}-${st.round?.gameType === 'P03' ? '' : st.round?.status}-${view}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {body}
        </motion.div>
      </AnimatePresence>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-2xl bg-gold px-4 py-3 text-center text-lg font-bold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Lobby({ st, onRank }: { st: any; onRank: () => void }) {
  return (
    <div>
      <div className="card mb-4 text-center">
        <div className="mb-1 text-lg text-ivory/70">게임 대기실</div>
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="my-3 flex justify-center">
          <GolfBall size={64} />
        </motion.div>
        <div className="text-2xl font-black">사회자가 다음 게임을 준비 중입니다</div>
        <div className="mt-2 text-lg text-ivory/70">화면을 켜 두시면 자동으로 시작됩니다</div>
        <div className="mt-4 flex items-center justify-center gap-2 text-lg"><Wifi size={18} className="text-gold" /> 현재 접속 <b className="text-gold">{st.counts.online}</b> / {st.counts.total}명</div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="text-base text-ivory/70">개인 누적 점수</div>
          <div className="text-3xl font-black text-gold tabular-nums">{fmt(st.myScore)}</div>
        </div>
        <div className="card text-center">
          <div className="text-base text-ivory/70">{st.me.teamName} 누적 점수</div>
          <div className="text-3xl font-black text-gold tabular-nums">{fmt(st.myTeamScore)}</div>
        </div>
      </div>
      <div className="card mb-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-bold">우리 조 명단</div>
          <TeamChip name={st.me.teamName} color={st.me.teamColor} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {st.teamMembers?.map((m: any) => (
            <div key={m.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-lg ${m.id === st.me.id ? 'bg-turf-pale font-bold text-turf' : 'bg-forest-deep'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${m.online ? 'bg-turf' : 'bg-ivory/20'}`} />
              {m.name}{m.isLeader && <span className="text-sm text-gold">조장</span>}
            </div>
          ))}
        </div>
      </div>
      {st.rankings && (
        <button className="card mb-4 block w-full text-left" onClick={onRank}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xl font-bold">🏆 현재 순위</div>
            <span className="text-sm text-ivory/50">{new Date(st.rankings.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 발표</span>
          </div>
          {st.rankings.team.map((t: any) => (
            <div key={t.id} className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-2 ${t.id === st.me.teamId ? 'border-2 border-gold' : 'bg-forest-deep'}`}>
              <Medal rank={t.rank} />
              <span className="flex-1 text-xl font-bold" style={{ color: t.color }}>{t.name}</span>
              <span className="text-xl font-black tabular-nums">{fmt(t.total)}</span>
            </div>
          ))}
          {(() => {
            const mine = st.rankings.individual.find((x: any) => x.id === st.me.id);
            return mine ? (
              <div className="mt-3 rounded-xl bg-turf-pale px-3 py-2 text-center text-lg">
                나의 개인 순위 <b className="text-2xl text-turf">{mine.rank}위</b> / {st.rankings.individual.length}명 · {fmt(mine.total)}점
              </div>
            ) : null;
          })()}
          <div className="mt-2 text-center text-sm text-ivory/50">눌러서 전체 순위 보기</div>
        </button>
      )}
      {st.myWins?.length > 0 && (
        <div className="card mb-4 border-gold">
          <div className="mb-2 text-xl font-bold text-gold">🎁 나의 당첨 내역</div>
          {st.myWins.map((w: any, i: number) => (
            <div key={i} className="text-lg">· {PRIZE_CATEGORIES[w.category] ?? w.category}{w.prize_name && ` — ${w.prize_name}`}</div>
          ))}
        </div>
      )}
      {st.rankings && (
        <button className="btn-ghost w-full" onClick={onRank}>
          <Trophy size={22} /> 최근 발표된 순위 보기
        </button>
      )}
    </div>
  );
}

function Intro({ st }: { st: any }) {
  const m = GAMES[st.session.game as GameType];
  return (
    <div>
      <div className="card mb-4 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="text-7xl">{m.emoji}</motion.div>
        <div className="mt-3 text-sm tracking-widest text-gold">{m.kind === 'team' ? '조별 대항전' : m.kind === 'individual' ? '개인전' : '행운 추첨'}</div>
        <div className="gold-text text-[38px] font-black">{m.title}</div>
      </div>
      <div className="card mb-4">
        <div className="mb-3 text-xl font-bold text-gold">게임 방법</div>
        {m.rules.map((r, i) => (
          <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.15 }} className="mb-3 flex gap-3 text-[21px] leading-snug">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-black text-white">{i + 1}</span>
            <span>{r}</span>
          </motion.div>
        ))}
        {m.leaderOnly && (
          <div className="mt-2 rounded-2xl bg-forest-deep p-3 text-lg">
            우리 조 조장: <b className="text-gold">{st.teamMembers?.find((x: any) => x.isLeader)?.name ?? '미지정 (사회자에게 알려 주세요)'}</b>
            {st.me.isLeader && <div className="mt-1 font-bold text-gold">조장님이 대표로 입력해 주세요!</div>}
          </div>
        )}
      </div>
      <div className="text-center text-xl text-ivory/70">곧 시작합니다. 잠시만 기다려 주세요!</div>
    </div>
  );
}

// ------------------------------------------------------------ 순위
function RankTabs({ st, onBack }: { st: any; onBack: () => void }) {
  const [tab, setTab] = useState<'team' | 'individual'>('team');
  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-lg text-ivory/70" onClick={onBack}><ChevronLeft /> 대기실로</button>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button className={tab === 'team' ? 'btn-gold' : 'btn-dark'} onClick={() => setTab('team')}>조별 순위</button>
        <button className={tab === 'individual' ? 'btn-gold' : 'btn-dark'} onClick={() => setTab('individual')}>개인 순위</button>
      </div>
      <Rankings st={st} kind={tab} />
    </div>
  );
}

const GAME_SHORT: Record<string, string> = { T01: '골든벨', T02: '이심전심', T03: '얼마일까요', T04: '최후의 역전', P01: '밸런스', P02: '유일한 숫자', P03: '10초의 감각', ADJ: '보정' };

function Rankings({ st, kind, live }: { st: any; kind: 'team' | 'individual'; live?: boolean }) {
  const rk = st.rankings;
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (live) sfx('fanfare');
  }, [live, rk?.at]);
  if (!rk) return <div className="card text-center text-xl">아직 발표된 순위가 없습니다.</div>;
  const list = kind === 'team' ? rk.team : rk.individual;
  const meId = kind === 'team' ? st.me.teamId : st.me.id;
  const myRank = list.find((x: any) => x.id === meId);
  return (
    <div>
      <div className="mb-4 text-center">
        <Trophy className="mx-auto mb-1 text-gold" size={40} />
        <div className="gold-text text-[34px] font-black">{kind === 'team' ? '조별 순위' : '개인 순위'}</div>
        <div className="text-base text-ivory/60">{new Date(rk.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 발표</div>
      </div>
      {myRank && (
        <div className="card mb-4 border-gold text-center">
          <div className="text-lg text-ivory/70">{kind === 'team' ? '우리 조' : '나의 순위'}</div>
          <div className="text-[40px] font-black text-gold">{myRank.rank}위 <span className="text-2xl text-ivory">{fmt(myRank.total)}점</span></div>
          <Delta d={myRank.delta} big />
        </div>
      )}
      <div className="grid gap-2">
        {list.map((x: any, i: number) => (
          <motion.button
            key={x.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: Math.min(i, 12) * 0.06 }}
            onClick={() => setOpen(open === x.id ? null : x.id)}
            className={`rounded-2xl px-3 py-3 text-left ${x.id === meId ? 'border-2 border-gold bg-gold/10' : 'bg-white border border-forest-line'}`}
          >
            <div className="flex items-center gap-3">
              <Medal rank={x.rank} />
              <div className="min-w-0 flex-1">
                <div className={`truncate font-bold ${kind === 'team' ? 'text-[24px]' : 'text-[20px]'}`}>{x.name}</div>
                {kind === 'individual' && <div className="text-sm" style={{ color: x.color }}>{x.teamName}</div>}
              </div>
              <Delta d={x.delta} />
              <div className={`text-right font-black tabular-nums ${x.rank === 1 ? 'text-gold' : x.rank === 2 ? 'text-silver' : x.rank === 3 ? 'text-bronze' : ''} ${kind === 'team' ? 'text-[28px]' : 'text-[22px]'}`}>{fmt(x.total)}</div>
            </div>
            {open === x.id && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-forest-line pt-2 text-base">
                {Object.keys(x.byGame).length === 0 && <span className="text-ivory/60">아직 점수가 없습니다</span>}
                {Object.entries(x.byGame).map(([g, v]: any) => (
                  <span key={g} className="rounded-full bg-forest-deep px-3 py-1">{GAME_SHORT[g] ?? g} {fmt(v)}</span>
                ))}
              </div>
            )}
          </motion.button>
        ))}
      </div>
      <div className="mt-3 text-center text-sm text-ivory/50">이름을 누르면 게임별 점수를 볼 수 있습니다</div>
    </div>
  );
}

function Delta({ d, big }: { d: number; big?: boolean }) {
  if (!d) return big ? <div className="text-base text-ivory/50">순위 변동 없음</div> : <span className="w-10 text-center text-sm text-ivory/40">-</span>;
  const up = d > 0;
  return (
    <span className={`${big ? 'text-xl' : 'w-10 text-center text-base'} font-bold ${up ? 'text-turf' : 'text-red-600'}`}>
      {up ? '▲' : '▼'}{Math.abs(d)}{big && (up ? ' 상승' : ' 하락')}
    </span>
  );
}

// ------------------------------------------------------------ 최종 시상식
function Ceremony({ st }: { st: any }) {
  const d = st.session.overlayData ?? {};
  const step = Number(d.step ?? 0);
  const c = d.ceremony ?? {};
  useEffect(() => {
    if (step >= 1 && step <= 4) sfx('fanfare');
  }, [step]);
  const ind = (rank: number) => c.individual?.find((x: any) => x.rank === rank)?.people ?? [];
  const meWin = (step >= 1 && step <= 3 && ind(4 - step).some((p: any) => p.name === st.me.name)) || (step === 4 && c.team?.some((t: any) => t.members.includes(st.me.name)));

  return (
    <div className="text-center">
      {step >= 1 && <Confetti burstKey={'cer' + step} count={meWin ? 90 : 40} />}
      <Trophy className="mx-auto mb-2 text-gold" size={48} />
      <div className="gold-text mb-6 text-[36px] font-black">최종 시상식</div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 140 }}>
          {step === 0 && (
            <div className="card">
              <div className="text-2xl font-bold">PHD PLAY 2026</div>
              <div className="mt-3 text-xl text-ivory/80">오늘 함께해 주셔서 감사합니다!</div>
              <div className="mt-6 text-lg text-ivory/60">잠시 후 수상자를 발표합니다 🥁</div>
            </div>
          )}
          {step >= 1 && step <= 3 && (
            <div className="card">
              <div className="mb-2 text-xl text-ivory/70">개인 종합</div>
              <div className={`mb-4 text-[56px] font-black ${step === 3 ? 'text-gold' : step === 2 ? 'text-silver' : 'text-bronze'}`}>{4 - step}위</div>
              {ind(4 - step).length === 0 && <div className="text-xl">해당 순위 없음</div>}
              {ind(4 - step).map((p: any) => (
                <div key={p.name} className="mb-3">
                  <div className="text-[44px] font-black">{p.name}</div>
                  <div className="text-xl text-ivory/70">{p.teamName} · {fmt(p.total)}점</div>
                </div>
              ))}
              {c.prizes?.[`ind${4 - step}`]?.name && <div className="mt-3 text-xl text-gold">🎁 {c.prizes[`ind${4 - step}`].name}</div>}
              {meWin && <div className="mt-4 text-2xl font-black text-gold">축하합니다!</div>}
            </div>
          )}
          {step === 4 && (
            <div className="card">
              <div className="mb-2 text-xl text-ivory/70">조별 종합 우승</div>
              {c.team?.map((t: any) => (
                <div key={t.name} className="mb-4">
                  <div className="text-[56px] font-black" style={{ color: t.color }}>{t.name}</div>
                  <div className="text-2xl font-bold">{fmt(t.total)}점</div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {t.members.map((m: string) => <span key={m} className="rounded-full bg-turf-pale px-3 py-1 text-lg font-bold text-turf">{m}</span>)}
                  </div>
                </div>
              ))}
              <div className="mt-4 border-t border-forest-line pt-3">
                {c.teamAll?.map((t: any) => (
                  <div key={t.name} className="flex justify-between py-1 text-xl"><span>{t.rank}위 {t.name}</span><span className="font-bold tabular-nums">{fmt(t.total)}점</span></div>
                ))}
              </div>
              {c.prizes?.team?.name && <div className="mt-3 text-xl text-gold">🎁 {c.prizes.team.name}</div>}
            </div>
          )}
          {step >= 5 && (
            <div className="card">
              <div className="mb-3 text-2xl font-bold text-gold">행운의 주인공들</div>
              {(c.lucky ?? []).length === 0 && <div className="text-lg text-ivory/60">-</div>}
              {(c.lucky ?? []).map((w: any, i: number) => (
                <div key={i} className="mb-2 flex justify-between rounded-xl bg-forest-deep px-3 py-2 text-lg">
                  <span className="text-ivory/70">{w.label}</span>
                  <span className="font-bold">{w.name} {w.note && <span className="text-sm text-ivory/60">({w.note})</span>}</span>
                </div>
              ))}
              <div className="mt-6 text-2xl font-black">모두 수고하셨습니다! ⛳</div>
              <div className="mt-1 text-lg text-ivory/70">2027년에도 굿샷 하세요!</div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
