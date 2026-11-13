/**
 * AI 성적예측 화면 규약 회귀 — `npx tsx --tsconfig tsconfig.app.json scripts/prediction-ui-test/run.mts`
 *
 * 여기서 지키는 것은 **오류를 내지 않고 조용히 틀리거나 되돌아가는 것**들이다.
 * 렌더 검사가 아니라 소스 규약 검사인 이유 — 이 컴포넌트는 react-query·supabase·recharts에
 * 얽혀 있어 SSR 로 세우려면 그 전부를 흉내 내야 하고, 그렇게 만든 검사는 정작 규약이 아니라
 * 흉내의 정확도를 잰다. 아래 항목들은 **소스에 있으면 지켜지고 없으면 깨지는** 성질이다.
 */
import fs from 'node:fs';

const SRC = 'src/features/student-dashboard/components/analysis/GradePredictionAnalysis.tsx';
const HOOK = 'src/features/student-dashboard/hooks/useGradePrediction.ts';
const CSS = 'src/index.css';
/*
  ⚠️ 이 저장소는 Windows 체크아웃이라 파일이 **CRLF** 다. 줄바꿈이 든 앵커는 그대로는
  빗나간다(이 검사를 쓸 때 실제로 전부 -1 이 나왔다). 읽자마자 정규화하고, 앵커에는
  되도록 **한 줄짜리 표식**을 쓴다.

  그리고 **주석을 지운 뒤** 검사한다 — 이 파일은 주석이 본문만큼 많아, `검증 정보` 같은
  말이 설명 주석에 먼저 나오면 "화면에서의 순서"를 재는 검사가 조용히 뒤집힌다
  (실제로 `검증 정보`(주석)가 `분석 대상`(마크업)보다 앞이라 순서 검사가 실패했다).
*/
const norm = (t: string) => t.replace(/\r\n/g, '\n');
const stripComments = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const src = norm(fs.readFileSync(SRC, 'utf8'));
const hook = norm(fs.readFileSync(HOOK, 'utf8'));
const css = norm(fs.readFileSync(CSS, 'utf8'));
/** 주석을 걷어낸 본문 — "화면에 나오는 순서"를 재는 검사는 이쪽을 쓴다 */
const body = stripComments(src);

let ok = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok += 1; else fails.push(`${name} — expected ${w}, got ${g}`);
};

// ── ① 변화량은 백분위로만 잰다 ─────────────────────────────────────────────
/*
  표시는 `grade_exact`(등급 구간 안 위치), 변화량은 `정수 등급 − 성적표 평균등급`이던 시절
  **부호까지 반대**인 값이 나왔다(직전 1.42 · 표시 1.99인데 −0.42 향상). 두 값은 같은 자가
  아니므로 뺄 수 없다. 같은 정의(`pct` ↔ `pct_adj`)끼리만 뺀다.
*/
{
  const block = src.slice(src.indexOf('const changes: Record<string, number | null> = {}'),
                          src.indexOf('// 모의고사 예측(국·수·영 + 전체)'));
  eq('변화량 블록을 잘라 왔다', block.length > 100, true);
  eq('변화량이 등급에서 나오지 않는다', /pred\.grades\[k\]\?\.grade\b(?!_|s)/.test(block), false);
  eq('백분위를 쓴다', block.includes('pct_adj') && block.includes('.pct'), true);
  eq('한쪽이라도 없으면 만들지 않는다', block.includes('curPct != null && nextPct != null'), true);
}
/* 표시는 소수 2자리 — 1자리면 `1.99 → 2.0` 이라 제도 등급과 어긋난다 */
eq('예측 등급은 소수 2자리', src.includes("v.toFixed(isPred ? 2 : 1)"), true);
/* 정의가 다른 직전 평균등급을 예측 셀에 병기하지 않는다 */
eq('예측 셀에 직전 평균등급을 병기하지 않는다',
   src.includes('({(row.currentGrades[k] as number).toFixed(1)})'), false);

// ── ② 지표는 실제로 예측을 낸 모델의 것 ────────────────────────────────────
eq('prediction_space 로 모델을 고른다', src.includes("analysis.predictionSpace === 'pct_adj'"), true);
eq('백분위 모델 지표를 읽는다', src.includes('analysis.modelInfo.percentile'), true);
eq('백분위 포인트로 표시한다', src.includes('val_rmse_pp'), true);

// ── ③ 실패는 셋을 갈라 말한다 ──────────────────────────────────────────────
/*
  종전엔 권한·통신·파싱·미생성이 모두 "예측 모델이 아직 생성되지 않았습니다"였다.
  사용자가 할 수 있는 일이 각각 달라 엉뚱한 안내는 없는 문제를 쫓게 만든다.
*/
for (const k of ['forbidden', 'missing', 'network', 'parse']) {
  eq(`훅이 ${k} 를 구분한다`, hook.includes(`'${k}'`), true);
}
eq('훅이 오류를 삼키지 않는다(null 반환 제거)',
   hook.includes('async function downloadJson<T>(objectPath: string): Promise<T> {'), true);
eq('매니페스트만 폴백을 쓴다', hook.includes('return FALLBACK_MANIFEST;'), true);
eq('화면이 오류 종류로 분기한다', src.includes('loadError instanceof PredictionLoadError'), true);
eq('재시도 경로가 있다', src.includes('onClick={() => refetch()}'), true);

// ── ④ 접근성: 펼침은 진짜 버튼 ─────────────────────────────────────────────
/*
  `<tr onClick>` 은 키보드로 도달할 수 없고 스크린리더가 접힘 상태를 못 읽는다.
  세 표(실측 내신·예측 내신·모의고사)가 모두 같은 규약을 써야 한다.
*/
eq('aria-expanded 를 쓰는 펼침 버튼이 3개 이상',
   (src.match(/aria-expanded=\{/g) ?? []).length >= 3, true);
eq('버튼에 최소 과녁 높이', (src.match(/min-h-\[24px\]/g) ?? []).length >= 3, true);
eq('상태를 글로도 알린다', src.includes('과목 펼치기'), true);
/* 핵심 설명을 9px 로 두지 않는다 — 읽으라고 쓴 글이다 */
eq('설명 문단에 9px 가 남아 있지 않다',
   src.includes('text-[9px] text-muted-foreground leading-relaxed'), false);

// ── ⑤ 첫 화면은 상담 질문 순서 ─────────────────────────────────────────────
{
  /* 줄바꿈이 든 앵커는 CRLF·escape 처리에서 자꾸 어긋난다 — 한 줄짜리 표식을 쓴다 */
  const head = body.slice(body.indexOf('{snapshotPicker}'), body.indexOf('집단 분석 그래프'));
  eq('첫 화면 블록을 잘라 왔다', head.length > 500, true);
  const iTarget = head.indexOf('분석 대상');
  const iNext = head.indexOf('다음 예측');
  const iState = head.indexOf('자료 상태');
  const iTech = head.indexOf('검증 정보');
  eq('상담 3종이 모두 있다', iTarget > 0 && iNext > 0 && iState > 0, true);
  eq('기술 지표는 그 뒤에 온다', iTech > iState, true);
  eq('기술 지표는 서랍이다', head.includes('<details'), true);
}
/* 그래프는 접어 두되 없애지 않는다 */
eq('그래프가 서랍 안에 있다', src.includes('집단 분석 그래프'), true);
eq('그래프가 사라지지는 않았다',
   ['등급 분포', '수강 집단 보정', '등급이 감추는 것', '내신 × 모의']
     .every(t => src.includes(t)), true);

// ── ⑥ 숫자의 출처 라벨 ─────────────────────────────────────────────────────
for (const k of ['actual', 'reference', 'predicted', 'scenario', 'rule']) {
  eq(`출처 배지 ${k} 정의`, src.includes(`  ${k}: {`), true);
}
eq('배지는 색만이 아니라 글자로도 구분한다',
   /label: '공식'/.test(src) && /label: '예측'/.test(src) && /label: '가정'/.test(src), true);

// ── ⑦ 2열 전환은 본문 폭 기준 ──────────────────────────────────────────────
/*
  `xl:` 은 뷰포트 폭이라, evalearn 3-패널처럼 **화면은 넓은데 본문이 좁은** 상태에서
  표가 짓눌린다. 컨테이너 쿼리는 이 요소가 실제로 받은 폭을 본다.
*/
eq('컨테이너를 선언한다', src.includes('pred-detail-container'), true);
eq('뷰포트 브레이크포인트로 되돌아가지 않았다', src.includes('xl:grid-cols-2 gap-4 items-start'), false);
eq('CSS 가 컨테이너 쿼리를 정의한다',
   css.includes('container-type: inline-size') && css.includes('@container (min-width: 56rem)'), true);

console.log(fails.length === 0
  ? `AI 성적예측 화면 규약 — ${ok}건 통과`
  : `AI 성적예측 화면 규약 — ${ok}건 통과, ${fails.length}건 실패`);
fails.forEach(f => console.error(`  ✗ ${f}`));
if (fails.length) process.exit(1);
