import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { articleFields, fieldsOfLabel, matchedFields, MAX_INTEREST_FIELDS, normalizeFields, preselectedFields, suggestFields, WORLD_FIELDS } from '../fields';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map(m => m[1]);

test('분야 목록 세 벌(TS · SQL · 엣지 함수)이 글자·순서까지 같다', () => {
  const sql = read('../../../../../supabase/migrations/20261011130000_world_news_fields_and_interests.sql');
  const sqlBody = /select array\[([\s\S]*?)\]::text\[\]/.exec(sql)?.[1];
  assert.ok(sqlBody, 'field_list() 본문을 찾지 못함');
  assert.deepEqual(quoted(sqlBody), [...WORLD_FIELDS]);
  const edge = read('../../../../../supabase/functions/world-news-fields/index.ts');
  const edgeBody = /export const FIELDS = \[([\s\S]*?)\] as const/.exec(edge)?.[1];
  assert.ok(edgeBody, '엣지 함수 FIELDS 를 찾지 못함');
  assert.deepEqual(quoted(edgeBody), [...WORLD_FIELDS]);
  // 상한도 짝이다 — DB CHECK 가 5개를 넘는 저장을 거부한다.
  assert.match(sql, new RegExp(`cardinality\\(fields\\) <= ${MAX_INTEREST_FIELDS}`));
});

test('희망 학과 → 분야', () => {
  assert.deepEqual(fieldsOfLabel('간호학과'), ['의학·보건']);
  assert.deepEqual(fieldsOfLabel('의예과'), ['의학·보건']);
  assert.deepEqual(fieldsOfLabel('치의예과'), ['의학·보건']);
  assert.deepEqual(fieldsOfLabel('물리치료학과'), ['의학·보건']); // 물리·우주 아님
  assert.deepEqual(fieldsOfLabel('국어교육과'), ['교육·심리', '인문·언어']);
  assert.deepEqual(fieldsOfLabel('영어영문학과'), ['인문·언어']);
  assert.ok(fieldsOfLabel('공학계열 1').includes('공학·로봇'));
  assert.deepEqual(fieldsOfLabel('자유전공학부'), []);
});

test('지식그래프 관심 라벨 → 분야', () => {
  assert.deepEqual(fieldsOfLabel('건강·의학·생명과학 탐구'), ['의학·보건', '생명과학']);
  assert.deepEqual(fieldsOfLabel('화학·생명과학·의학 탐구'), ['의학·보건', '생명과학', '화학·소재']);
  assert.deepEqual(fieldsOfLabel('인공지능 기술·윤리·사회 탐구'), ['AI·컴퓨터', '사회·윤리·법']);
  assert.deepEqual(fieldsOfLabel('환경·기후 문제 탐구와 실천'), ['지구·환경']);
  assert.deepEqual(fieldsOfLabel('수학·과학 모델링과 실생활 응용 탐구'), ['수학']);
});

test('한 낱말이 다른 분야를 품는 자리는 걸리지 않는다', () => {
  assert.ok(!fieldsOfLabel('생명공학').includes('공학·로봇'), '생명공학 ≠ 공학·로봇');
  assert.ok(!fieldsOfLabel('법의학').includes('사회·윤리·법'), '법의학 ≠ 법');
  assert.ok(fieldsOfLabel('법의학').includes('의학·보건'));
  assert.ok(!fieldsOfLabel('미술 감상과 표현 기법을 통한 시각 메시지 탐구').includes('사회·윤리·법'), '기법 ≠ 법');
  assert.ok(!fieldsOfLabel('문제 해결 방법').includes('사회·윤리·법'), '방법 ≠ 법');
  assert.ok(fieldsOfLabel('헌법과 인권').includes('사회·윤리·법'));
  // 희망 학과 실재값(2026-10-11 라이브 202종 전수 대조)에서 나온 자리
  assert.deepEqual(fieldsOfLabel('자율전공학부'), []);
  assert.deepEqual(fieldsOfLabel('사범대자율전공학부'), []);
  assert.deepEqual(fieldsOfLabel('소방안전공학과'), ['공학·로봇']);
  assert.deepEqual(fieldsOfLabel('역사문화학과'), ['인문·언어']);
  assert.ok(!fieldsOfLabel('군사학과').includes('인문·언어'));
  assert.deepEqual(fieldsOfLabel('항공서비스학과'), []);
  assert.deepEqual(fieldsOfLabel('항공우주공학과'), ['물리·우주', '공학·로봇']);
  assert.deepEqual(fieldsOfLabel('안경광학과'), ['의학·보건', '물리·우주']);
});

test('추천: 희망 학과가 생기부 관심보다 무겁고, 근거를 글로 남긴다', () => {
  const suggestions = suggestFields({
    departments: ['간호학과'],
    interests: ['환경·기후 문제 탐구와 실천', '사회·윤리·제도 탐구와 논증', '건강·의학·생명과학 탐구'],
  });
  assert.equal(suggestions[0].field, '의학·보건');
  assert.equal(suggestions[0].score, 4);
  assert.deepEqual(suggestions[0].reasons, ['희망 학과 간호학과', '생기부 관심 건강·의학·생명과학 탐구']);
  assert.equal(preselectedFields(suggestions).length, 3);
  assert.deepEqual(suggestFields({ departments: [], interests: [] }), []);
});

test('같은 점수면 목록 순서로 결정적이다', () => {
  const a = suggestFields({ departments: [], interests: ['경제·경영·마케팅 탐구', '환경 보호'] }).map(s => s.field);
  assert.deepEqual(a, ['지구·환경', '경제·경영']);
});

test('정규화: 목록 밖·중복·공백·잘못된 모양을 버리고 상한을 지킨다', () => {
  assert.deepEqual(normalizeFields([' 의학·보건 ', '의학·보건', '의학', 3, '수학']), ['의학·보건', '수학']);
  assert.deepEqual(normalizeFields(null), []);
  assert.deepEqual(normalizeFields('의학·보건'), []);
  assert.equal(normalizeFields([...WORLD_FIELDS]).length, MAX_INTEREST_FIELDS);
  assert.deepEqual(articleFields({ fields: null }), []);
  assert.deepEqual(articleFields({}), []);
});

test('맞춤 근거는 기사의 분야 순서(주된 분야 먼저)를 따른다', () => {
  const article = { fields: ['의학·보건', 'AI·컴퓨터', '생명과학'] };
  assert.deepEqual(matchedFields(article, ['생명과학', '의학·보건']), ['의학·보건', '생명과학']);
  assert.deepEqual(matchedFields(article, ['경제·경영']), []);
  assert.deepEqual(matchedFields({ fields: null }, ['의학·보건']), []);
});
