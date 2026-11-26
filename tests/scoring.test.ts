import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../lib/scoring.ts';

const R = (id: string, team: string, value: any) => ({ participantId: id, teamId: team, value });

test('골든벨: 정답자 1명당 100점, 최대 600', () => {
  const resp = [...Array(6)].map((_, i) => R('a' + i, 'A', { choice: 2 })).concat([R('b1', 'B', { choice: 1 }), R('b2', 'B', { choice: 2 })]);
  const r = S.scoreGoldenBell(2, resp, ['A', 'B', 'C']);
  assert.deepEqual(r.teamPoints.map((t) => t.points), [600, 100, 0]);
  assert.equal(r.correctCount, 7);
});

test('이심전심: 6/5/4 일치 = 600/400/200, 3대3 = 0, 미응답 제외', () => {
  assert.equal(S.mindMatchPoints(6, 6), 600);
  assert.equal(S.mindMatchPoints(6, 5), 400);
  assert.equal(S.mindMatchPoints(6, 4), 200);
  assert.equal(S.mindMatchPoints(6, 3), 0);
  const resp = [R('1', 'A', { choice: 0 }), R('2', 'A', { choice: 0 }), R('3', 'A', { choice: 0 }), R('4', 'A', { choice: 0 }), R('5', 'A', { choice: 0 })];
  assert.equal(S.scoreMindMatch(resp, [{ id: 'A', size: 6 }])[0].points, 400);
});

test('얼마일까요: 오차순 600/400/200, 동률 평균, 미응답 0', () => {
  const r = S.scorePriceGuess(100, [{ teamId: 'A', value: 90 }, { teamId: 'B', value: 110 }, { teamId: 'C', value: 150 }], ['A', 'B', 'C']);
  assert.deepEqual(r.map((x) => x.points), [500, 500, 200]);
  const r2 = S.scorePriceGuess(100, [{ teamId: 'A', value: 99 }], ['A', 'B', 'C']);
  assert.deepEqual(r2.map((x) => x.points), [600, 0, 0]);
});

test('최후의 역전: 정답 +베팅, 오답 -베팅, 베팅 한도', () => {
  const r = S.scoreComeback(1, [{ teamId: 'A', bet: 500, choice: 1 }, { teamId: 'B', bet: 300, choice: 0 }, { teamId: 'C', bet: 200, choice: null }]);
  assert.deepEqual(r.map((x) => x.points), [500, -300, -200]);
  assert.equal(S.clampBet(9999, 1200), 1200);
  assert.equal(S.clampBet(-5, 1200), 0);
  assert.equal(S.clampBet(100, -50), 0);
});

test('밸런스: 다수 200점, 동률 모두 200점', () => {
  const r = S.scoreBalance([R('1', 'A', { choice: 0 }), R('2', 'A', { choice: 0 }), R('3', 'B', { choice: 1 })]);
  assert.deepEqual(r.points.map((p) => p.points), [200, 200, 0]);
  const t = S.scoreBalance([R('1', 'A', { choice: 0 }), R('2', 'A', { choice: 1 })]);
  assert.deepEqual(t.points.map((p) => p.points), [200, 200]);
});

test('유일한 숫자: 작은 유일 숫자 순 300/200/100, 없으면 무효', () => {
  const r = S.scoreUniqueNumber([R('a', 'A', { number: 1 }), R('b', 'A', { number: 1 }), R('c', 'A', { number: 2 }), R('d', 'A', { number: 5 }), R('e', 'A', { number: 3 }), R('f', 'A', { number: 9 })]);
  assert.deepEqual(r.placements.map((p) => [p.participantId, p.points]), [['c', 300], ['e', 200], ['d', 100]]);
  assert.equal(S.scoreUniqueNumber([R('a', 'A', { number: 1 }), R('b', 'A', { number: 1 })]).void, true);
  assert.equal(Math.round(900 * S.P02_FACTOR), 1000);
});

test('10초의 감각: 평균 오차 순위 점수, 기록 없으면 0점', () => {
  const ps = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, teamId: 'A' }));
  const rounds = ['r1'];
  const att = ps.slice(0, 7).map((p, i) => ({ participantId: p.id, roundId: 'r1', ms: 10000 + (i + 1) * 10 }));
  const r = S.scoreTenSeconds(ps, rounds, att);
  assert.deepEqual(r.map((x) => x.points), [1000, 800, 600, 400, 200, 100, 100, 0]);
});

test('빙고 줄 계산', () => {
  const board = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(S.bingoLines(board, new Set([1, 2, 3])), 1);
  assert.equal(S.bingoLines(board, new Set([1, 2, 3, 5, 9])), 2);
  const u = S.pickUnique(9, 30);
  assert.equal(new Set(u).size, 9);
  assert.ok(u.every((n) => n >= 1 && n <= 30));
});

test('경쟁 순위 동점 처리', () => {
  const r = S.competitionRanks([{ s: 10 }, { s: 20 }, { s: 20 }, { s: 5 }], (x) => x.s);
  assert.deepEqual(r.map((x) => x.rank), [1, 1, 3, 4]);
});
