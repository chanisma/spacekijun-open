/**
 * 연수 서명 벡터(획 좌표) 회귀 테스트
 *
 * 실행: npx tsx scripts/training-signature-test/run.mts
 *
 * 검증 목적
 *  1) 저장 크기가 실제로 작은가 — 이 형식을 고른 이유가 크기이므로 숫자로 못박는다
 *  2) 단순화가 모양을 지키는가 (양 끝점 보존·경로 이탈 허용오차 이내)
 *  3) DB CHECK 제약(획 수·바이트 상한·구조)과 클라이언트 생성 결과가 어긋나지 않는가
 *  4) DB에서 읽은 임의 JSONB를 렌더 전에 걸러내는가 (jsonb는 어떤 모양이든 담긴다)
 *  5) 잉크 경계 잘라내기가 인쇄 셀을 채우도록 좌표계를 다시 잡는가
 */
import {
  DEFAULT_SIMPLIFY_EPSILON,
  MAX_STROKES,
  SIGNATURE_NORMALIZED_WIDTH,
  buildSignatureStrokes,
  estimateStoredBytes,
  isSignatureStrokes,
  parseSignatureStrokes,
  signatureBounds,
  signaturePointCount,
  strokePaths,
  strokesToSvgMarkup,
  trimSignature,
  type Point,
  type SignatureStrokes,
} from '../../src/lib/signatureStrokes';
import {
  parseTrainingAssignees,
  sortAssigneesByName,
  trainingAssigneeNames,
} from '../../src/lib/trainingSignature';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/** 손글씨 비슷한 획: 사인 곡선 + 미세 떨림. 포인터 이벤트의 고밀도 표본을 흉내낸다. */
const handwritingStroke = (
  count: number,
  x0: number,
  y0: number,
  amplitude = 40,
  jitter = 0.6,
): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      x: x0 + t * 260,
      y: y0 + Math.sin(t * Math.PI * 3) * amplitude + Math.sin(i * 2.7) * jitter,
    };
  });

const CANVAS_W = 640;
const CANVAS_H = 260;

// ────────────────────────────────────────────── 1) 저장 크기
{
  // 서명 1건 = 획 4개 × 200표본 (2초쯤 그린 분량)
  const raw = [
    handwritingStroke(200, 40, 120),
    handwritingStroke(200, 60, 150, 25),
    handwritingStroke(180, 320, 110, 35),
    handwritingStroke(120, 350, 160, 15),
  ];
  const strokes = buildSignatureStrokes(raw, CANVAS_W, CANVAS_H);
  check('현실적인 서명이 생성된다', !!strokes);

  if (strokes) {
    const bytes = estimateStoredBytes(strokes);
    const points = signaturePointCount(strokes);
    console.log(
      `  [크기] 원본 700점 → 저장 ${points}점 / ${bytes}바이트 (${(bytes / 1024).toFixed(2)}KB)`,
    );
    check('저장 크기가 4KB 미만', bytes < 4096, `${bytes}바이트`);
    check('DB CHECK 상한(40,000바이트) 이내', bytes <= 40000, `${bytes}바이트`);
    check('단순화로 점 수가 절반 이하로 준다', points < 350, `${points}점`);
  }
}

// ────────────────────────────────────────────── 2) 단순화가 모양을 지키는가
{
  // 직선 위의 점들은 양 끝만 남아야 한다
  const line: Point[] = Array.from({ length: 50 }, (_, i) => ({ x: i * 10, y: 100 }));
  const strokes = buildSignatureStrokes([line], CANVAS_W, CANVAS_H, { trim: false });
  check('직선은 두 점으로 단순화', signaturePointCount(strokes!) === 2, `${signaturePointCount(strokes!)}점`);

  // 꺾인 획의 꼭짓점은 살아남아야 한다
  const corner: Point[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 50 })),
    ...Array.from({ length: 20 }, (_, i) => ({ x: 190, y: 50 + i * 10 })),
  ];
  const cornerStrokes = buildSignatureStrokes([corner], CANVAS_W, CANVAS_H, { trim: false })!;
  check('직각 꼭짓점이 보존된다', signaturePointCount(cornerStrokes) === 3, `${signaturePointCount(cornerStrokes)}점`);

  // 양 끝점은 언제나 남는다 (획의 시작·끝이 잘리면 서명이 달라 보인다)
  const wave = handwritingStroke(300, 20, 120);
  const waveStrokes = buildSignatureStrokes([wave], CANVAS_W, CANVAS_H, { trim: false })!;
  const flat = waveStrokes.s[0];
  const scale = SIGNATURE_NORMALIZED_WIDTH / CANVAS_W;
  check(
    '획 시작점 보존',
    Math.abs(flat[0] - wave[0].x * scale) <= 1,
    `${flat[0]} vs ${(wave[0].x * scale).toFixed(1)}`,
  );
  check(
    '획 끝점 보존',
    Math.abs(flat[flat.length - 2] - wave[wave.length - 1].x * scale) <= 1,
    `${flat[flat.length - 2]} vs ${(wave[wave.length - 1].x * scale).toFixed(1)}`,
  );
}

// ────────────────────────────────────────────── 3) DB 제약과의 정합
{
  // 획 상한: 300개를 넘겨도 생성 결과는 상한 이내여야 CHECK가 거부하지 않는다
  const many = Array.from({ length: MAX_STROKES + 50 }, (_, i) => [
    { x: i, y: 10 },
    { x: i + 3, y: 40 },
  ]);
  const strokes = buildSignatureStrokes(many, CANVAS_W, CANVAS_H)!;
  check('획 수가 DB 상한 이내로 잘린다', strokes.s.length <= MAX_STROKES, `${strokes.s.length}획`);

  // 구조: 좌표는 짝수 길이 평탄 배열
  check(
    '모든 획이 짝수 길이',
    strokes.s.every((s) => s.length % 2 === 0),
  );
  check(
    '좌표가 정수',
    strokes.s.every((s) => s.every((n) => Number.isInteger(n))),
  );

  // 빈 입력은 저장하지 않는다 (NOT NULL 컬럼에 빈 값이 들어가지 않게)
  check('빈 획 목록은 null', buildSignatureStrokes([], CANVAS_W, CANVAS_H) === null);
  check('점 없는 획만 있으면 null', buildSignatureStrokes([[]], CANVAS_W, CANVAS_H) === null);
  check('폭이 0이면 null', buildSignatureStrokes([handwritingStroke(10, 0, 0)], 0, CANVAS_H) === null);
}

// ────────────────────────────────────────────── 4) 읽기 검증
{
  const good = buildSignatureStrokes([handwritingStroke(60, 20, 100)], CANVAS_W, CANVAS_H)!;
  check('정상 값 통과', isSignatureStrokes(good));

  const rejects: [string, unknown][] = [
    ['null', null],
    ['문자열', 'M10 10'],
    ['버전 불일치', { v: 2, w: 10, h: 10, s: [[1, 2]] }],
    ['획 없음', { v: 1, w: 10, h: 10, s: [] }],
    ['홀수 좌표', { v: 1, w: 10, h: 10, s: [[1, 2, 3]] }],
    ['숫자 아님', { v: 1, w: 10, h: 10, s: [['a', 'b']] }],
    ['NaN 좌표', { v: 1, w: 10, h: 10, s: [[NaN, 1]] }],
    ['폭 0', { v: 1, w: 0, h: 10, s: [[1, 2]] }],
    ['s가 배열 아님', { v: 1, w: 10, h: 10, s: { 0: [1, 2] } }],
  ];
  for (const [label, value] of rejects) {
    check(`잘못된 값 거부: ${label}`, !isSignatureStrokes(value));
    check(`parse가 null 반환: ${label}`, parseSignatureStrokes(value) === null);
  }
}

// ────────────────────────────────────────────── 5) 잘라내기 + 렌더
{
  // 캔버스 구석에 작게 그린 서명. 오른쪽 끝이 캔버스 밖(400+260 > 640)으로 나가는데,
  // 모바일에서 손가락을 캔버스 밖으로 끌면 포인터 이벤트가 실제로 이런 좌표를 준다.
  const corner = buildSignatureStrokes(
    [handwritingStroke(80, 400, 30, 15)],
    CANVAS_W,
    CANVAS_H,
  )!;
  const bounds = signatureBounds(corner)!;
  check('잘라낸 뒤 좌표가 원점 근처에서 시작', bounds.minX <= 8 && bounds.minY <= 8, JSON.stringify(bounds));
  check('잘라낸 폭이 잉크 폭에 맞춰진다', corner.w < SIGNATURE_NORMALIZED_WIDTH, `w=${corner.w}`);
  check('잉크가 좌표계 안에 있다', bounds.maxX <= corner.w && bounds.maxY <= corner.h);

  // trim은 여러 번 적용해도 안정적이어야 한다(다시 서명 → 저장 → 재렌더)
  const twice = trimSignature(trimSignature(corner));
  check('trim 멱등성(폭)', twice.w === corner.w, `${twice.w} vs ${corner.w}`);

  const paths = strokePaths(corner);
  check('획 수만큼 path 생성', paths.length === corner.s.length);
  check(
    '모든 path가 M으로 시작',
    paths.every((d) => d.startsWith('M')),
  );

  // 점 하나짜리 획(톡 찍은 점)도 그려져야 한다
  const dot: SignatureStrokes = { v: 1, w: 20, h: 20, s: [[10, 10]] };
  check('단일 점 획이 path로 나온다', strokePaths(dot)[0] === 'M10 10L10 10');

  const svg = strokesToSvgMarkup(corner);
  check('SVG 마크업에 viewBox', svg.includes(`viewBox="0 0 ${corner.w} ${corner.h}"`));
  check('SVG에 path 포함', svg.includes('<path d="M'));
  check('SVG 선 끝이 둥글다(획 느낌)', svg.includes('stroke-linecap="round"'));
}

// ────────────────────────────────────────────── 6) 상수 정합
{
  check('기본 허용오차가 폭 대비 0.5% 미만', DEFAULT_SIMPLIFY_EPSILON / SIGNATURE_NORMALIZED_WIDTH < 0.005);
}

// ────────────────────────────────────────────── 7) 참석자 명단 파싱
{
  // 현행: 객체형 (라이브 연수 4건 전부 이 형태)
  const objectForm = {
    홍길동: { name: '홍길동', signature: 1 },
    김철수: { name: '김철수', signature: 0 },
  };
  const parsed = parseTrainingAssignees(objectForm);
  check('객체형 파싱', parsed.length === 2, JSON.stringify(parsed));
  check('서명 플래그 반영', parsed[0].signature === 1 && parsed[1].signature === 0);

  // 레거시: 쉼표 문자열 (meeting.meta.assignee를 문자열로 쓰는 경로가 코드에 남아 있다)
  const stringForm = parseTrainingAssignees('홍길동, 김철수 ,이영희');
  check('문자열형 파싱', stringForm.length === 3, JSON.stringify(stringForm));
  check('문자열형 공백 제거', stringForm[1].name === '김철수', stringForm[1].name);

  // 배열형(방어)
  check('배열형 파싱', parseTrainingAssignees(['홍길동', { name: '김철수', signature: 1 }]).length === 2);

  // 값 안의 name이 키와 다르면 값 쪽을 신뢰한다(이름 변경 흔적)
  const mismatch = parseTrainingAssignees({ old_key: { name: '실제이름', signature: 0 } });
  check('값의 name 우선', mismatch[0]?.name === '실제이름', JSON.stringify(mismatch));

  // 키만 있고 값이 비어도 이름은 살린다
  check('값이 비면 키를 이름으로', parseTrainingAssignees({ 홍길동: {} })[0]?.name === '홍길동');

  check('빈 값은 빈 배열', parseTrainingAssignees(null).length === 0);
  check('숫자는 빈 배열', parseTrainingAssignees(42).length === 0);

  check(
    '이름 중복 제거',
    trainingAssigneeNames({ 홍길동: { name: '홍길동' }, dup: { name: '홍길동' } }).length === 1,
  );

  const sorted = sortAssigneesByName([{ name: '홍길동' }, { name: '김철수' }, { name: '이영희' }]);
  check('가나다순 정렬', sorted.map((r) => r.name).join(',') === '김철수,이영희,홍길동', sorted.map((r) => r.name).join(','));
}

// ────────────────────────────────────────────── 결과
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('✓ 서명 벡터 형식 회귀 테스트 통과');
