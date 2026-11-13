/**
 * 협업 보드 카테고리·노트 색 회귀 — `npx tsx scripts/collab-category-color-test/run.mts`
 *
 * 이 영역의 결함은 **오류를 내지 않는다**. 셋 다 화면은 멀쩡히 그려지고 결과만 틀린다.
 *
 *  1) **색 값이 두 모양으로 공존한다.** 옛 노트는 `'yellow'`, 팔레트가 생긴 뒤는
 *     `'#fff176'`. 한쪽만 정규화하고 비교하면 범례 필터가 **영원히 0건**이고
 *     색별 개수가 같은 색을 둘로 센다. `'yellow' === '#fff176'` 은 false 다.
 *  2) **카테고리 표기가 흔들린다.** `수업` / `수업 ` / `수 업` 이 서로 다른 칩 세 개가
 *     되는데 화면에서는 거의 같아 보인다.
 *  3) **색 목록이 네 화면에 복붙되기 쉽다.** 옛 코드가 그랬고, 하나만 고치면
 *     같은 보드가 교사 화면과 학생 화면에서 다른 색 목록을 낸다.
 *
 * 그래서 순수 로직 검증 + "단일 출처를 우회했는가" 정적 검사를 함께 둔다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOARD_CATEGORY_META_KEY,
  UNCATEGORIZED_KEY,
  boardMatchesCategories,
  buildCategoryCatalog,
  categoryNames,
  normalizeCategory,
  parseBoardCategory,
} from '../../src/lib/collabCategories';

import {
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_PALETTE,
  LEGACY_NOTE_COLORS,
  MAX_PALETTE_SIZE,
  contrastRatio,
  hasCustomPalette,
  isValidNoteColor,
  labeledPaletteEntries,
  noteColorName,
  noteMatchesColors,
  normalizeNoteColor,
  parseBoardPalette,
  readableInk,
  resolveNoteColorStyle,
  serializePalette,
  validatePalette,
} from '../../src/lib/collabNoteColors';

import {
  boardAccessFieldsFromDetail,
  boardAccessFieldsFromList,
  hasCollabViewAccess,
  hasCollabWriteAccess,
} from '../../src/lib/collabBoardAccess';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 1. 색 정규화: 두 모양이 한 값으로 모인다 ──────────────────────
ok(normalizeNoteColor('yellow') === '#fff176', '레거시 이름 → hex');
ok(normalizeNoteColor('YELLOW') === '#fff176', '대소문자 무시');
ok(normalizeNoteColor('  blue ') === '#90caf9', '공백 트림');
ok(normalizeNoteColor('#FFF176') === '#fff176', 'hex 소문자 정규화');
ok(normalizeNoteColor('#abc') === '#aabbcc', '3자리 hex 확장');
ok(normalizeNoteColor('fff176') === '#fff176', '# 없는 hex 허용');
ok(normalizeNoteColor('') === DEFAULT_NOTE_COLOR, '빈 값 → 기본색');
ok(normalizeNoteColor(null) === DEFAULT_NOTE_COLOR, 'null → 기본색');
ok(normalizeNoteColor('어쩌구') === DEFAULT_NOTE_COLOR, '알 수 없는 값 → 기본색(노트가 사라지지 않는다)');

ok(!isValidNoteColor('어쩌구'), 'isValidNoteColor: 쓰레기 거부');
ok(isValidNoteColor('white'), 'isValidNoteColor: 레거시 이름 허용');
ok(isValidNoteColor('#123456'), 'isValidNoteColor: hex 허용');

// 레거시 7색이 전부 살아 있어야 한다 — 라이브 노트가 이 이름으로 저장돼 있다.
for (const name of ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'white']) {
  ok(Boolean(LEGACY_NOTE_COLORS[name]), `레거시 색 보존: ${name}`);
}

// ── 2. 그라데이션 공식이 옛 Tailwind 클래스와 같다 ────────────────
// 옛 클래스: from-[#e3f2fd] to-[#90caf9] — 밝은 쪽 = base 를 흰색과 75% 섞은 값.
// 옛 값은 Material 팔레트에서 손으로 고른 것이라 **정확히 같지는 않다**(채널당 ≤1).
// 그 차이는 안 보이지만, 공식을 바꿔 색감이 달라지는 것은 보인다 → 2 이내로 못 박는다.
function channelDistance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}
function tintOf(style: string): string {
  return /linear-gradient\(to bottom right, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/.exec(style)![1];
}
function baseOf(style: string): string {
  return /linear-gradient\(to bottom right, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/.exec(style)![2];
}

for (const [name, oldTint, oldBase] of [
  ['blue', '#e3f2fd', '#90caf9'],
  ['green', '#e8f5e9', '#a5d6a7'],
  ['pink', '#fce4ec', '#f48fb1'],
  ['purple', '#f3e5f5', '#ce93d8'],
] as const) {
  const style = resolveNoteColorStyle(name).background;
  ok(baseOf(style) === oldBase, `${name}: base 가 옛 값 그대로`, style);
  ok(channelDistance(tintOf(style), oldTint) <= 2,
    `${name}: 밝은 쪽이 옛 값과 채널당 2 이내`,
    `${tintOf(style)} vs ${oldTint} (차이 ${channelDistance(tintOf(style), oldTint)})`);
}

// ── 3. 글자 대비 — 자유 색을 허용하는 순간 필수 ────────────────────
for (const hex of ['#ffffff', '#fff176', '#0f172a', '#1d4ed8', '#7f1d1d', '#a5d6a7', '#000000']) {
  const ink = readableInk(hex);
  ok(contrastRatio(hex, ink) >= 4.5, `글자 대비 4.5:1 이상: ${hex} → ${ink}`,
    `실제 ${contrastRatio(hex, ink).toFixed(2)}:1`);
}
ok(readableInk('#0f172a') === '#ffffff', '진한 남색 위에는 흰 글씨');
ok(readableInk('#fff176') === '#0f172a', '노랑 위에는 검은 글씨');

// ── 4. 색 필터 — 이름 노트와 hex 범례가 서로 걸려야 한다 ───────────
ok(noteMatchesColors('yellow', ['#fff176']), '★ 레거시 이름 노트가 hex 범례에 걸린다');
ok(noteMatchesColors('#FFF176', ['yellow']), '★ hex 노트가 레거시 범례에 걸린다');
ok(!noteMatchesColors('blue', ['#fff176']), '다른 색은 안 걸린다');
ok(noteMatchesColors('blue', []), '선택이 비면 전체 통과');

// ── 5. 팔레트 파싱 ────────────────────────────────────────────────
ok(parseBoardPalette(null).length === DEFAULT_NOTE_PALETTE.length, 'meta 없음 → 기본 팔레트');
ok(parseBoardPalette({}).length === DEFAULT_NOTE_PALETTE.length, '빈 meta → 기본 팔레트');
ok(parseBoardPalette({ note_palette: [] }).length === DEFAULT_NOTE_PALETTE.length,
  '빈 배열 → 기본 팔레트(고를 색이 0개면 화면이 죽는다)');
ok(parseBoardPalette({ note_palette: 'x' }).length === DEFAULT_NOTE_PALETTE.length,
  '망가진 값 → 기본 팔레트');

{
  const parsed = parseBoardPalette({
    note_palette: [
      { color: '#FFF176', label: '  진행 중  ' },
      { color: '#fff176', label: '중복' },          // 같은 색 → 버린다
      { color: 'not-a-color', label: '쓰레기' },     // 무효 → 버린다
      { color: '#90caf9' },                          // 이름 없는 색 → 남는다
      { color: '#a5d6a7', label: '' },               // 빈 이름 → 이름 없음
    ],
  });
  ok(parsed.length === 3, '중복·무효 제거 후 3개', JSON.stringify(parsed));
  ok(parsed[0].color === '#fff176' && parsed[0].label === '진행 중', '이름 트림 + 색 정규화');
  ok(parsed[1].label === undefined, '이름 없는 색은 label 키 자체가 없다');
  ok(parsed[2].label === undefined, '빈 문자열 이름 → 이름 없음');
  ok(labeledPaletteEntries(parsed).length === 1, '범례에는 이름 붙은 색만');
}

ok(
  parseBoardPalette({
    note_palette: Array.from({ length: 30 }, (_, i) => ({ color: `#${i.toString(16).padStart(6, '0')}` })),
  }).length === MAX_PALETTE_SIZE,
  `팔레트 상한 ${MAX_PALETTE_SIZE}개`,
);

ok(!hasCustomPalette({}), 'hasCustomPalette: 미설정 판별');
ok(hasCustomPalette({ note_palette: [{ color: '#fff' }] }), 'hasCustomPalette: 설정됨 판별');

ok(noteColorName('yellow') === '노랑', '이름 없는 팔레트면 레거시 색 이름');
ok(
  noteColorName('#fff176', [{ color: '#fff176', label: '진행 중' }]) === '진행 중',
  '팔레트 라벨이 레거시 이름보다 우선',
);

// ── 6. 팔레트 검증 — "같은 색이 겹칠 수는 없음" ────────────────────
ok(validatePalette([{ color: '#fff176' }, { color: '#90caf9' }]).length === 0, '정상 팔레트 통과');
{
  const errs = validatePalette([{ color: '#fff176' }, { color: 'YELLOW' }]);
  ok(errs.length === 1 && errs[0].index === 1,
    '★ 이름과 hex 로 적힌 같은 색을 중복으로 잡는다', JSON.stringify(errs));
}
ok(validatePalette([]).some((e) => e.index === -1), '빈 팔레트 거부');
ok(validatePalette([{ color: '###' }]).some((e) => e.index === 0), '무효 색 거부');

{
  const s = serializePalette([{ color: 'YELLOW', label: '  진행 중  ' }, { color: '#90CAF9', label: '   ' }]);
  ok(s[0].color === '#fff176' && s[0].label === '진행 중', '직렬화: 정규화 + 트림');
  ok(!('label' in s[1]), '직렬화: 공백뿐인 이름은 키를 뺀다');
}

// ── 7. 카테고리 정규화·카탈로그 ───────────────────────────────────
ok(normalizeCategory('  수업  ') === '수업', '카테고리 트림');
ok(normalizeCategory('수업\t\n자료') === '수업 자료', '연속 공백 접기');
ok(normalizeCategory('   ') === null, '공백뿐이면 null');
ok(normalizeCategory(null) === null, 'null 입력');
ok(normalizeCategory('가'.repeat(50))!.length === 24, '길이 상한 24자');

ok(parseBoardCategory({ [BOARD_CATEGORY_META_KEY]: ' 수업 ' }) === '수업', 'meta 읽기 + 정규화');
ok(parseBoardCategory({}) === null, '카테고리 없는 보드 → null');
ok(parseBoardCategory({ category: 123 }) === null, '문자열이 아니면 null');

{
  const boards = [
    { meta: { category: '수업' } },
    { meta: { category: '수업' } },
    { meta: { category: '행사' } },
    { meta: { category: '  수업  ' } },  // 정규화되어 '수업' 에 합쳐진다
    { meta: {} },
    { meta: null },
  ];
  const cat = buildCategoryCatalog(boards);
  ok(cat[0].key === '수업' && cat[0].count === 3,
    '★ 공백만 다른 이름이 한 칩으로 합쳐진다', JSON.stringify(cat));
  ok(cat[1].key === '행사' && cat[1].count === 1, '개수 내림차순 정렬');
  ok(cat[cat.length - 1].key === UNCATEGORIZED_KEY, '미분류는 항상 맨 뒤');
  ok(cat[cat.length - 1].count === 2, '미분류 개수');
  ok(!categoryNames(boards).includes(UNCATEGORIZED_KEY), '선택지 목록에 미분류 없음');
  ok(categoryNames(boards).length === 2, '선택지 = 실제 쓰이는 이름만');
}

{
  // 동점이면 가나다순 — 순서가 흔들리면 칩이 새로고침마다 자리를 바꾼다
  const cat = buildCategoryCatalog([{ meta: { category: '나' } }, { meta: { category: '가' } }]);
  ok(cat[0].label === '가' && cat[1].label === '나', '동점은 가나다순');
}

ok(boardMatchesCategories({ category: '수업' }, ['수업']), '카테고리 필터 일치');
ok(boardMatchesCategories({ category: '수업' }, [' 수업 ']), '필터도 정규화해서 비교');
ok(!boardMatchesCategories({ category: '수업' }, ['행사']), '다른 카테고리 배제');
ok(boardMatchesCategories({}, [UNCATEGORIZED_KEY]), '미분류 필터');
ok(!boardMatchesCategories({}, ['수업']), '미분류 보드는 이름 필터에 안 걸린다');
ok(boardMatchesCategories({}, []), '선택 없으면 전체 통과');

// ── 8. 접근 판정 — 비공개 보드가 목록에서 빠지는 근거 ──────────────
const ME = 'me';
const board = (visibility: string, created_by = 'other', members: string[] = []) =>
  ({ visibility, created_by, memberResourceIds: members });

ok(hasCollabViewAccess(board('public'), ME, false), 'public 읽기 허용');
ok(hasCollabViewAccess(board('read_only'), ME, false), 'read_only 읽기 허용');
ok(!hasCollabViewAccess(board('private'), ME, false), '★ 남의 비공개 보드 읽기 차단');
ok(hasCollabViewAccess(board('private', ME), ME, false), '내 비공개 보드는 읽기 허용');
ok(hasCollabViewAccess(board('private', 'other', [ME]), ME, false), '멤버면 읽기 허용');
ok(hasCollabViewAccess(board('private'), ME, true), 'admin 은 전부 읽기');
ok(!hasCollabViewAccess(board('private'), null, false), 'resourceId 미해결이면 차단(fail-closed)');

ok(hasCollabWriteAccess(board('public'), ME, false), 'public 쓰기 허용');
ok(!hasCollabWriteAccess(board('read_only'), ME, false), 'read_only 는 멤버만 쓰기');
ok(hasCollabWriteAccess(board('read_only', 'other', [ME]), ME, false), 'read_only 멤버 쓰기 허용');
ok(!hasCollabWriteAccess(board('private'), ME, false), '남의 비공개 보드 쓰기 차단');

ok(
  boardAccessFieldsFromList({
    visibility: 'private', created_by: 'x', collab_board_members: [{ user_id: 'a' }],
  }).memberResourceIds[0] === 'a',
  '목록 모양 어댑터',
);
ok(
  boardAccessFieldsFromDetail({
    visibility: 'private', created_by: 'x', members: [{ resource: { id: 'a' } }, { resource: null }],
  }).memberResourceIds.length === 1,
  '상세 모양 어댑터 — resource 가 비면 버린다',
);

// ── 9. 정적 검사: 단일 출처를 우회하지 않는가 ──────────────────────
const NOTE_FILES = [
  'src/components/collab/StickyNote.tsx',
  'src/components/collab/AddNoteCard.tsx',
  'src/components/collab/student/StudentStickyNote.tsx',
  'src/components/collab/student/StudentAddNoteCard.tsx',
];

for (const file of NOTE_FILES) {
  const src = read(file);
  // 옛 하드코딩 색 목록이 되살아나면 보드 팔레트가 화면마다 갈라진다.
  ok(
    !/from-\[#[0-9a-f]{6}\]/i.test(src),
    `${file}: 하드코딩 색 그라데이션 클래스 없음`,
    '색은 @/lib/collabNoteColors 단일 출처에서만',
  );
  ok(
    src.includes('NoteColorPicker'),
    `${file}: 공용 색 선택기 사용`,
  );
  ok(
    src.includes('collabNoteColors'),
    `${file}: 색 단일 출처 import`,
  );
}

// 목록 화면이 접근 판정을 직접 적어 두지 않고 공용 술어를 쓰는가.
{
  const src = read('src/pages/CollabBoard.tsx');
  ok(src.includes('hasCollabViewAccess'),
    'CollabBoard: 공용 접근 술어 사용');
  ok(/accessibleBoards/.test(src),
    '★ CollabBoard: 접근 불가 보드를 목록에서 제외 (2026-09-18 결정)');
  ok(!/visibility === 'private' && \(isOwner \|\| isMember\)/.test(src),
    'CollabBoard: 복붙 접근 판정이 되살아나지 않음');
}

// 색별 개수는 반드시 정규화 후에 센다 — 안 그러면 같은 색이 둘로 갈라진다.
for (const file of ['src/pages/BoardDetail.tsx', 'src/pages/StudentBoardDetail.tsx']) {
  const src = read(file);
  ok(/normalizeNoteColor\(note\.color\)/.test(src),
    `${file}: 색 집계 전 정규화`,
    '정규화 없이 세면 레거시 이름 노트와 hex 노트가 다른 색으로 잡힌다');
  ok(src.includes('parseBoardPalette'),
    `${file}: 보드 팔레트를 meta 에서 읽는다`);
  ok(/palette=\{palette\}/.test(src),
    `${file}: 팔레트를 노트 컴포넌트로 내려보낸다`);
}

// meta 는 통째로 교체되는 jsonb — 병합 없이 쓰면 다른 키가 사라진다.
{
  const src = read('src/hooks/useCollabBoards.ts');
  ok(src.includes('mergeBoardMeta'),
    '★ useCollabBoards: meta 병합 헬퍼 존재',
    'meta 를 통째로 덮어쓰면 카테고리 저장이 색 팔레트를 지운다');
  ok(/select\('id'\)[\s\S]{0,200}?권한이 없습니다/.test(src),
    'useCollabBoardPalette: RLS 차단(0행)을 오류로 드러낸다');
}

// 카테고리 저장 위치가 한 곳인가.
{
  const files = [
    'src/components/collab/CreateBoardDialog.tsx',
    'src/components/collab/EditBoardDialog.tsx',
  ];
  for (const file of files) {
    const src = read(file);
    ok(src.includes('BoardCategorySelect'), `${file}: 공용 카테고리 선택기 사용`);
    ok(!/overflow-hidden/.test(src),
      `${file}: DialogContent 에 overflow-hidden 없음`,
      '있으면 카테고리·멤버 드롭다운이 모달 경계에서 잘린다(CLAUDE.md Gotchas)');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
