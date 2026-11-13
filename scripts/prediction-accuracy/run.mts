/**
 * AI 성적예측 사후 검증 — 예측이 실제로 맞았는가.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/prediction-accuracy/run.mts
 *   (키를 인자로 주지 않아도 .env / .env.local 에서 읽는다)
 *   --csv <dir>  학생 단위 원자료를 CSV 로 함께 떨군다
 *
 * ## 무엇을 재는가
 *
 * `ml/out/grade_predictions.json` 은 **2026-07-02** 에 만들어진 고정 스냅샷이다. 그 시점에
 * 존재하지 않았던 두 가지가 지금은 실측으로 존재하므로, 둘 다 **진짜 사후 검증**이 된다.
 *
 *   A. **9월 모의고사** — 예측: `key_exam_flow` 의 9월 칸(`assumption='june_carryover'`,
 *      6월 값을 그대로 이월). 실측: 9월은 공식 성적 발표 전이라 **EBS 예상 등급컷 기반 참고 등급**
 *      (`mock_grade_cut` source='EBS' + 마킹 → 원점수 → 등급).
 *   B. **3학년 1학기 내신** — 예측: `predictions[semester='3-1'].grades`. 실측:
 *      `academic_development` 의 category='regular' 행을 교과군별 이수단위 가중평균.
 *
 * ## 왜 이 두 개만인가
 *
 * 6월 모의고사는 검증 대상이 **아니다**. 생성 시점에 6월 실측이 이미 DB 에 있어서
 * `build_key_exam_flow` 가 `june_actual` 을 채웠고(라이브 203명 중 193명), 예측은 6월을 못 본
 * 10명에게만 만들어졌다. 즉 6월 칸은 대부분 "예측"이 아니라 실측이라 맞히고 말고가 없다.
 *
 * ## 판정은 앱 코드를 그대로 쓴다
 *
 * 참고 등급은 `gradeMarkingSubject` → `computeRawScore` → `computeReferenceGrade` 를 그대로
 * 부른다. 검증용으로 채점을 새로 짜면 "화면에 보이는 등급"이 아니라 "이 스크립트만의 등급"과
 * 비교하게 되고, 그 차이가 곧 예측 오차로 둔갑한다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { gradeMarkingSubject } from '../../src/features/evalearn/utils/mockGrading';
import {
  computeRawScore,
  computeReferenceGrade,
  type GradeCut,
} from '../../src/features/evalearn/utils/referenceGrade';
import { resolveGrade3Split } from '../../src/features/evalearn/utils/grade3SubjectTrack';
import { toDbSubject } from '../../src/features/evalearn/utils/subjectAlias';

const ROOT = resolve(import.meta.dirname, '../..');

// ── 환경 ──────────────────────────────────────────────────────────────────
function readEnvFile(file: string): Record<string, string> {
  const path = join(ROOT, file);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env } as Record<string, string>;
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ VITE_SUPABASE_URL(.env) 과 SUPABASE_SERVICE_ROLE_KEY(.env.local) 가 필요합니다.');
  console.error('  student_basic_info 는 RLS 로 교사/admin 세션에만 열려 있어 anon 키로는 0행이 옵니다.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const csvArgIdx = process.argv.indexOf('--csv');
const CSV_DIR = csvArgIdx >= 0 ? process.argv[csvArgIdx + 1] : null;

// ── 통계 ──────────────────────────────────────────────────────────────────
/**
 * 등급/백분위 오차 묶음. 부호는 **예측 − 실측**이고 등급은 낮을수록 좋으므로,
 * bias > 0 = 예측이 실제보다 **나쁘게**(등급 숫자 크게) 봤다 = 비관, bias < 0 = 낙관.
 */
interface ErrStat {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  exact: number;   // |오차| < 0.5 (등급 한 칸 안)
  within1: number; // |오차| <= 1
  within2: number;
}
function stat(pairs: { pred: number; actual: number }[]): ErrStat {
  const n = pairs.length;
  if (n === 0) return { n: 0, mae: NaN, rmse: NaN, bias: NaN, exact: NaN, within1: NaN, within2: NaN };
  let ae = 0, se = 0, b = 0, ex = 0, w1 = 0, w2 = 0;
  for (const { pred, actual } of pairs) {
    const d = pred - actual;
    ae += Math.abs(d); se += d * d; b += d;
    if (Math.abs(d) < 0.5) ex++;
    if (Math.abs(d) <= 1) w1++;
    if (Math.abs(d) <= 2) w2++;
  }
  return { n, mae: ae / n, rmse: Math.sqrt(se / n), bias: b / n, exact: ex / n, within1: w1 / n, within2: w2 / n };
}
function corr(pairs: { pred: number; actual: number }[]): number {
  const n = pairs.length;
  if (n < 3) return NaN;
  const mx = pairs.reduce((s, p) => s + p.pred, 0) / n;
  const my = pairs.reduce((s, p) => s + p.actual, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    const dx = p.pred - mx, dy = p.actual - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
/**
 * MAE 의 95% 구간. **학생 단위로 흔든다** — 한 학생이 교과군 5~6칸을 만드는데 칸 단위로
 * 재표집하면 같은 학생의 칸들이 서로 독립인 척하게 되어 구간이 실제보다 좁아진다.
 * (모델 학습 쪽에서 검증 분할을 학생 단위로 바꾼 것과 같은 이유다.)
 */
function bootMaeCI(rows: { id: string; err: number }[], iters = 2000): [number, number] {
  const byStudent = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byStudent.get(r.id);
    if (arr) arr.push(r.err); else byStudent.set(r.id, [r.err]);
  }
  const ids = [...byStudent.keys()];
  if (ids.length < 5) return [NaN, NaN];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const boots: number[] = [];
  for (let b = 0; b < iters; b++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < ids.length; i++) {
      for (const x of byStudent.get(ids[Math.floor(rnd() * ids.length)])!) { sum += x; cnt++; }
    }
    if (cnt) boots.push(sum / cnt);
  }
  boots.sort((a, b) => a - b);
  return [boots[Math.floor(boots.length * 0.025)], boots[Math.floor(boots.length * 0.975)]];
}

/**
 * 두 예측의 차이(a − b)를 **같은 학생에서 짝지어** 흔든다. 표본이 갈리면 "누가 더 나은가"가
 * 아니라 "누구를 맞혔는가"를 재게 되므로, 맞대결은 반드시 짝지은 구간으로 판정한다.
 */
function bootPairedCI(rows: { id: string; a: number; b: number }[], iters = 2000) {
  const byStudent = new Map<string, { a: number; b: number }[]>();
  for (const r of rows) {
    const arr = byStudent.get(r.id);
    if (arr) arr.push(r); else byStudent.set(r.id, [r]);
  }
  const ids = [...byStudent.keys()];
  if (ids.length < 5) return null;
  const meanDiff = (sel: string[]) => {
    let sa = 0, sb = 0, c = 0;
    for (const id of sel) for (const x of byStudent.get(id)!) { sa += x.a; sb += x.b; c++; }
    return c ? (sa - sb) / c : NaN;
  };
  const point = meanDiff(ids);
  let seed = 6789;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const boots: number[] = [];
  for (let b = 0; b < iters; b++) {
    boots.push(meanDiff(Array.from({ length: ids.length }, () => ids[Math.floor(rnd() * ids.length)])));
  }
  boots.sort((x, y) => x - y);
  return { point, lo: boots[Math.floor(boots.length * 0.025)], hi: boots[Math.floor(boots.length * 0.975)] };
}

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');

/** [라벨, 통계, 상관, MAE 95% 구간?] — 구간은 학생 단위 부트스트랩(`bootMaeCI`). */
type StatRow = [string, ErrStat, number?, [number, number]?];

function printStatTable(title: string, rows: StatRow[]) {
  // 구간을 가진 행이 하나라도 있으면 열을 만든다(구간 없는 표는 종전 폭 그대로 둔다)
  const withCI = rows.some((r) => r[3] !== undefined && Number.isFinite(r[3]![0]));
  const ciTop = withCI ? '┬──────────────────' : '';
  const ciMid = withCI ? '┼──────────────────' : '';
  const ciBot = withCI ? '┴──────────────────' : '';
  console.log(`\n  ${title}`);
  console.log('  ┌────────────┬─────┬───────┬───────┬────────┬────────┬────────┬───────' + ciTop + '┐');
  console.log('  │ 구분       │   n │  MAE  │ RMSE  │  편향  │ 정확   │ ±1이내 │  상관 '
    + (withCI ? '│  MAE 95% 구간    ' : '') + '│');
  console.log('  ├────────────┼─────┼───────┼───────┼────────┼────────┼────────┼───────' + ciMid + '┤');
  for (const [label, s, r, ci] of rows) {
    const ciCell = withCI
      ? '│ ' + (ci !== undefined && Number.isFinite(ci[0]) ? `[${f(ci[0])}, ${f(ci[1])}]` : '—').padStart(16) + ' '
      : '';
    console.log(
      `  │ ${label.padEnd(10)} │ ${String(s.n).padStart(3)} │ ${f(s.mae).padStart(5)} │ ${f(s.rmse).padStart(5)} │ ` +
      `${(s.bias >= 0 ? '+' : '') + f(s.bias)}`.padStart(7) +
      ` │ ${pct(s.exact).padStart(6)} │ ${pct(s.within1).padStart(6)} │ ${(r == null ? '—' : f(r)).padStart(5)} ` + ciCell + '│'
    );
  }
  console.log('  └────────────┴─────┴───────┴───────┴────────┴────────┴────────┴───────' + ciBot + '┘');
}

// ── 백분위 → 등급 ──────────────────────────────────────────────────────────
/**
 * 수능 9등급의 정의(누적 4·11·23·40·60·77·89·96%)를 백분위로 뒤집은 표 = "그 등급의 최소 백분위".
 * EBS 가 이번 회차 컷에 붙여 표기한 백분위(96·89·77·61·40·23·11·4)와 4등급 한 칸만 1 차이인데,
 * 그건 실제 컷 점수의 백분위라 반올림이 섞인 값이다. 여기서는 정의 쪽을 쓴다.
 */
const PCT_GRADE_MIN = [96, 89, 77, 60, 40, 23, 11, 4];
function gradeFromPercentile(p: number): number {
  for (let g = 1; g <= 8; g++) if (p >= PCT_GRADE_MIN[g - 1]) return g;
  return 9;
}

// ── 예측 스냅샷 ────────────────────────────────────────────────────────────
interface KeyExamValues { korean_pct?: number | null; math_pct?: number | null; english_grade?: number | null }
interface Prediction {
  id: string; name: string; grade: number; class_num: number | null; grade_system: number;
  current_grades: Record<string, Record<string, unknown>>;
  predictions: { semester: string; grades: Record<string, { grade: number; lo?: number; hi?: number } | null>; raw_prediction?: Record<string, { grade: number } | null> }[];
  key_exam_flow?: { months: { month: number; actual?: KeyExamValues | null; predicted?: KeyExamValues | null; assumption?: string }[] } | null;
}
// --snapshot 으로 과거 스냅샷을 지정할 수 있다 — 재생성하면 3-1 예측이 실측으로 바뀌어
// 사라지므로, 그때의 예측을 다시 채점하려면 보관본을 가리켜야 한다.
//   npx tsx scripts/prediction-accuracy/run.mts --snapshot ml/out/snapshots/grade_predictions_2026-07-02.json
const snapArgIdx = process.argv.indexOf('--snapshot');
const SNAPSHOT = snapArgIdx >= 0 ? process.argv[snapArgIdx + 1] : 'ml/out/grade_predictions.json';
const predFile = JSON.parse(readFileSync(join(ROOT, SNAPSHOT), 'utf8'));
const predictions: Prediction[] = predFile.students;
const predById = new Map(predictions.filter((p) => p.grade === 3).map((p) => [p.id, p]));
const predById2 = new Map(predictions.filter((p) => p.grade === 2).map((p) => [p.id, p]));

// ── DB ────────────────────────────────────────────────────────────────────
interface MarkingSubject { answers?: (number | null)[]; correct?: (boolean | null)[]; item_count?: number }
interface MarkingEntry { academic_year: number; exam_month: number; exam_grade: number; subjects: Record<string, MarkingSubject> }
interface ResultEntry { academic_year: number; exam_month: number; exam_grade: number; subjects: Record<string, { grade?: number | null; percentile?: number | null }> }
interface AcademicRow { grade: number | string; semester: number | string; category: string; subject_group: string; rank: number | null; units: number | null }
interface StudentRow {
  id: string; name: string; class_num: number | null; grade?: number | string;
  academic_development: AcademicRow[] | null;
  mock_result: ResultEntry[] | null;
  mock_marking: MarkingEntry[] | null;
}

console.log('AI 성적예측 사후 검증');
console.log('═'.repeat(78));
console.log(`스냅샷 파일 : ${SNAPSHOT}`);
console.log(`예측 스냅샷 : ${predFile.generated_at}  (v${predFile.version}, ${predFile.model_info.type})`);
console.log(`학습 표본   : ${predFile.model_info.training_samples}건 · 졸업생 ${predFile.model_info.graduates_used}명 · val RMSE ${predFile.model_info.val_rmse}(정규화 척도)`);

/*
  2·3학년을 함께 읽는다. 3학년(9등급제)만 채점하면 **5등급제 방향은 영원히 미검증**으로 남는데,
  2026-07 스냅샷에는 2학년의 2-1 예측이 들어 있고 그 실측이 이제 나왔다 — 같은 방식으로
  채점할 수 있는 유일한 5등급제 사례다.
*/
const { data: studentsRaw, error: sErr } = await supabase
  .from('student_basic_info')
  .select('id, name, class_num, grade, academic_development, mock_result, mock_marking')
  .in('grade', [2, 3]);
if (sErr) throw sErr;
const allStudents = (studentsRaw ?? []) as unknown as StudentRow[];
const students = allStudents.filter((x) => Number(x.grade) === 3);
const students2 = allStudents.filter((x) => Number(x.grade) === 2);
console.log(`검증 대상   : 현 3학년 ${students.length}명 (예측 보유 ${predById.size}명)`
  + ` · 현 2학년 ${students2.length}명 (예측 보유 ${predById2.size}명)`);

// ══════════════════════════════════════════════════════════════════════════
// A. 9월 모의고사 — 예측(6월 이월) vs 실측(EBS 참고 등급)
// ══════════════════════════════════════════════════════════════════════════
const YEAR = 2026, MONTH = 9, EGRADE = 3;

const { data: problemRows, error: pErr } = await supabase
  .from('mock_problems')
  .select('subject, major_category, problem_number, point, answer')
  .eq('year', YEAR).eq('month', MONTH).eq('student_grade', EGRADE);
if (pErr) throw pErr;

const { data: cutRows, error: cErr } = await supabase
  .from('mock_grade_cut')
  .select('subject, source, max_score, cuts, is_absolute, national_mean, national_sd, collected_at')
  .eq('academic_year', YEAR).eq('exam_month', MONTH).eq('exam_grade', EGRADE);
if (cErr) throw cErr;

const cuts = new Map<string, GradeCut>(
  (cutRows ?? []).map((r: Record<string, unknown>) => [
    r.subject as string,
    {
      subject: r.subject as string,
      source: r.source as 'EBS' | 'official',
      maxScore: r.max_score as number,
      cuts: r.cuts as Record<string, number>,
      isAbsolute: r.is_absolute as boolean,
      nationalMean: r.national_mean == null ? null : Number(r.national_mean),
      nationalSd: r.national_sd == null ? null : Number(r.national_sd),
    },
  ])
);
const cutCollected = (cutRows ?? []).map((r: Record<string, unknown>) => r.collected_at).sort().at(-1);

/**
 * `referenceGradeService.buildSubjectProblems` 와 같은 규칙.
 * 3학년 국어·수학은 공통(독서/문학, 수학Ⅰ/Ⅱ)과 선택을 합쳐야 한 과목 100점이 된다.
 */
function subjectProblems(dbSubject: string) {
  const map = new Map<number, { point: number | null; answer: string | null }>();
  const split = resolveGrade3Split(EGRADE, YEAR, dbSubject);
  for (const r of (problemRows ?? []) as Record<string, unknown>[]) {
    const isElective = r.subject === dbSubject;
    const isCommon =
      split != null && r.subject === '공통' && r.major_category != null &&
      split.commonMajorCategories.includes(r.major_category as string);
    if (!isElective && !isCommon) continue;
    map.set(r.problem_number as number, { point: r.point as number | null, answer: r.answer as string | null });
  }
  return map;
}
const problemCache = new Map<string, ReturnType<typeof subjectProblems>>();
const problemsFor = (s: string) => {
  const hit = problemCache.get(s);
  if (hit) return hit;
  const built = subjectProblems(s);
  problemCache.set(s, built);
  return built;
};

const KOREAN_ELECTIVES = new Set(['화법과작문', '언어와매체']);
const MATH_ELECTIVES = new Set(['확률과통계', '미적분', '기하']);
type Core = 'korean' | 'math' | 'english';
function coreOf(markingSubject: string): Core | null {
  const db = toDbSubject(markingSubject);
  if (db === '국어' || KOREAN_ELECTIVES.has(db)) return 'korean';
  if (db === '수학' || MATH_ELECTIVES.has(db)) return 'math';
  if (db === '영어') return 'english';
  return null;
}

interface SepRow {
  id: string; name: string; class_num: number | null;
  core: Core; subject: string;
  predPct: number | null;       // 예측 백분위 (국·수)
  predGrade: number;            // 예측 등급 (국·수는 백분위 변환, 영어는 그대로)
  juneOfficialGrade: number | null; // 6월 공식 등급 (변환 없이 비교하는 대조군)
  preGrade: number | null;      // 3·5월 학평 기반 대안 예측 등급
  actualGrade: number;          // 9월 EBS 참고 등급
  rawScore: number; maxScore: number;
}
const sepRows: SepRow[] = [];
let markedButNoCut = 0, noPrediction = 0, sepTakers = 0;

for (const st of students) {
  const entry = st.mock_marking?.find(
    (e) => e.academic_year === YEAR && e.exam_month === MONTH && e.exam_grade === EGRADE
  );
  if (!entry) continue;
  sepTakers++;

  const pred = predById.get(st.id);
  const flow = pred?.key_exam_flow?.months;
  const sep = flow?.find((m) => m.month === 9)?.predicted ?? null;
  const june = flow?.find((m) => m.month === 6);
  const pre35 = [3, 5].map((mo) => flow?.find((m) => m.month === mo)?.actual ?? null).filter(Boolean) as KeyExamValues[];
  if (!sep) { noPrediction++; continue; }

  // 6월 공식 등급 (mock_result) — 백분위→등급 변환을 거치지 않는 대조군
  const juneResult = st.mock_result?.find((r) => r.academic_year === 2026 && r.exam_month === 6 && r.exam_grade === 3);

  for (const markingSubject of Object.keys(entry.subjects ?? {})) {
    const core = coreOf(markingSubject);
    if (!core) continue; // 탐구·한국사는 예측 대상이 아니다

    const db = toDbSubject(markingSubject);
    const cut = cuts.get(db);
    const problems = problemsFor(db);
    if (!cut || problems.size === 0) { markedButNoCut++; continue; }

    const graded = gradeMarkingSubject(entry.subjects[markingSubject] as never, problems as never);
    const ref = computeReferenceGrade(computeRawScore(graded, problems), cut);
    if (!ref) continue; // 배점 미적재 등 — 틀린 등급보다 빈칸

    let predGrade: number | null = null, predPct: number | null = null;
    if (core === 'english') predGrade = sep.english_grade ?? null;
    else {
      predPct = (core === 'korean' ? sep.korean_pct : sep.math_pct) ?? null;
      predGrade = predPct == null ? null : gradeFromPercentile(predPct);
    }
    if (predGrade == null) continue;

    // 3·5월 학평 기반 대안(= 6월을 안 봤다면 썼을 값)
    let preGrade: number | null = null;
    if (pre35.length > 0) {
      const key = core === 'english' ? 'english_grade' : core === 'korean' ? 'korean_pct' : 'math_pct';
      const vals = pre35.map((v) => v[key as keyof KeyExamValues]).filter((v): v is number => v != null);
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        preGrade = core === 'english' ? avg : gradeFromPercentile(avg);
      }
    }

    let juneOfficialGrade: number | null = null;
    if (juneResult?.subjects) {
      for (const [k, v] of Object.entries(juneResult.subjects)) {
        if (coreOf(k) === core && v?.grade != null) { juneOfficialGrade = v.grade; break; }
      }
    }
    void june;

    sepRows.push({
      id: st.id, name: st.name, class_num: st.class_num, core, subject: db,
      predPct, predGrade, juneOfficialGrade, preGrade, actualGrade: ref.grade,
      rawScore: ref.rawScore, maxScore: ref.maxScore,
    });
  }
}

console.log(`\n${'═'.repeat(78)}`);
console.log('A. 3학년 9월 모의고사 — AI 예측 vs 실측');
console.log('═'.repeat(78));
console.log(`  예측 = key_exam_flow 9월 칸 (assumption: june_carryover — 6월 값 이월)`);
console.log(`  실측 = EBS 예상 등급컷 참고 등급 (mock_grade_cut 수집일 ${cutCollected})`);
console.log(`  9월 응시(마킹 보유) ${sepTakers}명 · 예측 없음 ${noPrediction}명 · 판정 성립 ${sepRows.length}건`);
if (markedButNoCut) console.log(`  등급컷/문항 없어 제외 ${markedButNoCut}건`);
console.log(`  ※ 국어·수학의 실측은 EBS "예상" 컷이라 계통오차가 남을 수 있다. 영어는 절대평가(90/80/70…)라`);
console.log(`     컷 추정이 개입하지 않으므로 세 영역 중 영어 수치가 가장 믿을 만하다.`);

const byCore = (c: Core) => sepRows.filter((r) => r.core === c);
const asPair = (rows: SepRow[], pick: (r: SepRow) => number | null) =>
  rows.map((r) => ({ pred: pick(r), actual: r.actualGrade })).filter((p): p is { pred: number; actual: number } => p.pred != null);

const coreLabel: Record<Core, string> = { korean: '국어', math: '수학', english: '영어' };
printStatTable('AI 예측(6월 이월) — 등급 척도', ([
  ...(['korean', 'math', 'english'] as Core[]).map((c) => {
    const p = asPair(byCore(c), (r) => r.predGrade);
    return [coreLabel[c], stat(p), corr(p)] as [string, ErrStat, number];
  }),
  (() => { const p = asPair(sepRows, (r) => r.predGrade); return ['전체', stat(p), corr(p)] as [string, ErrStat, number]; })(),
]));

printStatTable('대조군 ① 6월 공식 등급을 그대로 (백분위 변환 없음)', ([
  ...(['korean', 'math', 'english'] as Core[]).map((c) => {
    const p = asPair(byCore(c), (r) => r.juneOfficialGrade);
    return [coreLabel[c], stat(p), corr(p)] as [string, ErrStat, number];
  }),
  (() => { const p = asPair(sepRows, (r) => r.juneOfficialGrade); return ['전체', stat(p), corr(p)] as [string, ErrStat, number]; })(),
]));

printStatTable('대조군 ② 3·5월 학평 평균을 이월했다면', ([
  ...(['korean', 'math', 'english'] as Core[]).map((c) => {
    const p = asPair(byCore(c), (r) => r.preGrade);
    return [coreLabel[c], stat(p), corr(p)] as [string, ErrStat, number];
  }),
  (() => { const p = asPair(sepRows, (r) => r.preGrade); return ['전체', stat(p), corr(p)] as [string, ErrStat, number]; })(),
]));

// 오차 분포 — 평균만으로는 "어느 쪽으로 틀렸는지"가 안 보인다.
// 6월 미응시자 10명은 전이 모델이 소수점 등급을 내므로 정수 칸으로 반올림해 묶는다.
console.log('\n  오차 분포 (예측등급 − 실측등급, 양수 = 예측이 더 나쁘게 봄)');
const buckets = new Map<number, number>();
for (const r of sepRows) {
  const k = Math.round(r.predGrade - r.actualGrade);
  buckets.set(k, (buckets.get(k) ?? 0) + 1);
}
const keys = [...buckets.keys()].sort((a, b) => a - b);
for (const k of keys) {
  const n = buckets.get(k)!;
  console.log(`   ${(k > 0 ? '+' : '') + k}`.padStart(6) + ` │ ${'█'.repeat(Math.round((n / sepRows.length) * 60))} ${n} (${((n / sepRows.length) * 100).toFixed(1)}%)`);
}

// ══════════════════════════════════════════════════════════════════════════
// B. 3학년 1학기 내신 — 예측 vs 실제
// ══════════════════════════════════════════════════════════════════════════
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '국어': 'korean', '수학': 'math', '영어': 'english',
  '사회(역사/도덕포함)': 'social', '과학': 'science', '한국사': 'social',
};
const GROUPS = ['korean', 'math', 'english', 'social', 'science'] as const;
const groupLabel: Record<string, string> = { korean: '국어', math: '수학', english: '영어', social: '사회', science: '과학', overall: '전체평균' };

/** 학습 스크립트 `extract_semester_features` 와 같은 규칙: category='regular' + rank 존재 + 이수단위 가중. */
function semesterGrades(rows: AcademicRow[] | null, g: number, sem: number): Record<string, number | null> {
  const acc: Record<string, { sum: number; units: number }> = {};
  let allSum = 0, allUnits = 0;
  for (const r of rows ?? []) {
    if (r.category !== 'regular' || r.rank == null) continue;
    if (String(r.grade) !== String(g) || String(r.semester) !== String(sem)) continue;
    const key = SUBJECT_GROUP_MAP[r.subject_group];
    if (!key) continue;
    const units = r.units || 1;
    acc[key] ??= { sum: 0, units: 0 };
    acc[key].sum += r.rank * units;
    acc[key].units += units;
    allSum += r.rank * units;
    allUnits += units;
  }
  const out: Record<string, number | null> = {};
  for (const k of GROUPS) out[k] = acc[k]?.units ? acc[k].sum / acc[k].units : null;
  out.overall = allUnits > 0 ? allSum / allUnits : null;
  return out;
}

interface NaesinRow {
  id: string; name: string; class_num: number | null; key: string;
  pred: number; actual: number; prev: number | null; g2avg: number | null;
  lo?: number; hi?: number;
}

/**
 * 한 학기 내신 예측을 채점한다. 학년·척도가 달라도 **규칙은 같아야** 두 결과를 나란히 읽을 수
 * 있으므로 함수 하나로 묶는다(종전엔 3학년 3-1 만 인라인으로 있었다).
 *
 * `prevSems` 는 대조군용 직전 학기들 — 첫 번째가 persistence(직전 학기 그대로),
 * 전체가 "최근 N학기 평균" 대조군이 된다.
 */
function runNaesinSection(cfg: {
  title: string; note: string;
  targetGrade: number; targetSem: number;
  prevSems: [number, number][];
  rows: StudentRow[];
  predMap: Map<string, Prediction>;
  csvName: string;
}) {
  const semKey = `${cfg.targetGrade}-${cfg.targetSem}`;
  const out: NaesinRow[] = [];
  let noActual = 0;

  for (const st of cfg.rows) {
    const pred = cfg.predMap.get(st.id);
    const pTarget = pred?.predictions.find((x) => x.semester === semKey);
    if (!pTarget) continue;

    const actual = semesterGrades(st.academic_development, cfg.targetGrade, cfg.targetSem);
    if (actual.overall == null) { noActual++; continue; }

    const prevs = cfg.prevSems.map(([g, sm]) => semesterGrades(st.academic_development, g, sm));

    for (const key of [...GROUPS, 'overall']) {
      const a = actual[key];
      const pv = pTarget.grades?.[key]?.grade;
      if (a == null || pv == null) continue;
      const prev = prevs[0]?.[key] ?? null;
      const hist = prevs.map((x) => x[key]).filter((v): v is number => v != null);
      out.push({
        id: st.id, name: st.name, class_num: st.class_num, key,
        pred: pv, actual: a, prev,
        lo: pTarget.grades?.[key]?.lo, hi: pTarget.grades?.[key]?.hi,
        g2avg: hist.length ? hist.reduce((x, y) => x + y, 0) / hist.length : null,
      });
    }
  }

  console.log(`
${'═'.repeat(78)}`);
  console.log(cfg.title);
  console.log('═'.repeat(78));
  console.log(cfg.note);
  console.log(`  실측 ${semKey} 성적 보유 ${new Set(out.map((r) => r.id)).size}명 · 미보유 ${noActual}명 · 비교 ${out.length}건`);
  if (out.length === 0) {
    console.log('  → 채점할 짝이 없다(그 학기 예측이 없거나 실측이 아직 없다).');
    return out;
  }

  const byKey = (k: string) => out.filter((r) => r.key === k);
  const keysOrder = [...GROUPS, 'overall'];
  const mkRows = (pick: (r: NaesinRow) => number | null) =>
    keysOrder.map((k) => {
      const sel = byKey(k).filter((r) => pick(r) != null);
      const pairs = sel.map((r) => ({ pred: pick(r)!, actual: r.actual }));
      const ci = bootMaeCI(sel.map((r) => ({ id: r.id, err: Math.abs(pick(r)! - r.actual) })));
      return [groupLabel[k], stat(pairs), corr(pairs), ci] as StatRow;
    });

  printStatTable('AI 예측', mkRows((r) => r.pred));
  const prevLabel = `${cfg.prevSems[0][0]}-${cfg.prevSems[0][1]}`;
  printStatTable(`대조군 ① ${prevLabel} 성적을 그대로 (persistence)`, mkRows((r) => r.prev));
  if (cfg.prevSems.length > 1) {
    printStatTable(`대조군 ② 직전 ${cfg.prevSems.length}학기 평균`, mkRows((r) => r.g2avg));
  }

  /*
    맞대결은 **같은 학생·같은 교과**에서만 짝지어 재고, 차이에 신뢰구간을 붙인다.
    종전엔 "MAE 가 0.0% 높다(악화)" 처럼 상대비만 적어, 그 차이가 실재하는지 표본 요동인지
    화면이 말해 주지 못했다.
  */
  const h2h = out.filter((r) => r.prev != null);
  const aiH = stat(h2h.map((r) => ({ pred: r.pred, actual: r.actual })));
  const pvH = stat(h2h.map((r) => ({ pred: r.prev!, actual: r.actual })));
  const delta = bootPairedCI(h2h.map((r) => ({
    id: r.id, a: Math.abs(r.pred - r.actual), b: Math.abs(r.prev! - r.actual),
  })));
  console.log(`
  맞대결 — AI vs ${prevLabel} 이월 (${prevLabel} 성적이 있는 ${h2h.length}건)`);
  console.log(`    AI 예측       MAE ${f(aiH.mae)} · RMSE ${f(aiH.rmse)} · 편향 ${(aiH.bias >= 0 ? '+' : '') + f(aiH.bias)}`);
  console.log(`    ${prevLabel} 그대로   MAE ${f(pvH.mae)} · RMSE ${f(pvH.rmse)} · 편향 ${(pvH.bias >= 0 ? '+' : '') + f(pvH.bias)}`);
  if (delta) {
    const verdict = delta.hi < 0 ? 'AI 가 낫다' : delta.lo > 0 ? '이월이 낫다' : '차이 불명확';
    console.log(`    차이(AI − 이월) ${(delta.point >= 0 ? '+' : '') + f(delta.point, 3)} 등급`
      + `  95% [${f(delta.lo, 3)}, ${f(delta.hi, 3)}]  → ${verdict}`);
    if (delta.lo <= 0 && delta.hi >= 0) {
      console.log('      ※ 평균만 보면 "AI ≈ 직전 학기 이월"이다. 아래 분위수·임계값을 함께 볼 것 —');
      console.log('        두 분포는 교차하므로 한 통계로 우열을 말할 수 없다.');
  /*
    MAE 가 같아도 **큰 오차의 빈도**는 다를 수 있고, 학생에게는 그쪽이 훨씬 중요하다
    (1등급을 크게 빗나간 예측 하나가 0.3등급짜리 오차 셋보다 나쁘다). 실제로 두 학년 모두
    RMSE 는 AI 가 뚜렷하게 낮았는데 종전 출력은 그 사실을 말하지 못했다.
  */
  /*
    ⚠️ **한 통계만 고르면 어느 쪽이든 유리하게 말할 수 있다.** 실측(24학번 3-1)에서 두 분포는
    여러 번 교차한다 — 중앙값과 p90 은 AI 가 낫고(0.57 vs 0.73 · 1.59 vs 2.00), 1~2등급 구간의
    빈도는 이월이 낫다(24.5% vs 16.7%). MAE 는 무승부, RMSE 는 AI. 그래서 요약 한 줄 대신
    **분위수와 임계값을 함께** 낸다. 읽는 사람이 "무엇을 중요하게 볼지" 고를 수 있어야 한다.
  */
  /*
    ## 예측구간이 말한 만큼 덮는가 (컨포멀 검증)

    구간은 **덮는 비율이 명목값과 맞아야** 의미가 있다. 80% 라고 적어 놓고 60% 만 덮으면
    점추정보다 나쁘다 — 틀린 확신을 주기 때문이다. 반대로 95% 를 덮으면 너무 넓어 쓸모가 없다.
    폭도 함께 본다(덮기만 하면 "1~9등급"으로도 100% 가 된다).
  */
  const withBand = out.filter((r) => r.lo != null && r.hi != null);
  if (withBand.length >= 20) {
    const covered = withBand.filter((r) => r.actual >= r.lo! && r.actual <= r.hi!).length;
    const width = withBand.reduce((s2, r) => s2 + (r.hi! - r.lo!), 0) / withBand.length;
    console.log(`
  예측구간 검증 — ${withBand.length}칸`);
    /*
      한쪽으로만 새면 **중심이 치우친 것**(보정 코호트와 이 전이의 편향이 다르다)이고,
      양쪽이 고르게 새면 **폭이 좁은 것**(분산 과소평가)이다. 처방이 다르므로 갈라 본다.
    */
    const below = withBand.filter((r) => r.actual < r.lo!).length;
    const above = withBand.filter((r) => r.actual > r.hi!).length;
    console.log(`    실제 덮은 비율 ${pct(covered / withBand.length)} (명목 80%) · 평균 폭 ${f(width)}등급`);
    console.log(`      벗어남: 아래로 ${pct(below / withBand.length)} · 위로 ${pct(above / withBand.length)}`
      + `  (한쪽이 크면 편향, 고르면 폭 부족)`);
    for (const k of [...GROUPS, 'overall']) {
      const sel = withBand.filter((r) => r.key === k);
      if (sel.length < 10) continue;
      const cv = sel.filter((r) => r.actual >= r.lo! && r.actual <= r.hi!).length / sel.length;
      const w = sel.reduce((s2, r) => s2 + (r.hi! - r.lo!), 0) / sel.length;
      console.log(`      ${groupLabel[k].padEnd(5)} 덮음 ${pct(cv).padStart(6)} · 폭 ${f(w)}등급 (n=${sel.length})`);
    }
  }

  const quant = (v: number[], q: number) => {
    const t = [...v].sort((x, y) => x - y);
    return t[Math.min(t.length - 1, Math.floor(t.length * q))];
  };
  const aiErrs = h2h.map((r) => Math.abs(r.pred - r.actual));
  const pvErrs = h2h.map((r) => Math.abs(r.prev! - r.actual));
  console.log(`    |오차| 분위수     중앙 ${f(quant(aiErrs, 0.5))}/${f(quant(pvErrs, 0.5))}`
    + `  p75 ${f(quant(aiErrs, 0.75))}/${f(quant(pvErrs, 0.75))}`
    + `  p90 ${f(quant(aiErrs, 0.90))}/${f(quant(pvErrs, 0.90))}`
    + `  p99 ${f(quant(aiErrs, 0.99))}/${f(quant(pvErrs, 0.99))}   (AI/이월)`);
  /*
    ⚠️⚠️ **임계값을 정수에 두면 이월 쪽이 공짜로 유리해진다.** 직전 학기 등급은 정수인 경우가
    많아(교과군에 과목이 하나면 석차등급 그대로) 이월의 오차도 정수에 쌓인다 — 실측에서
    **이월 오차의 30.4% 가 정확히 1.00**, 69.0% 가 정수였다(AI 는 1.6% · 4.3%). `> 1` 은 그
    봉우리를 통째로 "1등급 이내"로 넣으므로, 같은 데이터에서 임계값만 1.5 로 옮기면 판정이
    뒤집힌다(AI 24.5% vs 이월 16.7% → AI 11.6% vs 이월 12.0%).
    그래서 **격자 위(1·2)와 격자 밖(1.5) 을 함께** 내고, 표의 `정확`·`±1이내` 열도 같은 편향을
    받는다는 사실을 아래에 적어 둔다.
  */
  const lattice = (v: number[]) => v.filter((x) => Math.abs(x - Math.round(x)) < 1e-9).length / v.length;
  console.log(`    오차가 정수인 칸    AI ${pct(lattice(aiErrs))} vs 이월 ${pct(lattice(pvErrs))}`
    + '   ← 이월이 크면 정수 임계값 비교(정확·±1이내 포함)가 이월에 유리해진다');
  for (const th of [1, 1.5, 2]) {
    const ai = h2h.filter((r) => Math.abs(r.pred - r.actual) > th).length / h2h.length;
    const pv = h2h.filter((r) => Math.abs(r.prev! - r.actual) > th).length / h2h.length;
    const d = bootPairedCI(h2h.map((r) => ({
      id: r.id,
      a: Math.abs(r.pred - r.actual) > th ? 1 : 0,
      b: Math.abs(r.prev! - r.actual) > th ? 1 : 0,
    })));
    if (!d) continue;
    const v = d.hi < 0 ? 'AI 가 덜 낸다' : d.lo > 0 ? '이월이 덜 낸다' : '차이 불명확';
    console.log(`    ${String(th).padEnd(3)}등급 초과 오차 비율 AI ${pct(ai).padStart(6)} vs 이월 ${pct(pv).padStart(6)}`
      + `  차이 ${((d.point >= 0 ? '+' : '') + pct(d.point)).padStart(7)}`
      + `  95% [${pct(d.lo)}, ${pct(d.hi)}]  → ${v}`);
  }
  }
  }
  return out;
}

const naesinRows = runNaesinSection({
  title: 'B. 3학년 1학기 내신 — AI 예측 vs 실제 (9등급제)',
  note: `  예측 = predictions["3-1"].grades (9등급 척도)
`
      + `  실측 = academic_development category='regular' 교과군별 이수단위 가중평균`,
  targetGrade: 3, targetSem: 1,
  prevSems: [[2, 2], [2, 1]],
  rows: students, predMap: predById, csvName: 'naesin-3-1.csv',
});

/*
  2학년은 **5등급제 방향의 유일한 채점 사례**다. 지금까지 "1·2학년 예측 성능은 아직 잴 수 없다"고
  적어 두었는데, 2026-07 스냅샷이 2-1 을 예측했고 그 실측이 나왔다. 척도마다 모델이 하나씩이라
  9등급제 수치를 5등급제 방향에 옮겨 읽으면 안 되므로, 이 표가 없으면 절반은 근거가 없는 셈이다.
  다만 **5등급제는 등급 폭이 넓어 MAE 가 구조적으로 작게 나온다** — 두 표의 숫자를 직접
  비교하지 말고 각자의 대조군과 견줄 것.
*/
const naesinRows2 = runNaesinSection({
  title: 'C. 2학년 1학기 내신 — AI 예측 vs 실제 (5등급제)',
  note: `  예측 = predictions["2-1"].grades (5등급 척도 — 9등급제 표와 직접 비교 금지)
`
      + `  실측 = academic_development category='regular' 교과군별 이수단위 가중평균`,
  targetGrade: 2, targetSem: 1,
  prevSems: [[1, 2], [1, 1]],
  rows: students2, predMap: predById2, csvName: 'naesin-2-1.csv',
});

// ── CSV ───────────────────────────────────────────────────────────────────
if (CSV_DIR) {
  mkdirSync(CSV_DIR, { recursive: true });
  const q = (v: unknown) => (v == null ? '' : String(v));
  writeFileSync(join(CSV_DIR, 'sept-mock.csv'),
    '﻿학번,이름,반,영역,과목,예측백분위,예측등급,6월공식등급,3·5월기반등급,실측참고등급,원점수,만점,오차\n' +
    sepRows.map((r) => [r.id, r.name, r.class_num, coreLabel[r.core], r.subject, r.predPct, r.predGrade,
      r.juneOfficialGrade, r.preGrade, r.actualGrade, r.rawScore, r.maxScore, r.predGrade - r.actualGrade].map(q).join(',')).join('\n'), 'utf8');
  const naesinCsv = (rows: NaesinRow[], prevLabel: string) =>
    '\uFEFF' + `학번,이름,반,교과,예측등급,실측등급,${prevLabel}등급,직전평균,오차` + '\n' +
    rows.map((r) => [r.id, r.name, r.class_num, groupLabel[r.key], r.pred.toFixed(2), r.actual.toFixed(2),
      r.prev?.toFixed(2), r.g2avg?.toFixed(2), (r.pred - r.actual).toFixed(2)].map(q).join(',')).join('\n');
  writeFileSync(join(CSV_DIR, 'naesin-3-1.csv'), naesinCsv(naesinRows, '2-2'), 'utf8');
  writeFileSync(join(CSV_DIR, 'naesin-2-1.csv'), naesinCsv(naesinRows2, '1-2'), 'utf8');
  console.log(`\n  CSV: sept-mock.csv · naesin-3-1.csv · naesin-2-1.csv → ${CSV_DIR}`);
}

console.log('');
