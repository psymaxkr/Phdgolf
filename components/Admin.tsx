'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, ApiError, fmt, useLive, useTicker } from '@/lib/client';
import { GAMES, GameType, PRIZE_CATEGORIES } from '@/lib/games';

type Tab = 'control' | 'people' | 'questions' | 'scores' | 'prizes' | 'settings';
const TABS: [Tab, string][] = [['control', '진행'], ['people', '참석자·조'], ['questions', '문제은행'], ['scores', '점수·순위'], ['prizes', '경품'], ['settings', '설정·데모']];
const LETTERS = ['①', '②', '③', '④'];

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [slug, setSlug] = useState<'main' | 'demo'>('main');
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('e') === 'demo') setSlug('demo');
    api('/api/admin/state?e=main').then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);
  if (authed === null) return <div className="p-8 text-center">확인 중…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;
  return <Dashboard slug={slug} setSlug={(s) => { setSlug(s); history.replaceState(null, '', s === 'demo' ? '/admin?e=demo' : '/admin'); }} onLogout={() => setAuthed(false)} />;
}

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <main className="admin mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-4">
      <div className="gold-text mb-1 text-center text-3xl font-black">PHD PLAY 2026</div>
      <div className="mb-6 text-center text-ivory/70">사회자 · 관리자 로그인</div>
      <form onSubmit={async (e) => { e.preventDefault(); try { await api('/api/admin/login', { body: { password: pw } }); onOk(); } catch (x: any) { setErr(x.message); } }}>
        <input className="input mb-3" type="password" placeholder="관리자 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <div className="mb-3 text-red-600">{err}</div>}
        <button className="btn-gold w-full">로그인</button>
      </form>
    </main>
  );
}

function Dashboard({ slug, setSlug, onLogout }: { slug: 'main' | 'demo'; setSlug: (s: 'main' | 'demo') => void; onLogout: () => void }) {
  const fetcher = useCallback(() => api(`/api/admin/state?e=${slug}`), [slug]);
  const { data: st, error, reload, serverNow, online } = useLive<any>(fetcher, [slug], 1500);
  const [tab, setTab] = useState<Tab>('control');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) onLogout();
  }, [error, onLogout]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.err ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const act = useCallback(
    async (action: string, params: any = {}, okText?: string) => {
      setBusy(action);
      try {
        const r = await api(`/api/admin/action?e=${slug}`, { body: { action, params } });
        if (okText) setMsg({ text: okText });
        if (r?.data?.note) setMsg({ text: r.data.note });
        await reload();
        return r?.data;
      } catch (e: any) {
        setMsg({ text: e.message, err: true });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [slug, reload]
  );

  if (!st) return <div className="p-8 text-center">불러오는 중… {error?.message}</div>;
  const A = { st, act, busy, serverNow, slug };

  return (
    <main className="admin mx-auto max-w-6xl px-3 pb-24 pt-3">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <div className="gold-text text-xl font-black">PHD PLAY 관리자</div>
        <div className="flex rounded-xl bg-forest-deep p-1">
          {(['main', 'demo'] as const).map((s) => (
            <button key={s} onClick={() => setSlug(s)} className={`rounded-lg px-3 py-1 text-sm font-bold ${slug === s ? (s === 'demo' ? 'bg-amber-500 text-white' : 'bg-gold text-white') : 'text-ivory/60'}`}>
              {s === 'main' ? '실제 행사' : '데모 모드'}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-forest-deep px-3 py-1 text-sm">접속 <b className="text-gold">{st.counts.online}</b>/{st.counts.total}</span>
        {st.teams.map((t: any) => <span key={t.id} className="rounded-full bg-forest-deep px-3 py-1 text-sm" style={{ color: t.color }}>{t.name} {t.online}/{t.size}</span>)}
        {!online && <span className="rounded-full bg-red-600 text-white px-3 py-1 text-sm">서버 연결 끊김 · 재연결 중</span>}
        <a href={`/screen${slug === 'demo' ? '?e=demo' : ''}`} target="_blank" className="rounded-full bg-gold px-3 py-1 text-sm font-bold text-white">📺 프로젝터 화면</a>
      </header>
      {slug === 'demo' && <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">데모 모드입니다. 참석자 화면: <b>/demo</b> · 실제 행사 데이터에는 영향이 없습니다.</div>}
      <nav className="sticky top-0 z-20 -mx-3 mb-4 flex gap-1 overflow-x-auto bg-white/95 px-3 py-2 backdrop-blur">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-xl px-4 py-2 font-bold ${tab === k ? 'bg-gold text-white' : 'bg-forest-light text-ivory/80'}`}>{l}</button>
        ))}
      </nav>
      {tab === 'control' && <Control {...A} />}
      {tab === 'people' && <People {...A} />}
      {tab === 'questions' && <Questions {...A} />}
      {tab === 'scores' && <Scores {...A} />}
      {tab === 'prizes' && <Prizes {...A} />}
      {tab === 'settings' && <Settings {...A} onLogout={onLogout} />}
      {msg && <div className={`fixed bottom-4 left-1/2 z-50 w-[92%] max-w-lg -translate-x-1/2 rounded-2xl px-4 py-3 text-center font-bold shadow-xl ${msg.err ? 'bg-red-600 text-white' : 'bg-gold text-white'}`}>{msg.text}</div>}
    </main>
  );
}

type P = { st: any; act: (a: string, p?: any, ok?: string) => Promise<any>; busy: string | null; serverNow: () => number; slug: string };

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-gold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function B({ onClick, children, kind = 'dark', disabled, busy }: { onClick: () => void; children: React.ReactNode; kind?: 'gold' | 'dark' | 'ghost' | 'red'; disabled?: boolean; busy?: boolean }) {
  return (
    <button className={`btn-${kind} ${busy ? 'animate-pulse' : ''}`} disabled={disabled || busy} onClick={onClick}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------ 진행
function Control({ st, act, busy, serverNow, slug }: P) {
  useTicker(250);
  const s = st.session;
  const game = s.game as GameType | null;
  const meta = game ? GAMES[game] : null;
  const r = st.round;
  const ginfo = st.games.find((g: any) => g.type === game);
  const now = serverNow();
  const isCountdown = r && r.status === 'open' && now < Date.parse(r.startsAt);
  const remain = r && r.status === 'open' ? Math.max(0, Math.ceil((Date.parse(r.endsAt) - Math.max(now, Date.parse(r.startsAt))) / 1000)) : r?.status === 'paused' ? Math.ceil((r.pausedRemainingMs ?? 0) / 1000) : null;
  const canNext = meta && meta.kind !== 'lucky' && (!r || r.status === 'revealed');
  const roundsDone = ginfo && ginfo.revealed >= ginfo.totalRounds;

  // 휴대폰 진행용: 지금 눌러야 할 버튼 하나
  let primary: { label: string; run: () => void } | null = null;
  if (s.overlay === 'ceremony') primary = { label: '다음 발표 ▶', run: () => act('ceremony.step', { dir: 1 }) };
  else if (s.overlay) primary = { label: '순위 화면 닫기', run: () => act('overlay.close') };
  else if (game === 'P04') primary = st.bingo?.pending?.length ? { label: '빙고 우승 확정', run: () => act('bingo.confirm', { mode: 'all' }) } : { label: '🎱 번호 추첨', run: () => act('bingo.draw') };
  else if (game === 'P05') primary = { label: '⛳ 홀인원 추첨', run: () => act('hole.draw') };
  else if (game && r?.status === 'betting') primary = { label: '베팅 마감 · 문제 공개', run: () => act('round.open') };
  else if (game && r && ['open', 'paused', 'closed'].includes(r.status)) primary = { label: `🏁 결과 공개 (${r.answered}/${r.expected})`, run: () => act('round.reveal') };
  else if (game && canNext && !roundsDone) primary = { label: r ? '▶ 다음 문제' : '▶ 문제 시작', run: () => act('round.next') };
  else if (game && roundsDone) primary = { label: `🏆 ${meta!.kind === 'team' ? '조별' : '개인'} 순위 공개`, run: () => act('ranking.show', { kind: meta!.kind === 'team' ? 'team' : 'individual' }) };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {primary && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-forest-line bg-white/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl gap-2">
            {r?.status === 'open' && !isCountdown && <button className="btn-dark px-3" onClick={() => act('round.pause')}>⏸</button>}
            {r?.status === 'paused' && <button className="btn-dark px-3" onClick={() => act('round.resume')}>▶</button>}
            <button className="btn-gold flex-1 !min-h-[60px] !text-[20px]" disabled={!!busy} onClick={primary.run}>
              {remain !== null && !isCountdown && r?.status === 'open' ? `${remain}초 · ` : ''}{primary.label}
            </button>
          </div>
        </div>
      )}
      <div>
        <Section title={game ? `${meta!.emoji} ${meta!.title}` : '대기실 (게임 선택 전)'} right={game && <span className="text-sm text-ivory/70">라운드 {ginfo?.revealed ?? 0} / {ginfo?.totalRounds} 완료</span>}>
          {!game && <div className="text-ivory/70">오른쪽(모바일은 아래) 목록에서 진행할 게임을 선택하세요. 참석자 화면은 자동으로 전환됩니다.</div>}

          {game && meta!.kind !== 'lucky' && (
            <>
              {!r && <div className="mb-3 rounded-xl bg-forest-deep p-3">참석자 화면에 <b>게임 규칙</b>이 표시되고 있습니다. 설명 후 아래 <b>문제 시작</b>을 누르세요.</div>}
              {r && (
                <div className="mb-3 rounded-xl bg-forest-deep p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gold px-3 py-0.5 font-black text-white">{r.roundNo}번 문제</span>
                    <StatusBadge r={r} countdown={!!isCountdown} />
                    {remain !== null && !isCountdown && <span className={`text-2xl font-black tabular-nums ${remain <= 5 ? 'text-red-600' : 'text-gold'}`}>{remain}초</span>}
                    <span className="ml-auto text-lg">
                      {r.status === 'betting' ? `베팅 ${r.betCount}/${r.expected}조` : `응답 ${r.answered}/${r.expected}${meta!.leaderOnly ? '조' : '명'}`}
                    </span>
                  </div>
                  {r.question && (
                    <div className="mb-2">
                      <div className="text-lg font-bold">{r.question.prompt}</div>
                      {(r.question.options ?? []).length > 0 && (
                        <div className="mt-1 grid gap-1 sm:grid-cols-2">
                          {r.question.options.map((o: string, i: number) => (
                            <div key={i} className={`rounded-lg px-2 py-1 ${String(i) === r.question.answer && (game === 'T01' || game === 'T04') ? 'bg-gold/25 font-bold text-gold' : 'bg-forest-light'}`}>
                              {game === 'T01' || game === 'T04' ? LETTERS[i] : i === 0 ? 'A' : 'B'} {o}
                            </div>
                          ))}
                        </div>
                      )}
                      {game === 'T03' && <div className="mt-1 font-bold text-gold">정답(사회자만 보임): {fmt(Number(r.question.answer))} {r.question.unit}</div>}
                    </div>
                  )}
                  {r.missing?.length > 0 && r.status !== 'revealed' && (
                    <div className="text-sm text-ivory/70">미응답: {r.missing.slice(0, 20).join(', ')}{r.missing.length > 20 && ` 외 ${r.missing.length - 20}명`}</div>
                  )}
                  {r.status === 'revealed' && <AdminResult r={r} />}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {canNext && !roundsDone && <B kind="gold" busy={busy === 'round.next'} onClick={() => act('round.next')}>{r ? '▶ 다음 문제' : '▶ 문제 시작'}</B>}
                {r?.status === 'betting' && <B kind="gold" busy={busy === 'round.open'} onClick={() => act('round.open')}>베팅 마감 · 문제 공개</B>}
                {r?.status === 'open' && <B onClick={() => act('round.pause')}>⏸ 일시정지</B>}
                {r?.status === 'paused' && <B kind="gold" onClick={() => act('round.resume')}>▶ 다시 시작</B>}
                {r?.status === 'open' && !isCountdown && <B onClick={() => act('round.addTime')}>+10초</B>}
                {(r?.status === 'open' || r?.status === 'paused') && <B onClick={() => act('round.close')}>응답 마감</B>}
                {r && ['open', 'paused', 'closed'].includes(r.status) && <B kind="gold" busy={busy === 'round.reveal'} onClick={() => act('round.reveal')}>🏁 결과 공개</B>}
                {r && <B kind="ghost" onClick={() => confirm('이 문제를 처음부터 다시 진행할까요? (이 문제의 응답·점수는 삭제됩니다)') && act('round.redo', {}, '다시 진행합니다')}>↺ 이 문제 다시</B>}
                {r && r.status !== 'revealed' && <B kind="ghost" onClick={() => confirm('이 문제를 취소할까요?') && act('round.cancel')}>문제 취소</B>}
                {r?.status === 'revealed' && r.isVoid && <span className="self-center text-amber-700">유일한 숫자가 없어 무효 → ‘다음 문제’로 재진행</span>}
                {slug === 'demo' && r && <B kind="ghost" onClick={() => act('demo.autoAnswer', {}, '가상 참석자 응답 완료')}>🤖 가상 응답</B>}
                {roundsDone && <span className="self-center font-bold text-gold">모든 라운드 완료! 순위 공개 또는 게임 종료를 누르세요.</span>}
              </div>
            </>
          )}

          {game === 'P04' && <BingoControl st={st} act={act} busy={busy} />}
          {game === 'P05' && <HoleControl st={st} act={act} busy={busy} />}

          {game && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-forest-line pt-3">
              <B kind="red" onClick={() => act('game.end', r && r.status !== 'revealed' ? { force: confirm('진행 중인 문제가 있습니다. 그래도 종료할까요?') } : {})}>■ 게임 종료 (대기실로)</B>
            </div>
          )}
        </Section>

        <Section title="순위 발표 · 시상식">
          <div className="mb-2 text-sm text-ivory/70">
            참석자는 사회자가 공개한 시점의 순위만 봅니다. {s.publishedAt && `마지막 공개: ${new Date(s.publishedAt).toLocaleTimeString('ko-KR')}`}
            {s.overlay && <b className="ml-2 text-gold">현재 참석자 화면: {s.overlay === 'ceremony' ? `시상식 (${s.overlayData?.step ?? 0}단계)` : s.overlay === 'ranking_team' ? '조별 순위' : '개인 순위'}</b>}
          </div>
          <div className="flex flex-wrap gap-2">
            <B onClick={() => act('ranking.show', { kind: 'team' })}>🏆 조별 순위 공개</B>
            <B onClick={() => act('ranking.show', { kind: 'individual' })}>🏅 개인 순위 공개</B>
            {s.overlay && <B kind="ghost" onClick={() => act('overlay.close')}>순위/시상 화면 닫기</B>}
            <B kind="gold" onClick={() => confirm('최종 시상식을 시작할까요? (현재 점수로 확정 발표)') && act('ceremony.start')}>🎉 최종 시상식 시작</B>
            {s.overlay === 'ceremony' && (
              <>
                <B onClick={() => act('ceremony.step', { dir: -1 })}>◀ 이전</B>
                <B kind="gold" onClick={() => act('ceremony.step', { dir: 1 })}>다음 발표 ▶</B>
              </>
            )}
          </div>
          {s.overlay === 'ceremony' && <div className="mt-2 text-sm text-ivory/70">순서: 0 인사 → 1 개인 3위 → 2 개인 2위 → 3 개인 1위 → 4 조별 우승 → 5 행운상·마무리</div>}
        </Section>
      </div>

      <div>
        <Section title="게임 목록 (진행 순서)">
          <div className="grid gap-2">
            {st.games.map((g: any, i: number) => (
              <div key={g.type} className={`flex items-center gap-2 rounded-xl p-2 ${game === g.type ? 'border-2 border-gold bg-gold/10' : 'bg-forest-deep'} ${!g.enabled ? 'opacity-40' : ''}`}>
                <div className="flex flex-col">
                  <button className="px-1 text-xs text-ivory/60" disabled={i === 0} onClick={() => { const o = st.games.map((x: any) => x.type); [o[i - 1], o[i]] = [o[i], o[i - 1]]; act('game.reorder', { order: o }); }}>▲</button>
                  <button className="px-1 text-xs text-ivory/60" disabled={i === st.games.length - 1} onClick={() => { const o = st.games.map((x: any) => x.type); [o[i + 1], o[i]] = [o[i], o[i + 1]]; act('game.reorder', { order: o }); }}>▼</button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{i + 1}. {GAMES[g.type as GameType].emoji} {g.title}</div>
                  <div className="text-xs text-ivory/60">
                    {GAMES[g.type as GameType].kind === 'team' ? '조별' : GAMES[g.type as GameType].kind === 'individual' ? '개인' : '추첨'}
                    {GAMES[g.type as GameType].kind !== 'lucky' && ` · ${g.revealed}/${g.totalRounds}R · ${g.config.timeLimit}초`}
                    {g.status === 'done' && ' · 완료'}
                  </div>
                </div>
                {!g.enabled ? (
                  <button className="rounded-lg border border-forest-line px-3 py-2 text-sm font-bold" onClick={() => act('game.toggle', { gameType: g.type })}>켜기</button>
                ) : game !== g.type && (
                  <button className="rounded-lg bg-gold px-3 py-2 text-sm font-bold text-white" onClick={() => act('game.select', { gameType: g.type })}>
                    {g.status === 'done' ? '다시' : '선택'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-ivory/60">▲▼로 순서 변경 · 원하는 게임만 골라 진행(건너뛰기) 가능 · 가위바위보는 오프라인 진행 후 [경품] 탭에서 우승자 등록</div>
        </Section>
        <Section title="실시간 순위 (사회자용)">
          <div className="mb-2 text-sm font-bold">조별</div>
          {st.rankings.team.map((t: any) => <div key={t.id} className="flex justify-between py-0.5"><span>{t.rank}. {t.name}</span><b className="tabular-nums">{fmt(t.total)}</b></div>)}
          <div className="mb-1 mt-3 text-sm font-bold">개인 TOP 5</div>
          {st.rankings.individual.slice(0, 5).map((t: any) => <div key={t.id} className="flex justify-between py-0.5"><span>{t.rank}. {t.name}</span><b className="tabular-nums">{fmt(t.total)}</b></div>)}
        </Section>
      </div>
    </div>
  );
}

function StatusBadge({ r, countdown }: { r: any; countdown: boolean }) {
  const map: Record<string, [string, string]> = {
    betting: ['베팅 중', 'bg-purple-700 text-white'], open: ['응답 받는 중', 'bg-turf text-white'], paused: ['일시정지', 'bg-amber-600 text-white'],
    closed: ['응답 마감', 'bg-slate-500 text-white'], revealed: ['결과 공개됨', 'bg-gold text-white'],
  };
  const [l, c] = countdown ? ['카운트다운', 'bg-sky-600 text-white'] : map[r.status] ?? [r.status, 'bg-slate-500 text-white'];
  return <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${c}`}>{l}</span>;
}

function AdminResult({ r }: { r: any }) {
  const res = r.result ?? {};
  const g = r.gameType;
  return (
    <div className="mt-2 rounded-lg bg-forest-light p-2 text-sm">
      {res.teams && res.teams.map((t: any) => (
        <div key={t.teamId} className="flex justify-between"><span>{t.name}{t.bet !== undefined && ` (베팅 ${fmt(t.bet)}, ${t.correct ? '정답' : '오답'})`}{t.value !== undefined && t.value !== null && g === 'T03' && ` (${fmt(t.value)})`}{t.a !== undefined && ` (A${t.a}/B${t.b})`}{t.correct !== undefined && g === 'T01' && ` (정답 ${t.correct}명)`}</span><b>{t.points > 0 ? '+' : ''}{fmt(t.points)}</b></div>
      ))}
      {g === 'P01' && <div>A {res.a}명 / B {res.b}명 → 다수 {res.winners?.map((w: number) => (w === 0 ? 'A' : 'B')).join('·')} 200점</div>}
      {g === 'P02' && !res.void && res.placements?.map((p: any) => <div key={p.place}>{p.place}위 {p.name} ({p.number}) +{p.points}</div>)}
      {g === 'P03' && res.attempts?.filter((a: any) => a.ms !== null).slice(0, 5).map((a: any, i: number) => <div key={a.participantId}>{i + 1}. {a.name} {(a.ms / 1000).toFixed(3)}초</div>)}
    </div>
  );
}

function BingoControl({ st, act, busy }: { st: any; act: P['act']; busy: string | null }) {
  const b = st.bingo;
  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <div className="gold-text text-6xl font-black">{b?.last ?? '-'}</div>
        <div className="text-sm text-ivory/70">추첨 {b?.drawn?.length ?? 0}/30<br />{b?.drawn?.join(', ')}</div>
      </div>
      {b?.pending?.length > 0 && (
        <div className="mb-3 rounded-xl border-2 border-gold p-3">
          <div className="mb-2 text-lg font-black text-gold">🎉 빙고 2줄 완성: {b.pending.map((w: any) => `${w.name}(${w.teamName})`).join(', ')}</div>
          <div className="flex flex-wrap gap-2">
            <B kind="gold" onClick={() => act('bingo.confirm', { mode: 'all' })}>{b.pending.length > 1 ? '공동 우승 확정' : '우승 확정'}</B>
            {b.pending.length > 1 && <B onClick={() => act('bingo.confirm', { mode: 'pickOne' })}>추가 추첨으로 1명 선정</B>}
            <B kind="ghost" onClick={() => act('bingo.dismiss')}>확정 없이 계속</B>
          </div>
        </div>
      )}
      {b?.winners?.length > 0 && <div className="mb-3">확정 우승자: <b className="text-gold">{b.winners.map((w: any) => w.name).join(', ')}</b> (계속 추첨하면 다음 우승자를 찾습니다)</div>}
      <div className="flex flex-wrap gap-2">
        <B kind="gold" busy={busy === 'bingo.draw'} onClick={() => act('bingo.draw')}>🎱 번호 추첨</B>
        <B kind="ghost" onClick={() => confirm('빙고를 처음부터 다시 할까요? (빙고판·추첨·빙고 당첨 기록 삭제)') && act('game.reset', { gameType: 'P04' })}>빙고 초기화</B>
      </div>
    </div>
  );
}

function HoleControl({ st, act, busy }: { st: any; act: P['act']; busy: string | null }) {
  const h = st.hole;
  return (
    <div>
      <div className="mb-3 text-sm text-ivory/70">홀 번호 배정: {h?.assigned ?? 0}명 · 중복 당첨 {st.event.settings?.allow_duplicate_win ? '허용' : '불허(다른 경품 당첨자 제외)'}</div>
      {h?.draws?.length > 0 && (
        <div className="mb-3">
          {h.draws.map((d: any, i: number) => <div key={d.id}>{i + 1}. <b className="text-gold">{d.hole}번 홀</b> {d.name} ({d.teamName})</div>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <B kind="gold" busy={busy === 'hole.draw'} onClick={() => act('hole.draw')}>⛳ 홀인원 추첨</B>
        {!h?.draws?.length && <B kind="ghost" onClick={() => act('hole.reassign', {}, '홀 번호를 다시 배정했습니다')}>홀 번호 다시 배정</B>}
        <B kind="ghost" onClick={() => confirm('홀인원 추첨 기록을 모두 지울까요?') && act('game.reset', { gameType: 'P05' })}>추첨 초기화</B>
      </div>
      <div className="mt-2 text-xs text-ivory/60">참석자 화면에서 골프공 애니메이션(약 4초) 후 당첨자가 공개됩니다.</div>
    </div>
  );
}

// ------------------------------------------------------------ 참석자
function People({ st, act }: P) {
  const [bulk, setBulk] = useState('');
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [code, setCode] = useState('');
  const [gender, setGender] = useState('');
  const [showCodes, setShowCodes] = useState(false);
  return (
    <div>
      <Section title={`참석자 (${st.participants.length}명)`} right={
        <div className="flex flex-wrap gap-2">
          <B onClick={() => confirm('여성을 먼저 고르게 나누고 인원이 같도록 조를 자동 배정합니다. 기존 조·조장 지정은 바뀝니다. 진행할까요?') && act('p.autoTeams', {}, '조 자동 배정 완료')}>🎲 조 자동 배정</B>
          <B onClick={() => setShowCodes(!showCodes)}>{showCodes ? '코드 숨기기' : '입장 코드 보기'}</B>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-sm text-ivory/60"><tr><th className="p-1">이름</th><th>조</th><th>입장 코드</th><th>성별</th><th>조장</th><th>접속</th><th>점수</th><th></th></tr></thead>
            <tbody>
              {st.participants.map((p: any) => (
                <tr key={p.id} className="border-t border-forest-line">
                  <td className="p-1 font-bold">{p.name}{p.isVirtual && <span className="ml-1 text-xs text-amber-700">가상</span>}</td>
                  <td>
                    <select className="rounded-lg bg-forest-deep p-2" value={p.teamId ?? ''} onChange={(e) => act('p.update', { id: p.id, teamId: e.target.value })}>
                      <option value="">미배정</option>
                      {st.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>{showCodes ? <EditCell value={p.code} onSave={(v) => act('p.update', { id: p.id, code: v })} /> : '••••'}</td>
                  <td>
                    <select className="rounded-lg bg-forest-deep p-2" value={p.gender ?? ''} onChange={(e) => act('p.update', { id: p.id, gender: e.target.value })}>
                      <option value="">-</option><option value="F">여</option><option value="M">남</option>
                    </select>
                  </td>
                  <td><button className={`rounded-lg px-3 py-2 text-sm font-bold ${p.isLeader ? 'bg-gold text-white' : 'bg-forest-deep text-ivory/50'}`} onClick={() => act('p.setLeader', { id: p.id })}>{p.isLeader ? '조장' : '지정'}</button></td>
                  <td>{p.online ? <span className="text-turf">● 접속</span> : p.loggedIn ? <span className="text-ivory/50">○ 대기</span> : <span className="text-ivory/30">미입장</span>}</td>
                  <td className="tabular-nums">{fmt(p.score)}</td>
                  <td className="whitespace-nowrap">
                    <button className="mr-1 rounded-lg bg-forest-deep px-2 py-2 text-xs" title="다른 기기로 다시 입장할 수 있도록 접속 해제" onClick={() => act('p.kick', { id: p.id }, '접속을 해제했습니다')}>접속해제</button>
                    <button className="rounded-lg bg-red-100 text-red-700 px-2 py-2 text-xs" onClick={() => confirm(`${p.name}님을 삭제할까요? (점수 기록도 삭제)`) && act('p.delete', { id: p.id })}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-ivory/60">조장은 조당 1명 (얼마일까요·최후의 역전 대표 입력). ‘접속해제’ = 휴대폰을 바꿔 다시 입장해야 할 때 사용.</div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="한 명 추가">
          <div className="grid gap-2">
            <input className="input" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <select className="input text-base" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">조 미배정</option>
                {st.teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className="input text-base" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">성별</option><option value="F">여</option><option value="M">남</option></select>
              <input className="input text-base" placeholder="코드(자동)" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </div>
            <B kind="gold" onClick={async () => { await act('p.add', { name, teamId: team, code, gender }, `${name}님 추가`); setName(''); setCode(''); }}>추가</B>
          </div>
        </Section>
        <Section title="여러 명 한 번에 등록">
          <textarea className="input mb-2 min-h-[140px] py-2 text-base" placeholder={'한 줄에 한 명\n홍길동, 1조, 여, 1234\n김철수, 2조, 남\n(조·성별·코드는 생략 가능, 코드는 휴대폰 뒷자리 추천)'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <B kind="gold" onClick={async () => { const d = await act('p.bulk', { text: bulk }); if (d) { alert(`${d.added}명 등록 (중복 이름 제외)`); setBulk(''); } }}>일괄 등록</B>
        </Section>
      </div>

      <Section title={`조 구성 (현재 ${st.teams.length}개 조)`} right={
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4].map((n) => (
            <B key={n} kind={st.teams.length === n ? 'gold' : 'dark'} onClick={() => st.teams.length !== n && confirm(`${n}개 조로 바꾸고 참석자를 자동으로 다시 나눌까요? (여성 고르게 분산 · 조장 지정은 초기화)`) && act('team.setCount', { count: n, autoAssign: true }, `${n}개 조로 변경 완료`)}>{n}개 조</B>
          ))}
        </div>
      }>
        <div className="mb-3 text-sm text-ivory/70">참석자 {st.participants.length}명 → 조당 약 {Math.ceil(st.participants.length / Math.max(1, st.teams.length))}명</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {st.teams.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
              <EditCell value={t.name} onSave={(v) => act('team.rename', { id: t.id, name: v })} />
              <span className="text-sm text-ivory/60">{t.size}명</span>
            </div>
          ))}
        </div>
      </Section>

      {showCodes && (
        <Section title="입장 코드 안내표 (인쇄/캡처용)">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {st.participants.map((p: any) => (
              <div key={p.id} className="rounded-xl border-2 border-gold bg-white p-3 text-ivory">
                <div className="font-black">{p.name}</div>
                <div className="text-sm">{st.teams.find((t: any) => t.id === p.teamId)?.name ?? '미배정'} · 코드 <b className="text-lg">{p.code}</b></div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function EditCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="w-28 rounded-lg bg-forest-deep p-2" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && v.trim() && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

// ------------------------------------------------------------ 문제은행
const QGAMES: GameType[] = ['T01', 'T02', 'T03', 'T04', 'P01'];

function Questions({ st, act, slug }: P) {
  const [g, setG] = useState<GameType>('T01');
  const [list, setList] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const game = st.games.find((x: any) => x.type === g);
  const selected: string[] = game?.config.questionIds ?? [];
  const load = useCallback(async () => {
    const r = await api(`/api/admin/action?e=${slug}`, { body: { action: 'q.list', params: { gameType: g } } });
    setList(r.data ?? []);
  }, [g, slug]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    const base = selected.length ? selected : list.filter((q) => q.enabled).map((q) => q.id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    act('game.config', { gameType: g, questionIds: next });
  };
  const usedSet = new Set(selected.length ? selected : list.filter((q) => q.enabled).map((q) => q.id));
  const usedOrder = selected.length ? selected : list.filter((q) => q.enabled).map((q) => q.id);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {QGAMES.map((t) => <button key={t} onClick={() => { setG(t); setEdit(null); }} className={`rounded-xl px-4 py-2 font-bold ${g === t ? 'bg-gold text-white' : 'bg-forest-light'}`}>{GAMES[t].title}</button>)}
      </div>
      <Section title={`${GAMES[g].title} 진행 설정`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">라운드 수<input type="number" className="input mt-1 w-28 text-lg" defaultValue={game?.config.rounds} key={'r' + g + game?.config.rounds} onBlur={(e) => act('game.config', { gameType: g, rounds: e.target.value }, '저장됨')} /></label>
          <label className="text-sm">제한시간(초)<input type="number" className="input mt-1 w-28 text-lg" defaultValue={game?.config.timeLimit} key={'t' + g + game?.config.timeLimit} onBlur={(e) => act('game.config', { gameType: g, timeLimit: e.target.value }, '저장됨')} /></label>
          <label className="flex items-center gap-2 pb-3"><input type="checkbox" className="h-6 w-6" checked={!!game?.config.shuffle} onChange={(e) => act('game.config', { gameType: g, shuffle: e.target.checked })} /> 문제 순서 무작위</label>
          {selected.length > 0 && <B kind="ghost" onClick={() => act('game.config', { gameType: g, questionIds: [] })}>선택 해제 (전체 사용)</B>}
        </div>
        <div className="mt-2 text-sm text-ivory/70">
          출제 대상 {usedSet.size}문제 중 앞에서부터 {game?.config.rounds}문제 출제{game?.config.shuffle && ' (무작위 순서)'} · 체크 순서대로 출제됩니다.
          {game?.revealed > 0 && <b className="text-amber-700"> 이미 진행한 라운드가 있어 변경은 게임 초기화 후 반영됩니다.</b>}
        </div>
        {game?.revealed > 0 && <div className="mt-2"><B kind="ghost" onClick={() => confirm(`${GAMES[g].title}의 진행 기록과 점수를 모두 지우고 처음부터 할까요?`) && act('game.reset', { gameType: g }, '게임 초기화 완료')}>이 게임 초기화</B></div>}
      </Section>

      <Section title={`문제 목록 (${list.length})`} right={<B kind="gold" onClick={() => setEdit({ gameType: g, options: g === 'T02' || g === 'P01' ? ['', ''] : g === 'T03' ? [] : ['', '', '', ''], answer: g === 'T03' ? '' : '0', enabled: true })}>+ 새 문제</B>}>
        {edit && <QEditor q={edit} onCancel={() => setEdit(null)} onSave={async (q) => { const r = await act('q.save', q, '저장했습니다'); if (r !== false) { setEdit(null); load(); } }} />}
        <div className="grid gap-2">
          {list.map((q) => {
            const idx = usedOrder.indexOf(q.id);
            return (
              <div key={q.id} className={`flex items-start gap-2 rounded-xl p-2 ${usedSet.has(q.id) ? 'bg-forest-deep' : 'bg-forest-deep/40 opacity-60'}`}>
                <button onClick={() => toggle(q.id)} className={`mt-1 h-8 w-8 shrink-0 rounded-lg font-bold ${usedSet.has(q.id) ? 'bg-gold text-white' : 'border border-ivory/30'}`}>{usedSet.has(q.id) ? idx + 1 : ''}</button>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{g === 'T02' || g === 'P01' ? `${q.options[0]}  VS  ${q.options[1]}` : q.prompt}</div>
                  {(g === 'T01' || g === 'T04') && <div className="text-sm text-ivory/70">{q.options.map((o: string, i: number) => <span key={i} className={String(i) === q.answer ? 'font-bold text-gold' : ''}>{LETTERS[i]} {o}  </span>)}</div>}
                  {g === 'T03' && <div className="text-sm text-gold">정답 {q.answer} {q.unit} {q.base_date && `· 기준 ${q.base_date}`} {q.source && `· ${q.source}`}</div>}
                  {!q.enabled && <div className="text-xs text-amber-700">사용 안 함 (정답 확인 후 활성화)</div>}
                </div>
                <button className="rounded-lg bg-forest-light px-3 py-2 text-sm" onClick={() => setEdit({ ...q, gameType: q.game_type, imageUrl: q.image_url, baseDate: q.base_date })}>수정</button>
                <button className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm" onClick={async () => { if (confirm('삭제할까요?')) { await act('q.delete', { id: q.id }); load(); } }}>삭제</button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function QEditor({ q, onSave, onCancel }: { q: any; onSave: (q: any) => void; onCancel: () => void }) {
  const [f, setF] = useState<any>({ ...q, options: [...(q.options ?? [])] });
  const g = f.gameType as GameType;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  return (
    <div className="mb-4 rounded-2xl border-2 border-gold/50 p-3">
      {g !== 'T02' && g !== 'P01' && <textarea className="input mb-2 py-2 text-lg" placeholder="문제" value={f.prompt ?? ''} onChange={(e) => set('prompt', e.target.value)} />}
      {f.options.map((o: string, i: number) => (
        <div key={i} className="mb-2 flex items-center gap-2">
          {(g === 'T01' || g === 'T04') && <input type="radio" className="h-6 w-6" checked={String(f.answer) === String(i)} onChange={() => set('answer', String(i))} title="정답" />}
          <span className="w-6 font-bold">{g === 'T02' || g === 'P01' ? (i === 0 ? 'A' : 'B') : LETTERS[i]}</span>
          <input className="input text-lg" value={o} onChange={(e) => { const opts = [...f.options]; opts[i] = e.target.value; set('options', opts); }} />
        </div>
      ))}
      {(g === 'T01' || g === 'T04') && <div className="mb-2 text-xs text-ivory/60">왼쪽 동그라미 = 정답</div>}
      {g === 'T03' && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input className="input text-lg" placeholder="정답 숫자" value={f.answer ?? ''} onChange={(e) => set('answer', e.target.value)} />
          <input className="input text-lg" placeholder="단위 (원, g, mm…)" value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value)} />
          <input className="input text-lg" placeholder="기준 날짜 (가격 문제 필수)" value={f.baseDate ?? ''} onChange={(e) => set('baseDate', e.target.value)} />
          <input className="input text-lg" placeholder="출처" value={f.source ?? ''} onChange={(e) => set('source', e.target.value)} />
        </div>
      )}
      {g !== 'T02' && g !== 'P01' && <input className="input mb-2 text-lg" placeholder="해설 (결과 공개 때 표시)" value={f.explanation ?? ''} onChange={(e) => set('explanation', e.target.value)} />}
      <input className="input mb-2 text-base" placeholder="이미지 주소 URL (선택)" value={f.imageUrl ?? ''} onChange={(e) => set('imageUrl', e.target.value)} />
      <label className="mb-2 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} /> 사용</label>
      <div className="flex gap-2">
        <B kind="gold" onClick={() => onSave({ id: f.id, gameType: g, prompt: f.prompt, options: f.options, answer: f.answer, unit: f.unit, imageUrl: f.imageUrl, explanation: f.explanation, source: f.source, baseDate: f.baseDate, enabled: f.enabled !== false })}>저장</B>
        <B kind="ghost" onClick={onCancel}>취소</B>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 점수
const GS: Record<string, string> = { T01: '골든벨', T02: '이심전심', T03: '얼마일까요', T04: '최후의역전', P01: '밸런스', P02: '유일한숫자', P03: '10초', ADJ: '수동' };

function Scores({ st, act, slug }: P) {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [target, setTarget] = useState<'team' | 'individual'>('team');
  const [who, setWho] = useState('');
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const loadLogs = async () => { const d = await act('score.logs'); if (d) setLogs(d); };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <a className="btn-gold" href={`/api/admin/export?e=${slug}`}>⬇ 행사 결과 CSV 다운로드</a>
      </div>
      <Section title="조별 점수">
        <table className="w-full text-left">
          <thead className="text-sm text-ivory/60"><tr><th>순위</th><th>조</th>{['T01', 'T02', 'T03', 'T04', 'ADJ'].map((g) => <th key={g}>{GS[g]}</th>)}<th>합계</th></tr></thead>
          <tbody>{st.rankings.team.map((t: any) => (
            <tr key={t.id} className="border-t border-forest-line"><td className="p-1">{t.rank}</td><td className="font-bold">{t.name}</td>{['T01', 'T02', 'T03', 'T04', 'ADJ'].map((g) => <td key={g} className="tabular-nums">{fmt(t.byGame[g] ?? 0)}</td>)}<td className="font-black text-gold">{fmt(t.total)}</td></tr>
          ))}</tbody>
        </table>
      </Section>
      <Section title="개인 점수 (유일한 숫자는 1,000점 만점 환산)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead className="text-sm text-ivory/60"><tr><th>순위</th><th>이름</th><th>조</th>{['P01', 'P02', 'P03', 'ADJ'].map((g) => <th key={g}>{GS[g]}</th>)}<th>합계</th></tr></thead>
            <tbody>{st.rankings.individual.map((t: any) => (
              <tr key={t.id} className="border-t border-forest-line"><td className="p-1">{t.rank}</td><td className="font-bold">{t.name}</td><td className="text-sm">{t.teamName}</td>{['P01', 'P02', 'P03', 'ADJ'].map((g) => <td key={g} className="tabular-nums">{fmt(t.byGame[g] ?? 0)}</td>)}<td className="font-black text-gold">{fmt(t.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-ivory/60">동점자는 같은 순위로 표시됩니다. 결승이 필요하면 오프라인 진행 후 아래 수동 조정으로 1점 가산하세요.</div>
      </Section>
      <Section title="점수 수동 조정 (기록이 남습니다)">
        <div className="grid gap-2 sm:grid-cols-[120px_1fr_120px_1fr_auto]">
          <select className="input text-base" value={target} onChange={(e) => { setTarget(e.target.value as any); setWho(''); }}><option value="team">조</option><option value="individual">개인</option></select>
          <select className="input text-base" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">선택</option>
            {(target === 'team' ? st.teams : st.participants).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <input className="input text-base" placeholder="+100 / -50" value={pts} onChange={(e) => setPts(e.target.value)} />
          <input className="input text-base" placeholder="사유" value={reason} onChange={(e) => setReason(e.target.value)} />
          <B kind="gold" disabled={!who || !pts} onClick={async () => { await act('score.adjust', { target, id: who, points: pts, reason }, '조정 완료'); setPts(''); setReason(''); if (logs) loadLogs(); }}>적용</B>
        </div>
      </Section>
      <Section title="점수 변경 이력" right={<B onClick={loadLogs}>불러오기</B>}>
        {logs && (
          <div className="max-h-[420px] overflow-y-auto text-sm">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border-t border-forest-line py-1">
                <span className="w-16 text-ivory/50">{new Date(l.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="w-20">{l.target === 'team' ? l.team_name : l.participant_name}</span>
                <span className={`w-16 font-bold ${l.points >= 0 ? 'text-gold' : 'text-red-600'}`}>{l.points > 0 ? '+' : ''}{fmt(Math.round(l.points))}</span>
                <span className="flex-1 text-ivory/70">{l.reason}</span>
                {l.is_manual && <button className="rounded bg-red-100 text-red-700 px-2 py-1 text-xs" onClick={async () => { await act('score.deleteLog', { id: l.id }); loadLogs(); }}>취소</button>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------ 경품
function Prizes({ st, act }: P) {
  const [f, setF] = useState<any>({ category: 'ind1', name: '', quantity: 1, photoUrl: '' });
  const [w, setW] = useState<any>({ category: 'rps', participantId: '' });
  return (
    <div>
      <Section title="경품 등록">
        <div className="mb-3 grid gap-2 sm:grid-cols-[160px_1fr_90px_1fr_auto]">
          <select className="input text-base" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(PRIZE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input text-base" placeholder="경품명" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="input text-base" type="number" placeholder="수량" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          <input className="input text-base" placeholder="사진 URL (선택)" value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} />
          <B kind="gold" disabled={!f.name} onClick={async () => { await act('prize.save', f, '저장됨'); setF({ ...f, id: undefined, name: '', photoUrl: '' }); }}>{f.id ? '수정' : '추가'}</B>
        </div>
        {st.prizes.map((p: any) => (
          <div key={p.id} className="flex items-center gap-2 border-t border-forest-line py-2">
            {p.photo_url && <img src={p.photo_url} alt="" className="h-10 w-10 rounded object-cover" />}
            <span className="w-32 text-sm text-ivory/70">{PRIZE_CATEGORIES[p.category]}</span>
            <span className="flex-1 font-bold">{p.name} × {p.quantity}</span>
            <button className="rounded-lg bg-forest-light px-3 py-1 text-sm" onClick={() => setF({ id: p.id, category: p.category, name: p.name, quantity: p.quantity, photoUrl: p.photo_url ?? '' })}>수정</button>
            <button className="rounded-lg bg-red-100 text-red-700 px-3 py-1 text-sm" onClick={() => act('prize.delete', { id: p.id })}>삭제</button>
          </div>
        ))}
      </Section>
      <Section title="당첨자 관리" right={<B onClick={() => confirm('현재 점수 기준으로 조별 우승·개인 1~3위 당첨자를 다시 등록할까요?') && act('winner.autoRankings', {}, '순위 당첨자 등록 완료')}>🏆 순위 기반 자동 등록</B>}>
        <div className="mb-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <select className="input text-base" value={w.category} onChange={(e) => setW({ ...w, category: e.target.value })}>
            {Object.entries(PRIZE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input text-base" value={w.participantId} onChange={(e) => setW({ ...w, participantId: e.target.value })}>
            <option value="">참석자 선택</option>
            {st.participants.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <B kind="gold" disabled={!w.participantId} onClick={() => act('winner.add', w, '당첨자 등록')}>당첨자 등록</B>
        </div>
        <div className="mb-2 text-xs text-ivory/60">가위바위보 우승자는 여기서 ‘가위바위보 우승’을 골라 등록하세요.</div>
        {st.winners.map((x: any) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 border-t border-forest-line py-2">
            <span className="w-32 text-sm text-ivory/70">{PRIZE_CATEGORIES[x.category] ?? x.category}</span>
            <span className="font-bold">{x.participant_name}</span>
            <span className="text-sm text-ivory/60">{x.team_name} {x.prize_name && `· ${x.prize_name}`} {x.note && `· ${x.note}`}</span>
            <label className="ml-auto flex items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5" checked={x.delivered} onChange={(e) => act('winner.deliver', { id: x.id, delivered: e.target.checked })} /> 지급</label>
            <button className="rounded-lg bg-red-100 text-red-700 px-2 py-1 text-xs" onClick={() => confirm('당첨을 취소할까요?') && act('winner.delete', { id: x.id })}>취소</button>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------ 설정
function Settings({ st, act, slug, onLogout }: P & { onLogout: () => void }) {
  const [name, setName] = useState(st.event.name);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${slug === 'demo' ? '/demo' : '/'}`;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="참석자 접속 QR코드">
        <div className="flex flex-col items-center gap-2">
          {origin && <div className="rounded-2xl bg-white p-4"><QRCodeSVG value={url} size={220} /></div>}
          <div className="break-all text-center text-lg font-bold">{url}</div>
          <div className="flex gap-2">
            <B onClick={() => navigator.clipboard?.writeText(url)}>주소 복사 (카톡 전송용)</B>
            <a className="btn-dark" href={`/qr${slug === 'demo' ? '?e=demo' : ''}`} target="_blank">QR 크게 보기</a>
            <a className="btn-gold" href={`/screen${slug === 'demo' ? '?e=demo' : ''}`} target="_blank">📺 프로젝터 화면</a>
          </div>
        </div>
      </Section>
      <Section title="행사 설정">
        <label className="mb-2 block text-sm">행사명<input className="input mt-1 text-lg" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="mb-3 flex items-center gap-2">
          <input type="checkbox" className="h-6 w-6" checked={!!st.event.settings?.allow_duplicate_win} onChange={(e) => act('settings.save', { allowDuplicate: e.target.checked, eventName: name })} />
          중복 당첨 허용 (끄면 홀인원 추첨·수동 등록 시 이미 당첨된 분 제외)
        </label>
        <B kind="gold" onClick={() => act('settings.save', { allowDuplicate: !!st.event.settings?.allow_duplicate_win, eventName: name }, '저장됨')}>저장</B>
      </Section>
      {slug === 'demo' && (
        <Section title="데모 모드 도구">
          <div className="grid gap-2">
            <B kind="gold" onClick={() => confirm('가상 참석자 18명(3개 조)을 새로 만듭니다. 데모 데이터는 초기화됩니다.') && act('demo.generate', {}, '가상 참석자 18명 생성 (코드 1001~1018)')}>🤖 가상 참석자 18명 생성</B>
            <B onClick={() => act('demo.randomScores', {}, '임의 점수 생성')}>🎲 임의 점수 생성</B>
            <B kind="red" onClick={() => confirm('데모 데이터를 모두 삭제할까요?') && act('demo.clear', {}, '데모 데이터 삭제')}>데모 데이터 일괄 삭제</B>
          </div>
          <div className="mt-2 text-sm text-ivory/70">가상 참석자 코드: 김영수 1001 ~ 송지은 1018. 휴대폰으로 /demo 에 접속해 가상 참석자로 직접 체험할 수 있습니다. 진행 탭의 ‘🤖 가상 응답’으로 나머지 응답을 채우세요.</div>
        </Section>
      )}
      <Section title="전체 초기화 (주의)">
        <div className="mb-2 text-sm text-ivory/70">모든 게임 기록·점수·당첨·빙고·홀인원 기록을 삭제합니다. 참석자·조·문제·경품은 유지됩니다. 행사 직전 리허설 후 사용하세요.</div>
        <B kind="red" onClick={() => { const c = prompt("확인을 위해 '초기화'를 입력하세요"); if (c) act('event.resetAll', { confirm: c }, '전체 초기화 완료'); }}>전체 게임 초기화</B>
      </Section>
      <Section title="관리자 작업 기록 (최근 30건)">
        <div className="max-h-64 overflow-y-auto text-sm">
          {st.logs.map((l: any, i: number) => <div key={i} className="border-t border-forest-line py-1"><span className="text-ivory/50">{new Date(l.created_at).toLocaleTimeString('ko-KR')}</span> {l.action}</div>)}
        </div>
        <div className="mt-3"><B kind="ghost" onClick={async () => { await api('/api/admin/logout', { body: {} }); onLogout(); }}>로그아웃</B></div>
      </Section>
    </div>
  );
}
