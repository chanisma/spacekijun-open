/**
 * 코인 경제 관리(2026-10-21) 회귀 — `npx tsx --tsconfig tsconfig.app.json scripts/coin-economy-test/run.mts`
 *
 * 이 부류는 틀려도 오류가 없다: 시드에 없는 키는 서버에서 예외지만 화면은 조용히 옛 숫자를 그리고,
 * 화면 기본값이 시드와 어긋나면 «150코인» 이라 말하면서 200 을 뺀다. 그래서
 *   ① 시드 ↔ 코드 기본값 ② 서버가 읽는 키 ⊂ 시드 ③ 숫자가 함수 본문에 되살아나지 않았는가
 *   ④ 동기화가 상수를 실제로 바꾸고 되돌리는가 ⑤ 관리 화면 판정 ⑥ 배선(루트·관리자 탭) 을 검사한다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyCoinEconomy } from '../../src/lib/coinEconomy';
import { applySettingEdit, filterWallets, groupSettings, historyKindLabel, moveReason, pageButtons, summarizeEconomy, paginate, settingChanges, sortWallets, summarizeWallets, DEFAULT_WALLET_FILTER, type CoinWallet } from '../../src/lib/coinEconomyAdmin';
import type { CoinEconomySetting } from '../../src/lib/coinEconomy';
import '../../src/features/tamagotchi/model/economySync';
import '../../src/features/academy/game/economySync';
import '../../src/features/star-tower/model/economySync';
import * as credit from '../../src/features/tamagotchi/model/credit';
import { GACHA_MACHINES } from '../../src/features/tamagotchi/model/gachaMachines';
import { SLOT_PRICES, slotPriceOf } from '../../src/features/tamagotchi/model/petSlots';
import { ACHIEVEMENTS, REPEAT_ACHIEVEMENTS, parseAchievements, repeatRows } from '../../src/features/tamagotchi/model/achievements';
import { DECOR_PRICES } from '../../src/features/tamagotchi/services/decorService';
import * as social from '../../src/features/tamagotchi/services/socialService';
import { workshopEconomy } from '../../src/features/academy/game/workshopModel';
import * as study from '../../src/features/academy/game/studyService';
import { academyRewards } from '../../src/features/academy/game/economySync';
import { STAR_COIN, starSaleMax } from '../../src/features/star-tower/model/catalog';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) pass++; else { fail++; console.log('✗', name, detail ?? ''); }
}

const MIG = read('supabase/migrations/20261021100000_coin_economy_admin.sql');
// 2026-10-21 얻기 넓히기(플래너·요즘 세상·면접 준비·다마고찌 반복 업적) — 시드가 두 파일에 있다
const MIG3 = read('supabase/migrations/20261021120000_coin_earn_more.sql');
// 2026-10-26 수익화(의뢰 작품 수익) — 시드 둘 + 뽑기 함수 치환
const MIG4 = read('supabase/migrations/20261026160000_tama_gacha_royalty.sql');

// ── 시드 파싱 ──
const seedBlock = MIG.slice(MIG.indexOf('insert into public.coin_economy_setting('), MIG.indexOf('create or replace function economy_private.num'))
  + MIG3.slice(MIG3.indexOf('insert into public.coin_economy_setting('), MIG3.indexOf('alter table public.wallet_ledger'))
  + MIG4.slice(MIG4.indexOf('insert into public.coin_economy_setting('), MIG4.indexOf('-- ── 3) 원장 kind'));
const seed = new Map<string, { app: string; direction: string; value: number; def: number; min: number; max: number }>();
for (const m of seedBlock.matchAll(/\('([a-z0-9_.-]+)', '([a-z0-9-]+)', '(earn|spend|limit)', '(?:[^']|'')*', '(?:[^']|'')*', '[^']*', (-?\d+), (-?\d+), (-?\d+), (-?\d+), \d+\)/g)) {
  seed.set(m[1], { app: m[2], direction: m[3], value: +m[4], def: +m[5], min: +m[6], max: +m[7] });
}
const sv = (k: string) => seed.get(k)?.def;

// ① 시드 ↔ 코드 기본값 (모듈을 처음 불러온 상태 = 아직 적용 전)
check('시드 71개(54 + 15 + 수익 2)', seed.size === 71, seed.size);
check('시드: value = default · 범위 안', [...seed.values()].every((s) => s.value === s.def && s.def >= s.min && s.def <= s.max));
for (const k of credit.CREDIT_KINDS) {
  check(`펫 ${k} 금액·횟수 = 시드`, credit.CREDIT_RULES[k].amount === sv(`tama.${k}.amount`) && credit.CREDIT_RULES[k].cap === sv(`tama.${k}.cap`));
}
check('플래너 «오늘 완료» = 시드', credit.PLANNING_REWARD === sv('academy.planning_reward'));
for (const m of GACHA_MACHINES) check(`가챠 ${m.id} = 시드`, m.price === sv(`tama.gacha.${m.id}.price`) && m.refund === sv(`tama.gacha.${m.id}.refund`));
check('펫 자리 값 = 시드', SLOT_PRICES.every((p, i) => p === sv(`tama.pet_slot.${i + 1}`)) && SLOT_PRICES.length === 3);
for (const a of ACHIEVEMENTS) check(`업적 ${a.id} = 시드`, a.reward === sv(`tama.achievement.${a.id}`));
check('꾸미기 의뢰 값 = 시드', DECOR_PRICES.device === sv('tama.decor.device') && DECOR_PRICES.shell === sv('tama.decor.shell')
  && DECOR_PRICES.wallpaper === sv('tama.decor.wallpaper') && DECOR_PRICES.rug === sv('tama.decor.rug')
  && DECOR_PRICES.floor === sv('tama.decor.other') && DECOR_PRICES.shelf === sv('tama.decor.other') && DECOR_PRICES.wall === sv('tama.decor.other'));
check('캐릭터 의뢰 = 시드', social.CHARACTER_PRICE === sv('tama.character_order'));
check('공방 = 시드', workshopEconomy.orderCost === sv('academy.workshop_order_cost') && workshopEconomy.salePrice === sv('academy.workshop_sale_price') && workshopEconomy.commission === sv('academy.workshop_commission'));
check('장 완료 = 시드', academyRewards.chapter === sv('academy.chapter_reward'));
check('자습 = 시드', study.STUDY_REWARD === sv('study.attendance_reward') && study.STUDY_DAILY_CAP === sv('study.daily_receipts'));
check('별 조각 = 시드', STAR_COIN.rate === sv('tower.star_rate') && STAR_COIN.dailyCap === sv('tower.star_daily_cap'));

// ② 서버가 읽는 키 ⊂ 시드
const literalKeys = [...(MIG + MIG3).matchAll(/economy_private\.num\('([a-z0-9_.-]+)'\)/g)].map((m) => m[1]);
const missing = literalKeys.filter((k) => !seed.has(k));
check('num(문자 키) 가 모두 시드에', missing.length === 0, missing);
const dynamic = [
  ...['plan', 'reflect', 'focus', 'diary'].flatMap((k) => [`tama.${k}.amount`, `tama.${k}.cap`]),
  ...['all', 'character', 'device', 'shell', 'deco'].flatMap((m) => [`tama.gacha.${m}.price`, `tama.gacha.${m}.refund`]),
  ...[1, 2, 3].map((i) => `tama.pet_slot.${i}`),
  ...ACHIEVEMENTS.map((a) => `tama.achievement.${a.id}`),
  ...['device', 'shell', 'wallpaper', 'rug', 'other'].map((s) => `tama.decor.${s}`),
  ...REPEAT_ACHIEVEMENTS.map((r) => `tama.repeat.${r.id}`),
  // 뽑기 함수 치환 문자열 안이라 따옴표가 두 겹('') — 문자 키 정규식에 안 걸린다
  ...[...MIG4.matchAll(/economy_private\.num\(''([a-z0-9_.-]+)''\)/g)].map((m) => m[1]),
];
check('num(조립 키) 가 모두 시드에', dynamic.every((k) => seed.has(k)), dynamic.filter((k) => !seed.has(k)));
// grant_daily(…, '금액 키', '횟수 키', …) 처럼 문자열로 넘기는 키
const passedKeys = [...new Set([...MIG3.slice(MIG3.indexOf('-- ── 3. 요즘 세상')).matchAll(/'((?:world|interview)\.[a-z_]+)'/g)].map((m) => m[1]))];
check('grant_daily 에 넘기는 키가 모두 시드에', passedKeys.length === 6 && passedKeys.every((k) => seed.has(k)), passedKeys);
const used = new Set([...literalKeys, ...dynamic, ...passedKeys]);
check('시드에 쓰이지 않는 키 없음', [...seed.keys()].every((k) => used.has(k)), [...seed.keys()].filter((k) => !used.has(k)));
check('achievement_rule 의 업적 목록 = TS', ACHIEVEMENTS.every((a) => new RegExp(`\\('${a.id}', \\d+\\)`).test(MIG)));

// ③ 숫자가 본문에 되살아나지 않았는가(이 마이그레이션이 바꾼 9개 함수 + 규칙 함수)
const body = MIG.slice(MIG.indexOf('-- ── 3. 규칙 함수'), MIG.indexOf('-- ── 5. 관리자 RPC'));
for (const [re, why] of [
  [/coins\s*=\s*coins\s*\+\s*5\b/, '플래너 +5'], [/coins=coins-100/, '공방 -100'], [/n\*5/, '자습 청구 n*5'],
  [/apply\(new\.student_id, 5,/, '출석 +5'], [/apply\(new\.student_id, -5,/, '출석 회수 -5'], [/apply\(new\.student_id, 1,/, '피드백 +1'],
  [/price constant integer := 150/, '캐릭터 150'], [/then 300 when/, '꾸미기 값'], [/price:=35;/, '진열 35'], [/coins=coins\+10,/, '수수료 +10'],
  [/'confirm_cost' is distinct from '100'/, '공방 확인값 100'], [/rn <= 2-/, '자습 하루 2'],
] as const) check(`숫자 되살아남 없음: ${why}`, !re.test(body));
check('규칙 함수가 STABLE', (body.match(/language sql stable/g) ?? []).length === 7);
check('출석 회수 = 영수증 값', /returning amount into amt;\n\s*perform wallet_private\.apply\(new\.student_id, -coalesce\(amt, 0\)/.test(body));
check('가챠 환급 ≤ 값 을 서버가 검사', /refund'\) > economy_private\.num\('tama\.gacha\.' \|\| m \|\| '\.price'\)/.test(MIG));
check('숫자 못 박은 제약을 범위로', ['academy_workshop_orders_charged_coins_check', 'academy_workshop_commissions_amount_check', 'academy_study_rewards_amount_check',
  'academy_chapter_rewards_amount_check', 'academy_custom_fixed_price', 'tama_credit_ledger_amount_check'].every((c) => MIG.includes(`drop constraint ${c};`)));
check('관리자 RPC 6종 anon·PUBLIC 회수', /revoke all on function %s from public, anon/.test(MIG) && (MIG.match(/'public\.admin_[a-z_]+\(/g) ?? []).length === 6);
check('원장 kind 에 admin_grant·admin_revoke', /'admin_grant', 'admin_revoke'\]/.test(MIG));
for (const k of ['tama_royalty', 'admin_grant', 'admin_revoke', 'seaton_attendance', 'tower_star_sale', 'isekai3d_coin', 'tama_achievement', 'workshop_order', 'gacha'])
  check(`기록 이름표 ${k}`, historyKindLabel(k) !== k);

// ④ 동기화 — 값을 바꾸면 상수가 바뀌고, 빈 묶음이면 기본값으로 돌아온다
applyCoinEconomy({
  'tama.plan.amount': 3, 'tama.focus.cap': 4, 'academy.planning_reward': 7, 'tama.gacha.all.price': 33, 'tama.gacha.all.refund': 9,
  'tama.pet_slot.2': 155, 'tama.achievement.week': 21, 'tama.decor.other': 111, 'tama.character_order': 160,
  'academy.workshop_order_cost': 120, 'academy.chapter_reward': 60, 'study.attendance_reward': 6, 'study.daily_receipts': 3,
  'tower.star_rate': 3, 'tower.star_daily_cap': 12,
});
check('적용: 펫 금액·횟수', credit.CREDIT_RULES.plan.amount === 3 && credit.CREDIT_RULES.focus.cap === 4);
check('적용: 하루 최대 다시 계산', credit.DAILY_PET_MAX === 3 * 2 + 2 * 1 + 2 * 4 + 2 * 1);
check('적용: 플래너', credit.PLANNING_REWARD === 7);
check('적용: 가챠', GACHA_MACHINES[0].price === 33 && GACHA_MACHINES[0].refund === 9);
check('적용: 펫 자리', slotPriceOf(1) === 155 && slotPriceOf(0) === 100);
check('적용: 업적', ACHIEVEMENTS.find((a) => a.id === 'week')!.reward === 21);
check('적용: 꾸미기 other → 바닥·선반·벽', DECOR_PRICES.floor === 111 && DECOR_PRICES.wall === 111 && DECOR_PRICES.rug === sv('tama.decor.rug'));
check('적용: 캐릭터(live binding)', social.CHARACTER_PRICE === 160);
check('적용: 아카데미', workshopEconomy.orderCost === 120 && academyRewards.chapter === 60 && study.STUDY_REWARD === 6 && study.STUDY_DAILY_CAP === 3);
check('적용: 별 조각 + 판매 상한 계산', STAR_COIN.rate === 3 && STAR_COIN.dailyCap === 12 && starSaleMax(100, 0) === 4);
applyCoinEconomy({});
check('빈 설정 = 기본값으로 되돌림', credit.CREDIT_RULES.plan.amount === 2 && GACHA_MACHINES[0].price === sv('tama.gacha.all.price')
  && social.CHARACTER_PRICE === 150 && workshopEconomy.orderCost === 100 && STAR_COIN.rate === 2 && study.STUDY_DAILY_CAP === 2 && credit.DAILY_PET_MAX === 12);

// ⑤ 관리 화면 판정
const S = (key: string, value: number, extra: Partial<CoinEconomySetting> = {}): CoinEconomySetting => ({
  key, app: 'tamagotchi', direction: 'spend', label: key, note: '', unit: '코인', value, default_value: value, min_value: 0, max_value: 1000, sort: 0,
  updated_at: '', updated_by: null, ...extra,
});
const ss = [S('tama.gacha.all.price', 30), S('tama.gacha.all.refund', 8), S('x.earn', 5, { direction: 'earn', app: 'study' })];
check('변경 없음', Object.keys(settingChanges(ss, {}).changes).length === 0);
check('같은 값은 변경 아님', Object.keys(settingChanges(ss, { 'x.earn': '5' }).changes).length === 0);
check('정수 아님 → 문제', !!settingChanges(ss, { 'x.earn': '2.5' }).problems['x.earn'] && !!settingChanges(ss, { 'x.earn': '' }).problems['x.earn']);
check('범위 밖 → 문제', !!settingChanges(ss, { 'x.earn': '1001' }).problems['x.earn']);
check('환급 > 값 → 문제', !!settingChanges(ss, { 'tama.gacha.all.refund': '31' }).problems['tama.gacha.all.refund']);
check('값을 내려 환급보다 작아져도 → 문제', !!settingChanges(ss, { 'tama.gacha.all.price': '5' }).problems['tama.gacha.all.refund']);
check('정상 변경', settingChanges(ss, { 'x.earn': '7', 'tama.gacha.all.refund': '30' }).changes['x.earn'] === 7);
check('묶음: 앱·방향 순서', groupSettings(ss).map((g) => `${g.app}/${g.direction}`).join() === 'study/earn,tamagotchi/spend');
const W = (p: Partial<CoinWallet>): CoinWallet => ({ user_id: Math.random().toString(), name: '가', email: null, role: 'student', grade: '1', class: '2', number: '3', status: 'active', coins: 10, updated_at: null, ...p });
const ws = [W({ coins: 10 }), W({ coins: 30 }), W({ coins: null }), W({ coins: 20, status: 'graduated' }), W({ role: 'teacher', coins: 500, grade: null })];
check('기본 거르기 = 재학생', filterWallets(ws, DEFAULT_WALLET_FILTER).length === 3);
check('요약: 지갑 없음은 중앙값에서 뺀다', (() => { const s = summarizeWallets(filterWallets(ws, DEFAULT_WALLET_FILTER)); return s.withWallet === 2 && s.median === 20 && s.total === 40; })());
check('교직원 거르기', filterWallets(ws, { ...DEFAULT_WALLET_FILTER, role: 'faculty' }).length === 1);
check('학번 검색', filterWallets(ws, { ...DEFAULT_WALLET_FILTER, search: '10203' }).length === 3);

// ⑤-1 사용한 코인(2026-10-21 «사용한 총 코인 개수»)
const sw = [W({ name: '가', coins: 50, spent: 10 }), W({ name: '나', coins: 10, spent: 300 }), W({ name: '다', coins: 90 })];
const rw = [W({ name: '가', updated_at: '2026-10-20T09:00:00+09:00' }), W({ name: '나', updated_at: null, coins: null }), W({ name: '다', updated_at: '2026-10-23T08:00:00+09:00' })];
check('정렬: 최근 변동 순(지갑 없음은 맨 끝)', sortWallets(rw, 'recent').map((r) => r.name).join() === '다,가,나');
// ⑤-3 수익화 · 경제 통계(2026-10-26)
check('수익 키 둘을 뽑기가 읽는다', ['tama.royalty.percent', 'tama.royalty.max'].every((k) => MIG4.includes(`economy_private.num(''${k}'')`)) && sv('tama.royalty.percent') === 50 && sv('tama.royalty.max') === 30);
check('수익 = 남이 값을 내고 뽑았을 때만', MIG4.includes('maker is not null and maker <> u and price > 0'));
check('수익 원장 = 뽑기 기록 id 로 멱등', MIG4.includes(`''gacha:'' || log_id`) && MIG4.includes('returning id into log_id'));
check('원장 kind 에 tama_royalty', /'tower_achievement', 'tama_royalty'\]\)\)/.test(MIG4));
check('치환은 자리가 정확히 한 번일 때만', MIG4.includes('if hits <> 1 then raise exception'));
{
  const e = summarizeEconomy({ started: 21600, earned: 16678, spent: 12587, revoked: 115, circulating: 26976 });
  check('통계: 발행 = 시작 + 획득', e.issued === 38278);
  check('통계: 기대 잔액 = 발행 − 사용 − 회수, 차이 = 시중 − 기대', e.expected === 25576 && e.unexplained === 1400);
  check('통계: 사용 비율', e.spendRate === 33 && summarizeEconomy({ started: 0, earned: 0, spent: 0, revoked: 0, circulating: 0 }).spendRate === null);
}

// ⑤-2 최근 획득 순 · 사유(2026-10-26) — 변동 시각(updated_at)이 아니라 «얻은» 시각으로. 얻은 적 없으면 맨 끝
const mv = (at: string, kind: string, note = '') => ({ at, amount: 5, kind, note });
const ew = [
  W({ name: '가', updated_at: '2026-10-26T10:00:00+09:00', last_earned: mv('2026-10-20T09:00:00+09:00', 'seaton_attendance') }),
  W({ name: '나', updated_at: '2026-10-21T10:00:00+09:00', last_earned: mv('2026-10-21T09:00:00+09:00', 'admin_grant', '대회 상') }),
  W({ name: '다', updated_at: '2026-10-26T11:00:00+09:00' }),
];
check('정렬: 최근 획득 순(쓴 것만 최근이면 뒤로 · 얻은 적 없으면 맨 끝)', sortWallets(ew, 'earned_recent').map((r) => r.name).join() === '나,가,다');
check('사유: 메모가 이름표를 되풀이하면 메모만', moveReason({ kind: 'seaton_attendance', note: '자습실 출석 2026-10-26' }) === '자습실 출석 2026-10-26');
check('사유: 다른 메모는 «이름표 · 메모»', moveReason({ kind: 'admin_grant', note: '대회 상' }) === '관리자 부여 · 대회 상');
check('사유: 메모가 없으면 이름표', moveReason({ kind: 'tama_plan', note: '' }) === '펫: 계획 세우기');
check('정렬: 많이 쓴 순(사용 없음은 0)', sortWallets(sw, 'spent_desc').map((r) => r.name).join() === '나,가,다');
check('요약: 쓴 코인 합·쓴 사람 수', (() => { const s = summarizeWallets(sw); return s.spentTotal === 310 && s.spenders === 2; })());
const SPENT = read('supabase/migrations/20261021110000_coin_wallets_spent.sql');
check('쓴 코인: 회수(출석 취소·관리자)는 사용이 아니다', /kind not in \('seaton_attendance_reversal', 'admin_revoke'\)/.test(SPENT));
check('쓴 코인: 낸 값 − 돌려받은 값(가챠·의뢰 셋)', (SPENT.match(/charged_coins - o\.refunded_coins > 0/g) ?? []).length === 3 && SPENT.includes('g.price - g.refund > 0'));
check('쓴 코인: 표와 기록 창이 같은 판정(spend_rows)', /from economy_private\.spend_rows\(null\)/.test(SPENT) && /economy_private\.spend_rows\(p_user\)/.test(SPENT));
check('쓴 코인: 관리자 0원 자리는 빼고 근사 표시', SPENT.includes('not tama_private.user_is_admin(w.owner)') && (SPENT.match(/, true\n/g) ?? []).length === 2);
for (const k of ['workshop_purchase', 'shop_purchase', 'pet_slot']) check(`기록 이름표 ${k}`, historyKindLabel(k) !== k);

// ⑤-3 가챠 값 고치기(2026-10-21 «가챠 가격 수정이 안 된다» — 값을 환급보다 낮추면 저장이 막히고 이유가 다른 줄에만 떴다)
{
  const G = [S('tama.gacha.all.price', 30), S('tama.gacha.all.refund', 8), S('tama.gacha.character.price', 120), S('tama.gacha.character.refund', 30)];
  const a = applySettingEdit(G, {}, 'tama.gacha.all.price', '4');
  check('값을 환급보다 낮추면 환급을 비율대로 함께 낮춘다', a.adjusted?.value === 1 && a.draft['tama.gacha.all.refund'] === '1' && Object.keys(settingChanges(G, a.draft).problems).length === 0);
  const b = applySettingEdit(G, {}, 'tama.gacha.character.price', '20');
  check('캐릭터 120→20 이면 환급 30→5', b.adjusted?.value === 5 && Object.keys(settingChanges(G, b.draft).problems).length === 0);
  check('값을 올리면 환급은 그대로', applySettingEdit(G, {}, 'tama.gacha.all.price', '40').adjusted === null);
  check('원래 값으로 되돌리면 그 칸은 바뀐 것 아님', !('tama.gacha.all.price' in applySettingEdit(G, { 'tama.gacha.all.price': '40' }, 'tama.gacha.all.price', '30').draft));
  check('입력 중(빈칸·숫자 아님)은 건드리지 않는다', applySettingEdit(G, {}, 'tama.gacha.all.price', '').adjusted === null);
  const adminSrc = read('src/components/admin/CoinEconomyAdmin.tsx');
  check('저장이 막히면 이유를 도구줄에 이름과 함께', adminSrc.includes('저장할 수 없어요 — ') && adminSrc.includes('applySettingEdit(settings, draft, s.key, v)'));
  // 2026-10-21 «저장이 안 됨»(가챠 값 · 이세계 하루 동전 횟수) — 서버는 정상인데 요청이 0건이었다. 크롬 «추가 대화상자 차단» 뒤엔
  // window.confirm 이 창 없이 곧바로 «취소»라 단추가 죽은 것처럼 보인다 → 확인은 화면 안 상자
  check('확인창(window.confirm) 호출 없음', !/window\.confirm\(/.test(adminSrc));
  check('저장·부여 확인은 화면 안 상자', adminSrc.includes('data-coin-confirm') && adminSrc.includes('data-grant-confirm') && adminSrc.includes('onClick={() => setConfirming(true)}'));
}

// ⑤-4 반복 업적 · 얻기 넓히기
{
  const d = parseAchievements({ progress: {}, claimed: [], deaths: [], rewards: { first_egg: 9 }, repeat: { diary: { progress: 17, step: 7, claimed: 1, reward: 5 }, focus: { progress: 4, step: 5, claimed: 0, reward: 5 }, heal: { progress: 30, step: 10, claimed: 0, reward: 0 } } });
  const rr = repeatRows(d);
  const by = (id: string) => rr.find((r) => r.id === id)!;
  check('반복: 17/7 · 1번 받음 → 1단계 받을 수 있음', by('diary').ready === 1);
  check('반복: 4/5 → 아직, 진행 4/5', by('focus').ready === 0 && by('focus').inStep === 4);
  check('반복: 보상 0 이면 받기 없음', by('heal').ready === 0);
  check('반복: 서버 값 없으면 0 진행', by('plan').progress === 0 && by('plan').step === 10);
  check('업적 보상은 서버 값(관리자 설정)이 이긴다', d.rewards.first_egg === 9);
  check('반복 단계 SQL = TS', REPEAT_ACHIEVEMENTS.every((r) => MIG3.includes(`('${r.id}', ${r.step})`)));
  const rp = MIG3.slice(MIG3.indexOf('function tama_private.repeat_progress'), MIG3.indexOf('function tama_private.repeat_claimed'));
  check('반복: 진행도는 줄지 않는 값만(펫 행의 날 수 안 씀)', rp.includes('count(distinct earned_on) from public.tama_credit_ledger') && !rp.includes('tama_pet'));
  // 2026-10-28 — 일기는 원본 표 행 수를 세서 1글자 일기 반복으로 악용됐다 → 하루 상한이 걸린 원장으로
  const MIG_DIARY = read('supabase/migrations/20261028100000_tama_repeat_diary_credit.sql');
  const rp2 = MIG_DIARY.slice(MIG_DIARY.indexOf('function tama_private.repeat_progress'), MIG_DIARY.indexOf('function public.tama_repeat_claim'));
  check('반복: 일기는 보상 원장(하루 상한)으로 센다 — tama_diary 행 수 금지', rp2.includes("tama_credit_ledger where user_id = p_user and kind = 'diary'") && !rp2.includes('tama_diary'));
  check('반복: 남은 진행 문구는 음수가 아니다', MIG_DIARY.includes('greatest(have - done * step, 0)'));
  {
    const over = repeatRows(parseAchievements({ progress: {}, claimed: [], deaths: [], repeat: { diary: { progress: 3, step: 7, claimed: 119, reward: 20 } } })).find((r) => r.id === 'diary')!;
    check('반복: 진행도 < 받은 단계면 받기 없음 · 진행 0', over.ready === 0 && over.inStep === 0);
  }
  check('트리거는 저장을 막지 않는다(경고만)', (MIG3.match(/exception when others then\s+raise warning/g) ?? []).length === 2);
  check('요즘 세상: 질문 10자 · 돌아보기 20자', MIG3.includes("btrim(coalesce(new.question, ''))) >= 10") && MIG3.includes("btrim(coalesce(new.reflection, ''))) >= 20"));
  check('면접: ready 로 바뀐 순간만 · 질문마다', MIG3.includes("new.status = 'ready' and old.status is distinct from 'ready'") && MIG3.includes("new.question_id::text"));
  check('한 번 = 출처 유일 키 · 하루 상한은 원장 셈', MIG3.includes('source_id = p_source) then return 0') && MIG3.includes('earned_on = today) >= economy_private.num(p_cap_key)'));
  check('플래너: 미리 세운(전날까지) · 한 주 N일', MIG3.includes("(t.created_at at time zone 'Asia/Seoul')::date < t.task_date") && MIG3.includes("= economy_private.num('planner.week_days')"));
  for (const k of ['tama_repeat', 'planner_ahead', 'planner_week', 'world_inquiry', 'world_reflection', 'interview_answer']) check(`기록 이름표 ${k}`, historyKindLabel(k) !== k);
  check('요즘 세상·면접 화면이 설정 값으로 안내', read('src/features/world-today/components/WorldStoryDialog.tsx').includes("coin('world.inquiry_reward', 2)") && read('src/features/interview-prep/components/AnswerComposer.tsx').includes("coin('interview.answer_reward', 3)"));
  check('플래너 화면엔 코인 숫자를 띄우지 않는다(«플래너는 플래너로» 결정)', !/코인/.test(read('src/features/academy/game/BookWeek.tsx') + read('src/features/planner/PlannerPage.tsx')));
}

// ⑤-2 쪽 나누기
const hundred = Array.from({ length: 120 }, (_, i) => i + 1);
const p1 = paginate(hundred, 1, 50), p3 = paginate(hundred, 3, 50);
check('쪽: 첫 쪽 1–50 / 3쪽', p1.items.length === 50 && p1.from === 1 && p1.to === 50 && p1.pages === 3);
check('쪽: 마지막 쪽 101–120', p3.items.length === 20 && p3.from === 101 && p3.to === 120);
check('쪽: 범위 밖은 끝으로 당김(거르기로 줄어든 목록)', paginate(hundred, 9, 50).page === 3 && paginate(hundred.slice(0, 10), 3, 50).page === 1);
check('쪽: 0·음수·NaN 은 1쪽', paginate(hundred, 0, 50).page === 1 && paginate(hundred, Number.NaN, 50).page === 1);
check('쪽: 빈 목록 = 1쪽 0–0', (() => { const e = paginate([], 1, 50); return e.pages === 1 && e.from === 0 && e.to === 0 && e.items.length === 0; })());
check('쪽 단추: 적으면 전부', pageButtons(1, 3).join() === '1,2,3');
check('쪽 단추: 많으면 처음·끝·주변 + …', pageButtons(6, 13).map((n) => n ?? '…').join() === '1,…,4,5,6,7,8,…,13');
check('쪽 단추: 앞쪽', pageButtons(1, 13).map((n) => n ?? '…').join() === '1,2,3,…,13');

// ⑥ 배선
const admin = read('src/pages/Admin.tsx');
check('관리자 탭 등록', /case 'coins':\s*\n\s*return <CoinEconomyAdmin \/>/.test(admin) && read('src/components/admin/layout/AdminSidebar.tsx').includes('value: "coins"'));
for (const [f, sync] of [
  ['src/features/tamagotchi/TamagotchiPage.tsx', './model/economySync'],
  ['src/features/academy/AcademyPage.tsx', './game/economySync'],
  ['src/features/star-tower/StarTowerPage.tsx', './model/economySync'],
] as const) {
  const s = read(f);
  check(`루트가 설정을 읽는다: ${f}`, s.includes('useCoinEconomy();') && s.includes(`import '${sync}'`));
}
for (const f of ['ChapterScene', 'DormChapterScene', 'LibraryChapterScene', 'PostChapterScene', 'ReadingChapterScene', 'SkyChapterScene'])
  check(`장 보상 문구가 설정을 따른다: ${f}`, !read(`src/features/academy/game/${f}.tsx`).includes('50코인'));
check('공방 문구에 100 박힘 없음', !read('src/features/academy/game/GameWorkshop.tsx').includes('100코인'));
check('자습 문구에 5 박힘 없음', !/5코인|\* 5\b/.test(read('src/features/academy/game/GameStudyLedger.tsx')));

console.log(`\n코인 경제 회귀: ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
