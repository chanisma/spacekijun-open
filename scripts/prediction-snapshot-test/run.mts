/**
 * 예측 스냅샷 목록(`ml/out/snapshots.json`) 정합 회귀.
 *
 *   npx tsx scripts/prediction-snapshot-test/run.mts
 *
 * ## 왜 필요한가
 * 화면은 매니페스트만 보고 선택기를 그리고, 고른 항목의 `path` 로 본체를 받는다.
 * 그래서 목록이 **실제 파일과 어긋나면 404 를 받고 예측이 비어 보인다** — 오류 화면이
 * 아니라 "예측 모델이 아직 생성되지 않았습니다"로 떨어져서, 사라진 게 아니라 원래 없던
 * 것처럼 보인다. 목록과 파일은 사람이 손으로 맞출 수 있는 종류가 아니므로 여기서 고정한다.
 *
 * 요약값(학생 수·학년 분포)도 대조한다. 선택기는 **본체를 받기 전에** 이 값으로 그려지므로,
 * 틀리면 "1학년 223명"이라고 써 놓고 눌러 보면 없는 상태가 된다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/*
  예측 산출물은 **비공개 Storage 버킷**이 정본이다(개인정보라 public/ 에 두지 않는다).
  여기서는 파이프라인이 남긴 **로컬 작업본**을 검사한다 — 목록과 파일의 정합은 로컬에서
  깨져 있으면 업로드된 것도 깨져 있기 때문이다. 파이프라인을 아직 안 돌린 클론에서는
  파일이 없으므로 **실패가 아니라 건너뛴다**.
*/
const ROOT = resolve(import.meta.dirname, '../..');
/*
  산출물은 `public/` 밖(`ml/out/`)에 있다 — public 에 두면 그 작업 트리에서 빌드하는 순간
  dist 로 복사돼 이름·학번·성적이 공개 경로로 나가기 때문이다. 매니페스트의 `path` 는
  버킷 키(`/ml/...`)라 디스크 경로와 다르므로 여기서 옮겨 적는다.
*/
const OUT = join(ROOT, 'ml', 'out');
const onDisk = (bucketKey: string) => join(OUT, bucketKey.replace(/^\/?ml\//, ''));

let passed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const manifestPath = join(OUT, 'snapshots.json');
if (!existsSync(manifestPath)) {
  console.log(['',"예측 스냅샷 목록 정합 — 로컬 산출물이 없어 건너뜁니다."].join(String.fromCharCode(10)));
  console.log('  (검사하려면 `python ml/train_grade_predictor.py` 를 먼저 돌리세요)');
  process.exit(0);
}

interface Entry {
  id: string; label: string; note?: string | null; path: string;
  generated_at: string; training_samples: number; students: number;
  students_by_grade?: Record<string, number>;
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  current: string; snapshots: Entry[];
};

ok('스냅샷이 하나 이상', manifest.snapshots?.length > 0);
ok('current 가 목록에 있다', manifest.snapshots.some((s) => s.id === manifest.current),
  `current=${manifest.current}`);

const seen = new Set<string>();
for (const entry of manifest.snapshots) {
  const tag = entry.id;
  ok(`[${tag}] id 중복 없음`, !seen.has(entry.id));
  seen.add(entry.id);
  ok(`[${tag}] label 있음`, !!entry.label);
  ok(`[${tag}] path 가 절대 경로`, entry.path?.startsWith('/'), entry.path);

  const file = onDisk(entry.path);
  const exists = existsSync(file);
  ok(`[${tag}] 파일 존재`, exists, file);
  if (!exists) continue;

  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    generated_at: string;
    model_info?: { training_samples?: number };
    students: { grade: number }[];
  };

  ok(`[${tag}] generated_at 일치`, data.generated_at === entry.generated_at,
    `목록 ${entry.generated_at} vs 파일 ${data.generated_at}`);
  ok(`[${tag}] 학생 수 일치`, data.students.length === entry.students,
    `목록 ${entry.students} vs 파일 ${data.students.length}`);
  ok(`[${tag}] 학습 표본 일치`,
    (data.model_info?.training_samples ?? 0) === entry.training_samples,
    `목록 ${entry.training_samples} vs 파일 ${data.model_info?.training_samples}`);

  const actual: Record<string, number> = {};
  for (const st of data.students) actual[String(st.grade)] = (actual[String(st.grade)] ?? 0) + 1;
  ok(`[${tag}] 학년별 인원 일치`,
    JSON.stringify(actual) === JSON.stringify(entry.students_by_grade ?? {}),
    `목록 ${JSON.stringify(entry.students_by_grade)} vs 파일 ${JSON.stringify(actual)}`);

  // 화면이 반드시 읽는 필드 — 없으면 그 스냅샷을 고른 순간 빈 화면이 된다
  ok(`[${tag}] students 배열`, Array.isArray(data.students) && data.students.length > 0);
  const sample = data.students[0] as unknown as Record<string, unknown>;
  for (const field of ['id', 'name', 'grade', 'grade_system', 'current_grades', 'predictions']) {
    ok(`[${tag}] 학생 필드 ${field}`, field in sample);
  }
}

// current 는 항상 운영 경로를 가리켜야 한다(아카이브를 current 로 잘못 적으면 재생성이 반영되지 않는다)
const cur = manifest.snapshots.find((s) => s.id === manifest.current);
ok('current 는 /ml/grade_predictions.json', cur?.path === '/ml/grade_predictions.json', cur?.path);

console.log(`\n예측 스냅샷 목록 정합 — ${passed}건 통과${failures.length ? `, ${failures.length}건 실패` : ''}`);
console.log(`  스냅샷 ${manifest.snapshots.length}건: ${manifest.snapshots.map((s) => s.id).join(', ')}`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
