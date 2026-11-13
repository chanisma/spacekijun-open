/**
 * 결재 서명 → HWPX 결재란 날인 회귀 테스트
 *
 * 실행: npx tsx scripts/approval-stamp-test/run.mts
 *
 * 검증 목적
 *  1) 결재란 칸 이름(계·부장·교감·교장)을 **텍스트로** 찾아 그 아래 서명 칸을 고르는가
 *     — 셀 인덱스를 하드코딩하면 양식이 바뀔 때 조용히 엉뚱한 칸에 찍힌다
 *  2) 그림이 **셀 `<hp:tc>` 안**에, **`treatAsChar="1"`(글자처럼)**으로 들어가는가
 *     ★ 이것이 이 테스트의 존재 이유다. 예전 구현은 `@rhwp/core`의 floating picture를 써서
 *       `vertRelTo="PAPER"` + 절대 오프셋으로 넣었고, 한글이 다시 배치하면 서명이 칸 밖으로
 *       나갔다. 그때 테스트는 "rhwp로 다시 열어 좌표가 같은가"를 봤는데, 자기가 쓴 좌표를
 *       그대로 돌려받는 동어반복이라 결함을 통과시켰다. 이제 **좌표가 아니라 구조**를 본다.
 *  3) 크기가 셀 안에 들어가는가(`<hp:cellSz>` − `<hp:cellMargin>` 기준)
 *  4) 여러 칸을 한 번에 찍어도 서로의 오프셋을 밀지 않는가
 *  5) 만들어진 HWPX를 `@rhwp/core`가 다시 열고 표·본문이 보존되는가(문법 타당성 확인)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  findSignatureCellInXml,
  stampSignaturesIntoSectionXml,
  tableCellTextsFromXml,
  type SignaturePlacement,
} from '../../src/lib/rhwp/approvalCells';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const templatePath = path.join(root, 'src/components/toolbox/hwpx/lesson-exchange-template.hwpx');
const pngPath = path.join(root, 'public/logo_sm.png');

let passed = 0;
const failures: string[] = [];
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const templateBytes = new Uint8Array(fs.readFileSync(templatePath));
const zip0 = await JSZip.loadAsync(templateBytes);
const sectionXml = await zip0.file('Contents/section0.xml')!.async('string');

// ────────────────────────────────────────────── 1) 칸 찾기
const cellTexts = tableCellTextsFromXml(sectionXml);
check('표를 찾는다', cellTexts.length === 3, `${cellTexts.length}개`);
check(
  '결재란이 첫 표',
  (cellTexts[0] ?? []).some((t) => t.replace(/\s+/g, '') === '결재'),
  JSON.stringify(cellTexts[0]),
);

const ROLES = ['계', '부장', '교감', '교장'];
ROLES.forEach((role, i) => {
  const cell = findSignatureCellInXml(sectionXml, role);
  check(`'${role}' 서명 칸을 찾는다`, !!cell);
  check(`'${role}' 서명 칸은 머리 행 아래(rowAddr=1)`, cell?.rowAddr === 1, `rowAddr=${cell?.rowAddr}`);
  check(`'${role}' 서명 칸 열=${i + 1}`, cell?.colAddr === i + 1, `colAddr=${cell?.colAddr}`);
  check(`'${role}' 칸 크기를 읽는다`, (cell?.widthHu ?? 0) > 0 && (cell?.heightHu ?? 0) > 0);
});

check('공백 표기 정규화', findSignatureCellInXml(sectionXml, ' 부 장 ')?.colAddr === 2);
check('없는 칸 이름은 null', findSignatureCellInXml(sectionXml, '행정실장') === null);
check('빈 문자열은 null', findSignatureCellInXml(sectionXml, '   ') === null);

// ────────────────────────────────────────────── 2) 삽입 구조
const placements: SignaturePlacement[] = ROLES.map((role, i) => ({
  roleLabel: role,
  imageId: `image${i + 1}`,
  naturalWidthPx: 3040,
  naturalHeightPx: 1405,
}));

const result = stampSignaturesIntoSectionXml(sectionXml, placements);
check('4칸 모두 날인', result.stamped.length === 4, JSON.stringify(result));
check('건너뛴 칸 없음', result.missing.length === 0, JSON.stringify(result.missing));
check('그림 4개 삽입', (result.xml.match(/<hp:pic\b/g) ?? []).length === 4);

// ★ 핵심 회귀: 글자처럼 배치이고 용지 절대좌표가 아니어야 한다
const picBlocks = [...result.xml.matchAll(/<hp:pic\b[\s\S]*?<\/hp:pic>/g)].map((m) => m[0]);
check('그림 블록 4개', picBlocks.length === 4);
for (const pic of picBlocks) {
  check('treatAsChar="1" (글자처럼)', pic.includes('treatAsChar="1"'), pic.slice(0, 80));
  check('용지 절대좌표 아님', !pic.includes('RelTo="PAPER"'));
  check('문단 기준 배치', pic.includes('vertRelTo="PARA"') && pic.includes('horzRelTo="COLUMN"'));
  check('오프셋 0', pic.includes('vertOffset="0"') && pic.includes('horzOffset="0"'));
}

// 각 그림이 **자기 칸 안**에 있는가 — 셀 범위를 다시 파싱해 포함 관계를 본다
for (const role of ROLES) {
  const cell = findSignatureCellInXml(result.xml, role);
  const idx = ROLES.indexOf(role);
  check(
    `'${role}' 그림이 그 칸 <hp:tc> 안에 있다`,
    !!cell && cell.xml.includes(`binaryItemIDRef="image${idx + 1}"`),
    cell ? cell.xml.slice(0, 120) : 'cell 없음',
  );
  check(`'${role}' 칸에 그림 1개만`, (cell?.xml.match(/<hp:pic\b/g) ?? []).length === 1);
  check(
    `'${role}' 줄 캐시 제거`,
    !!cell && !cell.xml.includes('<hp:linesegarray>'),
    '남아 있으면 한글이 옛 줄 높이로 그린다',
  );
}

// ────────────────────────────────────────────── 3) 크기가 칸 안에 들어가는가
for (const role of ROLES) {
  const before = findSignatureCellInXml(sectionXml, role)!;
  const after = findSignatureCellInXml(result.xml, role)!;
  const sz = after.xml.match(/<hp:sz width="(\d+)" widthRelTo="ABSOLUTE" height="(\d+)"/);
  const drawW = Number(sz?.[1] ?? 0);
  const drawH = Number(sz?.[2] ?? 0);
  const availW = before.widthHu - before.marginLeftHu - before.marginRightHu;
  const availH = before.heightHu - before.marginTopHu - before.marginBottomHu;

  check(`'${role}' 그림 크기 > 0`, drawW > 0 && drawH > 0, `${drawW}x${drawH}`);
  check(`'${role}' 폭이 칸 안`, drawW <= availW, `그림 ${drawW} > 여유 ${availW}`);
  check(`'${role}' 높이가 칸 안`, drawH <= availH, `그림 ${drawH} > 여유 ${availH}`);
  // 원본 비율 유지(찌그러지면 서명이 서명처럼 보이지 않는다)
  const ratio = drawW / drawH;
  check(`'${role}' 종횡비 보존`, Math.abs(ratio - 3040 / 1405) < 0.02, `비율 ${ratio.toFixed(3)}`);
}

// ────────────────────────────────────────────── 4) 부분 실패·빈 입력
const partial = stampSignaturesIntoSectionXml(sectionXml, [
  { roleLabel: '교감', imageId: 'image1', naturalWidthPx: 100, naturalHeightPx: 50 },
  { roleLabel: '행정실장', imageId: 'image2', naturalWidthPx: 100, naturalHeightPx: 50 },
]);
check('있는 칸만 찍는다', partial.stamped.join() === '교감', JSON.stringify(partial.stamped));
check('없는 칸은 missing', partial.missing.join() === '행정실장', JSON.stringify(partial.missing));
check('그림 1개만', (partial.xml.match(/<hp:pic\b/g) ?? []).length === 1);

const none = stampSignaturesIntoSectionXml(sectionXml, []);
check('빈 입력은 원본 그대로', none.xml === sectionXml);

// 다른 칸(머리행·본문 표)은 건드리지 않았는가
const headerCell = tableCellTextsFromXml(result.xml)[0];
check('머리 행 텍스트 보존', JSON.stringify(headerCell?.slice(0, 5)) === JSON.stringify(['결재', '계', '부장', '교감', '교장']), JSON.stringify(headerCell));
check('본문 표 2개 보존', tableCellTextsFromXml(result.xml).length === 3);

// ────────────────────────────────────────────── 5) 실제 HWPX로 묶어 @rhwp/core가 여는가
const png = new Uint8Array(fs.readFileSync(pngPath));
const zip = await JSZip.loadAsync(templateBytes);
let manifest = await zip.file('Contents/content.hpf')!.async('string');
for (const placement of placements) {
  zip.file(`BinData/${placement.imageId}.png`, png);
  manifest = manifest.replace(
    '</opf:manifest>',
    `<opf:item id="${placement.imageId}" href="BinData/${placement.imageId}.png" media-type="image/png" isEmbeded="1"/></opf:manifest>`,
  );
}
zip.file('Contents/section0.xml', result.xml);
zip.file('Contents/content.hpf', manifest);

const mimetype = await zip.file('mimetype')!.async('uint8array');
const ordered = new JSZip();
ordered.file('mimetype', mimetype, { compression: 'STORE' });
for (const name of Object.keys(zip.files)) {
  if (name === 'mimetype') continue;
  const entry = zip.files[name];
  if (entry.dir) continue;
  ordered.file(name, await entry.async('uint8array'));
}
const out: Uint8Array = await ordered.generateAsync({ type: 'uint8array' });

const core: any = await import('@rhwp/core/rhwp.js');
core.initSync({ module: fs.readFileSync(path.join(root, 'node_modules/@rhwp/core/rhwp_bg.wasm')) });

let reopened: any;
try {
  reopened = new core.HwpDocument(out);
  check('만든 HWPX를 core가 연다', true);
} catch (error) {
  check('만든 HWPX를 core가 연다', false, String(error));
}

if (reopened) {
  const layout = JSON.parse(reopened.getPageControlLayout(0)).controls ?? [];
  const tables = layout.filter((c: any) => c.type === 'table');
  const images = layout.filter((c: any) => c.type === 'image');
  check('표 3개 보존', tables.length === 3, `${tables.length}개`);
  check('그림 4개 인식', images.length === 4, `${images.length}개`);

  // 레이아웃상으로도 결재란 표 영역 안에 있는가 (좌표는 참고용 — 판정 기준은 위의 구조 검사)
  const approvalTable = tables[0];
  for (const img of images) {
    const inside =
      img.x >= approvalTable.x - 1 &&
      img.y >= approvalTable.y - 1 &&
      img.x + img.w <= approvalTable.x + approvalTable.w + 1 &&
      img.y + img.h <= approvalTable.y + approvalTable.h + 1;
    check('그림이 결재란 표 영역 안', inside, `img=(${img.x},${img.y},${img.w},${img.h}) tbl=(${approvalTable.x},${approvalTable.y},${approvalTable.w},${approvalTable.h})`);
  }
  reopened.free();
}

const outZip = await JSZip.loadAsync(out);
const binData = Object.keys(outZip.files).filter((f) => /^BinData\/.+\.png$/.test(f));
check('BinData 이미지 4개', binData.length === 4, binData.join(','));
const section = await outZip.file('Contents/section0.xml')!.async('string');
for (const role of [...ROLES, '결강시 보강 계획서']) {
  check(`본문 '${role}' 보존`, section.includes(role));
}

// ────────────────────────────────────────────── 6) 실제 순서: 내용 채움 → 날인
// 앱은 빈 템플릿이 아니라 `fillLessonSection0`으로 채운 문서에 날인한다.
// 채움이 결재란을 건드리면(예: 다른 표를 노리는 치환이 흘러들면) 칸을 못 찾게 된다.
const { fillLessonSection0 } = await import(
  '../../src/components/toolbox/hwpx/lessonExchangeFormFill'
);
const filled = fillLessonSection0(sectionXml, {
  teacherName: '권민결',
  subject: '정보',
  reasons: [0, 4],
  rows: [
    {
      grade: '1-1',
      absenceDate: '7/16',
      absenceDay: '목',
      absencePeriod: '7',
      absenceSubject: '정보',
      swapType: '교체',
      makeupSubject: '한국사1',
      makeupTeacher: '임이안',
      makeupDate: '7/16',
      makeupDay: '목',
      makeupPeriod: '5',
      makeupLocation: '',
    },
  ],
});
check('채움 후에도 결재란 표 3개', tableCellTextsFromXml(filled).length === 3);
const filledStamp = stampSignaturesIntoSectionXml(filled, placements);
check('채운 문서에도 4칸 날인', filledStamp.stamped.length === 4, JSON.stringify(filledStamp));
check('채운 내용 보존', filledStamp.xml.includes('권민결') && filledStamp.xml.includes('한국사1'));
for (const role of ROLES) {
  const cell = findSignatureCellInXml(filledStamp.xml, role);
  check(`채운 문서 '${role}' 칸 안에 그림`, (cell?.xml.match(/<hp:pic\b/g) ?? []).length === 1);
}

// ────────────────────────────────────────────── 결과
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('✓ 결재란 날인 회귀 테스트 통과');
