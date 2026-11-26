// 게임 메타데이터 (클라이언트/서버 공용)

export type GameType = 'T01' | 'T02' | 'T03' | 'T04' | 'P01' | 'P02' | 'P03' | 'P04' | 'P05';

export type GameMeta = {
  type: GameType;
  title: string;
  kind: 'team' | 'individual' | 'lucky';
  emoji: string;
  rounds: number;
  maxRounds: number;
  timeLimit: number;
  leaderOnly?: boolean;
  usesQuestions?: boolean;
  rules: string[];
};

export const GAMES: Record<GameType, GameMeta> = {
  T01: {
    type: 'T01', title: '골프 골든벨', kind: 'team', emoji: '🔔', rounds: 10, maxRounds: 30, timeLimit: 15, usesQuestions: true,
    rules: ['골프 상식 4지선다 퀴즈입니다.', '조원 모두 각자 답을 고릅니다.', '정답자 1명당 우리 조에 100점!', '제한시간 안에 답을 골라 제출하세요.'],
  },
  T02: {
    type: 'T02', title: '이심전심', kind: 'team', emoji: '🤝', rounds: 5, maxRounds: 20, timeLimit: 15, usesQuestions: true,
    rules: ['두 가지 중 하나를 고릅니다.', '우리 조원들과 같은 답을 고를수록 높은 점수!', '6명 일치 600점 · 5명 400점 · 4명 200점', '3대3이면 0점입니다.'],
  },
  T03: {
    type: 'T03', title: '얼마일까요?', kind: 'team', emoji: '💰', rounds: 5, maxRounds: 10, timeLimit: 30, usesQuestions: true, leaderOnly: true,
    rules: ['조원들과 상의해서 숫자를 맞힙니다.', '조장님이 대표로 답을 입력합니다.', '정답에 가장 가까운 조가 1위! (600·400·200점)', '제한시간 안에 조장님이 제출하세요.'],
  },
  T04: {
    type: 'T04', title: '최후의 역전', kind: 'team', emoji: '🏆', rounds: 1, maxRounds: 3, timeLimit: 30, usesQuestions: true, leaderOnly: true,
    rules: ['문제를 보기 전에 걸 점수를 정합니다.', '조장님이 0점 ~ 보유 점수 안에서 입력합니다.', '맞히면 건 점수만큼 더하고, 틀리면 뺍니다.', '다른 조의 베팅은 결과 발표 때 공개됩니다.'],
  },
  P01: {
    type: 'P01', title: '골프 밸런스 게임', kind: 'individual', emoji: '⚖️', rounds: 5, maxRounds: 20, timeLimit: 15, usesQuestions: true,
    rules: ['A와 B 중 하나를 고릅니다.', '더 많은 사람이 고른 쪽을 고르면 200점!', '동률이면 모두 200점입니다.', '제한시간 안에 골라 주세요.'],
  },
  P02: {
    type: 'P02', title: '유일한 숫자', kind: 'individual', emoji: '🔢', rounds: 3, maxRounds: 10, timeLimit: 15,
    rules: ['1부터 20 중 숫자 하나를 고릅니다.', '다른 사람과 겹치지 않은 숫자 중', '가장 작은 숫자를 고른 사람이 1위!', '겹친 숫자는 탈락 · 1위 300 / 2위 200 / 3위 100점'],
  },
  P03: {
    type: 'P03', title: '10초의 감각', kind: 'individual', emoji: '⏱️', rounds: 3, maxRounds: 5, timeLimit: 60,
    rules: ['시작 버튼을 누르고 마음속으로 10초를 셉니다.', '10초가 됐다고 생각하면 정지!', '화면에 시간은 보이지 않습니다.', '도중에 화면을 끄거나 나가면 무효입니다.'],
  },
  P04: {
    type: 'P04', title: '행운의 골프 빙고', kind: 'lucky', emoji: '🎯', rounds: 1, maxRounds: 1, timeLimit: 0,
    rules: ['내 휴대폰에 나만의 빙고판이 있습니다.', '사회자가 번호를 뽑으면 자동으로 체크됩니다.', '가로·세로·대각선 2줄을 먼저 완성하면 우승!', '그냥 화면만 보고 계시면 됩니다.'],
  },
  P05: {
    type: 'P05', title: '행운의 홀인원', kind: 'lucky', emoji: '⛳', rounds: 1, maxRounds: 1, timeLimit: 0,
    rules: ['모두에게 홀 번호가 하나씩 배정됩니다.', '사회자가 추첨하면 골프공이 날아갑니다.', '공이 들어간 홀의 주인공이 당첨!', '여러 번 추첨할 수 있습니다.'],
  },
};

export const DEFAULT_ORDER: GameType[] = ['P01', 'T02', 'T01', 'P02', 'T03', 'P03', 'T04', 'P04', 'P05'];
export const TEAM_GAMES: GameType[] = ['T01', 'T02', 'T03', 'T04'];
export const INDIVIDUAL_GAMES: GameType[] = ['P01', 'P02', 'P03'];

export const PRIZE_CATEGORIES: Record<string, string> = {
  team: '조별 종합 우승',
  ind1: '개인 종합 1위',
  ind2: '개인 종합 2위',
  ind3: '개인 종합 3위',
  rps: '가위바위보 우승',
  bingo: '행운의 골프 빙고',
  hole: '행운의 홀인원',
  etc: '기타',
};

export const TEAM_COLORS = ['#0B3D91', '#15803D', '#C2410C'];
