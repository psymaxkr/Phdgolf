// PHD PLAY 2026 - 점수 계산 (순수 함수, 서버에서만 사용 / 단위 테스트 대상)

export type Resp = { participantId: string; teamId: string | null; value: any };

/** 경쟁 순위(1,1,3 방식) */
export function competitionRanks<T>(items: T[], score: (t: T) => number, desc = true): { item: T; rank: number }[] {
  const sorted = [...items].sort((a, b) => (desc ? score(b) - score(a) : score(a) - score(b)));
  const out: { item: T; rank: number }[] = [];
  sorted.forEach((item, i) => {
    const prev = out[i - 1];
    const rank = prev && score(prev.item) === score(item) ? prev.rank : i + 1;
    out.push({ item, rank });
  });
  return out;
}

/** T01 골든벨: 정답 비율 × 600점 (6명 조 = 정답자 1명당 100점, 인원이 다르면 비율로 환산) */
export function goldenBellPoints(correct: number, teamSize: number) {
  if (teamSize <= 0) return 0;
  return Math.round((correct / teamSize) * 600);
}
export function scoreGoldenBell(answer: number, responses: Resp[], teamIds: string[], teamSizes: Record<string, number> = {}) {
  const perTeam: Record<string, { correct: number; answered: number }> = {};
  teamIds.forEach((t) => (perTeam[t] = { correct: 0, answered: 0 }));
  const dist = [0, 0, 0, 0];
  const correctIds: string[] = [];
  for (const r of responses) {
    const v = Number(r.value?.choice);
    if (Number.isInteger(v) && v >= 0 && v < 4) dist[v]++;
    if (!r.teamId || !perTeam[r.teamId]) continue;
    perTeam[r.teamId].answered++;
    if (v === answer) {
      perTeam[r.teamId].correct++;
      correctIds.push(r.participantId);
    }
  }
  const total = responses.length;
  const teamPoints = teamIds.map((t) => {
    const size = teamSizes[t] ?? 6;
    return { teamId: t, points: goldenBellPoints(perTeam[t].correct, size), correct: perTeam[t].correct, answered: perTeam[t].answered, size };
  });
  return { dist, total, correctCount: correctIds.length, correctIds, teamPoints };
}

/** T02 이심전심: 조원 일치 인원 → 점수 (조 인원수 기준, 미응답자는 일치 인원에 미포함) */
export function mindMatchPoints(teamSize: number, maxSame: number) {
  if (teamSize <= 0 || maxSame * 2 <= teamSize) return 0; // 과반 미달(3대3 등)은 0점
  const diff = teamSize - maxSame;
  return diff === 0 ? 600 : diff === 1 ? 400 : diff === 2 ? 200 : 0;
}
export function scoreMindMatch(responses: Resp[], teams: { id: string; size: number }[]) {
  return teams.map((t) => {
    const a = responses.filter((r) => r.teamId === t.id && Number(r.value?.choice) === 0).length;
    const b = responses.filter((r) => r.teamId === t.id && Number(r.value?.choice) === 1).length;
    const maxSame = Math.max(a, b);
    return { teamId: t.id, a, b, size: t.size, points: mindMatchPoints(t.size, maxSame), majority: a === b ? null : a > b ? 0 : 1 };
  });
}

/** 순위별 점수표 + 동률 평균 */
export function tiedPoints<T>(items: T[], metric: (t: T) => number, table: number[]) {
  const sorted = [...items].sort((a, b) => metric(a) - metric(b));
  const out: { item: T; rank: number; points: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && metric(sorted[j + 1]) === metric(sorted[i])) j++;
    let sum = 0;
    for (let k = i; k <= j; k++) sum += table[k] ?? 0;
    const pts = Math.round((sum / (j - i + 1)) * 100) / 100;
    for (let k = i; k <= j; k++) out.push({ item: sorted[k], rank: i + 1, points: pts });
    i = j + 1;
  }
  return out;
}

/** T03 얼마일까요: 절대 오차가 작은 순 600/400/200, 동률은 평균, 미응답 0 */
export function scorePriceGuess(answer: number, teamAnswers: { teamId: string; value: number }[], teamIds: string[]) {
  const valid = teamAnswers.filter((t) => Number.isFinite(t.value));
  const ranked = tiedPoints(valid, (t) => Math.abs(t.value - answer), [600, 400, 200]);
  return teamIds.map((id) => {
    const r = ranked.find((x) => x.item.teamId === id);
    return r
      ? { teamId: id, value: r.item.value, error: Math.abs(r.item.value - answer), rank: r.rank, points: r.points }
      : { teamId: id, value: null, error: null, rank: null, points: 0 };
  });
}

/** T04 최후의 역전: 정답 +베팅, 오답/미응답 -베팅 */
export function scoreComeback(answer: number, teams: { teamId: string; bet: number; choice: number | null }[]) {
  return teams.map((t) => {
    const correct = t.choice !== null && t.choice === answer;
    return { ...t, correct, points: correct ? t.bet : -t.bet };
  });
}
export function clampBet(bet: number, teamScore: number) {
  const max = Math.max(0, Math.floor(teamScore));
  if (!Number.isFinite(bet)) return 0;
  return Math.min(max, Math.max(0, Math.floor(bet)));
}

/** P01 밸런스: 다수 선택 200점, 동률이면 모두 200점 */
export function scoreBalance(responses: Resp[]) {
  const a = responses.filter((r) => Number(r.value?.choice) === 0).length;
  const b = responses.filter((r) => Number(r.value?.choice) === 1).length;
  const winners = a === b ? [0, 1] : a > b ? [0] : [1];
  const points = responses.map((r) => {
    const c = Number(r.value?.choice);
    return { participantId: r.participantId, teamId: r.teamId, choice: c, points: (a + b > 0 && winners.includes(c)) ? 200 : 0 };
  });
  return { a, b, winners, points };
}

/** P02 유일한 숫자: 유일한 숫자 중 작은 순 300/200/100 (유일 숫자가 없으면 무효) */
export function scoreUniqueNumber(responses: Resp[]) {
  const counts: Record<number, string[]> = {};
  for (const r of responses) {
    const n = Number(r.value?.number);
    if (!Number.isInteger(n) || n < 1 || n > 20) continue;
    (counts[n] ||= []).push(r.participantId);
  }
  const uniques = Object.keys(counts).map(Number).filter((n) => counts[n].length === 1).sort((x, y) => x - y);
  const table = [300, 200, 100];
  const placements = uniques.slice(0, 3).map((n, i) => ({ number: n, participantId: counts[n][0], place: i + 1, points: table[i] }));
  const distribution = Array.from({ length: 20 }, (_, i) => counts[i + 1]?.length ?? 0);
  return { void: uniques.length === 0, placements, distribution, uniques };
}
export const P02_FACTOR = 1000 / 900;

/** P03 10초의 감각: 라운드별 오차 평균 → 순위 점수. 무효/미참여 라운드는 20초 오차로 계산, 유효 기록이 하나도 없으면 0점 */
export const P03_PENALTY_ERROR = 20;
export const P03_TABLE = [1000, 800, 600, 400, 200];
export function scoreTenSeconds(
  participants: { id: string; teamId: string | null }[],
  roundIds: string[],
  attempts: { participantId: string; roundId: string; ms: number | null }[] // ms=null → 무효
) {
  const rows = participants.map((p) => {
    let validCount = 0;
    const errors = roundIds.map((rid) => {
      const a = attempts.find((x) => x.participantId === p.id && x.roundId === rid);
      if (a && a.ms !== null && Number.isFinite(a.ms)) {
        validCount++;
        return Math.abs(a.ms / 1000 - 10);
      }
      return P03_PENALTY_ERROR;
    });
    const avg = errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : P03_PENALTY_ERROR;
    return { participantId: p.id, teamId: p.teamId, validCount, avgError: Math.round(avg * 1000) / 1000 };
  });
  const eligible = rows.filter((r) => r.validCount > 0);
  const ranked = competitionRanks(eligible, (r) => r.avgError, false);
  return rows.map((r) => {
    const x = ranked.find((k) => k.item.participantId === r.participantId);
    const rank = x ? x.rank : null;
    const points = rank === null ? 0 : P03_TABLE[rank - 1] ?? 100;
    return { ...r, rank, points };
  });
}

/** 빙고: 3x3 판에서 완성된 줄 수 */
export const BINGO_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
export function bingoLines(board: number[], drawn: Set<number>) {
  return BINGO_LINES.filter((line) => line.every((i) => drawn.has(board[i]))).length;
}

/** 1~max 중 중복 없이 n개 */
export function pickUnique(n: number, max: number, rand: () => number = Math.random) {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
export function shuffle<T>(arr: T[], rand: () => number = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
