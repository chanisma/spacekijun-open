/**
 * Admin «코인 경제» SSR 렌더 — 캐시를 미리 채워 실제 컴포넌트가 그려지는지 본다(관리자 로그인 없이).
 * `npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/coin-economy-test/render.mts`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EconomyStatsPanel, SettingsPanel, WalletsPanel } from '../../src/components/admin/CoinEconomyAdmin';
import type { CoinEconomySetting } from '../../src/lib/coinEconomy';

let pass = 0, fail = 0;
const check = (name: string, ok: unknown) => { if (ok) pass++; else { fail++; console.log('✗', name); } };

const migFile = (n: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase/migrations', n), 'utf8');
// 시드는 두 파일(2026-10-21 얻기 넓히기에서 15개 더) — 들어 있는 insert 줄만 읽힌다
const MIG = migFile('20261021100000_coin_economy_admin.sql') + migFile('20261021120000_coin_earn_more.sql');
const seed: CoinEconomySetting[] = [...MIG.matchAll(/\('([a-z0-9_.-]+)', '([a-z0-9-]+)', '(earn|spend|limit)', '((?:[^']|'')*)', '((?:[^']|'')*)', '([^']*)', (-?\d+), (-?\d+), (-?\d+), (-?\d+), (\d+)\)/g)]
  .map((m) => ({ key: m[1], app: m[2] as CoinEconomySetting['app'], direction: m[3] as CoinEconomySetting['direction'], label: m[4], note: m[5], unit: m[6],
    value: +m[7], default_value: +m[8], min_value: +m[9], max_value: +m[10], sort: +m[11], updated_at: '', updated_by: null }));
seed[0] = { ...seed[0], value: seed[0].value + 1 }; // 기본값과 다른 줄 하나

const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
client.setQueryData(['coin-economy-admin'], seed);
client.setQueryData(['coin-wallets-admin'], [
  { user_id: 'a', name: '김학생', email: 'user212@example.com', role: 'student', grade: '2', class: '1', number: '1', status: 'active', coins: 320, updated_at: '2026-10-20T03:00:00Z',
    spent: 417, spent_approx: false, last_spent: { at: '2026-10-18T00:03:05Z', amount: 30, kind: 'gacha', note: 'all:shell_gold' },
    last_earned: { at: '2026-10-19T00:03:05Z', amount: 50, kind: 'admin_grant', note: '대회 상' } },
  { user_id: 'b', name: '이학생', email: 'user213@example.com', role: 'student', grade: '2', class: '1', number: '2', status: 'active', coins: null, updated_at: null },
  { user_id: 'c', name: '박선생', email: 't@myschool.hs.kr', role: 'teacher', grade: null, class: null, number: null, status: null, coins: 90, updated_at: null },
]);
const wrap = (el: ReturnType<typeof h>) => renderToString(h(QueryClientProvider, { client }, el)).replace(/<!-- -->/g, '');

const s = wrap(h(SettingsPanel));
check('설정: 앱 묶음 여덟', ['자습실 · 자습 보상', '별빛 아카데미', '플래너', '다마고찌', '별까지 쌓기', '요즘 세상', '면접 준비', '이세계 3D'].every((t) => s.includes(t)));
check('설정: 얻기·쓰기·횟수 표지', s.includes('얻기') && s.includes('쓰기') && s.includes('횟수·상한'));
check('설정: 54줄 입력', (s.match(/inputMode="numeric"/g) ?? []).length === seed.length);
check('설정: 기본값과 다른 줄 표시', s.includes('기본값과 다름'));
check('설정: 처음엔 저장 꺼짐', /disabled=""[^>]*>.{0,200}저장/s.test(s) || /<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*저장<\/button>/s.test(s));

const w = wrap(h(WalletsPanel));
check('지갑: 재학생만(교사 숨김)', w.includes('김학생') && w.includes('이학생') && !w.includes('박선생'));
check('지갑: 학번', w.includes('20101'));
check('지갑: 지갑 없음 표시', w.includes('지갑 없음'));
check('지갑: 부여 패널', w.includes('코인 부여 · 회수') && w.includes('0명에게 부여'));
check('지갑: 합·중앙값', w.includes('320'));
check('사용: 열 머리·합 칸', w.includes('>사용한 코인</th>') && w.includes('사용한 코인 합') && w.includes('한 번이라도 쓴 사람 1명'));
check('사용: 줄에 합·최근 사용(사유)', w.includes('>417<') && w.includes('가챠 · all:shell_gold') && w.includes('>−30<'));
check('획득: 열 머리·최근 획득(사유)·정렬', w.includes('>최근 획득 · 사유</th>') && w.includes('관리자 부여 · 대회 상') && w.includes('>+50<') && w.includes('최근 획득 순'));
check('사용: 정렬 «많이 쓴 순»', w.includes('많이 쓴 순'));
check('지갑: 3명이면 한 쪽', w.includes('1–2 / 2명') && w.includes('aria-label="이전 쪽"') && /aria-current="page"[^>]*>1</.test(w));

// 학생 120명 → 첫 쪽 50명만, 쪽 단추 1·2·3, 결과 전체 고르기
const many = Array.from({ length: 120 }, (_, i) => ({
  user_id: `u${i}`, name: `학생${String(i).padStart(3, '0')}`, email: `25-1${String(i).padStart(4, '0')}@myschool.hs.kr`, role: 'student',
  grade: '1', class: String(1 + (i % 9)), number: String(1 + i), status: 'active', coins: 1000 - i, updated_at: null,
}));
const c2 = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
c2.setQueryData(['coin-wallets-admin'], many);
const m = renderToString(h(QueryClientProvider, { client: c2 }, h(WalletsPanel))).replace(/<!-- -->/g, '');
check('쪽: 첫 쪽 50줄만', (m.match(/ 고르기"/g) ?? []).length - 1 === 50); // 머리 체크박스(이 쪽 모두 고르기) 1개 제외
check('쪽: 코인 많은 순 첫 쪽에 1000, 51번째(950) 없음', m.includes('학생000') && m.includes('학생049') && !m.includes('학생050'));
check('쪽: 표기 1–50 / 120명', m.includes('1–50 / 120명'));
check('쪽: 단추 1·2·3', /aria-current="page"[^>]*>1</.test(m) && />2<\/button>/.test(m) && />3<\/button>/.test(m));
check('쪽: 결과 전체 고르기', m.includes('결과 120명 모두 고르기'));

// 경제 통계(2026-10-26)
const c3 = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
c3.setQueryData(['coin-economy-stats-admin'], {
  start_per_wallet: 100, wallets: 216, circulating: 26976, started: 21600, earned: 16678, spent: 12587, spent_approx: true, revoked: 115,
  royalty: 15, royalty_people: 1,
  earn_by_kind: [{ kind: 'seaton_attendance', amount: 4295, times: 859, people: 120, week: 300 }, { kind: 'tama_royalty', amount: 15, times: 1, people: 1, week: 15 }],
  spend_by_kind: [{ kind: 'gacha', amount: 9000, times: 400, people: 90, week: 800, approx: false }],
  daily: [{ day: '2026-10-26', earned: 500, spent: 300 }],
  royalty_items: [{ id: 'char_rockbear', name: '멋쟁이 락스타', slot: 'character', rarity: 'legendary', creator: '황지아', draws: 3, paid: 15 }],
});
const st = renderToString(h(QueryClientProvider, { client: c3 }, h(EconomyStatsPanel)));
check('통계: 발행·시중·사용·획득·수익·회수', ['발행된 총 코인', '>38,278<', '시중에 풀린 코인', '>26,976<', '사용된 코인', '≈12,587', '벌어들인 코인', '수익화(의뢰 작품)', '회수된 코인'].every((t) => st.includes(t)));
check('통계: 기록 밖 차이를 말한다', /\+(<!-- -->)?1,400/.test(st) && st.includes('25,576'));
check('통계: 얻은 곳·쓴 곳 이름표', st.includes('자습실 출석') && st.includes('의뢰 작품 수익') && st.includes('가챠'));
check('통계: 수익화 표', st.includes('멋쟁이 락스타') && st.includes('황지아') && st.includes('전설'));

console.log(`\n코인 경제 렌더: ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
