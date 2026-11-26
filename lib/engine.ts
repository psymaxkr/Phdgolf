// PHD PLAY 2026 - 서버 게임 엔진 (상태 조회, 응답 처리)
import { q, q1, tx, bump } from './db';
import { GAMES, DEFAULT_ORDER, GameType, TEAM_COLORS, INDIVIDUAL_GAMES } from './games';
import * as S from './scoring';

export class AppError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

const ensured = new Set<string>();
export const ONLINE_MS = 25_000;

export async function getEvent(slugIn: string | null | undefined) {
  const slug = slugIn === 'demo' ? 'demo' : 'main';
  let ev = await q1('select * from events where slug=$1', [slug]);
  if (!ev) {
    ev = await q1(
      `insert into events(slug, name, event_date, is_demo) values ($1, $2, '2026-11-27', $3)
       on conflict (slug) do update set slug = excluded.slug returning *`,
      [slug, slug === 'demo' ? 'PHD PLAY 2026 데모 모드' : 'PHD Golf Club Year-End Party', slug === 'demo']
    );
  }
  if (!ensured.has(ev.id)) {
    await ensureEventRows(ev.id);
    ensured.add(ev.id);
  }
  return ev as { id: string; slug: string; name: string; event_date: string; is_demo: boolean; settings: any };
}

export function forgetEnsured(eventId: string) {
  ensured.delete(eventId);
}

export async function ensureEventRows(eventId: string) {
  await tx(async (c) => {
    await c.query('select pg_advisory_xact_lock(hashtext($1))', [eventId]);
    const t = await c.query('select count(*)::int n from teams where event_id=$1', [eventId]);
    if (t.rows[0].n === 0) {
      for (let i = 0; i < 3; i++) {
        await c.query('insert into teams(event_id, name, sort_order, color) values ($1,$2,$3,$4)', [eventId, `${i + 1}조`, i + 1, TEAM_COLORS[i]]);
      }
    }
    for (const [i, type] of DEFAULT_ORDER.entries()) {
      const m = GAMES[type];
      await c.query(
        `insert into games(event_id, game_type, title, sort_order, config) values ($1,$2,$3,$4,$5)
         on conflict (event_id, game_type) do nothing`,
        [eventId, type, m.title, i + 1, { rounds: m.rounds, timeLimit: m.timeLimit, questionIds: [], shuffle: false, playOrder: [] }]
      );
    }
    await c.query('insert into game_sessions(event_id) values ($1) on conflict do nothing', [eventId]);
    await c.query('insert into sync(event_id) values ($1) on conflict do nothing', [eventId]);
  });
}

// ---------------------------------------------------------------- 공통 조회
export async function loadCore(eventId: string) {
  const [teams, participants, session, games, sync] = await Promise.all([
    q('select id, name, color, sort_order from teams where event_id=$1 order by sort_order, name', [eventId]),
    q(
      `select id, name, team_id, is_leader, is_virtual, gender, code, last_seen, (session_token is not null) as logged_in
       from participants where event_id=$1 order by name`,
      [eventId]
    ),
    q1('select * from game_sessions where event_id=$1', [eventId]),
    q('select * from games where event_id=$1 order by sort_order', [eventId]),
    q1('select version from sync where event_id=$1', [eventId]),
  ]);
  return { teams, participants, session, games, version: Number(sync?.version ?? 0) };
}

export function isOnline(p: any, now = Date.now()) {
  if (p.is_virtual) return true;
  return !!p.last_seen && now - new Date(p.last_seen).getTime() < ONLINE_MS;
}

export async function computeScores(eventId: string) {
  const logs = await q('select target, team_id, participant_id, game_type, points::float8 as points, is_manual from score_logs where event_id=$1', [eventId]);
  const team: Record<string, { total: number; byGame: Record<string, number> }> = {};
  const ind: Record<string, { total: number; byGame: Record<string, number> }> = {};
  for (const l of logs) {
    const key = l.is_manual ? 'ADJ' : l.game_type;
    if (l.target === 'team' && l.team_id) {
      const t = (team[l.team_id] ||= { total: 0, byGame: {} });
      t.total += l.points;
      t.byGame[key] = (t.byGame[key] || 0) + l.points;
    } else if (l.target === 'individual' && l.participant_id) {
      const pts = !l.is_manual && l.game_type === 'P02' ? l.points * S.P02_FACTOR : l.points;
      const p = (ind[l.participant_id] ||= { total: 0, byGame: {} });
      p.total += pts;
      p.byGame[key] = (p.byGame[key] || 0) + pts;
    }
  }
  const round = (o: Record<string, { total: number; byGame: Record<string, number> }>) => {
    for (const k of Object.keys(o)) {
      o[k].total = Math.round(o[k].total);
      for (const g of Object.keys(o[k].byGame)) o[k].byGame[g] = Math.round(o[k].byGame[g]);
    }
  };
  round(team);
  round(ind);
  return { team, ind };
}

export function buildRankings(core: { teams: any[]; participants: any[] }, scores: Awaited<ReturnType<typeof computeScores>>, prev?: any) {
  const teamName = (id: string | null) => core.teams.find((t) => t.id === id)?.name ?? '미배정';
  const teamColor = (id: string | null) => core.teams.find((t) => t.id === id)?.color ?? '#888';
  const teamList = core.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, total: scores.team[t.id]?.total ?? 0, byGame: scores.team[t.id]?.byGame ?? {} }));
  const team = S.competitionRanks(teamList, (x) => x.total).map(({ item, rank }) => {
    const pr = prev?.team?.find((x: any) => x.id === item.id)?.rank;
    return { ...item, rank, delta: pr ? pr - rank : 0 };
  });
  const indList = core.participants.map((p) => ({
    id: p.id, name: p.name, teamId: p.team_id, teamName: teamName(p.team_id), color: teamColor(p.team_id),
    total: scores.ind[p.id]?.total ?? 0, byGame: scores.ind[p.id]?.byGame ?? {},
  }));
  const individual = S.competitionRanks(indList, (x) => x.total).map(({ item, rank }) => {
    const pr = prev?.individual?.find((x: any) => x.id === item.id)?.rank;
    return { ...item, rank, delta: pr ? pr - rank : 0 };
  });
  return { at: new Date().toISOString(), team, individual };
}

/** 제한시간이 지난 라운드는 자동 마감 */
export async function autoClose(round: any) {
  if (!round || round.status !== 'open' || !round.ends_at) return round;
  if (Date.now() > new Date(round.ends_at).getTime() + 700) {
    const r = await q1(`update rounds set status='closed' where id=$1 and status='open' returning *`, [round.id]);
    if (r) {
      await bump(round.event_id);
      return r;
    }
    return (await q1('select * from rounds where id=$1', [round.id])) ?? round;
  }
  return round;
}

export function gameConfig(games: any[], type: string) {
  const g = games.find((x) => x.game_type === type);
  const m = GAMES[type as GameType];
  const cfg = g?.config ?? {};
  return {
    row: g,
    rounds: Math.min(Number(cfg.rounds ?? m.rounds), m.maxRounds),
    timeLimit: Number(cfg.timeLimit ?? m.timeLimit),
    questionIds: (cfg.questionIds ?? []) as string[],
    playOrder: (cfg.playOrder ?? []) as string[],
    shuffle: !!cfg.shuffle,
    bingo: cfg.bingo ?? { pending: [] },
  };
}

export function totalRoundsFor(type: string, cfg: ReturnType<typeof gameConfig>) {
  const m = GAMES[type as GameType];
  if (m.usesQuestions) return Math.min(cfg.rounds, cfg.playOrder.length || cfg.rounds);
  return cfg.rounds;
}

function roundPublic(r: any) {
  return {
    id: r.id,
    gameType: r.game_type,
    roundNo: r.round_no,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    pausedRemainingMs: r.paused_remaining_ms,
    timeLimit: r.time_limit_sec,
    payload: r.payload,
    result: r.status === 'revealed' ? r.result : null,
    isVoid: r.is_void,
  };
}

// ---------------------------------------------------------------- 참석자 상태
export async function participantState(slug: string, token: string | null) {
  const ev = await getEvent(slug);
  let me: any = null;
  if (token) {
    me = await q1('select id, name, team_id, is_leader, last_seen from participants where session_token=$1 and event_id=$2', [token, ev.id]);
    if (!me) return { kicked: true };
    if (!me.last_seen || Date.now() - new Date(me.last_seen).getTime() > 8000) {
      await q('update participants set last_seen=now() where id=$1', [me.id]);
      me.last_seen = new Date().toISOString();
    }
  }
  const core = await loadCore(ev.id);
  const s = core.session;
  const now = Date.now();
  const myTeam = me ? core.teams.find((t) => t.id === me.team_id) : null;
  const base: any = {
    serverNow: now,
    version: core.version,
    event: { name: ev.name, date: ev.event_date, isDemo: ev.is_demo },
    me: me ? { id: me.id, name: me.name, teamId: me.team_id, teamName: myTeam?.name ?? '미배정', teamColor: myTeam?.color ?? '#888', isLeader: me.is_leader } : null,
    teams: core.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    counts: { online: core.participants.filter((p) => isOnline(p, now)).length, total: core.participants.length },
    session: { game: s.current_game, phase: s.phase, overlay: s.overlay, overlayData: s.overlay_data },
    rankings: s.published_rankings ?? null,
  };
  if (!me) return base;

  base.teamMembers = core.participants
    .filter((p) => p.team_id && p.team_id === me.team_id)
    .map((p) => ({ id: p.id, name: p.name, isLeader: p.is_leader, online: isOnline(p, now) }));

  const scores = await computeScores(ev.id);
  base.myScore = scores.ind[me.id]?.total ?? 0;
  base.myTeamScore = me.team_id ? scores.team[me.team_id]?.total ?? 0 : 0;

  const wins = await q(
    `select w.category, p.name as prize_name from winners w left join prizes p on p.id=w.prize_id where w.event_id=$1 and w.participant_id=$2 order by w.created_at`,
    [ev.id, me.id]
  );
  base.myWins = wins;

  if (s.current_game) {
    const cfg = gameConfig(core.games, s.current_game);
    const played = await q1<{ n: number }>(
      `select count(*)::int n from rounds where event_id=$1 and game_type=$2 and not is_void and status='revealed'`,
      [ev.id, s.current_game]
    );
    base.gameInfo = { type: s.current_game, title: GAMES[s.current_game as GameType].title, totalRounds: totalRoundsFor(s.current_game, cfg), revealed: played?.n ?? 0 };
  }

  if (s.current_round_id) {
    let r = await q1('select * from rounds where id=$1', [s.current_round_id]);
    r = await autoClose(r);
    if (r) {
      const pub: any = roundPublic(r);
      const resp = await q(
        `select participant_id, team_id, scope, kind, value from responses where round_id=$1 and (participant_id=$2 or (scope='team' and team_id=$3))`,
        [r.id, me.id, me.team_id]
      );
      const cnt = await q1<{ n: number }>(`select count(distinct participant_id)::int n from responses where round_id=$1 and kind='answer'`, [r.id]);
      pub.answeredCount = cnt?.n ?? 0;
      pub.myAnswer = resp.find((x) => x.kind === 'answer' && x.participant_id === me.id)?.value ?? null;
      pub.myStart = resp.find((x) => x.kind === 'start' && x.participant_id === me.id)?.value ?? null;
      pub.teamAnswer = resp.find((x) => x.kind === 'answer' && x.scope === 'team')?.value ?? null;
      pub.teamBet = resp.find((x) => x.kind === 'bet' && x.scope === 'team')?.value ?? null;
      if (r.game_type === 'T04') pub.teamScoreForBet = base.myTeamScore;
      base.round = pub;
    }
  }

  if (s.current_game === 'P04') base.bingo = await bingoView(ev.id, me.id, core);
  if (s.current_game === 'P05') base.hole = await holeView(ev.id, me.id, core);
  return base;
}

export async function bingoView(eventId: string, meId: string | null, core: any) {
  const draws = await q('select number, draw_no, created_at from bingo_draws where event_id=$1 order by draw_no', [eventId]);
  const drawn = draws.map((d) => d.number);
  const set = new Set<number>(drawn);
  let board: number[] | null = null;
  if (meId) {
    const b = await q1('select numbers from bingo_boards where event_id=$1 and participant_id=$2', [eventId, meId]);
    board = b?.numbers ?? null;
  }
  const winnersRows = await q(`select participant_id from winners where event_id=$1 and category='bingo'`, [eventId]);
  const cfg = gameConfig(core.games, 'P04');
  const nameOf = (id: string) => {
    const p = core.participants.find((x: any) => x.id === id);
    const t = core.teams.find((x: any) => x.id === p?.team_id);
    return { id, name: p?.name ?? '?', teamName: t?.name ?? '' };
  };
  return {
    board,
    drawn,
    last: drawn[drawn.length - 1] ?? null,
    lastAt: draws[draws.length - 1]?.created_at ?? null,
    lines: board ? S.bingoLines(board, set) : 0,
    pending: (cfg.bingo.pending ?? []).map(nameOf),
    winners: winnersRows.map((w) => nameOf(w.participant_id)),
  };
}

export async function holeView(eventId: string, meId: string | null, core: any) {
  const assigns = await q('select participant_id, hole_no from hole_assignments where event_id=$1', [eventId]);
  const draws = await q('select id, hole_no, participant_id, created_at from hole_draws where event_id=$1 order by created_at', [eventId]);
  const nameOf = (id: string) => {
    const p = core.participants.find((x: any) => x.id === id);
    const t = core.teams.find((x: any) => x.id === p?.team_id);
    return { name: p?.name ?? '?', teamName: t?.name ?? '' };
  };
  return {
    myHole: meId ? assigns.find((a) => a.participant_id === meId)?.hole_no ?? null : null,
    totalHoles: Math.max(18, assigns.length),
    assigned: assigns.length,
    draws: draws.map((d) => ({ id: d.id, hole: d.hole_no, participantId: d.participant_id, createdAt: d.created_at, ...nameOf(d.participant_id) })),
  };
}

// ---------------------------------------------------------------- 참석자 입장
export async function listNames(slug: string) {
  const ev = await getEvent(slug);
  const core = await loadCore(ev.id);
  return {
    event: { name: ev.name, date: ev.event_date, isDemo: ev.is_demo },
    teams: core.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    participants: core.participants.map((p) => ({ id: p.id, name: p.name, teamId: p.team_id })),
  };
}

export async function join(slug: string, participantId: string, code: string, newToken: string) {
  const ev = await getEvent(slug);
  const p = await q1('select id, code, name from participants where id=$1 and event_id=$2', [participantId, ev.id]);
  if (!p) throw new AppError('등록되지 않은 참석자입니다.');
  if (String(p.code).trim() !== String(code ?? '').trim()) throw new AppError('입장 코드가 맞지 않습니다. 다시 확인해 주세요.', 401);
  await q('update participants set session_token=$1, last_seen=now() where id=$2', [newToken, p.id]);
  await bump(ev.id);
  return { token: newToken, name: p.name };
}

// ---------------------------------------------------------------- 응답 제출
function validChoice(v: any, n: number) {
  const c = Number(v?.choice);
  return Number.isInteger(c) && c >= 0 && c < n ? c : null;
}

export async function respond(slug: string, token: string | null, body: any) {
  if (!token) throw new AppError('먼저 입장해 주세요.', 401);
  const ev = await getEvent(slug);
  const me = await q1('select id, team_id, is_leader from participants where session_token=$1 and event_id=$2', [token, ev.id]);
  if (!me) throw new AppError('다른 기기에서 입장하여 접속이 종료되었습니다. 다시 입장해 주세요.', 401);
  const sess = await q1('select current_round_id from game_sessions where event_id=$1', [ev.id]);
  if (!sess?.current_round_id || sess.current_round_id !== body.roundId) throw new AppError('지금은 응답할 수 없는 문제입니다.');
  let r = await q1('select * from rounds where id=$1', [body.roundId]);
  r = await autoClose(r);
  const g = r.game_type as GameType;
  const meta = GAMES[g];
  const kind = body.kind === 'bet' ? 'bet' : body.kind === 'start' ? 'start' : 'answer';
  const now = Date.now();
  let value: any;
  let scope: 'individual' | 'team' = 'individual';

  if (kind === 'bet') {
    if (g !== 'T04' || r.status !== 'betting') throw new AppError('지금은 베팅 시간이 아닙니다.');
    if (!me.is_leader) throw new AppError('조장님만 베팅할 수 있습니다.');
    const scores = await computeScores(ev.id);
    const teamScore = scores.team[me.team_id]?.total ?? 0;
    value = { bet: S.clampBet(Number(body.value?.bet), teamScore), teamScore };
    scope = 'team';
  } else {
    if (r.status !== 'open') throw new AppError(r.status === 'paused' ? '잠시 멈춤 중입니다.' : '응답이 마감되었습니다.');
    const startsAt = new Date(r.starts_at).getTime();
    const endsAt = new Date(r.ends_at).getTime();
    if (now < startsAt - 300) throw new AppError('아직 시작 전입니다.');
    if (now > endsAt + 1500) throw new AppError('응답이 마감되었습니다.');
    if (kind === 'start') {
      if (g !== 'P03') throw new AppError('잘못된 요청입니다.');
      value = { at: now };
    } else {
      if (meta.leaderOnly) {
        if (!me.is_leader) throw new AppError('조장님이 대표로 제출합니다.');
        scope = 'team';
      }
      switch (g) {
        case 'T01':
        case 'T04': {
          const c = validChoice(body.value, 4);
          if (c === null) throw new AppError('보기를 선택해 주세요.');
          value = { choice: c };
          break;
        }
        case 'T02':
        case 'P01': {
          const c = validChoice(body.value, 2);
          if (c === null) throw new AppError('A 또는 B를 선택해 주세요.');
          value = { choice: c };
          break;
        }
        case 'T03': {
          const n = Number(String(body.value?.number ?? '').replace(/,/g, ''));
          if (!Number.isFinite(n)) throw new AppError('숫자를 입력해 주세요.');
          value = { number: n };
          break;
        }
        case 'P02': {
          const n = Number(body.value?.number);
          if (!Number.isInteger(n) || n < 1 || n > 20) throw new AppError('1~20 사이 숫자를 골라 주세요.');
          value = { number: n };
          break;
        }
        case 'P03': {
          const start = await q1(`select value from responses where round_id=$1 and participant_id=$2 and kind='start'`, [r.id, me.id]);
          const ms = Number(body.value?.ms);
          if (body.value?.invalid || !Number.isFinite(ms)) {
            value = { invalid: true, reason: String(body.value?.reason ?? 'invalid').slice(0, 40) };
          } else if (ms >= 30000) {
            value = { invalid: true, reason: 'timeout' };
          } else if (start && ms > now - Number(start.value.at) + 4000) {
            value = { invalid: true, reason: 'mismatch' };
          } else {
            value = { ms: Math.max(0, Math.round(ms * 1000) / 1000) };
          }
          break;
        }
        default:
          throw new AppError('이 게임은 응답이 필요 없습니다.');
      }
    }
  }

  const ins = await q1(
    `insert into responses(round_id, event_id, participant_id, team_id, scope, kind, value)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning id`,
    [r.id, ev.id, me.id, me.team_id, scope, kind, value]
  );
  if (!ins) throw new AppError(scope === 'team' ? '이미 우리 조의 답안이 제출되었습니다.' : '이미 응답을 제출했습니다.', 409);
  if (scope === 'team') await bump(ev.id);
  return { ok: true, value };
}

export { INDIVIDUAL_GAMES };
