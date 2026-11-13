/**
 * HWPX 페이지 절대좌표 날인 회귀 — `npx tsx scripts/hwpx-page-stamp-test/run.mts`
 *
 * 결재 날인 테스트에서 얻은 교훈을 따른다: **좌표가 아니라 구조를 본다**.
 * "내가 쓴 값을 그대로 돌려받는" 검사는 동어반복이라 항상 통과한다.
 *
 * 여기서 지키는 불변식:
 *   · 그림이 대상 문단의 `<hp:run>` **안**에 있다
 *   · `treatAsChar="0"` + `RelTo="PAPER"` (글자처럼이면 좌표가 통째로 무시된다)
 *   · `textWrap="IN_FRONT_OF_TEXT"` (모든 개체 위 — 사용자 요구)
 *   · `allowOverlap="1"`·`flowWithText="0"` (없으면 한글이 겹침을 피해 스스로 밀어낸다)
 *   · 표 셀 안 문단을 본문 문단으로 세지 않는다(번호가 밀리면 다른 쪽에 찍힌다)
 *   · 여러 개를 넣어도 앞 편집이 뒤 오프셋을 밀지 않는다
 *   · 줄 캐시(`linesegarray`) 제거
 */
import {
  stampPageBoxesIntoSectionXml, pageStampPicXml, topLevelParagraphs, firstRunEnd,
  type PageStampPlacement,
} from '../../src/features/e-signature/lib/hwpxPageStamp';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const para = (text: string) => `<hp:p id="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>`;

/** 표가 든 문단 — 셀 안에 또 `<hp:p>` 가 있다(본문 문단으로 세면 안 된다) */
const tablePara = `<hp:p id="1"><hp:run charPrIDRef="0"><hp:tbl rowCnt="1" colCnt="2">` +
  `<hp:tr><hp:tc><hp:subList>${para('셀1')}</hp:subList></hp:tc>` +
  `<hp:tc><hp:subList>${para('셀2')}</hp:subList></hp:tc></hp:tr>` +
  `</hp:tbl></hp:run></hp:p>`;

const SECTION =
  `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hp="p" xmlns:hc="c" xmlns:hs="s">` +
  para('첫째 쪽 본문') +      // 0
  tablePara +                 // 1 (셀 문단 2개가 안에 있다)
  para('둘째 쪽 본문') +      // 2
  `</hs:sec>`;

const place = (over: Partial<PageStampPlacement> = {}): PageStampPlacement => ({
  imageId: 'image9', paraIndex: 0,
  xHu: 30000, yHu: 60000, widthHu: 8000, heightHu: 3000,
  naturalWidthPx: 400, naturalHeightPx: 150,
  ...over,
});

// ══ 문단 스캔 ══════════════════════════════════════════════════════════════
{
  const ps = topLevelParagraphs(SECTION);
  check('본문 문단은 3개(셀 문단 2개는 세지 않는다)', ps.length === 3, String(ps.length));
  check('0번은 첫째 쪽', SECTION.slice(ps[0].start, ps[0].end).includes('첫째 쪽'));
  check('1번은 표 문단', SECTION.slice(ps[1].start, ps[1].end).includes('<hp:tbl'));
  check('2번은 둘째 쪽', SECTION.slice(ps[2].start, ps[2].end).includes('둘째 쪽'));
  check('셀 문단을 셌다면 2번이 셀2였을 것',
    !SECTION.slice(ps[2].start, ps[2].end).includes('셀2'));

  const runEnd = firstRunEnd(SECTION, ps[0]);
  check('run 여는 태그 직후를 가리킨다',
    runEnd != null && SECTION.slice(runEnd).startsWith('<hp:t>첫째'),
    runEnd == null ? 'null' : SECTION.slice(runEnd, runEnd + 12));
}

// 자기 닫힘 문단·run 은 건너뛴다(넣을 자리가 없다)
{
  const xml = `<hs:sec>${'<hp:p id="9"/>'}${para('실제')}</hs:sec>`;
  const ps = topLevelParagraphs(xml);
  check('자기 닫힘 문단도 문단으로 센다(번호 보존)', ps.length === 2, String(ps.length));
  check('자기 닫힘 문단에는 run 이 없다', firstRunEnd(xml, ps[0]) === null);

  const selfRun = `<hs:sec><hp:p><hp:run charPrIDRef="0"/></hp:p></hs:sec>`;
  check('자기 닫힘 run 도 거부', firstRunEnd(selfRun, topLevelParagraphs(selfRun)[0]) === null);
}

// ══ 배치 속성 ══════════════════════════════════════════════════════════════
{
  const xml = pageStampPicXml(place(), 1000);
  check('글자처럼이 아니다', xml.includes('treatAsChar="0"'));
  check('용지 기준 세로', xml.includes('vertRelTo="PAPER"'));
  check('용지 기준 가로', xml.includes('horzRelTo="PAPER"'));
  check('모든 개체 위', xml.includes('textWrap="IN_FRONT_OF_TEXT"'));
  check('겹침 허용', xml.includes('allowOverlap="1"'));
  check('글 흐름과 분리', xml.includes('flowWithText="0"'));
  check('좌표가 HWPUNIT 그대로', xml.includes('horzOffset="30000"') && xml.includes('vertOffset="60000"'));
  check('크기 반영', xml.includes('width="8000"') && xml.includes('height="3000"'));
  check('이미지 참조', xml.includes('binaryItemIDRef="image9"'));
  check('zOrder 반영', xml.includes('zOrder="1000"'));

  // 결재 날인(글자처럼)과 확실히 다른 형태여야 한다
  check('결재본과 다른 배치', !xml.includes('vertRelTo="PARA"') && !xml.includes('horzRelTo="COLUMN"'));

  // 소수 좌표는 반올림 — HWPUNIT 은 정수다
  const rounded = pageStampPicXml(place({ xHu: 100.6, yHu: 200.4, widthHu: 10.5, heightHu: 20.5 }), 1);
  check('좌표 반올림', rounded.includes('horzOffset="101"') && rounded.includes('vertOffset="200"'),
    rounded.match(/horzOffset="[^"]+"/)?.[0]);

  // 설명 문자열의 XML 이스케이프
  const esc = pageStampPicXml(place({ description: '홍<길>동 & "서명"' }), 1);
  check('설명 이스케이프', esc.includes('&lt;') && esc.includes('&amp;') && esc.includes('&quot;'));
  check('원문 꺾쇠가 새어 나오지 않는다', !esc.includes('홍<길>동'));
}

// ══ 삽입 ═══════════════════════════════════════════════════════════════════
{
  const r = stampPageBoxesIntoSectionXml(SECTION, [place({ paraIndex: 0 })]);
  check('한 건 찍힘', r.stamped.length === 1);

  const ps = topLevelParagraphs(r.xml);
  const p0 = r.xml.slice(ps[0].start, ps[0].end);
  check('그림이 0번 문단 안', p0.includes('<hp:pic'));
  check('그림이 run 안', /<hp:run[^>]*><hp:pic/.test(p0), p0.slice(0, 120));
  check('다른 문단은 그대로', !r.xml.slice(ps[2].start, ps[2].end).includes('<hp:pic'));
}

// ── 여러 건: 앞 편집이 뒤 오프셋을 밀면 안 된다 ────────────────────────────
{
  const r = stampPageBoxesIntoSectionXml(SECTION, [
    place({ paraIndex: 0, imageId: 'imageA' }),
    place({ paraIndex: 2, imageId: 'imageB' }),
  ]);
  check('두 건 다 찍힘', r.stamped.length === 2, r.stamped.join(','));

  const ps = topLevelParagraphs(r.xml);
  check('A 는 0번 문단', r.xml.slice(ps[0].start, ps[0].end).includes('imageA'));
  check('B 는 2번 문단', r.xml.slice(ps[2].start, ps[2].end).includes('imageB'));
  check('서로 섞이지 않았다',
    !r.xml.slice(ps[0].start, ps[0].end).includes('imageB') &&
    !r.xml.slice(ps[2].start, ps[2].end).includes('imageA'));

  // 같은 문단에 두 개
  const same = stampPageBoxesIntoSectionXml(SECTION, [
    place({ paraIndex: 0, imageId: 'imageC' }),
    place({ paraIndex: 0, imageId: 'imageD', xHu: 50000 }),
  ]);
  check('같은 문단에 둘 다', same.stamped.length === 2 &&
    same.xml.includes('imageC') && same.xml.includes('imageD'));
  check('zOrder 가 서로 다르다', /zOrder="1000"/.test(same.xml) && /zOrder="1001"/.test(same.xml));
}

// ── 줄 캐시 제거 ───────────────────────────────────────────────────────────
{
  const withCache = SECTION.replace('</hp:run>',
    '</hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray>');
  check('원본에는 줄 캐시가 있다', withCache.includes('linesegarray'));
  const r = stampPageBoxesIntoSectionXml(withCache, [place()]);
  check('찍은 뒤 줄 캐시가 사라진다', !r.xml.includes('linesegarray'));

  // 2026-10-25 — 다른 문단·표 칸 문단의 캐시는 남긴다(전부 지우면 rhwp 가 칸 안 여러 줄을 겹쳐 그렸다)
  const LS = '<hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray>';
  const nested = `<hs:sec><hp:p id="1"><hp:run charPrIDRef="0"><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p id="9"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run>${LS}</hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run>${LS}</hp:p>` +
    `<hp:p id="2"><hp:run charPrIDRef="0"><hp:t>둘째</hp:t></hp:run>${LS}</hp:p></hs:sec>`;
  const n = stampPageBoxesIntoSectionXml(nested, [place({ paraIndex: 0 })]);
  const ns = topLevelParagraphs(n.xml);
  const first = n.xml.slice(ns[0].start, ns[0].end);
  check('그림 문단 자신의 캐시만 지운다', n.stamped.length === 1 && (first.match(/linesegarray>/g) ?? []).length === 2, first);
  check('표 칸 문단의 캐시는 남는다', /<hp:t>칸<\/hp:t><\/hp:run><hp:linesegarray>/.test(n.xml));
  check('다른 문단의 캐시는 남는다', n.xml.slice(ns[1].start, ns[1].end).includes('linesegarray'));
}

// ── 안전 ───────────────────────────────────────────────────────────────────
{
  check('빈 배치는 원본 그대로', stampPageBoxesIntoSectionXml(SECTION, []).xml === SECTION);
  const gone = stampPageBoxesIntoSectionXml(SECTION, [place({ paraIndex: 99 })]);
  check('없는 문단은 건너뛴다', gone.stamped.length === 0 && gone.xml === SECTION);
  const empty = stampPageBoxesIntoSectionXml('<hs:sec></hs:sec>', [place()]);
  check('문단 없는 문서도 안전', empty.stamped.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
