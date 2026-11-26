// PHD PLAY 2026 - 18명 동시 참여 시뮬레이션 (데모 모드에서 실행)
// 사용법: BASE=https://배포주소 ADMIN_PASSWORD=비밀번호 node scripts/simulate.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'test1234';
const E = 'demo';
let cookie = '';
const stats = { requests: 0, errors: 0, lat: [] };
const failures = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { body, token, admin } = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-phd-token': token } : {}), ...(admin ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  stats.requests++;
  stats.lat.push(Date.now() - t0);
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  if (res.status >= 500) stats.errors++;
  return { status: res.status, data };
}
const admin = async (action, params = {}) => {
  const r = await call(`/api/admin/action?e=${E}`, { body: { action, params }, admin: true });
  if (r.status !== 200) throw new Error(`${action}: ${r.data.error}`);
  return r.data.data;
};
const adminState = async () => (await call(`/api/admin/state?e=${E}`, { admin: true })).data;
function check(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg);
}

async function main() {
  console.log('BASE', BASE);
  const login = await call('/api/admin/login', { body: { password: PW } });
  check(login.status === 200, '관리자 로그인');
  check((await call('/api/admin/login', { body: { password: 'wrong' } })).status === 401, '잘못된 관리자 비밀번호 거부');
  await admin('demo.generate');
  const names = (await call(`/api/names?e=${E}`)).data;
  check(names.participants.length === 18, `가상 참석자 18명 생성 (${names.participants.length})`);

  // 18명 동시 입장
  const codeOf = (n) => String(1001 + ['김영수', '이정희', '박민호', '최순자', '정대현', '강미경', '조성훈', '윤재석', '장혜진', '임동욱', '한상철', '오세영', '서경민', '신미란', '권태호', '황인규', '안병철', '송지은'].indexOf(n));
  const bad = await call(`/api/join?e=${E}`, { body: { participantId: names.participants[0].id, code: '0000' } });
  check(bad.status === 401, '틀린 입장 코드 거부');
  const people = await Promise.all(names.participants.map(async (p) => {
    const r = await call(`/api/join?e=${E}`, { body: { participantId: p.id, code: codeOf(p.name) } });
    return { ...p, token: r.data.token };
  }));
  check(people.every((p) => p.token), '18명 동시 입장 성공');

  // 각자 상태 조회 (휴대폰 18대가 1초마다 확인하는 부하)
  let polling = true;
  const pollers = people.map(async (p) => {
    while (polling) {
      await call(`/api/state?e=${E}`, { token: p.token });
      await sleep(900 + Math.random() * 300);
    }
  });
  const st0 = (await call(`/api/state?e=${E}`, { token: people[0].token })).data;
  for (const p of people) {
    const s = (await call(`/api/state?e=${E}`, { token: p.token })).data;
    p.me = s.me;
  }
  check(people.filter((p) => p.me.isLeader).length === 3, '조장 3명 지정됨');
  check(st0.teamMembers.length === 6, '대기실 조원 명단 6명');

  const state = async (p) => (await call(`/api/state?e=${E}`, { token: p.token })).data;
  const answerAll = async (fn) => {
    const rs = await Promise.all(people.map(async (p) => {
      const v = fn(p);
      if (v === null) return null;
      const s = await state(p);
      return call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: s.round.id, kind: v.kind ?? 'answer', value: v.value } });
    }));
    return rs.filter(Boolean);
  };
  const waitCountdown = () => sleep(3700);

  // ---------------- T01 골든벨 3문제
  console.log('\n[T01 골든벨]');
  await admin('game.config', { gameType: 'T01', rounds: 3 });
  await admin('game.select', { gameType: 'T01' });
  const perRound = [];
  for (let i = 0; i < 3; i++) {
    await admin('round.next');
    const pre = await state(people[0]);
    check(!JSON.stringify(pre.round).includes('"answer"'), `${i + 1}번: 결과 공개 전 정답 비노출`);
    const early = await call(`/api/respond?e=${E}`, { token: people[0].token, body: { roundId: pre.round.id, value: { choice: 0 } } });
    check(early.status === 400, `${i + 1}번: 카운트다운 중 응답 거부`);
    await waitCountdown();
    const ast = await adminState();
    const ans = Number(ast.round.question.answer);
    const rs = await answerAll((p) => ({ value: { choice: people.indexOf(p) % 3 === 0 ? (ans + 1) % 4 : ans } }));
    check(rs.every((r) => r.status === 200), `${i + 1}번: 18명 동시 응답 (${rs.filter((r) => r.status === 200).length}/18)`);
    const dup = await call(`/api/respond?e=${E}`, { token: people[1].token, body: { roundId: pre.round.id, value: { choice: ans } } });
    check(dup.status === 409, `${i + 1}번: 중복 응답 차단`);
    await admin('round.reveal');
    const after = await state(people[1]);
    check(after.round.result.answer === ans && after.round.result.correctCount === 12, `${i + 1}번: 정답 공개·정답자 12명`);
    perRound.push(Object.fromEntries(after.round.result.teams.map((t) => [t.teamId, t.points])));
    check(after.round.result.teams.every((t) => t.points === t.correct * 100), `${i + 1}번: 조별 점수 = 정답자 × 100`);
  }
  const expected = (rounds) => (tid) => rounds.reduce((s, r) => s + (r[tid] ?? 0), 0);
  let ast = await adminState();
  const t01 = ast.rankings.team.map((t) => t.byGame.T01);
  check(ast.rankings.team.every((t) => t.byGame.T01 === expected(perRound)(t.id)), `골든벨 누적 = 라운드 합계 (${t01.join('/')})`);
  // 재진행 시 중복 지급 방지
  await admin('round.redo');
  await waitCountdown();
  const ans3 = Number((await adminState()).round.question.answer);
  await answerAll((p) => ({ value: { choice: ans3 } }));
  await admin('round.reveal');
  ast = await adminState();
  perRound[2] = Object.fromEntries(ast.teams.map((t) => [t.id, 600]));
  check(ast.rankings.team.every((t) => t.byGame.T01 === expected(perRound)(t.id)), `라운드 재진행 후 중복 지급 없음 (${ast.rankings.team.map((t) => t.byGame.T01).join('/')})`);
  const r = await call(`/api/admin/action?e=${E}`, { body: { action: 'round.next' }, admin: true });
  check(r.status === 400, '설정 라운드 수 초과 시 다음 문제 차단');
  await admin('game.end');

  // ---------------- T02 이심전심 1라운드
  console.log('\n[T02 이심전심]');
  await admin('game.config', { gameType: 'T02', rounds: 1 });
  await admin('game.select', { gameType: 'T02' });
  await admin('round.next');
  await waitCountdown();
  const teams = ast.teams.map((t) => t.id);
  // 1조 6명 A, 2조 4:2, 3조 3:3
  const cnt = {};
  await answerAll((p) => {
    const ti = teams.indexOf(p.me.teamId);
    cnt[ti] = (cnt[ti] ?? 0) + 1;
    const k = cnt[ti];
    const choice = ti === 0 ? 0 : ti === 1 ? (k <= 4 ? 0 : 1) : (k <= 3 ? 0 : 1);
    return { value: { choice } };
  });
  await admin('round.reveal');
  const t02 = (await adminState()).round.result.teams.map((t) => t.points);
  check(JSON.stringify(t02) === JSON.stringify([600, 200, 0]), `이심전심 600/200/0 (${t02.join('/')})`);
  await admin('game.end');

  // ---------------- T03 얼마일까요 (조장만)
  console.log('\n[T03 얼마일까요]');
  await admin('game.config', { gameType: 'T03', rounds: 1 });
  await admin('game.select', { gameType: 'T03' });
  await admin('round.next');
  await waitCountdown();
  const a3 = Number((await adminState()).round.question.answer);
  const nonLeader = people.find((p) => !p.me.isLeader);
  const nl = await call(`/api/respond?e=${E}`, { token: nonLeader.token, body: { roundId: (await state(nonLeader)).round.id, value: { number: 1 } } });
  check(nl.status === 400, '조원(비조장) 대표답안 제출 차단');
  const leaders = people.filter((p) => p.me.isLeader).sort((a, b) => teams.indexOf(a.me.teamId) - teams.indexOf(b.me.teamId));
  await Promise.all(leaders.map(async (p, i) => call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: (await state(p)).round.id, value: { number: [a3 + 1, a3 - 1, a3 + 10][i] } } })));
  await admin('round.reveal');
  const t03 = (await adminState()).round.result.teams.map((t) => t.points);
  check(JSON.stringify(t03) === JSON.stringify([500, 500, 200]), `얼마일까요 동률 평균 500/500/200 (${t03.join('/')})`);
  await admin('game.end');

  // ---------------- T04 최후의 역전
  console.log('\n[T04 최후의 역전]');
  ast = await adminState();
  const before = ast.rankings.team.reduce((m, t) => ({ ...m, [t.id]: t.total }), {});
  await admin('game.select', { gameType: 'T04' });
  await admin('round.next');
  const b0 = await state(leaders[0]);
  check(b0.round.status === 'betting' && !b0.round.payload.prompt, '베팅 단계: 문제 비공개');
  const bets = [500, 99999, 0];
  await Promise.all(leaders.map((p, i) => call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: b0.round.id, kind: 'bet', value: { bet: bets[i] } } })));
  const other = await state(leaders[1]);
  check(other.round.teamBet && other.round.teamBet.bet === before[teams[1]], `베팅 한도 = 보유 점수 (${other.round.teamBet?.bet})`);
  await admin('round.open');
  await waitCountdown();
  const a4 = Number((await adminState()).round.question.answer);
  await Promise.all(leaders.map(async (p, i) => call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: b0.round.id, value: { choice: i === 0 ? a4 : (a4 + 1) % 4 } } })));
  await admin('round.reveal');
  ast = await adminState();
  const d0 = ast.rankings.team.find((t) => t.id === teams[0]).total - before[teams[0]];
  const d1 = ast.rankings.team.find((t) => t.id === teams[1]).total - before[teams[1]];
  check(d0 === 500 && d1 === -before[teams[1]], `최후의 역전 정답 +500 / 오답 -전액 (${d0}/${d1})`);
  await admin('game.end');

  // ---------------- P01 밸런스
  console.log('\n[P01 밸런스]');
  await admin('game.config', { gameType: 'P01', rounds: 1 });
  await admin('game.select', { gameType: 'P01' });
  await admin('round.next');
  await waitCountdown();
  await answerAll((p) => (people.indexOf(p) === 17 ? null : { value: { choice: people.indexOf(p) < 10 ? 0 : 1 } }));
  await admin('round.reveal');
  const p01 = (await adminState()).round.result;
  check(p01.a === 10 && p01.b === 7, `밸런스 A10/B7, 미응답 1 (${p01.a}/${p01.b})`);
  await admin('game.end');

  // ---------------- P02 유일한 숫자 (무효 → 재진행)
  console.log('\n[P02 유일한 숫자]');
  await admin('game.config', { gameType: 'P02', rounds: 1 });
  await admin('game.select', { gameType: 'P02' });
  await admin('round.next');
  await waitCountdown();
  await answerAll((p) => ({ value: { number: 1 + (people.indexOf(p) % 9) } })); // 모두 중복
  await admin('round.reveal');
  check((await adminState()).round.isVoid, '유일한 숫자 없음 → 무효 처리');
  await admin('round.next');
  await waitCountdown();
  await answerAll((p) => ({ value: { number: people.indexOf(p) < 3 ? [2, 4, 7][people.indexOf(p)] : 10 + (people.indexOf(p) % 2) } }));
  await admin('round.reveal');
  const p02 = (await adminState()).round.result.placements.map((x) => x.number);
  check(JSON.stringify(p02) === '[2,4,7]', `유일한 숫자 1~3위 = 2,4,7 (${p02})`);
  await admin('game.end');

  // ---------------- P03 10초의 감각
  console.log('\n[P03 10초의 감각]');
  await admin('game.config', { gameType: 'P03', rounds: 1 });
  await admin('game.select', { gameType: 'P03' });
  await admin('round.next');
  await waitCountdown();
  await Promise.all(people.map(async (p, i) => {
    const s = await state(p);
    await call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: s.round.id, kind: 'start', value: {} } });
    const t0 = Date.now();
    await sleep(9200 + i * 90);
    const ms = i === 17 ? null : Date.now() - t0;
    return call(`/api/respond?e=${E}`, { token: p.token, body: { roundId: s.round.id, value: ms === null ? { invalid: true, reason: 'hidden' } : { ms } } });
  }));
  await admin('round.reveal');
  ast = await adminState();
  const p03 = ast.round.result.attempts;
  check(p03.filter((a) => a.ms !== null).length === 17 && p03.some((a) => a.status === 'hidden'), '10초: 17명 유효 + 화면이탈 1명 무효');
  const p03pts = ast.rankings.individual.filter((x) => x.byGame.P03).map((x) => x.byGame.P03).sort((a, b) => b - a);
  check(p03pts[0] === 1000 && p03pts[1] === 800, `10초 1위 1000 / 2위 800 (${p03pts.slice(0, 6).join(',')})`);
  await admin('game.end');

  // ---------------- P04 빙고
  console.log('\n[P04 빙고]');
  await admin('game.select', { gameType: 'P04' });
  let bingo;
  for (let i = 0; i < 30; i++) {
    await admin('bingo.draw');
    bingo = (await adminState()).bingo;
    if (bingo.pending.length) break;
  }
  const nums = new Set(bingo.drawn);
  check(nums.size === bingo.drawn.length, `빙고 번호 중복 없음 (${bingo.drawn.length}개 추첨)`);
  check(bingo.pending.length > 0, `빙고 우승자 발생 (${bingo.pending.map((w) => w.name).join(',')})`);
  const pb = await state(people[0]);
  check(pb.bingo.board.length === 9 && new Set(pb.bingo.board).size === 9, '개인 빙고판 9칸 중복 없음');
  await admin('bingo.confirm', { mode: 'all' });
  await admin('game.end');

  // ---------------- P05 홀인원
  console.log('\n[P05 홀인원]');
  await admin('game.select', { gameType: 'P05' });
  const holes = await Promise.all(people.map(async (p) => (await state(p)).hole.myHole));
  check(new Set(holes).size === 18 && Math.min(...holes) === 1 && Math.max(...holes) === 18, '홀 번호 1~18 중복 없이 배정');
  for (let i = 0; i < 3; i++) await admin('hole.draw');
  const h = (await adminState()).hole;
  check(new Set(h.draws.map((d) => d.participantId)).size === 3, '홀인원 3회 추첨 · 중복 당첨 없음');
  await admin('game.end');

  // ---------------- 순위 공개 / 시상식
  console.log('\n[순위·시상]');
  await admin('ranking.show', { kind: 'individual' });
  const rk = await state(people[0]);
  check(rk.session.overlay === 'ranking_individual' && rk.rankings.individual.length === 18, '개인 순위 공개 18명');
  await admin('winner.autoRankings');
  await admin('ceremony.start');
  for (let i = 0; i < 5; i++) await admin('ceremony.step', { dir: 1 });
  const cer = await state(people[0]);
  check(cer.session.overlayData.step === 5, '시상식 단계 진행');
  await admin('overlay.close');

  // ---------------- 중복 로그인
  console.log('\n[보안]');
  const again = await call(`/api/join?e=${E}`, { body: { participantId: people[0].id, code: codeOf(people[0].name) } });
  const old = await call(`/api/state?e=${E}`, { token: people[0].token });
  check(old.data.kicked === true, '다른 기기 재입장 시 기존 기기 접속 종료');
  people[0].token = again.data.token;
  const noAdmin = await call(`/api/admin/state?e=${E}`);
  check(noAdmin.status === 401, '관리자 API 비로그인 차단');
  const csv = await fetch(`${BASE}/api/admin/export?e=${E}`, { headers: { cookie } });
  const text = await csv.text();
  check(csv.status === 200 && text.includes('[개인 순위]'), 'CSV 다운로드');

  polling = false;
  await Promise.all(pollers);
  const lat = stats.lat.sort((a, b) => a - b);
  console.log(`\n요청 ${stats.requests}건 · 서버 오류 ${stats.errors}건 · 응답시간 p50 ${lat[Math.floor(lat.length * 0.5)]}ms / p95 ${lat[Math.floor(lat.length * 0.95)]}ms / max ${lat[lat.length - 1]}ms`);
  console.log(failures.length ? `\n실패 ${failures.length}건:\n- ${failures.join('\n- ')}` : '\n모든 검증 통과');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
