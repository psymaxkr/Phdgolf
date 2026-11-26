// PHD PLAY 2026 - 관리자 기능 (진행 제어, 채점, 추첨, 관리)
import { q, q1, tx, bump } from './db';
import { GAMES, GameType, PRIZE_CATEGORIES, TEAM_GAMES } from './games';
import * as S from './scoring';
import { randInt, secureRand } from './auth';
import {
  AppError, getEvent, loadCore, computeScores, buildRankings, autoClose, gameConfig, totalRoundsFor,
  isOnline, bingoView, holeView, forgetEnsured, ensureEventRows,
} from './engine';

const COUNTDOWN_MS = 3500;

async function log(eventId: string, action: string, detail: any) {
  await q('insert into admin_logs(event_id, action, detail) values ($1,$2,$3)', [eventId, action, detail ?? null]);
}

// ---------------------------------------------------------------- 관리자 상태
export async function adminState(slug: string) {
  const ev = await getEvent(slug);
  const core = await loadCore(ev.id);
  const s = core.session;
  const now = Date.now();
  const scores = await computeScores(ev.id);
  const live = buildRankings(core, scores, s.published_rankings);

  const roundCounts = await q(
    `select game_type, count(*) filter (where status='revealed' and not is_void)::int as revealed, count(*)::int as total
     from rounds where event_id=$1 group by game_type`,
    [ev.id]
  );
  const games = core.games.map((g) => {
    const cfg = gameConfig(core.games, g.game_type);
    const rc = roundCounts.find((x) => x.game_type === g.game_type);
    return {
      type: g.game_type, title: g.title, sortOrder: g.sort_order, enabled: g.enabled, status: g.status,
      config: { rounds: cfg.rounds, timeLimit: cfg.timeLimit, questionIds: cfg.questionIds, shuffle: cfg.shuffle },
      totalRounds: totalRoundsFor(g.game_type, cfg), revealed: rc?.revealed ?? 0,
    };
  });

  let round: any = null;
  if (s.current_round_id) {
    let r = await q1('select * from rounds where id=$1', [s.current_round_id]);
    r = await autoClose(r);
    if (r) {
      const resp = await q(
        `select r.participant_id, r.team_id, r.kind, r.scope, r.value, r.created_at from responses r where r.round_id=$1 order by r.created_at`,
        [r.id]
      );
      const question = r.question_id ? await q1('select * from questions where id=$1', [r.question_id]) : null;
      const meta = GAMES[r.game_type as GameType];
      const answeredIds = new Set(resp.filter((x) => x.kind === 'answer').map((x) => x.participant_id));
      const answeredTeams = new Set(resp.filter((x) => x.kind === 'answer' && x.scope === 'team').map((x) => x.team_id));
      const betTeams = new Set(resp.filter((x) => x.kind === 'bet').map((x) => x.team_id));
      let missing: string[];
      if (meta.leaderOnly) {
        const key = r.status === 'betting' ? betTeams : answeredTeams;
        missing = core.teams.filter((t) => !key.has(t.id)).map((t) => `${t.name} 조장`);
      } else {
        missing = core.participants.filter((p) => !answeredIds.has(p.id)).map((p) => p.name);
      }
      round = {
        id: r.id, gameType: r.game_type, roundNo: r.round_no, status: r.status, startsAt: r.starts_at, endsAt: r.ends_at,
        pausedRemainingMs: r.paused_remaining_ms, timeLimit: r.time_limit_sec, payload: r.payload, result: r.result, isVoid: r.is_void,
        question,
        answered: meta.leaderOnly ? answeredTeams.size : answeredIds.size,
        betCount: betTeams.size,
        expected: meta.leaderOnly ? core.teams.length : core.participants.length,
        missing,
        responses: resp.map((x) => ({ ...x, name: core.participants.find((p) => p.id === x.participant_id)?.name })),
      };
    }
  }

  const [prizes, winners, logs] = await Promise.all([
    q('select * from prizes where event_id=$1 order by sort_order, category', [ev.id]),
    q(
      `select w.*, p.name as participant_name, t.name as team_name, z.name as prize_name
       from winners w left join participants p on p.id=w.participant_id left join teams t on t.id=w.team_id
       left join prizes z on z.id=w.prize_id where w.event_id=$1 order by w.created_at`,
      [ev.id]
    ),
    q('select action, detail, created_at from admin_logs where event_id=$1 order by created_at desc limit 30', [ev.id]),
  ]);

  return {
    serverNow: now,
    version: core.version,
    event: { id: ev.id, slug: ev.slug, name: ev.name, date: ev.event_date, isDemo: ev.is_demo, settings: ev.settings },
    teams: core.teams.map((t) => ({
      ...t,
      size: core.participants.filter((p) => p.team_id === t.id).length,
      online: core.participants.filter((p) => p.team_id === t.id && isOnline(p, now)).length,
    })),
    participants: core.participants.map((p) => ({
      id: p.id, name: p.name, teamId: p.team_id, isLeader: p.is_leader, isVirtual: p.is_virtual, gender: p.gender, code: p.code,
      online: isOnline(p, now), loggedIn: p.logged_in, score: scores.ind[p.id]?.total ?? 0,
    })),
    counts: { online: core.participants.filter((p) => isOnline(p, now)).length, total: core.participants.length },
    session: { game: s.current_game, phase: s.phase, overlay: s.overlay, overlayData: s.overlay_data, publishedAt: s.published_rankings?.at ?? null },
    games,
    round,
    rankings: live,
    prizes,
    winners,
    logs,
    bingo: s.current_game === 'P04' || games.find((g) => g.type === 'P04')?.status !== 'ready' ? await bingoView(ev.id, null, core) : null,
    hole: s.current_game === 'P05' || games.find((g) => g.type === 'P05')?.status !== 'ready' ? await holeView(ev.id, null, core) : null,
  };
}

// ---------------------------------------------------------------- 채점
async function scoreRound(eventId: string, roundId: string) {
  const r = await q1('select * from rounds where id=$1', [roundId]);
  if (!r) throw new AppError('라운드를 찾을 수 없습니다.');
  const core = await loadCore(eventId);
  const resp = await q('select participant_id, team_id, scope, kind, value from responses where round_id=$1', [roundId]);
  const question = r.question_id ? await q1('select * from questions where id=$1', [r.question_id]) : null;
  const teamIds = core.teams.map((t) => t.id);
  const tName = (id: string | null) => core.teams.find((t) => t.id === id)?.name ?? '미배정';
  const pName = (id: string) => core.participants.find((p) => p.id === id)?.name ?? '?';
  const pTeam = (id: string) => core.participants.find((p) => p.id === id)?.team_id ?? null;
  const answers: S.Resp[] = resp.filter((x) => x.kind === 'answer').map((x) => ({ participantId: x.participant_id, teamId: x.team_id, value: x.value }));
  const rows: any[] = [];
  let result: any = {};
  let isVoid = false;
  const g = r.game_type as GameType;
  const base = { event_id: eventId, game_type: g };

  switch (g) {
    case 'T01': {
      const ans = Number(question?.answer);
      const sc = S.scoreGoldenBell(ans, answers, teamIds);
      sc.teamPoints.forEach((t) => t.points && rows.push({ ...base, target: 'team', team_id: t.teamId, points: t.points, reason: `골든벨 ${r.round_no}번 정답 ${t.correct}명` }));
      result = {
        answer: ans, options: question?.options ?? [], explanation: question?.explanation ?? '', dist: sc.dist, total: sc.total,
        expected: core.participants.length, correctCount: sc.correctCount,
        accuracy: core.participants.length ? Math.round((sc.correctCount / core.participants.length) * 100) : 0,
        teams: sc.teamPoints.map((t) => ({ ...t, name: tName(t.teamId) })),
      };
      break;
    }
    case 'T02': {
      const sizes = core.teams.map((t) => ({ id: t.id, size: core.participants.filter((p) => p.team_id === t.id).length }));
      const sc = S.scoreMindMatch(answers, sizes);
      sc.forEach((t) => t.points && rows.push({ ...base, target: 'team', team_id: t.teamId, points: t.points, reason: `이심전심 ${r.round_no}R ${Math.max(t.a, t.b)}명 일치` }));
      result = { options: question?.options ?? r.payload?.options ?? [], teams: sc.map((t) => ({ ...t, name: tName(t.teamId) })) };
      break;
    }
    case 'T03': {
      const ans = Number(question?.answer);
      const teamAns = answers.filter((a) => a.teamId).map((a) => ({ teamId: a.teamId as string, value: Number(a.value?.number) }));
      const sc = S.scorePriceGuess(ans, teamAns, teamIds);
      sc.forEach((t) => t.points && rows.push({ ...base, target: 'team', team_id: t.teamId, points: t.points, reason: `얼마일까요 ${r.round_no}R ${t.rank}위` }));
      result = {
        answer: ans, unit: question?.unit ?? '', explanation: question?.explanation ?? '', source: question?.source ?? '', baseDate: question?.base_date ?? '',
        teams: sc.map((t) => ({ ...t, name: tName(t.teamId) })),
      };
      break;
    }
    case 'T04': {
      const ans = Number(question?.answer);
      const scores = await computeScores(eventId);
      const teams = core.teams.map((t) => {
        const bet = resp.find((x) => x.kind === 'bet' && x.team_id === t.id)?.value?.bet ?? 0;
        const ch = answers.find((a) => a.teamId === t.id)?.value?.choice;
        return { teamId: t.id, bet: Number(bet) || 0, choice: Number.isInteger(ch) ? ch : null };
      });
      const sc = S.scoreComeback(ans, teams);
      sc.forEach((t) => t.points && rows.push({ ...base, target: 'team', team_id: t.teamId, points: t.points, reason: `최후의 역전 ${r.round_no}R ${t.correct ? '정답' : '오답'} (베팅 ${t.bet})` }));
      // 이전 점수: 이 라운드 점수를 제외한 현재 점수
      const prevRound = await q(`select team_id, sum(points)::float8 p from score_logs where round_id=$1 and not is_manual group by team_id`, [roundId]);
      result = {
        answer: ans, options: question?.options ?? [], explanation: question?.explanation ?? '',
        teams: sc.map((t) => {
          const before = (scores.team[t.teamId]?.total ?? 0) - (prevRound.find((x) => x.team_id === t.teamId)?.p ?? 0);
          return { ...t, name: tName(t.teamId), before, after: before + t.points };
        }),
      };
      break;
    }
    case 'P01': {
      const sc = S.scoreBalance(answers);
      sc.points.forEach((p) => p.points && rows.push({ ...base, target: 'individual', participant_id: p.participantId, team_id: pTeam(p.participantId), points: p.points, reason: `밸런스 ${r.round_no}R 다수 선택` }));
      result = { options: question?.options ?? r.payload?.options ?? [], a: sc.a, b: sc.b, total: sc.a + sc.b, winners: sc.winners };
      break;
    }
    case 'P02': {
      const sc = S.scoreUniqueNumber(answers);
      isVoid = sc.void;
      if (!sc.void) sc.placements.forEach((p) => rows.push({ ...base, target: 'individual', participant_id: p.participantId, team_id: pTeam(p.participantId), points: p.points, reason: `유일한 숫자 ${r.round_no}R ${p.place}위 (${p.number})` }));
      result = {
        void: sc.void, distribution: sc.distribution, total: answers.length,
        placements: sc.placements.map((p) => ({ ...p, name: pName(p.participantId), teamName: tName(pTeam(p.participantId)) })),
      };
      break;
    }
    case 'P03': {
      const list = core.participants.map((p) => {
        const a = answers.find((x) => x.participantId === p.id);
        const started = resp.some((x) => x.kind === 'start' && x.participant_id === p.id);
        const ms = a && !a.value?.invalid && Number.isFinite(Number(a.value?.ms)) ? Number(a.value.ms) : null;
        return {
          participantId: p.id, name: p.name, teamName: tName(p.team_id), ms,
          error: ms === null ? null : Math.round(Math.abs(ms / 1000 - 10) * 1000) / 1000,
          status: ms !== null ? 'ok' : a ? a.value?.reason ?? 'invalid' : started ? 'invalid' : 'none',
        };
      });
      list.sort((x, y) => (x.error ?? 999) - (y.error ?? 999));
      result = { attempts: list };
      break;
    }
    default:
      throw new AppError('이 게임은 라운드 채점이 없습니다.');
  }

  await tx(async (c) => {
    await c.query('select replace_round_scores($1, $2)', [roundId, JSON.stringify(rows)]);
    await c.query(`update rounds set status='revealed', result=$2, is_void=$3, revealed_at=now(), ends_at=least(coalesce(ends_at, now()), now()) where id=$1`, [roundId, result, isVoid]);
  });

  if (g === 'P03') await scoreTenSecondsGame(eventId);
  return { result, isVoid };
}

async function scoreTenSecondsGame(eventId: string) {
  const core = await loadCore(eventId);
  const rounds = await q(`select id, round_no from rounds where event_id=$1 and game_type='P03' and status='revealed' and not is_void order by round_no`, [eventId]);
  const roundIds = rounds.map((r) => r.id);
  const resp = roundIds.length
    ? await q(`select participant_id, round_id, value from responses where round_id = any($1::uuid[]) and kind='answer'`, [roundIds])
    : [];
  const attempts = resp.map((x) => ({
    participantId: x.participant_id, roundId: x.round_id,
    ms: !x.value?.invalid && Number.isFinite(Number(x.value?.ms)) ? Number(x.value.ms) : null,
  }));
  const res = S.scoreTenSeconds(core.participants.map((p) => ({ id: p.id, teamId: p.team_id })), roundIds, attempts);
  const rows = res.filter((r) => r.points > 0).map((r) => ({
    target: 'individual', participant_id: r.participantId, team_id: r.teamId ?? '', points: r.points,
    reason: `10초의 감각 ${r.rank}위 (평균 오차 ${r.avgError.toFixed(3)}초, ${roundIds.length}라운드 기준)`,
  }));
  await q('select replace_game_scores($1, $2, $3)', [eventId, 'P03', JSON.stringify(rows)]);
  // 현재까지 종합 순위를 마지막 라운드 결과에 첨부
  const last = rounds[rounds.length - 1];
  if (last) {
    const pName = (id: string) => core.participants.find((p) => p.id === id)?.name ?? '?';
    const standings = res.filter((r) => r.rank !== null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 10)
      .map((r) => ({ name: pName(r.participantId), rank: r.rank, avgError: r.avgError, points: r.points, validCount: r.validCount }));
    await q(`update rounds set result = result || $2::jsonb where id=$1`, [last.id, JSON.stringify({ standings, roundsCounted: roundIds.length })]);
  }
}

// ---------------------------------------------------------------- 라운드 생성
async function buildPlayOrder(eventId: string, type: GameType, cfg: ReturnType<typeof gameConfig>) {
  let ids = cfg.questionIds;
  if (!ids.length) {
    const rows = await q(`select id from questions where game_type=$1 and enabled order by sort_order, created_at`, [type]);
    ids = rows.map((r) => r.id);
  } else {
    const rows = await q(`select id from questions where id = any($1::uuid[]) and enabled`, [ids]);
    const ok = new Set(rows.map((r) => r.id));
    ids = ids.filter((id) => ok.has(id));
  }
  if (cfg.shuffle) ids = S.shuffle(ids, secureRand);
  return ids;
}

async function questionPayload(type: GameType, questionId: string | null) {
  if (!questionId) return {};
  const qq = await q1('select prompt, options, unit, image_url from questions where id=$1', [questionId]);
  if (!qq) return {};
  // 정답(answer)·해설은 결과 공개 전까지 절대 포함하지 않음
  return { prompt: qq.prompt, options: qq.options, unit: qq.unit, imageUrl: qq.image_url };
}

async function nextRound(eventId: string) {
  const core = await loadCore(eventId);
  const s = core.session;
  const type = s.current_game as GameType;
  if (!type) throw new AppError('먼저 게임을 선택하세요.');
  const meta = GAMES[type];
  if (meta.kind === 'lucky') throw new AppError('추첨 게임은 추첨 버튼을 사용하세요.');
  if (s.current_round_id) {
    const cur = await q1('select status, is_void from rounds where id=$1', [s.current_round_id]);
    if (cur && cur.status !== 'revealed') throw new AppError('현재 문제의 결과를 먼저 공개하세요.');
  }
  const cfg = gameConfig(core.games, type);
  const total = totalRoundsFor(type, cfg);
  const done = await q1<{ n: number }>(`select count(*)::int n from rounds where event_id=$1 and game_type=$2 and not is_void`, [eventId, type]);
  const roundNo = (done?.n ?? 0) + 1;
  if (roundNo > total) throw new AppError(`이 게임의 ${total}라운드를 모두 마쳤습니다. 게임 종료를 눌러 주세요.`);
  let questionId: string | null = null;
  if (meta.usesQuestions) {
    questionId = cfg.playOrder[roundNo - 1] ?? null;
    if (!questionId) throw new AppError('사용할 문제가 부족합니다. 문제은행에서 문제를 선택하세요.');
  }
  const limit = cfg.timeLimit;
  const now = Date.now();
  let r;
  if (type === 'T04') {
    r = await q1(
      `insert into rounds(event_id, game_type, round_no, question_id, status, time_limit_sec, payload) values ($1,$2,$3,$4,'betting',$5,'{"stage":"bet"}') returning id`,
      [eventId, type, roundNo, questionId, limit]
    );
  } else {
    const startsAt = new Date(now + COUNTDOWN_MS);
    const endsAt = new Date(now + COUNTDOWN_MS + limit * 1000);
    const payload = await questionPayload(type, questionId);
    r = await q1(
      `insert into rounds(event_id, game_type, round_no, question_id, status, starts_at, ends_at, time_limit_sec, payload)
       values ($1,$2,$3,$4,'open',$5,$6,$7,$8) returning id`,
      [eventId, type, roundNo, questionId, startsAt, endsAt, limit, payload]
    );
  }
  await q(`update game_sessions set phase='play', current_round_id=$2, overlay=null, updated_at=now() where event_id=$1`, [eventId, r.id]);
  return { roundNo };
}

async function currentRound(eventId: string) {
  const s = await q1('select current_round_id from game_sessions where event_id=$1', [eventId]);
  if (!s?.current_round_id) throw new AppError('진행 중인 문제가 없습니다.');
  const r = await q1('select * from rounds where id=$1', [s.current_round_id]);
  if (!r) throw new AppError('진행 중인 문제가 없습니다.');
  return autoClose(r);
}

// ---------------------------------------------------------------- 추첨
async function ensureBingoBoards(eventId: string) {
  const parts = await q('select id from participants where event_id=$1', [eventId]);
  const existing = await q('select participant_id, numbers from bingo_boards where event_id=$1', [eventId]);
  const used = new Set(existing.map((b) => [...b.numbers].sort((x: number, y: number) => x - y).join(',')));
  for (const p of parts) {
    if (existing.some((b) => b.participant_id === p.id)) continue;
    let nums: number[];
    let guard = 0;
    do {
      nums = S.pickUnique(9, 30, secureRand);
      guard++;
    } while (used.has([...nums].sort((x, y) => x - y).join(',')) && guard < 50);
    used.add([...nums].sort((x, y) => x - y).join(','));
    await q('insert into bingo_boards(event_id, participant_id, numbers) values ($1,$2,$3) on conflict do nothing', [eventId, p.id, nums]);
  }
}

async function ensureHoles(eventId: string, force = false) {
  const parts = await q('select id from participants where event_id=$1 order by created_at', [eventId]);
  const existing = await q('select participant_id from hole_assignments where event_id=$1', [eventId]);
  if (!force && existing.length === parts.length && existing.every((e) => parts.some((p) => p.id === e.participant_id))) return;
  const draws = await q1<{ n: number }>('select count(*)::int n from hole_draws where event_id=$1', [eventId]);
  if ((draws?.n ?? 0) > 0 && existing.length > 0 && !force) {
    // 추첨이 이미 시작됐다면 새로 등록된 사람에게만 남은 번호 배정
    const taken = new Set((await q('select hole_no from hole_assignments where event_id=$1', [eventId])).map((x) => x.hole_no));
    for (const p of parts) {
      if (existing.some((e) => e.participant_id === p.id)) continue;
      let n = 1;
      while (taken.has(n)) n++;
      taken.add(n);
      await q('insert into hole_assignments(event_id, participant_id, hole_no) values ($1,$2,$3)', [eventId, p.id, n]);
    }
    return;
  }
  const holes = S.shuffle(Array.from({ length: parts.length }, (_, i) => i + 1), secureRand);
  await tx(async (c) => {
    await c.query('delete from hole_assignments where event_id=$1', [eventId]);
    for (const [i, p] of parts.entries()) {
      await c.query('insert into hole_assignments(event_id, participant_id, hole_no) values ($1,$2,$3)', [eventId, p.id, holes[i]]);
    }
  });
}

async function bingoDraw(eventId: string) {
  const drawn = await q('select number from bingo_draws where event_id=$1', [eventId]);
  const set = new Set<number>(drawn.map((d) => d.number));
  const remain = Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => !set.has(n));
  if (!remain.length) throw new AppError('모든 번호를 추첨했습니다.');
  const pick = remain[randInt(remain.length)];
  const ins = await q1(
    `insert into bingo_draws(event_id, number, draw_no) values ($1,$2,(select coalesce(max(draw_no),0)+1 from bingo_draws where event_id=$1))
     on conflict do nothing returning number`,
    [eventId, pick]
  );
  if (!ins) throw new AppError('추첨이 겹쳤습니다. 다시 눌러 주세요.');
  set.add(pick);
  // 우승자 확인 (2줄 이상)
  const boards = await q('select participant_id, numbers from bingo_boards where event_id=$1', [eventId]);
  const confirmed = new Set((await q(`select participant_id from winners where event_id=$1 and category='bingo'`, [eventId])).map((w) => w.participant_id));
  const pending = boards.filter((b) => !confirmed.has(b.participant_id) && S.bingoLines(b.numbers, set) >= 2).map((b) => b.participant_id);
  await q(
    `update games set config = jsonb_set(config, '{bingo}', $2::jsonb) where event_id=$1 and game_type='P04'`,
    [eventId, JSON.stringify({ pending })]
  );
  return { number: pick, newWinners: pending.length };
}

async function holeDraw(eventId: string, allowDup: boolean) {
  await ensureHoles(eventId);
  const assigns = await q('select participant_id, hole_no from hole_assignments where event_id=$1', [eventId]);
  const holeWinners = new Set((await q(`select participant_id from hole_draws where event_id=$1`, [eventId])).map((x) => x.participant_id));
  const anyWinners = new Set((await q(`select participant_id from winners where event_id=$1`, [eventId])).map((x) => x.participant_id));
  const eligible = assigns.filter((a) => !holeWinners.has(a.participant_id) && (allowDup || !anyWinners.has(a.participant_id)));
  if (!eligible.length) throw new AppError('추첨할 수 있는 참석자가 없습니다. (중복 당첨 허용 설정을 확인하세요)');
  const pick = eligible[randInt(eligible.length)];
  const team = await q1('select team_id from participants where id=$1', [pick.participant_id]);
  const prize = await q1(`select id from prizes where event_id=$1 and category='hole' order by sort_order limit 1`, [eventId]);
  await tx(async (c) => {
    await c.query('insert into hole_draws(event_id, hole_no, participant_id) values ($1,$2,$3)', [eventId, pick.hole_no, pick.participant_id]);
    await c.query('insert into winners(event_id, prize_id, category, participant_id, team_id, note) values ($1,$2,$3,$4,$5,$6)', [
      eventId, prize?.id ?? null, 'hole', pick.participant_id, team?.team_id ?? null, `${pick.hole_no}번 홀`,
    ]);
  });
  return { hole: pick.hole_no };
}

// ---------------------------------------------------------------- 데모
const DEMO_NAMES = ['김영수', '이정희', '박민호', '최순자', '정대현', '강미경', '조성훈', '윤재석', '장혜진', '임동욱', '한상철', '오세영', '서경민', '신미란', '권태호', '황인규', '안병철', '송지은'];

async function demoGenerate(eventId: string) {
  await tx(async (c) => {
    await c.query('delete from participants where event_id=$1', [eventId]);
  });
  const teams = await q('select id from teams where event_id=$1 order by sort_order', [eventId]);
  for (const [i, name] of DEMO_NAMES.entries()) {
    const team = teams[i % 3];
    const female = [1, 3, 5, 8, 13].includes(i);
    await q(
      'insert into participants(event_id, team_id, name, code, gender, is_leader, is_virtual) values ($1,$2,$3,$4,$5,$6,true)',
      [eventId, team.id, name, String(1001 + i), female ? 'F' : 'M', i < 3]
    );
  }
}

async function demoAutoAnswer(eventId: string, exclude: string[] = []) {
  const r = await currentRound(eventId);
  const parts = await q('select id, team_id, is_leader from participants where event_id=$1 and is_virtual', [eventId]);
  const g = r.game_type as GameType;
  const meta = GAMES[g];
  const question = r.question_id ? await q1('select answer from questions where id=$1', [r.question_id]) : null;
  let n = 0;
  for (const p of parts) {
    if (exclude.includes(p.id)) continue;
    let kind = 'answer';
    let value: any;
    let scope = 'individual';
    if (r.status === 'betting') {
      if (!p.is_leader) continue;
      const scores = await computeScores(eventId);
      const ts = scores.team[p.team_id]?.total ?? 0;
      kind = 'bet';
      scope = 'team';
      value = { bet: S.clampBet(Math.floor(ts * secureRand()), ts), teamScore: ts };
    } else {
      if (r.status !== 'open' && r.status !== 'paused' && r.status !== 'closed') throw new AppError('응답을 받을 수 있는 상태가 아닙니다.');
      if (meta.leaderOnly) {
        if (!p.is_leader) continue;
        scope = 'team';
      }
      switch (g) {
        case 'T01': case 'T04': value = { choice: secureRand() < 0.6 ? Number(question?.answer ?? 0) : randInt(4) }; break;
        case 'T02': value = { choice: secureRand() < 0.7 ? 0 : 1 }; break;
        case 'P01': value = { choice: randInt(2) }; break;
        case 'T03': { const a = Number(question?.answer ?? 100); value = { number: Math.round(a * (0.6 + secureRand() * 0.8) * 100) / 100 }; break; }
        case 'P02': value = { number: 1 + randInt(8) }; break;
        case 'P03': value = secureRand() < 0.1 ? { invalid: true, reason: 'hidden' } : { ms: Math.round(8500 + secureRand() * 3000) }; break;
        default: continue;
      }
    }
    const ins = await q1(
      `insert into responses(round_id, event_id, participant_id, team_id, scope, kind, value) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning id`,
      [r.id, eventId, p.id, p.team_id, scope, kind, value]
    );
    if (ins) n++;
  }
  return { inserted: n };
}

// ---------------------------------------------------------------- 액션 라우터
export async function adminAction(slug: string, action: string, p: any) {
  const ev = await getEvent(slug);
  const E = ev.id;
  let data: any = null;

  switch (action) {
    // ---------- 진행 제어
    case 'game.select': {
      const type = p.gameType as GameType;
      if (!GAMES[type]) throw new AppError('알 수 없는 게임입니다.');
      const core = await loadCore(E);
      if (core.session.current_round_id) {
        const cur = await q1('select status from rounds where id=$1', [core.session.current_round_id]);
        if (cur && cur.status !== 'revealed' && !p.force) throw new AppError('진행 중인 문제가 있습니다. 결과 공개 또는 라운드 취소 후 바꾸세요.');
      }
      const cfg = gameConfig(core.games, type);
      const played = await q1<{ n: number }>('select count(*)::int n from rounds where event_id=$1 and game_type=$2', [E, type]);
      if (GAMES[type].usesQuestions && (!(played?.n) || !cfg.playOrder.length)) {
        const order = await buildPlayOrder(E, type, cfg);
        await q(`update games set config = jsonb_set(config, '{playOrder}', $3::jsonb) where event_id=$1 and game_type=$2`, [E, type, JSON.stringify(order)]);
      }
      if (type === 'P04') await ensureBingoBoards(E);
      if (type === 'P05') await ensureHoles(E);
      await q(`update games set status='playing' where event_id=$1 and game_type=$2`, [E, type]);
      await q(`update game_sessions set current_game=$2, phase='intro', current_round_id=null, overlay=null, updated_at=now() where event_id=$1`, [E, type]);
      break;
    }
    case 'game.end': {
      const s = await q1('select current_game, current_round_id from game_sessions where event_id=$1', [E]);
      if (s?.current_round_id) {
        const cur = await q1('select status from rounds where id=$1', [s.current_round_id]);
        if (cur && cur.status !== 'revealed' && !p.force) throw new AppError('진행 중인 문제가 있습니다. 결과를 공개하거나 라운드를 취소하세요.');
      }
      if (s?.current_game) await q(`update games set status='done' where event_id=$1 and game_type=$2`, [E, s.current_game]);
      await q(`update game_sessions set current_game=null, phase='lobby', current_round_id=null, overlay=null, updated_at=now() where event_id=$1`, [E]);
      break;
    }
    case 'round.next':
      data = await nextRound(E);
      break;
    case 'round.open': { // 최후의 역전: 베팅 마감 → 문제 공개
      const r = await currentRound(E);
      if (r.status !== 'betting') throw new AppError('베팅 단계가 아닙니다.');
      const now = Date.now();
      const payload = await questionPayload(r.game_type, r.question_id);
      await q(`update rounds set status='open', starts_at=$2, ends_at=$3, payload=$4 where id=$1 and status='betting'`, [
        r.id, new Date(now + COUNTDOWN_MS), new Date(now + COUNTDOWN_MS + r.time_limit_sec * 1000), payload,
      ]);
      break;
    }
    case 'round.pause': {
      const r = await currentRound(E);
      if (r.status !== 'open') throw new AppError('진행 중일 때만 멈출 수 있습니다.');
      const now = Date.now();
      const startsAt = new Date(r.starts_at).getTime();
      const remaining = Math.max(0, new Date(r.ends_at).getTime() - Math.max(now, startsAt));
      await q(`update rounds set status='paused', paused_remaining_ms=$2 where id=$1 and status='open'`, [r.id, remaining]);
      break;
    }
    case 'round.resume': {
      const r = await currentRound(E);
      if (r.status !== 'paused') throw new AppError('멈춘 상태가 아닙니다.');
      const now = Date.now();
      const startsAt = new Date(r.starts_at).getTime();
      const base = Math.max(now, startsAt);
      await q(`update rounds set status='open', ends_at=$2, paused_remaining_ms=null where id=$1 and status='paused'`, [r.id, new Date(base + (r.paused_remaining_ms ?? 0))]);
      break;
    }
    case 'round.addTime': {
      const r = await currentRound(E);
      if (r.status !== 'open') throw new AppError('진행 중일 때만 시간을 늘릴 수 있습니다.');
      await q(`update rounds set ends_at = ends_at + interval '10 seconds' where id=$1`, [r.id]);
      break;
    }
    case 'round.close': {
      const r = await currentRound(E);
      if (!['open', 'paused'].includes(r.status)) throw new AppError('이미 마감되었습니다.');
      await q(`update rounds set status='closed', ends_at=least(ends_at, now()), paused_remaining_ms=null where id=$1`, [r.id]);
      break;
    }
    case 'round.reveal': {
      const r = await currentRound(E);
      if (r.status === 'betting') throw new AppError('먼저 문제를 공개하세요.');
      data = await scoreRound(E, r.id);
      break;
    }
    case 'round.redo': { // 같은 라운드 재진행 (기존 점수 삭제 후 다시)
      const r = await currentRound(E);
      const now = Date.now();
      await tx(async (c) => {
        await c.query('delete from score_logs where round_id=$1 and not is_manual', [r.id]);
        await c.query('delete from responses where round_id=$1', [r.id]);
        if (r.game_type === 'T04') {
          await c.query(`update rounds set status='betting', starts_at=null, ends_at=null, payload='{"stage":"bet"}', result=null, is_void=false, revealed_at=null, paused_remaining_ms=null where id=$1`, [r.id]);
        } else {
          await c.query(
            `update rounds set status='open', starts_at=$2, ends_at=$3, result=null, is_void=false, revealed_at=null, paused_remaining_ms=null where id=$1`,
            [r.id, new Date(now + COUNTDOWN_MS), new Date(now + COUNTDOWN_MS + r.time_limit_sec * 1000)]
          );
        }
      });
      if (r.game_type === 'P03') await scoreTenSecondsGame(E);
      break;
    }
    case 'round.cancel': {
      const r = await currentRound(E);
      await q('delete from rounds where id=$1', [r.id]);
      await q(`update game_sessions set current_round_id=null, phase='intro' where event_id=$1`, [E]);
      if (r.game_type === 'P03') await scoreTenSecondsGame(E);
      break;
    }
    case 'game.reset': {
      const type = p.gameType as GameType;
      await tx(async (c) => {
        await c.query('delete from rounds where event_id=$1 and game_type=$2', [E, type]);
        await c.query('delete from score_logs where event_id=$1 and game_type=$2 and not is_manual', [E, type]);
        if (type === 'P04') {
          await c.query('delete from bingo_draws where event_id=$1', [E]);
          await c.query('delete from bingo_boards where event_id=$1', [E]);
          await c.query(`delete from winners where event_id=$1 and category='bingo'`, [E]);
          await c.query(`update games set config = jsonb_set(config, '{bingo}', '{"pending":[]}') where event_id=$1 and game_type='P04'`, [E]);
        }
        if (type === 'P05') {
          await c.query('delete from hole_draws where event_id=$1', [E]);
          await c.query(`delete from winners where event_id=$1 and category='hole'`, [E]);
        }
        await c.query(`update games set status='ready', config = jsonb_set(config, '{playOrder}', '[]') where event_id=$1 and game_type=$2`, [E, type]);
        await c.query(
          `update game_sessions set current_game=null, phase='lobby', current_round_id=null, overlay=null where event_id=$1 and current_game=$2`,
          [E, type]
        );
      });
      break;
    }
    case 'game.config': {
      const type = p.gameType as GameType;
      const m = GAMES[type];
      const cfg: any = {};
      if (p.rounds !== undefined) cfg.rounds = Math.max(1, Math.min(m.maxRounds, Number(p.rounds) || m.rounds));
      if (p.timeLimit !== undefined) cfg.timeLimit = Math.max(5, Math.min(180, Number(p.timeLimit) || m.timeLimit));
      if (p.questionIds !== undefined) cfg.questionIds = (p.questionIds as string[]).filter(Boolean);
      if (p.shuffle !== undefined) cfg.shuffle = !!p.shuffle;
      cfg.playOrder = []; // 설정 변경 시 다음 게임 선택 때 출제 순서 재생성
      const played = await q1<{ n: number }>('select count(*)::int n from rounds where event_id=$1 and game_type=$2', [E, type]);
      if (played?.n) delete cfg.playOrder;
      await q(`update games set config = config || $3::jsonb where event_id=$1 and game_type=$2`, [E, type, JSON.stringify(cfg)]);
      if (played?.n && (p.questionIds !== undefined || p.shuffle !== undefined)) data = { note: '이미 진행한 라운드가 있어 문제 순서는 게임 초기화 후 반영됩니다.' };
      break;
    }
    case 'game.reorder': {
      const order = p.order as string[];
      for (const [i, t] of order.entries()) await q('update games set sort_order=$3 where event_id=$1 and game_type=$2', [E, t, i + 1]);
      break;
    }
    case 'game.toggle': {
      await q('update games set enabled = not enabled where event_id=$1 and game_type=$2', [E, p.gameType]);
      break;
    }

    // ---------- 순위 / 시상식
    case 'ranking.show': {
      const core = await loadCore(E);
      const scores = await computeScores(E);
      const ranks = buildRankings(core, scores, core.session.published_rankings);
      await q(
        `update game_sessions set prev_rankings=published_rankings, published_rankings=$2, overlay=$3, overlay_data='{}' where event_id=$1`,
        [E, ranks, p.kind === 'team' ? 'ranking_team' : 'ranking_individual']
      );
      break;
    }
    case 'overlay.close':
      await q(`update game_sessions set overlay=null, overlay_data='{}' where event_id=$1`, [E]);
      break;
    case 'ceremony.start': {
      const core = await loadCore(E);
      const scores = await computeScores(E);
      const ranks = buildRankings(core, scores, core.session.published_rankings);
      const winners = await q(
        `select w.category, p.name, t.name as team_name, z.name as prize_name, w.note from winners w
         left join participants p on p.id=w.participant_id left join teams t on t.id=w.team_id left join prizes z on z.id=w.prize_id
         where w.event_id=$1 and w.category in ('rps','bingo','hole','etc') order by w.created_at`,
        [E]
      );
      const prizeOf = async (cat: string) => (await q1('select name, photo_url from prizes where event_id=$1 and category=$2 order by sort_order limit 1', [E, cat])) ?? null;
      const ceremony = {
        individual: [3, 2, 1].map((rank) => ({ rank, people: ranks.individual.filter((x) => x.rank === rank).map((x) => ({ name: x.name, teamName: x.teamName, total: x.total })) })),
        team: ranks.team.filter((t) => t.rank === 1).map((t) => ({
          name: t.name, color: t.color, total: t.total,
          members: core.participants.filter((x) => x.team_id === t.id).map((x) => x.name),
        })),
        teamAll: ranks.team.map((t) => ({ name: t.name, total: t.total, rank: t.rank, color: t.color })),
        lucky: winners.map((w) => ({ category: w.category, label: PRIZE_CATEGORIES[w.category] ?? w.category, name: w.name, teamName: w.team_name, prize: w.prize_name, note: w.note })),
        prizes: { ind1: await prizeOf('ind1'), ind2: await prizeOf('ind2'), ind3: await prizeOf('ind3'), team: await prizeOf('team') },
      };
      await q(
        `update game_sessions set prev_rankings=published_rankings, published_rankings=$2, overlay='ceremony', overlay_data=$3 where event_id=$1`,
        [E, ranks, { step: 0, ceremony }]
      );
      break;
    }
    case 'ceremony.step': {
      const s = await q1('select overlay_data from game_sessions where event_id=$1', [E]);
      const step = Math.max(0, Math.min(6, Number(s?.overlay_data?.step ?? 0) + (p.dir === -1 ? -1 : 1)));
      await q(`update game_sessions set overlay_data = jsonb_set(overlay_data, '{step}', $2::jsonb) where event_id=$1`, [E, JSON.stringify(step)]);
      break;
    }

    // ---------- 추첨 게임
    case 'bingo.draw':
      data = await bingoDraw(E);
      break;
    case 'bingo.confirm': {
      const core = await loadCore(E);
      const cfg = gameConfig(core.games, 'P04');
      let ids: string[] = cfg.bingo.pending ?? [];
      if (!ids.length) throw new AppError('확정할 빙고 우승자가 없습니다.');
      if (p.mode === 'pickOne') ids = [ids[randInt(ids.length)]];
      const prize = await q1(`select id from prizes where event_id=$1 and category='bingo' order by sort_order limit 1`, [E]);
      for (const id of ids) {
        const tm = core.participants.find((x) => x.id === id)?.team_id ?? null;
        await q('insert into winners(event_id, prize_id, category, participant_id, team_id, note) values ($1,$2,$3,$4,$5,$6)', [
          E, prize?.id ?? null, 'bingo', id, tm, p.mode === 'pickOne' ? '추가 추첨으로 결정' : ids.length > 1 ? '공동 우승' : '',
        ]);
      }
      await q(`update games set config = jsonb_set(config, '{bingo}', '{"pending":[]}') where event_id=$1 and game_type='P04'`, [E]);
      break;
    }
    case 'bingo.dismiss': // 대기 우승자 무시하고 계속 추첨
      await q(`update games set config = jsonb_set(config, '{bingo}', '{"pending":[]}') where event_id=$1 and game_type='P04'`, [E]);
      break;
    case 'hole.draw':
      data = await holeDraw(E, !!ev.settings?.allow_duplicate_win);
      break;
    case 'hole.reassign': {
      const d = await q1<{ n: number }>('select count(*)::int n from hole_draws where event_id=$1', [E]);
      if (d?.n) throw new AppError('이미 추첨이 진행되어 홀 번호를 다시 배정할 수 없습니다.');
      await ensureHoles(E, true);
      break;
    }

    // ---------- 참석자 / 조
    case 'p.add': {
      const name = String(p.name ?? '').trim();
      if (!name) throw new AppError('이름을 입력하세요.');
      const code = String(p.code ?? '').trim() || String(1000 + randInt(9000));
      await q('insert into participants(event_id, team_id, name, code, gender, is_leader) values ($1,$2,$3,$4,$5,false)', [E, p.teamId || null, name, code, p.gender || null]).catch((e) => {
        if (String(e.message).includes('duplicate')) throw new AppError('같은 이름이 이미 있습니다. (동명이인은 이름 뒤에 구분 표시를 붙여 주세요)');
        throw e;
      });
      break;
    }
    case 'p.bulk': {
      const lines = String(p.text ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const teams = await q('select id, name from teams where event_id=$1 order by sort_order', [E]);
      let added = 0;
      for (const line of lines) {
        const [nameRaw, a, b, c2] = line.split(/[,\t]/).map((x) => x?.trim());
        if (!nameRaw) continue;
        const fields = [a, b, c2].filter(Boolean) as string[];
        let teamId: string | null = null;
        let code = '';
        let gender: string | null = null;
        for (const f of fields) {
          const t = teams.find((x) => x.name === f || x.name === `${f}조` || x.name.replace('조', '') === f.replace('조', ''));
          if (/^(여|여성|F|f)$/.test(f)) gender = 'F';
          else if (/^(남|남성|M|m)$/.test(f)) gender = 'M';
          else if (/^\d{3,8}$/.test(f)) code = f;
          else if (t) teamId = t.id;
        }
        if (!code) code = String(1000 + randInt(9000));
        const r = await q1(
          'insert into participants(event_id, team_id, name, code, gender) values ($1,$2,$3,$4,$5) on conflict (event_id, name) do nothing returning id',
          [E, teamId, nameRaw, code, gender]
        );
        if (r) added++;
      }
      data = { added, total: lines.length };
      break;
    }
    case 'p.update': {
      const fields: string[] = [];
      const vals: any[] = [p.id, E];
      const set = (col: string, v: any) => { vals.push(v); fields.push(`${col}=$${vals.length}`); };
      if (p.name !== undefined) set('name', String(p.name).trim());
      if (p.code !== undefined) set('code', String(p.code).trim());
      if (p.teamId !== undefined) set('team_id', p.teamId || null);
      if (p.gender !== undefined) set('gender', p.gender || null);
      if (!fields.length) break;
      await q(`update participants set ${fields.join(', ')} where id=$1 and event_id=$2`, vals);
      break;
    }
    case 'p.setLeader': {
      const pp = await q1('select team_id, is_leader from participants where id=$1 and event_id=$2', [p.id, E]);
      if (!pp) throw new AppError('참석자를 찾을 수 없습니다.');
      if (pp.is_leader) {
        await q('update participants set is_leader=false where id=$1', [p.id]);
      } else {
        await q('update participants set is_leader=false where event_id=$1 and team_id=$2', [E, pp.team_id]);
        await q('update participants set is_leader=true where id=$1', [p.id]);
      }
      break;
    }
    case 'p.delete':
      await q('delete from participants where id=$1 and event_id=$2', [p.id, E]);
      break;
    case 'p.kick':
      await q('update participants set session_token=null, last_seen=null where id=$1 and event_id=$2', [p.id, E]);
      break;
    case 'p.autoTeams': {
      const parts = await q('select id, gender from participants where event_id=$1', [E]);
      const teams = await q('select id from teams where event_id=$1 order by sort_order', [E]);
      const women = S.shuffle(parts.filter((x) => x.gender === 'F'), secureRand);
      const others = S.shuffle(parts.filter((x) => x.gender !== 'F'), secureRand);
      const sizes = teams.map(() => 0);
      const assign: Record<string, string> = {};
      // 여성 먼저 고르게 분산 후, 인원이 적은 조부터 채움
      for (const person of [...women, ...others]) {
        const min = Math.min(...sizes);
        const candidates = sizes.map((s, i) => (s === min ? i : -1)).filter((i) => i >= 0);
        const idx = candidates[randInt(candidates.length)];
        assign[person.id] = teams[idx].id;
        sizes[idx]++;
      }
      await tx(async (c) => {
        for (const [pid, tid] of Object.entries(assign)) await c.query('update participants set team_id=$2, is_leader=false where id=$1', [pid, tid]);
      });
      break;
    }
    case 'team.rename':
      await q('update teams set name=$3 where id=$1 and event_id=$2', [p.id, E, String(p.name ?? '').trim() || '조']);
      break;

    // ---------- 점수
    case 'score.adjust': {
      const pts = Number(p.points);
      if (!Number.isFinite(pts) || pts === 0) throw new AppError('조정 점수를 입력하세요.');
      const target = p.target === 'team' ? 'team' : 'individual';
      const teamId = target === 'team' ? p.id : (await q1('select team_id from participants where id=$1', [p.id]))?.team_id ?? null;
      await q(
        `insert into score_logs(event_id, target, team_id, participant_id, game_type, points, reason, is_manual) values ($1,$2,$3,$4,$5,$6,$7,true)`,
        [E, target, teamId, target === 'individual' ? p.id : null, p.gameType || 'ADJ', pts, String(p.reason ?? '관리자 수동 조정').slice(0, 200)]
      );
      break;
    }
    case 'score.logs':
      data = await q(
        `select s.id, s.target, s.game_type, s.points::float8 points, s.reason, s.is_manual, s.created_at, t.name team_name, p.name participant_name
         from score_logs s left join teams t on t.id=s.team_id left join participants p on p.id=s.participant_id
         where s.event_id=$1 order by s.created_at desc limit 300`,
        [E]
      );
      return { data }; // 조회는 동기화 신호 불필요
    case 'score.deleteLog':
      await q('delete from score_logs where id=$1 and event_id=$2 and is_manual', [p.id, E]);
      break;

    // ---------- 경품
    case 'prize.save': {
      const cat = PRIZE_CATEGORIES[p.category] ? p.category : 'etc';
      if (p.id) {
        await q('update prizes set category=$3, name=$4, quantity=$5, photo_url=$6 where id=$1 and event_id=$2', [p.id, E, cat, String(p.name ?? ''), Number(p.quantity) || 1, p.photoUrl || null]);
      } else {
        await q('insert into prizes(event_id, category, name, quantity, photo_url, sort_order) values ($1,$2,$3,$4,$5,(select coalesce(max(sort_order),0)+1 from prizes where event_id=$1))', [
          E, cat, String(p.name ?? '경품'), Number(p.quantity) || 1, p.photoUrl || null,
        ]);
      }
      break;
    }
    case 'prize.delete':
      await q('delete from prizes where id=$1 and event_id=$2', [p.id, E]);
      break;
    case 'winner.add': {
      const pp = await q1('select team_id from participants where id=$1 and event_id=$2', [p.participantId, E]);
      if (!pp) throw new AppError('참석자를 선택하세요.');
      if (!ev.settings?.allow_duplicate_win && !p.force) {
        const dup = await q1('select category from winners where event_id=$1 and participant_id=$2 limit 1', [E, p.participantId]);
        if (dup) throw new AppError(`이미 '${PRIZE_CATEGORIES[dup.category] ?? dup.category}'에 당첨된 분입니다. (설정에서 중복 당첨 허용 가능)`);
      }
      const prize = p.prizeId ? { id: p.prizeId } : await q1('select id from prizes where event_id=$1 and category=$2 order by sort_order limit 1', [E, p.category]);
      await q('insert into winners(event_id, prize_id, category, participant_id, team_id, note) values ($1,$2,$3,$4,$5,$6)', [
        E, prize?.id ?? null, p.category, p.participantId, pp.team_id, p.note || null,
      ]);
      break;
    }
    case 'winner.delete':
      await q('delete from winners where id=$1 and event_id=$2', [p.id, E]);
      break;
    case 'winner.deliver':
      await q('update winners set delivered=$3 where id=$1 and event_id=$2', [p.id, E, !!p.delivered]);
      break;
    case 'winner.autoRankings': {
      const core = await loadCore(E);
      const scores = await computeScores(E);
      const ranks = buildRankings(core, scores);
      await q(`delete from winners where event_id=$1 and category in ('team','ind1','ind2','ind3')`, [E]);
      const prizeId = async (cat: string) => (await q1('select id from prizes where event_id=$1 and category=$2 order by sort_order limit 1', [E, cat]))?.id ?? null;
      for (const t of ranks.team.filter((x) => x.rank === 1)) {
        const pid = await prizeId('team');
        for (const m of core.participants.filter((x) => x.team_id === t.id)) {
          await q('insert into winners(event_id, prize_id, category, participant_id, team_id, note) values ($1,$2,$3,$4,$5,$6)', [E, pid, 'team', m.id, t.id, `${t.name} ${t.total}점`]);
        }
      }
      for (const rank of [1, 2, 3]) {
        const pid = await prizeId(`ind${rank}`);
        for (const x of ranks.individual.filter((i) => i.rank === rank)) {
          await q('insert into winners(event_id, prize_id, category, participant_id, team_id, note) values ($1,$2,$3,$4,$5,$6)', [E, pid, `ind${rank}`, x.id, x.teamId, `${x.total}점`]);
        }
      }
      break;
    }

    // ---------- 문제은행
    case 'q.list':
      data = await q('select * from questions where ($1::text is null or game_type=$1) order by game_type, sort_order, created_at', [p.gameType ?? null]);
      return { data };
    case 'q.save': {
      const type = String(p.gameType);
      if (!['T01', 'T02', 'T03', 'T04', 'P01'].includes(type)) throw new AppError('문제를 사용하는 게임이 아닙니다.');
      const options = Array.isArray(p.options) ? p.options.map((x: any) => String(x)) : [];
      if ((type === 'T01' || type === 'T04') && (options.length !== 4 || options.some((o: string) => !o.trim()))) throw new AppError('보기 4개를 모두 입력하세요.');
      if ((type === 'T02' || type === 'P01') && (options.length !== 2 || options.some((o: string) => !o.trim()))) throw new AppError('선택지 A, B를 입력하세요.');
      if (type === 'T03' && !Number.isFinite(Number(p.answer))) throw new AppError('정답 숫자를 입력하세요.');
      const prompt = String(p.prompt ?? '').trim() || (type === 'T02' ? '둘 중 우리 조원들이 더 많이 고를 것은?' : type === 'P01' ? '여러분의 선택은? (다수가 고를 쪽을 맞혀 보세요)' : '');
      if (!prompt) throw new AppError('문제를 입력하세요.');
      const vals = [type, prompt, JSON.stringify(options), p.answer === undefined || p.answer === null ? null : String(p.answer), p.unit || null, p.imageUrl || null, p.explanation || null, p.source || null, p.baseDate || null, p.enabled !== false];
      if (p.id) {
        await q(
          `update questions set game_type=$2, prompt=$3, options=$4::jsonb, answer=$5, unit=$6, image_url=$7, explanation=$8, source=$9, base_date=$10, enabled=$11 where id=$1`,
          [p.id, ...vals]
        );
      } else {
        await q(
          `insert into questions(game_type, prompt, options, answer, unit, image_url, explanation, source, base_date, enabled, sort_order)
           values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,(select coalesce(max(sort_order),0)+1 from questions where game_type=$1))`,
          vals
        );
      }
      return { data: null };
    }
    case 'q.delete':
      await q('delete from questions where id=$1', [p.id]);
      return { data: null };

    // ---------- 설정 / 초기화
    case 'settings.save': {
      const settings = { ...(ev.settings ?? {}), allow_duplicate_win: !!p.allowDuplicate };
      await q('update events set settings=$2, name=coalesce(nullif($3,\'\'), name) where id=$1', [E, settings, String(p.eventName ?? '').trim()]);
      break;
    }
    case 'event.resetAll': {
      if (p.confirm !== '초기화') throw new AppError("확인 문구 '초기화'를 정확히 입력하세요.");
      await tx(async (c) => {
        for (const t of ['rounds', 'score_logs', 'winners', 'bingo_draws', 'bingo_boards', 'hole_draws', 'hole_assignments']) {
          await c.query(`delete from ${t} where event_id=$1`, [E]);
        }
        await c.query(`update games set status='ready', config = jsonb_set(jsonb_set(config, '{playOrder}', '[]'), '{bingo}', '{"pending":[]}') where event_id=$1`, [E]);
        await c.query(`update game_sessions set current_game=null, phase='lobby', current_round_id=null, overlay=null, overlay_data='{}', published_rankings=null, prev_rankings=null where event_id=$1`, [E]);
      });
      break;
    }

    // ---------- 데모 모드
    case 'demo.generate':
      if (!ev.is_demo) throw new AppError('데모 모드에서만 사용할 수 있습니다.');
      await adminAction('demo', 'event.resetAll', { confirm: '초기화' });
      await demoGenerate(E);
      break;
    case 'demo.autoAnswer':
      if (!ev.is_demo) throw new AppError('데모 모드에서만 사용할 수 있습니다.');
      data = await demoAutoAnswer(E, Array.isArray(p.exclude) ? p.exclude : []);
      break;
    case 'demo.randomScores': {
      if (!ev.is_demo) throw new AppError('데모 모드에서만 사용할 수 있습니다.');
      const core = await loadCore(E);
      for (const t of core.teams) {
        await q(`insert into score_logs(event_id, target, team_id, game_type, points, reason, is_manual) values ($1,'team',$2,'ADJ',$3,'데모 임의 점수',true)`, [E, t.id, (1 + randInt(30)) * 100]);
      }
      for (const x of core.participants) {
        await q(`insert into score_logs(event_id, target, team_id, participant_id, game_type, points, reason, is_manual) values ($1,'individual',$2,$3,'ADJ',$4,'데모 임의 점수',true)`, [E, x.team_id, x.id, randInt(16) * 100]);
      }
      break;
    }
    case 'demo.clear': {
      if (!ev.is_demo) throw new AppError('데모 모드에서만 사용할 수 있습니다.');
      await q('delete from events where id=$1 and is_demo', [E]);
      forgetEnsured(E);
      const ev2 = await getEvent('demo');
      await ensureEventRows(ev2.id);
      await bump(ev2.id);
      return { data: { cleared: true } };
    }
    default:
      throw new AppError(`알 수 없는 명령: ${action}`);
  }

  await log(E, action, p ?? null);
  await bump(E);
  return { data };
}

export async function exportCsv(slug: string) {
  const ev = await getEvent(slug);
  const core = await loadCore(ev.id);
  const scores = await computeScores(ev.id);
  const ranks = buildRankings(core, scores);
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  const row = (...cells: any[]) => lines.push(cells.map(esc).join(','));
  row(`${ev.name} 결과`, new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
  row();
  row('[조별 순위]');
  row('순위', '조', '총점', '골든벨', '이심전심', '얼마일까요', '최후의 역전', '수동조정');
  ranks.team.forEach((t) => row(t.rank, t.name, t.total, ...TEAM_GAMES.map((g) => t.byGame[g] ?? 0), t.byGame.ADJ ?? 0));
  row();
  row('[개인 순위]');
  row('순위', '이름', '조', '총점', '밸런스', '유일한 숫자(환산)', '10초의 감각', '수동조정');
  ranks.individual.forEach((x) => row(x.rank, x.name, x.teamName, x.total, x.byGame.P01 ?? 0, x.byGame.P02 ?? 0, x.byGame.P03 ?? 0, x.byGame.ADJ ?? 0));
  row();
  row('[당첨자]');
  row('구분', '이름', '조', '경품', '비고', '지급');
  const winners = await q(
    `select w.category, p.name, t.name tn, z.name zn, w.note, w.delivered from winners w left join participants p on p.id=w.participant_id
     left join teams t on t.id=w.team_id left join prizes z on z.id=w.prize_id where w.event_id=$1 order by w.created_at`,
    [ev.id]
  );
  winners.forEach((w) => row(PRIZE_CATEGORIES[w.category] ?? w.category, w.name, w.tn, w.zn, w.note, w.delivered ? '지급' : '미지급'));
  row();
  row('[점수 변경 이력]');
  row('시각', '대상', '조', '이름', '게임', '점수', '사유', '수동');
  const logs = await q(
    `select s.created_at, s.target, t.name tn, p.name pn, s.game_type, s.points::float8 pts, s.reason, s.is_manual from score_logs s
     left join teams t on t.id=s.team_id left join participants p on p.id=s.participant_id where s.event_id=$1 order by s.created_at`,
    [ev.id]
  );
  logs.forEach((l) => row(new Date(l.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), l.target === 'team' ? '조' : '개인', l.tn, l.pn,
    GAMES[l.game_type as GameType]?.title ?? '수동 조정', l.pts, l.reason, l.is_manual ? 'Y' : ''));
  return '﻿' + lines.join('\r\n');
}

export { INDIVIDUAL_GAMES } from './games';
