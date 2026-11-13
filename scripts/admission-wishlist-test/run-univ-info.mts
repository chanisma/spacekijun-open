/**
 * 대학 기본 정보(입학처 · 복수지원) 검증 하니스.
 * 실행: npx tsx scripts/admission-wishlist-test/run-univ-info.mts
 *
 * 이 자료는 **조용히 틀리는 자리가 많아** 회귀가 유일한 방어선이다:
 *  · 원본이 PDF 추출본이라 **단어 한가운데에 줄바꿈**이 들어간다(명지대 `'복수 지\n원 가능'`)
 *  · 입학처 칸이 **URL 이 아닐 수 있다**(조선대 `'입학처(해오름관 2층)'`) — href 에 넣으면 상대경로
 *  · `최대 N회` 가 **본교 상한이 아닐 수 있다**(부산대는 6이 상한이고 2는 교과 유형 안의 규칙)
 *  · **캠퍼스가 정보의 단위**다(강원대 3캠퍼스의 복수지원 규정이 서로 다르다)
 * 아래 문구는 전부 라이브(2026-09-09) 원문에서 가져왔다.
 */
import {
  MULTI_APPLY_SECTION,
  baseUniversity,
  canonUniversity,
  classifyMultiApply,
  extractSusiSummary,
  mapUnivInfo,
  multiApplyLimit,
  multiApplyWarning,
  normalizeSourceUrl,
  resolveUnivInfo,
  sectionText,
  toUnivInfoRows,
  univInfoQueryKeys,
  urlHost,
  validateUnivInfoRows,
  type AdmissionUnivInfo,
  type RawSusiUniversity,
} from '../../src/features/admission-wishlist/utils/admissionUnivInfo';
import {
  buildComparisonRows, cellHasControl, multiApplyLevel, shouldWrapCell,
  type ComparisonColumn,
} from '../../src/features/admission-wishlist/utils/comparisonRows';
import { computeItemInsight } from '../../src/features/admission-wishlist/utils/itemInsight';
import type { WishlistItem } from '../../src/features/admission-wishlist/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
}

/* ═════════ 1) 원본 파싱 ═════════ */
console.log('── 1) 원본 파싱 ──');
{
  const html = `<script>const D = {"meta":{"title":"t","sectionTitles":{"13":"복수지원 가능 여부"}},"universities":[{"name":"가나대학교","region":"강원","home":"https://a.ac.kr","sections":{"13":[{"t":"p","x":"복수지원 가능"}]}}]};</script>`;
  const d = extractSusiSummary(html);
  check('D 리터럴을 잘라 낸다', d.universities.length === 1 && d.universities[0].name === '가나대학교');

  // 문자열 안의 중괄호에 속으면 안 된다 (원본 주소·비고에 실제로 들어 있다)
  const tricky = `const D = {"meta":{"sectionTitles":{"13":"복수지원 가능 여부"}},"universities":[{"name":"브레이스{대","sections":{"13":[{"t":"p","x":"a}b"}]}}]}`;
  check('문자열 안 중괄호를 세지 않는다', extractSusiSummary(tricky).universities[0].name === '브레이스{대');

  // 섹션 번호를 코드에 박아 둔 채 원본이 순서를 바꾸면 **엉뚱한 내용**을 복수지원으로 싣는다
  const moved = `const D = {"meta":{"sectionTitles":{"13":"계약학과 및 첨단학과"}},"universities":[{"name":"가"}]}`;
  let threw = false;
  try { extractSusiSummary(moved); } catch { threw = true; }
  check('섹션 13 제목이 바뀌면 적재를 멈춘다', threw);

  check('섹션 번호 상수는 13', MULTI_APPLY_SECTION === '13');
}

console.log('\n── 2) 섹션 평문화 ──');
{
  const u: RawSusiUniversity = {
    name: '가',
    sections: {
      '13': [
        { t: 'p', x: '가. 복수지원 허용 범위' },
        { t: 'p', x: '   ' },
        { t: 'tb', r: [['전형명', '지원 가능\n횟수', ''], ['일반', '1회', '']] },
      ],
    },
  };
  const t = sectionText(u, '13');
  check('빈 단락은 버린다', !t.includes('\n\n'), JSON.stringify(t));
  check('표는 셀을 | 로 잇는다', t.includes('전형명 | 지원 가능 횟수'), JSON.stringify(t));
  check('셀 안 줄바꿈은 공백으로', !t.split('\n')[1]?.includes('지원 가능\n'), JSON.stringify(t));
  check('없는 섹션은 빈 문자열', sectionText(u, '99') === '');
}

/* ═════════ 3) URL 위생 ═════════ */
console.log('\n── 3) 입학처 주소 (라이브 실측 값) ──');
{
  check('스킴 있으면 그대로', normalizeSourceUrl('https://ipsi.cku.ac.kr/sites/iphak/index.do') === 'https://ipsi.cku.ac.kr/sites/iphak/index.do');
  // 34곳이 스킴 없이 온다 — 그대로 href 에 넣으면 **상대경로**가 되어 앱 안에서 이동한다
  check('스킴 없으면 https 를 붙인다', normalizeSourceUrl('go.hanyang.ac.kr') === 'https://go.hanyang.ac.kr');
  check('경로도 살린다', normalizeSourceUrl('www.gjue.ac.kr/html/ipsi/index.html') === 'https://www.gjue.ac.kr/html/ipsi/index.html');
  check('http 는 유지', normalizeSourceUrl('http://ipsi.dankook.ac.kr') === 'http://ipsi.dankook.ac.kr');

  // **주소가 아닌 값** — 링크를 만들면 안 된다
  check('조선대: 안내 문구는 링크가 아니다', normalizeSourceUrl('입학처(해오름관 2층)') === null);
  check('가톨릭대: 한 단어도 링크가 아니다', normalizeSourceUrl('입학처') === null);
  check('빈 값', normalizeSourceUrl('') === null && normalizeSourceUrl(null) === null);

  // 한 칸에 여러 주소가 섞이거나 잘린 값 — 첫 주소만
  check('경희대: 잘린 값에서 첫 주소', normalizeSourceUrl('[대학] www.khu.ac.kr / [') === 'https://www.khu.ac.kr');
  check('성신여대: 괄호 앞에서 끊는다', normalizeSourceUrl('www.sungshin.ac.kr(대학)/ ipsi.sungshin.ac.kr(') === 'https://www.sungshin.ac.kr');
  check('원서접수: 괄호 안 주소도 뽑는다', normalizeSourceUrl('유웨이어플라이(www.uwayapply.com)') === 'https://www.uwayapply.com');

  // 원본 오타 — 그대로 두면 링크가 죽는다
  check('호원대: wwww → www', normalizeSourceUrl('wwww.howon.ac.kr') === 'https://www.howon.ac.kr');

  check('호스트만 뽑기', urlHost('https://ipsi.cku.ac.kr/sites/iphak') === 'ipsi.cku.ac.kr');
  check('호스트: 스킴 없으면 원문', urlHost('입학처') === '입학처');
}

/* ═════════ 4) 대학명 정규화 ═════════ */
console.log('\n── 4) 대학명 정규화 (약칭 ↔ 정식명) ──');
{
  check('대학교 → 대', canonUniversity('전북대학교') === '전북대' && canonUniversity('전북대') === '전북대');
  check('공백 제거', canonUniversity(' 전북 대학교 ') === '전북대');
  // 라이브 미매칭 14건 중 11건을 해결한 세 규칙
  check('여자대 → 여대', canonUniversity('이화여자대학교') === canonUniversity('이화여대'));
  check('교육대 → 교대', canonUniversity('경인교육대학교') === canonUniversity('경인교대'));
  check('과학기술대 → 과기대', canonUniversity('서울과학기술대학교') === canonUniversity('서울과기대'));

  // **캠퍼스는 정보의 단위** — 분화 11곳 중 입학처가 다른 곳 9·복수지원이 다른 곳 10
  check('canon 은 캠퍼스를 남긴다', canonUniversity('고려대학교(세종)') === '고려대(세종)');
  check('canon: 대괄호도 소괄호로', canonUniversity('동국대학교[WISE]') === '동국대(WISE)');
  check('canon: 세종캠과 본교가 다르다', canonUniversity('고려대학교') !== canonUniversity('고려대학교(세종)'));
  check('base 는 캠퍼스를 버린다', baseUniversity('고려대학교(세종)') === '고려대' && baseUniversity('강원대학교(춘천)') === '강원대');

  const keys = univInfoQueryKeys(['고려대(세종)', '전북대', null]);
  check('조회 키에 canon 과 base 를 함께 담는다', keys.includes('고려대(세종)') && keys.includes('고려대') && keys.includes('전북대'), keys.join(','));
  check('조회 키는 빈 값을 버린다', !keys.includes(''));
}

/* ═════════ 5) 복수지원 판정 ═════════ */
console.log('\n── 5) 복수지원 판정 (라이브 원문) ──');
{
  // ★ 핵심 회귀: 원본이 PDF 추출본이라 단어 한가운데 줄바꿈이 들어간다.
  //   원문 그대로 정규식을 대면 조용히 빗나가고 결과는 '원문 확인'으로만 보인다.
  const myeongji = '전형 일정이 중복되지 않으면 수시모집 모든 전형 간 복수 지\n원 가능';
  check('명지대: 단어 중간 줄바꿈을 넘긴다', classifyMultiApply(myeongji).status === 'allowed', classifyMultiApply(myeongji).status);

  // 대부분의 자료는 "가능하다, 단 …는 불가" 형태 — 불가가 있다고 막혔다고 읽으면 안 된다
  const kwandong = '• 전체 전형 중 지원자격 충족여부에 따라 최대 6회 전형 복수지원 가능\n• 복수지원 불가한 경우\n- 동일한 전형 내에서 복수의 모집단위에 지원하는 경우';
  check('가톨릭관동대: 예외의 "불가"에 속지 않는다', classifyMultiApply(kwandong).status === 'allowed');

  const ajou = '가. 같은 전형 내에서 다른 모집단위 중복지원 불가(개별 전형 당 1회 지원 가능)\n나. 위 경우 외에는 전형 간 복수지원 제한 없음';
  check('아주대: "제한 없음"은 가능', classifyMultiApply(ajou).status === 'allowed');

  const hansei = '수시모집의 전형 간 중복(복수) 지원 가능 (단, 모집단위는 전형별로 1개만 선택 가능)';
  check('한세대: 괄호가 끼어든 표기', classifyMultiApply(hansei).status === 'allowed');

  // 진짜 불가 — 상담에서 반드시 알아야 하므로 '원문 확인'으로 뭉개면 안 된다
  check('서울교대: 모든 전형 복수지원 불가', classifyMultiApply('- 모든 전형 복수지원 불가').status === 'blocked');
  check('부산교대: 우리대학 내의 …는 불가함', classifyMultiApply('- 우리대학 내의 수시 전형 복수지원은 불가함').status === 'blocked');
  check('아신대: 허용하지 않습니다', classifyMultiApply('우리대학 내에서는 복수지원을 허용하지 않습니다.').status === 'blocked');
  check('인천가톨릭대: 복수 지원할 수 없음', classifyMultiApply('- 본교의 각 전형 및 모집단위 간에 복수 지원할 수 없음.(하나의 전형만 지원 가능함)').status === 'blocked');
  check('청주교대: 복수의 전형에 지원 불가', classifyMultiApply('- 복수의 전형에 지원 불가').status === 'blocked');
  check('전주교대: 원문이 "불가능" 한 단어', classifyMultiApply('불가능').status === 'blocked');
  check('호원대: 원문이 "불가" 한 단어', classifyMultiApply('불가').status === 'blocked');
  check('한국교원대: 불가로 시작', classifyMultiApply('불가(1개 전형 1개 모집단위만 지원 가능').status === 'blocked');

  check('전형이 하나뿐인 대학', classifyMultiApply('해당 없음').status === 'not-applicable');
  check('자료 자체가 비면 unknown', classifyMultiApply('').status === 'unknown');
  check('자료 없음 요약', classifyMultiApply('').summary === '자료 없음');

  // 규칙으로 단정할 수 없는 자료(표·결격 사유 서술)는 **억지로 판정하지 않는다**
  const snu = '다음에 해당하는 지원자는 불합격(결격 포함) 처리하며\n3) 서울대학교 수시모집에서 2개 이상의 모집단위 및 다른 전형에 복수지원한 경우';
  check('서울대: 보류하고 원문을 넘긴다', classifyMultiApply(snu).status === 'unknown', classifyMultiApply(snu).status);
}

/* ═════════ 6) 본교 내 상한 ═════════ */
console.log('\n── 6) 본교 내 최대 지원 횟수 ──');
{
  // ★ 핵심 회귀: 총량 표현이 있으면 그 계열만 본다.
  //   그냥 최솟값을 쓰면 부산대가 6회 → 2회로 조용히 틀린다.
  const pusan = '나. 우리 대학교에는 최대 6회까지 복수지원 가능합니다.\n1) 학생부교과 유형 안에서는 2회 복수지원 가능합니다.';
  check('부산대: 총량 6이 이긴다 (2가 아니다)', multiApplyLimit(pusan) === 6, String(multiApplyLimit(pusan)));
  check('부산대: 6이면 추가 제한 없음으로 요약', classifyMultiApply(pusan).summary === '가능');

  // 한 문서에 전국 6회와 본교 상한이 함께 오면 **작은 쪽**이 본교 상한이다
  check('극동대: 최대 3회 + 최대 6회 → 3', multiApplyLimit('본교 수시모집 복수지원 가능(전형이 다를 경우 최대 3회까지 지원 가능)\n수시모집 지원횟수는 최대 6회로 제한하며') === 3);
  check('동국대: 최대 5회 (… 포함 시 최대 6회) → 5', multiApplyLimit('각 1회씩 최대 5회 (재외국민 특별전형 중고교과정국외이수자 포함 시 최대 6회) 지원 가능') === 5);

  // `최대 N개 전형 중 M개` 의 N 은 상한이 아니라 **고를 모집단**이다
  const dongseo = '일반계고 출신 지원가능 전형 : ① ② ③ 최대 11개 전형 중 6개 복수지원 가능';
  check('동서대: "중"이 뒤따르면 총량이 아니다 (11 아님)', multiApplyLimit(dongseo) !== 11, String(multiApplyLimit(dongseo)));

  // 전형 **당** 1회는 대학 상한이 아니다
  check('아주대: "전형 당 1회"는 상한이 아니다', multiApplyLimit('개별 전형 당 1회 지원 가능') === null, String(multiApplyLimit('개별 전형 당 1회 지원 가능')));

  // 총량 표현이 없을 때만 맨 수치를 본다 (라이브 검증값)
  check('남부대: 2회 지원 가능', multiApplyLimit('- 전형을 달리하여 학과 관계없이 2회 지원 가능') === 2);
  check('송원대: 2회 복수 지원 가능', multiApplyLimit('전형 간 2회 복수 지원 가능') === 2);
  check('한국체대: 2개의 전형까지', multiApplyLimit('○ 본교 수시모집은 2개의 전형까지 지원할 수 있으며') === 2);
  check('초당대: 3회 지원 가능', multiApplyLimit('- 전형을 달리하여 3회 지원 가능') === 3);
  check('국립군산대: 최대 3개 전형 / 총 3회', multiApplyLimit('우리 대학은 최대 3개 전형에 복수 지원 가능함\n총 3회 지원 가능함') === 3);
  check('광주대: 각 전형별 1회, 총 5회', multiApplyLimit('- 각 전형별 1회, 총 5회 복수지원 가능. 학과 제한 없음') === 5);
  check('경북대: 최대 4개 전형 지원 가능', multiApplyLimit('최대 4개 전형 지원 가능') === 4);
  check('광주여대: 최대 3개 전형까지', multiApplyLimit('최대 3개 전형까지 복수 지원 가능함') === 3);
  check('한림대: 본교 최대 4회', multiApplyLimit('- 본교 수시모집 전형 중 최대 4회 복수 지원 가능') === 4);

  check('수치가 없으면 null', multiApplyLimit('전형 간 복수지원 가능') === null);
  check('6 미만이면 요약에 적는다', classifyMultiApply('본교 수시모집 전형 중 최대 4회 복수 지원 가능').summary === '가능 · 본교 내 최대 4회');
}

/* ═════════ 7) 행 만들기 · 검증 ═════════ */
console.log('\n── 7) 행 만들기 · 적재 전 검증 ──');
{
  const raw = {
    meta: { sectionTitles: { '13': '복수지원 가능 여부' } },
    universities: [
      { name: '가나대학교', region: '강원', addr: '주소', home: 'ipsi.gana.ac.kr', apply: 'www.uwayapply.com', phone: '033)000-0000', baseDate: '2026년 6월 10일', sections: { '13': [{ t: 'p' as const, x: '최대 3회 복수지원 가능' }] } },
      { name: '다라대학교', sections: { '13': [{ t: 'p' as const, x: '해당 없음' }] } },
    ],
  };
  const rows = toUnivInfoRows(raw);
  check('행 2개', rows.length === 2);
  check('스킴을 붙여 저장', rows[0].home_url === 'https://ipsi.gana.ac.kr');
  check('원문도 함께 보존', rows[0].home_raw === 'ipsi.gana.ac.kr');
  check('상한 3회', rows[0].multi_apply_limit === 3);
  check('전문 보존', rows[0].multi_apply_text === '최대 3회 복수지원 가능');
  check('해당 없음', rows[1].multi_apply_status === 'not-applicable');
  check('주소 없으면 null', rows[1].home_url === null);

  // 검증은 "절반만 들어가는" 사태를 막는 문지기다
  check('대학 수가 적으면 걸린다', validateUnivInfoRows(rows).some((p) => p.includes('대학 수가')));
  const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[0], university: `대학${i}`, university_canon: `대학${i}`, university_base: `대학${i}` }));
  check('정상이면 문제 없음', validateUnivInfoRows(many).length === 0, validateUnivInfoRows(many).join(' / '));
  const dup = [...many, { ...many[0] }];
  check('대학명 중복을 잡는다', validateUnivInfoRows(dup).some((p) => p.includes('중복')));
  const bad = [...many]; bad[0] = { ...bad[0], home_url: 'ipsi.no-scheme.ac.kr' };
  check('스킴 없는 주소를 잡는다', validateUnivInfoRows(bad).some((p) => p.includes('스킴')));
}

/* ═════════ 8) 매칭 ═════════ */
console.log('\n── 8) 대학 매칭 (캠퍼스 보류) ──');
{
  const mk = (university: string, over: Partial<AdmissionUnivInfo> = {}): AdmissionUnivInfo => ({
    university,
    universityCanon: canonUniversity(university),
    universityBase: baseUniversity(university),
    region: null, address: null, phone: null,
    homeUrl: 'https://a.ac.kr', homeRaw: 'https://a.ac.kr', applyUrl: null, applyRaw: null,
    multiApplyStatus: 'allowed', multiApplyLimit: null, multiApplySummary: '가능',
    multiApplyText: '복수지원 가능', baseDate: null,
    ...over,
  });
  const pool = [
    mk('전북대학교'),
    mk('고려대학교'), mk('고려대학교(세종)'),
    mk('강원대학교(춘천)'), mk('강원대학교(강릉,원주)'), mk('강원대학교(삼척)'),
    mk('명지대학교'),
    mk('이화여자대학교'),
  ];

  const jb = resolveUnivInfo('전북대', pool);
  check('약칭 ↔ 정식명 정확 일치', jb.info?.university === '전북대학교' && !jb.viaBase && !jb.ambiguous);

  const ewha = resolveUnivInfo('이화여대', pool);
  check('여대 약칭도 정확 일치', ewha.info?.university === '이화여자대학교');

  const korSejong = resolveUnivInfo('고려대(세종)', pool);
  check('캠퍼스가 있으면 그 캠퍼스로', korSejong.info?.university === '고려대학교(세종)' && !korSejong.viaBase);

  // ★ 캠퍼스마다 규정이 다르므로 여럿이면 **고르지 않는다**
  const kw = resolveUnivInfo('강원대', pool);
  check('강원대: 후보 3곳이면 보류', kw.info === null && kw.ambiguous && kw.candidates.length === 3);

  const kor = resolveUnivInfo('고려대', pool);
  check('고려대: 본교와 정확 일치가 있으면 확정', kor.info?.university === '고려대학교' && !kor.ambiguous);

  // 캠퍼스 표기가 자료에 없으면 폴백하되 **무엇과 붙었는지 밝힐 수 있게** 표시한다
  const mj = resolveUnivInfo('명지대(자연)', pool);
  check('명지대(자연) → 명지대학교 (폴백)', mj.info?.university === '명지대학교' && mj.viaBase);

  check('자료에 없으면 빈 결과', resolveUnivInfo('없는대', pool).info === null && !resolveUnivInfo('없는대', pool).ambiguous);
  check('후보가 비면 빈 결과', resolveUnivInfo('전북대', []).info === null);
  check('undefined 안전', resolveUnivInfo('전북대', undefined).info === null);

  check('DB 행 → 화면용 매핑', mapUnivInfo({
    university: '가', university_canon: '가', university_base: '가',
    multi_apply_status: 'blocked', multi_apply_limit: 3, multi_apply_summary: 's',
  }).multiApplyLimit === 3);
  check('매핑: 상태 기본값 unknown', mapUnivInfo({ university: '가' }).multiApplyStatus === 'unknown');
}

/* ═════════ 9) 같은 대학 교차 검사 ═════════ */
console.log('\n── 9) 같은 대학을 여러 곳 담았을 때 ──');
{
  const info = (over: Partial<AdmissionUnivInfo>): AdmissionUnivInfo => ({
    university: '가', universityCanon: '가', universityBase: '가',
    region: null, address: null, phone: null,
    homeUrl: null, homeRaw: null, applyUrl: null, applyRaw: null,
    multiApplyStatus: 'allowed', multiApplyLimit: null, multiApplySummary: '가능',
    multiApplyText: null, baseDate: null, ...over,
  });
  check('한 곳뿐이면 말하지 않는다', multiApplyWarning(info({}), 1).level === null);
  check('자료가 없으면 말하지 않는다', multiApplyWarning(null, 3).level === null);
  check('상한 안이면 안내만', multiApplyWarning(info({ multiApplyLimit: 3 }), 2).level === 'info');
  check('상한을 넘기면 경고', multiApplyWarning(info({ multiApplyLimit: 3 }), 4).level === 'over');
  check('상한 경고에 숫자를 적는다', multiApplyWarning(info({ multiApplyLimit: 3 }), 4).message.includes('3회'));
  check('복수지원 불가 대학에 2곳', multiApplyWarning(info({ multiApplyStatus: 'blocked' }), 2).level === 'blocked');
  check('해당 없음 대학에 2곳', multiApplyWarning(info({ multiApplyStatus: 'not-applicable' }), 2).level === 'blocked');
  check('상한이 없으면 안내만', multiApplyWarning(info({}), 3).level === 'info');
}

/* ═════════ 10) 비교표 행 ═════════ */
console.log('\n── 10) 비교표 행 ──');
{
  const item: WishlistItem = {
    id: 'w1', studentCode: '00-00232', track: 'gyogwa',
    university: '원광대', department: '간호학과', admissionName: '학생부교과',
    memo: null, sortOrder: 0, tier: 'apply',
    convertedScore: null, interviewDate: null, firstAnnounceDate: null, finalAnnounceDate: null,
    csatCheck6: null, csatCheck9: null,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
    gyogwa: null, jonghap: null, adiga: null,
  };
  const insight = computeItemInsight(item, { naesin: null, subjects: null, mock: null, mockRounds: [] });
  const info: AdmissionUnivInfo = {
    university: '원광대학교', universityCanon: '원광대', universityBase: '원광대',
    region: '전북', address: '익산시', phone: '063)000-0000',
    homeUrl: 'https://ipsi.wku.ac.kr', homeRaw: 'ipsi.wku.ac.kr',
    applyUrl: 'https://www.uwayapply.com', applyRaw: 'www.uwayapply.com',
    multiApplyStatus: 'allowed', multiApplyLimit: 5, multiApplySummary: '가능 · 본교 내 최대 5회',
    multiApplyText: '※ 본교 최대 5회 지원 가능', baseDate: '2026년 6월 10일',
  };
  const col = (over: Partial<ComparisonColumn> = {}): ComparisonColumn => ({ item, insight, ...over });

  const rows = buildComparisonRows([]);
  const site = rows.find((r) => r.key === 'admissionSite')!;
  const multi = rows.find((r) => r.key === 'multiApply')!;
  check('입학처 행이 기본 정보에 있다', site?.section === 'basic' && site.label === '입학처');
  check('복수지원 행이 기본 정보에 있다', multi?.section === 'basic' && multi.label === '복수지원');

  // 로딩 중 / 자료 없음 / 보류를 구분해야 "왜 비었는지"를 화면이 말할 수 있다
  check('로딩 중', site.text(col()) === '…' && multi.text(col()) === '…');
  const empty = col({ univInfo: { info: null, candidates: [], ambiguous: false, viaBase: false } });
  check('자료 없음', site.text(empty) === '자료 없음' && multi.text(empty) === '자료 없음');
  check('자료 없으면 근거도 없다', site.detail!(empty) === null && multi.detail!(empty) === null);

  const amb = col({ univInfo: { info: null, candidates: [info], ambiguous: true, viaBase: false } });
  check('보류는 "캠퍼스 확인 필요"', site.text(amb) === '캠퍼스 확인 필요' && multi.text(amb) === '캠퍼스 확인 필요');
  check('보류에도 근거는 있다 (후보를 밝힌다)', site.detail!(amb)?.sections.some((s) => s.heading?.includes('후보')) === true);

  const ok = col({ univInfo: { info, candidates: [info], ambiguous: false, viaBase: false }, sameUniversityCount: 1 });
  check('입학처는 호스트만 적는다', site.text(ok) === 'ipsi.wku.ac.kr', site.text(ok));
  check('복수지원 요약', multi.text(ok) === '가능 · 본교 내 최대 5회', multi.text(ok));

  const two = col({ univInfo: { info, candidates: [info], ambiguous: false, viaBase: false }, sameUniversityCount: 2 });
  check('2곳이면 개수를 붙인다', two && multi.text(two).includes('목록에 2곳'), multi.text(two));
  const over = col({ univInfo: { info, candidates: [info], ambiguous: false, viaBase: false }, sameUniversityCount: 6 });
  check('상한을 넘기면 경고 수준', multiApplyLevel(over) === 'over');
  check('경고가 근거에도 담긴다', multi.detail!(over)?.sections.some((s) => s.heading === '확인이 필요합니다') === true);
  check('상한 안이면 경고 아님', multiApplyLevel(two) === 'info');
  check('보류면 경고하지 않는다', multiApplyLevel(amb) === null);

  // 원문은 **항상** 함께 펼친다 (요약이 틀릴 수 있으므로)
  const d = multi.detail!(ok)!;
  check('근거에 원문이 담긴다', d.sections.some((s) => s.text === '※ 본교 최대 5회 지원 가능'));
  check('근거가 원문이 정본임을 밝힌다', d.sections.some((s) => s.note?.includes('모집요강')));
  const ds = site.detail!(ok)!;
  check('입학처 근거에 연락처가 함께', ds.sections[0].items?.some((i) => i.label === '전화') === true);
  check('입학처 근거에 원서접수가 함께', ds.sections[0].items?.some((i) => i.label === '원서접수') === true);

  // 주소가 아닌 값 — 링크가 없는 이유를 말한다
  const textOnly = col({
    univInfo: { info: { ...info, homeUrl: null, homeRaw: '입학처(해오름관 2층)' }, candidates: [], ambiguous: false, viaBase: false },
  });
  check('주소가 아니면 원문을 적는다', site.text(textOnly) === '입학처(해오름관 2층)');
  check('링크가 없는 이유를 밝힌다', site.detail!(textOnly)?.sections.some((s) => s.note?.includes('안내 문구')) === true);

  // 폴백으로 붙었으면 무엇과 붙었는지 밝힌다
  const viaBase = col({ univInfo: { info, candidates: [info], ambiguous: false, viaBase: true } });
  check('폴백이면 매칭된 대학명을 밝힌다', site.detail!(viaBase)?.sections.some((s) => s.note?.includes('원광대학교')) === true);

  // `<button>` 안에 `<a>` 를 넣지 않는다 (상호작용 요소 중첩)
  check('입학처 셀은 컨트롤로 취급', cellHasControl(site, false) && cellHasControl(site, true));
  check('입학처 셀은 통째로 감싸지 않는다', !shouldWrapCell(site, false, true));
  check('복수지원 셀은 통째로 감싸도 된다', shouldWrapCell(multi, false, true));

  // 영역이 흩어지면 표 머리글이 어긋난다
  const basicKeys = rows.filter((r) => r.section === 'basic').map((r) => r.key);
  const firstNonBasic = rows.findIndex((r) => r.section !== 'basic');
  check('기본 정보 행이 연속 블록', rows.slice(0, firstNonBasic).every((r) => r.section === 'basic') && basicKeys.length === firstNonBasic);
  check('모든 행이 text() 를 갖는다', rows.every((r) => typeof r.text === 'function'));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
