# Work Spec 엔진

문서 유형 독립적 HWPX 자동 채움 엔진. 설계 문서: `docs/superpowers/specs/2026-07-24-document-work-spec-design.md`

## 일반화 원칙 (위반 금지)

1. **이 디렉터리에 특정 양식의 지식을 두지 않는다** — 라벨 문자열, 더미 이름, 행 수, 표 구조 등 문서 고유 정보는 전부 스펙 인스턴스(JSON)나 회귀 스크립트 픽스처에 있다.
2. `detect.ts`의 `DEFAULT_CONVENTIONS`는 한국 공문 **일반 관습**(□ 체크박스, 연번 열, 합계 행, "예시" 표기)만 담고, 호출측이 교체할 수 있다.
3. 탐지 결과는 **제안**이다 — `confirmRequired` 타깃은 사람 확정 없이 실행하지 않는다.
4. 새 문서 유형 지원 = 새 스펙(JSON) 1건. 새 kind(엔진 코드)가 필요해지는 경우에만 이 디렉터리를 수정한다.

## 모듈

| 파일 | 역할 |
|------|------|
| `types.ts` | Work Spec v1 스키마(타깃 9종·locator 6종·제약·지식 소스) |
| `hwpxIndex.ts` | HWPX 섹션 구조 인덱서(순수 문자열, DOM 비의존) + 오프셋 편집 프리미티브 |
| `locator.ts` | 구조 주소→지문 검증→재바인딩→stale 이중화 해석 |
| `formula.ts` | computed·제약용 화이트리스트 식 언어(eval 금지) |
| `engine.ts` | fill 오케스트레이션(keep 스냅샷→일반 타깃→재색인→rowGroup→tableGroup 순차) |
| `verify.ts` | 제약·잔여물·keep 불변성 기계 검증 |
| `planSchema.ts` | 스펙의 plan.* 참조에서 plan 스키마 자동 유도 |
| `detect.ts` | 구조 탐지기(스펙 초안 제안) |
| `llm.ts` | plan/prose/의미분류 프롬프트 + ChatFn 계약(주입) |
| `knowledge.ts` | 지식 소스 해석(DbFetch 주입) |

앱 어댑터(supabase 주입)는 `../services/specFillService.ts`.

## 반복 구조 2종 — `rowGroup`과 `tableGroup`

| | 무엇을 복제하나 | 언제 쓰나 |
|---|---|---|
| `rowGroup` | 표 **안의 행** | 항목 수만큼 행이 늘어나는 표(예산 내역, 주차별 계획) |
| `tableGroup` | 표를 감싼 **문단째**(=표 1개) | 행 수가 고정된 표를 항목마다 하나씩 만들어야 할 때 |

`tableGroup`이 성립하는 이유는 HWPX에서 표가 **평범한 문단의 `<hp:run>` 안에** 있기 때문이다. 표 앞 런(소제목)이 같은 문단에 있어 복제 시 함께 따라오고, 감싼 문단 경계는 원문에서 `lastIndexOf('<hp:p ', table.start)` / `indexOf('</hp:p>', table.end)`로 정확히 잡힌다(표 앞 런에는 `hp:p`가 없고 셀 문단은 전부 `table.end` 이전).

소제목은 셀이 아니라 런이라 절대 위치 locator로 N번째 복제본을 가리킬 수 없다 → `caption: { anchor, source }`로 타깃 필드에 둔다.

**`tableGroup`의 범위 밖**: 행 수가 항목마다 달라지는 표. 병합(`4×2` 등)을 쪼개야 하므로 복제로는 안 된다. 필요해지면 표 안에 `rowGroup`을 중첩하는 방향으로.

## 회귀

```bash
npx tsx scripts/task-work-spec-test/run-form1.mts       # 구조 신호형 E2E(전 kind + 라운드트립)
npx tsx scripts/task-work-spec-test/run-form2.mts       # 의미 신호형 메커니즘(런 분할 마크·keep·더미 치환)
npx tsx scripts/task-work-spec-test/run-form2-full.mts  # form2 저장 스펙 66타깃 종단(DB 스펙의 단일 출처)
npx tsx scripts/task-work-spec-test/run-tablegroup.mts  # 표 묶음 복제(병합·주소·캡션·XML 균형)
npx tsx scripts/task-work-spec-test/run-detect.mts      # 탐지 제안 + 미학습 제3문서 일반화 가드
npx tsx scripts/task-work-spec-test/check-indexer.mts   # 자기완결 태그가 문단 스택을 어긋내지 않는지
npx tsx scripts/task-work-spec-test/check-designate.mts # 지정 결함 3종(choice options·데이터 구역·복제 원본)
npx tsx scripts/task-work-spec-test/check-plan-rows.mts # 항목 수 상·하한 유도 + 행 N개 추가 클램프
```

수정 시 모두 통과해야 한다. 새 문서 유형에서 실패를 발견하면 픽스처와 단언을 **종류·개수 기준**(특정 문자열 금지)으로 추가한다.

## 검증이 파서에 종속되면 안 된다

잔여물처럼 "문서에 이 문자열이 남아 있는가"를 묻는 검사는 `parseHwpxSection().fullText`가 아니라 **원문 `<hp:t>` 기준**(`rawSectionText`)으로 한다. 인덱서가 문단을 흘리면 검사도 함께 눈이 멀어 **거짓 음성**이 된다(2026-07-27 실측: 표를 감싼 문단이 통째로 빠져 남아 있는 예시 문구를 0건으로 통과).
