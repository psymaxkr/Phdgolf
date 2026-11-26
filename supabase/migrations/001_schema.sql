-- =============================================================
-- PHD PLAY 2026 - 데이터베이스 스키마
-- Supabase SQL Editor 에서 001 → 002 순서로 실행하세요.
-- =============================================================
create extension if not exists pgcrypto;

-- 행사 (main = 실제 행사, demo = 데모 모드. 두 행사의 데이터는 완전히 분리됩니다)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  event_date date,
  is_demo boolean not null default false,
  settings jsonb not null default '{"allow_duplicate_win": false}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  color text not null default '#0B3D91'
);
create index if not exists teams_event_idx on teams(event_id);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  code text not null,
  gender text,                      -- 'F' | 'M' | null (조 자동 배정 시 성비 분산용)
  is_leader boolean not null default false,
  is_virtual boolean not null default false,
  session_token text,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);
create index if not exists participants_event_idx on participants(event_id);
create unique index if not exists participants_token_idx on participants(session_token) where session_token is not null;

-- 게임 종류 및 설정 (행사별)
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_type text not null,          -- T01..T04, P01..P05
  title text not null,
  sort_order int not null default 0,
  enabled boolean not null default true,
  status text not null default 'ready', -- ready | playing | done
  config jsonb not null default '{}'::jsonb,
  unique (event_id, game_type)
);

-- 문제은행 (모든 행사 공용)
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  game_type text not null,          -- T01 골든벨 / T02 이심전심 / T03 얼마일까요 / T04 최후의역전 / P01 밸런스
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer text,                      -- 선택형: 정답 인덱스("0"~"3"), 숫자형: 숫자
  unit text,
  image_url text,
  explanation text,
  source text,
  base_date text,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists questions_type_idx on questions(game_type, sort_order);

-- 현재 진행 상태 (행사당 1행)
create table if not exists game_sessions (
  event_id uuid primary key references events(id) on delete cascade,
  current_game text,
  phase text not null default 'lobby',   -- lobby | intro | play
  current_round_id uuid,
  overlay text,                           -- null | ranking_team | ranking_individual | ceremony
  overlay_data jsonb not null default '{}'::jsonb,
  published_rankings jsonb,
  prev_rankings jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  game_type text not null,
  round_no int not null,
  question_id uuid references questions(id) on delete set null,
  status text not null default 'open',   -- betting | open | paused | closed | revealed
  starts_at timestamptz,
  ends_at timestamptz,
  time_limit_sec int not null default 15,
  paused_remaining_ms int,
  payload jsonb not null default '{}'::jsonb,  -- 참석자에게 공개되는 문제 (정답 제외)
  result jsonb,                                -- 결과 공개 후에만 참석자에게 전달
  is_void boolean not null default false,
  created_at timestamptz not null default now(),
  revealed_at timestamptz
);
create index if not exists rounds_event_idx on rounds(event_id, game_type, round_no);

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  team_id uuid,
  scope text not null default 'individual',    -- individual | team (조장 대표 제출)
  kind text not null default 'answer',         -- answer | bet | start
  value jsonb not null,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id, kind)
);
-- 조 대표 답안은 조당 1개만 허용 (조장 중복 제출 방지)
create unique index if not exists responses_team_unique on responses(round_id, team_id, kind) where scope = 'team';
create index if not exists responses_round_idx on responses(round_id);

-- 점수 변경 이력 (모든 점수는 여기서 집계)
create table if not exists score_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  target text not null,                 -- team | individual
  team_id uuid references teams(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  game_type text not null,
  round_id uuid references rounds(id) on delete cascade,
  points numeric not null,
  reason text,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists score_logs_event_idx on score_logs(event_id);
create index if not exists score_logs_round_idx on score_logs(round_id);

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null,       -- team | ind1 | ind2 | ind3 | rps | bingo | hole | etc
  name text not null,
  quantity int not null default 1,
  photo_url text,
  sort_order int not null default 0
);

create table if not exists winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  prize_id uuid references prizes(id) on delete set null,
  category text not null,
  participant_id uuid references participants(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  note text,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists winners_event_idx on winners(event_id);

create table if not exists bingo_boards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  numbers int[] not null,
  unique (event_id, participant_id)
);

create table if not exists bingo_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  number int not null,
  draw_no int not null,
  created_at timestamptz not null default now(),
  unique (event_id, number),
  unique (event_id, draw_no)
);

create table if not exists hole_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  hole_no int not null,
  unique (event_id, participant_id),
  unique (event_id, hole_no)
);

create table if not exists hole_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  hole_no int not null,
  participant_id uuid references participants(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists admin_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 실시간 동기화 신호 테이블 (참석자는 이 테이블의 변경만 구독합니다. 민감 정보 없음)
create table if not exists sync (
  event_id uuid primary key references events(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- 순위 집계 뷰 (유일한 숫자는 900점 → 1,000점 환산)
create or replace view leaderboard with (security_invoker = true) as
  select s.event_id, 'team'::text as kind, s.team_id as id, sum(s.points) as total
    from score_logs s where s.target = 'team' group by s.event_id, s.team_id
  union all
  select s.event_id, 'individual'::text as kind, s.participant_id as id,
         sum(case when s.game_type = 'P02' and not s.is_manual then s.points * 10.0 / 9.0 else s.points end) as total
    from score_logs s where s.target = 'individual' group by s.event_id, s.participant_id;

-- =============================================================
-- 서버 함수
-- =============================================================

-- 동기화 버전 증가 (모든 변경 후 호출 → 참석자 화면 즉시 갱신)
create or replace function bump_sync(p_event uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into sync(event_id, version, updated_at) values (p_event, 1, now())
  on conflict (event_id) do update set version = sync.version + 1, updated_at = now()
  returning version into v;
  return v;
end $$;

-- 라운드 자동 점수 교체 (삭제 + 삽입을 한 트랜잭션으로 → 재진행해도 중복 지급 없음)
create or replace function replace_round_scores(p_round uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from rounds where id = p_round for update;
  delete from score_logs where round_id = p_round and is_manual = false;
  insert into score_logs(event_id, target, team_id, participant_id, game_type, round_id, points, reason, is_manual)
  select (r->>'event_id')::uuid, r->>'target', nullif(r->>'team_id','')::uuid, nullif(r->>'participant_id','')::uuid,
         r->>'game_type', p_round, (r->>'points')::numeric, r->>'reason', false
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

-- 게임 단위 자동 점수 교체 (10초의 감각 최종 점수처럼 라운드가 아닌 게임 단위 점수)
create or replace function replace_game_scores(p_event uuid, p_game text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from score_logs where event_id = p_event and game_type = p_game and round_id is null and is_manual = false;
  insert into score_logs(event_id, target, team_id, participant_id, game_type, round_id, points, reason, is_manual)
  select p_event, r->>'target', nullif(r->>'team_id','')::uuid, nullif(r->>'participant_id','')::uuid,
         p_game, null, (r->>'points')::numeric, r->>'reason', false
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

-- =============================================================
-- RLS 보안 정책
-- 모든 데이터는 서버(API, service_role 키)에서만 읽고 씁니다.
-- 브라우저(anon 키)는 sync 테이블의 버전 번호만 읽을 수 있습니다.
-- =============================================================
alter table events enable row level security;
alter table teams enable row level security;
alter table participants enable row level security;
alter table games enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table rounds enable row level security;
alter table responses enable row level security;
alter table score_logs enable row level security;
alter table prizes enable row level security;
alter table winners enable row level security;
alter table bingo_boards enable row level security;
alter table bingo_draws enable row level security;
alter table hole_assignments enable row level security;
alter table hole_draws enable row level security;
alter table admin_logs enable row level security;
alter table sync enable row level security;

drop policy if exists sync_read on sync;
create policy sync_read on sync for select using (true);

revoke all on function bump_sync(uuid) from public;
revoke all on function replace_round_scores(uuid, jsonb) from public;
revoke all on function replace_game_scores(uuid, text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function bump_sync(uuid) to service_role;
    grant execute on function replace_round_scores(uuid, jsonb) to service_role;
    grant execute on function replace_game_scores(uuid, text, jsonb) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on leaderboard from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on leaderboard from authenticated;
  end if;
end $$;

-- 실시간 구독 대상 등록
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table sync;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 기본 행사 2개 (실제 / 데모)
insert into events(slug, name, event_date, is_demo) values
  ('main', 'PHD Golf Club Year-End Party', '2026-11-27', false),
  ('demo', 'PHD PLAY 2026 데모 모드', '2026-11-27', true)
on conflict (slug) do nothing;
