# 공통 모달 디자인과 저장 후 갱신

2026-09-10

## 적용 범위

공용 Dialog·AlertDialog를 사용하는 화면에 일정 추가 모달의 24px 모서리, 얇은 구분선,
헤더·푸터 여백, 둥근 닫기/하단 버튼을 적용했다. 출결·일정·문서·메시지·관리·평가 화면의
개별 하단 액션 영역 37곳을 DialogFooter로 옮겼다. 평가 기록 기능의 별도 UI 래퍼도
공용 컴포넌트를 다시 내보내도록 통합했다.

과목·세특·유사 문장 상세의 직접 구현한 오버레이 3곳은 공용 Dialog로 전환했다.
문서 편집기, 전체 높이 화면, 일정 입력창은 기존 전용 본문 구성을 유지한다.
Sheet·Drawer는 측면/하단 배치에 맞는 기존 형태를 유지하며 공통 레이어에 참여한다.

## 레이아웃과 드롭다운

- 바깥 `DialogContent`는 크기·위치·테두리·그림자를 담당하며 overflow를 허용한다.
- 안쪽 `[data-slot="dialog-viewport"]`는 패딩·grid/flex·스크롤을 담당한다.
  기존 `className`의 레이아웃 유틸리티는 `splitDialogClasses`가 안쪽으로 옮긴다.
- 기본 패딩에서는 바로 아래 DialogHeader·DialogFooter가 테두리까지 이어진다.
  직접 구성하는 편집기는 `p-0 flex flex-col`과 내부 `min-h-0 flex-1 overflow-y-auto`로
  헤더·본문·푸터를 나눌 수 있다. 커스텀 스타일에서 바깥 노드의 직계 자식을 가정하면
  새 viewport 구조에 맞춰 선택자를 지정해야 한다.
- Popover·Select·DropdownMenu·ContextMenu·Tooltip·HoverCard는 현재 모달의 바깥
  surface 안에 portal을 만든다. 본문 스크롤에 잘리지 않으면서 모달의 포커스/접근성 범위에 남는다.
  모달 내부 드롭다운에서 `container={document.body}`를 강제하지 않는다.

## 중첩 모달

`modal-surface.tsx`가 실제 마운트된 surface의 순서와 부모 관계로 z-index를 계산한다.
Dialog·AlertDialog·Sheet·Drawer가 같은 스택을 사용하며, 포커스·Escape·바깥 클릭은
Radix가 관리한다. 자식 모달의 form submit은 surface에서 전파를 멈춰 부모 form을
함께 제출하지 않는다. 닫힌 DialogContent를 렌더링한 것만으로는 레이어를 등록하지 않는다.

기존 [Radix 의존성 단일화 규약](../nested-modal-pitfalls.md)은 계속 적용된다.

## 저장 후 즉시 반영

App은 `AppQueryClient`를 사용한다. 같은 데이터를 다른 키로 조회하는 화면들의 관계를
명시적으로 연결하여 저장한 화면 외의 활성 목록/대시보드도 다시 조회한다.

| 변경 데이터 | 연결된 조회 범위 |
|---|---|
| 일정·회의 | 일정 목록, 회의 상세, 오늘의 회의, 학생 주간 일정 |
| 업무·행사 | 행사 목록/상세, 내 업무, 통계, 일정의 업무 마감 |
| 시간표·학기 | 교사/학생 시간표, 오늘의 시간표, 학기·과목 선택 |
| 과목·수강 | 과목 개설, 수강 정보, 과제 과목 선택, 학생 일정 |
| 리소스·태그 | 리소스/태그 목록, 선택기, 표시 이름, 시간표 리소스 |

연결된 비활성 조회는 stale 처리한다. 모달을 닫기만 했을 때 모든 캐시를 무효화하거나
브라우저를 새로고침하지 않는다. 같은 루트의 개별 ID/exact 조건은 유지하며 관계는
한 단계만 확장한다. 새 조회 키는 실제 데이터 의존성을 확인한 뒤 관계를 추가해야 한다.

일정 수정/삭제는 갱신을 기다린 뒤 완료한다. 업무 상세는 상태뿐 아니라 제목·유형도
갱신된 데이터에서 읽는다. 캘린더의 선택 일정도 현재 목록에서 다시 찾는다. 리소스 관리의
직접 저장·가져오기는 자체 목록과 공용 선택기 캐시를 함께 갱신한다. 프로필 저장은
인증/프로필 상태를 갱신하고 강제 페이지 새로고침을 제거했다.

이 방식이 개별 화면의 로컬 state를 자동으로 동기화하지는 않는다. 직접 API를 호출하는
새 모달은 성공 후 목록 갱신 콜백 또는 관련 invalidate를 실행해야 한다. 편집 대상은
가능하면 ID를 저장하고 현재 데이터에서 파생해 오래된 선택 객체가 남지 않도록 한다.

## 휴대폰 표시 방식 (2026-09-20)

### 규칙

사용자 규칙은 **"입력 한두 개짜리는 지금처럼 가운데, 내용이 복잡하면 화면을 통째로"** 다.
문제는 "복잡한가"를 화면마다 사람이 다시 판단하면 70개 모달이 제각각이 된다는 것이라,
**작성자가 이미 선언해 둔 데스크톱 크기에서 유도**한다.

| 값 | 언제 | 모양 |
|---|---|---|
| `center` | 그 외 전부 (기본) | 종전과 같은 가운데 상자 |
| `fullscreen` | `max-w-lg`(512px) 이상 **또는** `max-h-[80vh]`/`h-[80vh]` 이상을 선언 | 0,0 부터 100dvh, 테두리·모서리 없음 |
| `sheet` | 공용 피커 전용(직접 쓰지 않는다) | 아래에서 올라오는 시트, 최대 85dvh |

판정 = `src/components/ui/dialog-layout.ts` 의 `resolveMobilePresentation`,
배치 = `src/components/ui/modal.css`, 경계값 = `MOBILE_MODAL_BREAKPOINT`(640px).
`DialogContent` 가 결과를 `data-mobile` 로 내보내고 CSS 가 그것만 본다.

**유도가 틀리면 `mobile` prop 으로 못 박는다** — 목록을 손으로 관리하지 않기 위해서다.
현재 명시한 곳 = `StickyNote`·`StudentStickyNote` 의 "노트 수정"(폭은 500px 로 좁게
선언했지만 실제로는 제목+본문+색상 편집기), `TaskUnitEditor` 의 "붙여넣기로 단위 추가"
(rows=7 textarea 에 표를 붙여넣는다). 반대로 넓게 선언한 안내 모달이 있으면 `'center'`.

**`AlertDialog` 는 `data-mobile` 을 붙이지 않는다** — 확인창이 "입력 한두 개"의 전형이라
어떤 폭에서도 가운데다. 다만 공용 뷰포트를 함께 쓰므로 줄어든 패딩과 44px 푸터 버튼은
그대로 적용된다.

### 조용히 틀리는 자리

- **⚠️ 배치를 JS 로 하지 말 것.** 뷰포트를 재서 분기하면 첫 렌더가 폭을 모른 채 한 번
  잘못 그려지고, 회전·키보드 전환마다 다시 계산해야 한다. CSS 미디어 쿼리는 그 둘이 없다.
  JS 쪽(`useIsMobileModal`)은 **구조가 달라지는 것**(팝오버 ↔ 시트, 자동 포커스 여부,
  [완료] 버튼)에만 쓰고, 크기·위치·모서리는 전부 CSS 다.
- **⚠️ 특이도를 눈대중하지 말 것** (2026-09-12 토스트 사고와 같은 부류).
  Tailwind 의 평범한 유틸리티(`max-w-lg`)는 0-1-0 이지만 **변형 유틸리티**
  (`data-[state=open]:animate-in`)는 0-2-0 이다. 그래서 배치 규칙은 속성 선택자 2개,
  **애니메이션 규칙은 3개**(`[data-slot][data-mobile][data-state]`)로 두었다. 0-2-0 끼리는
  소스 순서로 갈리는데 `modal.css` 와 Tailwind 출력의 순서는 보장되지 않는다.
- **⚠️ 화면을 꽉 채우면 기본 `grid` 뷰포트가 행을 벌린다.** `align-content` 기본값
  (`normal`=stretch)이 auto 트랙을 늘리므로 남는 세로 공간이 **입력칸 사이사이로** 배분돼
  폼이 흩어진다. 높이가 내용에 맞던 데스크톱에서는 남는 공간이 없어 드러나지 않던 동작이다.
  전체화면에서만 세로 flex 로 바꾸고(자식 `flex-shrink: 0` = grid 와 같은 "안 줄어듦")
  푸터에 `margin-top: auto` 를 줘 화면 아래(엄지 위치)에 붙인다.
  `.grid` 를 선택자로 쓸 수 있는 근거: 호출부가 `flex` 를 넘기면 `cn()` 의 tailwind-merge 가
  display 충돌로 `grid` 를 **지운다**(실측). 즉 DOM 의 `.grid` 는 "기본 뷰포트를 그대로
  쓰는 모달"이라는 정확한 표시이고, 직접 flex 를 구성한 편집기는 건드리지 않는다.
- **⚠️ inline `padding` 을 되살리지 말 것.** 안전영역(`env(safe-area-inset-*)`) 패딩은
  바깥 surface 에 줘야 안쪽 스크롤 영역이 그만큼 줄어드는데, inline style 은 어떤
  선택자보다 세다. 그래서 종전 `style={{ padding: 0 }}` 을 클래스 `p-0` 으로 옮겼다.
- **⚠️ 경계값은 두 곳에 있다.** `modal.css` 의 `@media (max-width: 639.98px)` 와
  `useIsMobileModal` 이 같은 값이어야 한다. 어긋나면 그 사이 폭에서 **JS 는 시트로 그리는데
  CSS 는 가운데 모달로 배치**하고, 오류는 나지 않는다. `use-mobile.tsx`(768px)와 섞지 말 것 —
  그쪽은 네비게이션 경계라 700px 태블릿에서 모달과 드롭다운의 판단이 갈린다.

## 드롭다운 → 선택 시트 (2026-09-20)

`src/components/ui/responsive-picker.tsx` — 데스크톱에서는 `Popover`, 휴대폰에서는
아래에서 올라오는 `Dialog` 시트. `PickerRoot`/`PickerTrigger`/`PickerContent` 로 기존
`Popover*` 를 그대로 치환한다.

**왜.** 팝오버는 마우스용 부품이다. 휴대폰에서는 ①트리거에 붙어 뜨므로 화면 아래쪽 입력에서
열면 목록이 접히고 ②키보드가 올라오면 남는 높이가 200px 남짓이라 두세 줄만 보이며
③바깥을 탭하면 닫히는데 그 "바깥"이 목록 바로 옆 몇 px 이다.

적용 = `SearchableMultiSelect`·`SearchableSelect`·`DepartmentSelect`(앱 전역 35파일) +
`BoardCategorySelect`·`EventCreateDialog`(2개)·`TaskEditDialog`(1개).
**아직 남은 것**(요청 범위 밖) = `features/exam-schedule/.../SupervisionShared.tsx`,
`features/inquiry-design/.../CurriculumSubjectCombobox.tsx`.

### 시트가 스스로 책임지는 것

- **목록 높이.** 소비처의 `max-h-[200px]`(팝오버 시절 값)을 시트 CSS 가 덮는다
  (`[data-mobile="sheet"] [cmdk-list]`). 소비처마다 분기를 넣으면 새 피커가 늘 때
  같은 실수를 반복한다 — 증상은 "시트 아래쪽이 텅 빈 채 목록만 좁게 스크롤".
- **포커스.** 열릴 때 **검색 입력이 아니라 시트 자신**으로 옮긴다. 검색 입력을 잡으면
  키보드가 즉시 올라와 목록이 두세 줄이 되고, 그냥 두면 **바깥 모달의 입력에 포커스가
  남아**(실측) 키보드 사용자가 시트에 들어갈 수 없다.
- **키보드.** `position: fixed; bottom: 0` 은 키보드에 덮인다(기본
  `interactive-widget=resizes-visual` 에서 키보드는 레이아웃 뷰포트를 줄이지 않는다).
  뷰포트 메타를 `resizes-content` 로 바꾸면 해결되지만 **앱 전체에 걸려 모바일 하단
  내비가 키보드 위로 올라온다** — 하나를 고치려고 다른 하나를 깬다. 그래서 시트 쪽에서만
  처리한다: 입력에 포커스가 들어오면 높이를 85dvh 로 고정해 **시트 윗부분(검색창 + 결과
  앞줄)이 키보드 위로** 올라오게 한다(`data-sheet-expanded`).
- **중첩.** 시트는 `Dialog` 라서 모달 안에서 열면 모달 속 모달이 된다. `modal-surface.tsx`
  의 레이어 스택이 z-index 를 쌓고 `DialogPortal` 은 container 를 넘기지 않아 body 로
  나간다([중첩 모달 규약](../nested-modal-pitfalls.md)). 팝오버 경로는 종전대로
  `usePortalContainer` 가 바깥 모달 **안으로** 넣는다 — **두 경로의 규칙이 반대인 것은
  의도된 것**이다.

## 손가락 크기·글자 크기 (2026-09-20)

- 모달 푸터 버튼·`CommandItem`·`SelectItem`·닫기 버튼 = 휴대폰 **44px**, 데스크톱 밀도는
  `sm:` 에서 되돌린다(업무 관리 툴바의 `h-8` 어휘를 데스크톱에서 깨지 않는다).
- `Textarea`·`CommandInput` = 휴대폰 **16px**(`text-base md:text-sm`, `Input` 과 같은 규칙).
  **16px 미만 입력은 iOS Safari 가 포커스 때 화면을 확대하고 되돌리지 않는다** — 모달
  안에서는 저장 버튼이 화면 밖으로 밀려 저장을 못 한다.
- **⚠️ 그 primitive 기본값만으로는 안 지켜진다 (스크린샷 검증에서 발견).**
  호출부가 `text-sm` 을 주면 `cn()` 의 tailwind-merge 가 **같은 group 인 `text-base` 를
  지운다**. 실측(2026-09-20): 공지 본문 14px · 공지 게시 기간 date **12px** ·
  구매 신청 컬럼명 14px. 호출부를 하나씩 고치면 **새로 쓰는 `text-sm` 마다 다시 뚫리므로**
  `modal.css` 가 모달 안 입력에 16px 를 한 번 더 건다(`[data-slot="dialog-content"]
  :is(input, textarea, select)` = 0-1-1 > 유틸리티 0-1-0, 640px 미만에서만).
  **새 모달은 입력 폭을 "휴대폰에서 16px" 기준으로 잡을 것** — `text-xs` 로 두 칸을
  나란히 놓는 설계는 휴대폰에서 그대로 재지 않는다.
- 모달 기본 패딩 = 좁은 화면에서 24→20px. 헤더·푸터가 테두리까지 이어지게 만드는 음수
  마진도 같은 값으로 맞춘다(**한쪽만 바꾸면 헤더가 한 줄 어긋나 보인다**).
- **⚠️ `overflow:hidden`/스크롤바 숨김은 넘침을 "없앤" 것이 아니라 "안 보이게" 한 것이다.**
  회의 가능 시간 표(도구 모음 · 스케줄 [부가 기능])는 칸이 `min-w-[80px]` 고정이라 390px 에서 금요일이
  화면 밖이었는데, 이 표가 스크롤바를 숨겨 둬서(`[&::-webkit-scrollbar]:hidden`)
  **열이 빠진 줄도 알 수 없었다**(휴대폰에서만 54px 로 좁혀 월~금이 다 들어온다).
  `scrollWidth > clientWidth` 검사는 **조상이 잘라 내면 통과**하므로, 잘림은
  `overflow-x: hidden` 인 요소를 따로 세야 잡힌다(스크린샷 러너가 그렇게 한다).

## 휴대폰 뒤로가기 = 맨 위 모달 닫기 (2026-09-22)

요구: "모바일 사이트에서 모달이 동작할 때 뒤로가기를 누르면 활성화되어 있는 모달이 꺼지는 식으로
동작하도록 하고 싶음. (바로 이전 페이지로 돌아가는 게 아니라)"

### 어떻게 동작하나

모달이 열리면 **URL 이 같은** 기록 항목을 하나 쌓는다. 휴대폰의 뒤로가기(안드로이드 버튼·
제스처, iOS 스와이프)는 그 항목을 꺼내고, 우리는 그 신호로 **맨 위 모달 하나만** 닫는다.
중첩이면 안쪽부터 한 번에 하나씩, 다 닫힌 다음의 뒤로가기는 종전처럼 이전 페이지다.

| 파일 | 역할 |
|---|---|
| `src/lib/modalBackHistory.ts` | 순수 관리자(가짜 기록으로 회귀 가능) + 앱 싱글턴 + `installModalBackHistory()` |
| `src/components/ui/modal-back.tsx` | `createBackClosableRoot`(Root 래퍼) · `useModalBackClose`(직접 만든 오버레이용) · `useModalBackEscapeGuard` |
| `src/components/common/ModalBackRouterSync.tsx` | 라우터 위치를 관리자에 알린다 — `App.tsx` 의 `BrowserRouter` 안에 **하나만** |
| `src/main.tsx` | React 렌더 **전에** 설치(라우터보다 먼저 popstate 를 받아야 한다) |

`Dialog`·`AlertDialog`·`Sheet`(모바일 햄버거 메뉴 포함)·`Drawer`·휴대폰 선택 시트(`PickerRoot`)가
전부 자동이다 — **소비처는 아무것도 하지 않는다.** Radix 를 직접 쓰는 곳만 `useModalBackClose` 를
부른다(현재 아카데미 `GameModal`·`GameExitButton`).

- **대상 기기 = `pointer: coarse`**(터치가 주 입력 — 휴대폰·태블릿). 폭(640px)이 아니라 입력 방식으로
  가른 이유: 태블릿에도 시스템 뒤로가기가 있고, 좁은 데스크톱 창에는 없다. **데스크톱은 종전 그대로**
  (기록을 쌓지 않는다, 2026-09-22 실측).
- **뒤로가기는 Esc 와 같은 규칙으로 닫힌다.** Content 의 `onEscapeKeyDown` 을 먼저 불러 보고
  `preventDefault()` 하면 닫지 않는다(`NoticeFormDialog` 저장 중, `ContextLibraryDialog` 작성 중).
  그다음 `onOpenChange(false)` — 거기서 거부해도 닫지 않는다. **닫히지 않으면 항목을 다시 쌓으므로
  다음 뒤로가기도 페이지를 떠나지 않는다**(작성 중 내용 보호). 아카데미 "창가의 하늘"처럼 Esc 가
  "한 단계 나가기"인 모달은 뒤로가기도 한 단계씩 나간다.
- 모달 하나만 끄려면 Root 에 `closeOnBack={false}` — 끄면 뒤로가기가 모달을 연 채 이전 페이지로
  간다. 모달이 뒤로가기를 스스로 다루는 경우가 아니면 쓰지 말 것(현재 사용처 0).

### 규칙은 하나 — "기록 깊이 = 열린 모달 수"

경우를 따로 처리하지 않고 무슨 일이 생기면 `reconcile()` 이 둘을 맞춘다. 기록 항목은 모달 id 가
아니라 **깊이 표시**(`history.state.__modalDepth = n`)라서 이 규칙 하나로 다 된다.

| 상황 | 결과 |
|---|---|
| 모달이 열림 | 깊이 부족 → `pushState` |
| X·Esc·저장으로 닫힘 | 깊이 남음 → `history.go(-n)` 으로 스스로 치운다(안 치우면 다음 뒤로가기가 헛돈다) |
| 뒤로가기 | 깊이 줄어듦 → 넘치는 모달에 닫기 요청 |
| 닫기 거부 | 깊이 부족 → 다시 `pushState` |
| A 닫고 B 열기(한 틱) | 깊이 불변 → **기록을 건드리지 않는다**(형제 패턴 — 일정 설문 결과 → 일정 만들기. 처음 쓴 `SpecSubmissionComposerDialog` 는 2026-10-05 삭제) |
| 모달 안에서 다른 화면으로 이동 | 남은 항목은 고아 — 뒤로가기로 거기 닿으면 한 칸 더 뒤로(= 한 번에 원래 화면) |
| 라우터 replace 가 항목을 덮음(모달은 열린 채) | 깊이 표시가 사라짐 → 다시 쌓는다 |

### 조용히 틀리는 자리

- **⚠️ 라우터가 모달 전환 popstate 를 받으면 URL 로 여는 모달이 닫히자마자 다시 열린다.**
  우리 항목은 바로 아래 항목의 state(react-router 의 `usr`·`key`·`idx`)를 복사하므로 라우터가
  받아도 **값이 같은 위치**를 계산하지만, 새 location 객체가 생겨 `useSearchParams` 값이 바뀐 것처럼
  보인다 → `useEffect(() => { if (params.get('task')) open() }, [searchParams])` 가 다시 돈다.
  그래서 "라우터가 볼 위치가 지금과 **값까지** 같을 때만" 캡처 단계에서 `stopImmediatePropagation()`
  으로 삼킨다. URL 이 바뀌는 popstate 는 절대 삼키지 않는다. 판정에 라우터 위치가 필요해서
  `ModalBackRouterSync` 가 있다(fixture 실측: 삼키지 않으면 `paramOpenCount` 가 1 → 2).
- **⚠️ 우리가 부른 `go()` 의 도착을 사용자의 뒤로가기로 읽으면 방금 연 모달이 닫힌다.**
  `history.go()` 는 비동기다. "닫고 곧바로 다른 모달 열기"에서 되돌림이 도착하는 순간 새 모달은
  이미 그 깊이 위에 있다 — 회귀 ⑩이 실제로 이 버그를 잡았다. 되돌리는 중(`pending`)의 도착은
  아무것도 닫지 않고, 그동안의 push 도 미룬다(순서가 브라우저마다 다르다).
- **⚠️ 중첩 모달의 id 는 렌더 중에 정해야 한다.** 바깥·안쪽이 함께 열리면 React 는 안쪽 effect 를
  먼저 돌린다. id 를 등록할 때 받으면 안쪽이 부모를 모른 채 등록돼 **바깥이 "맨 위"** 가 된다.
  `useState(nextModalBackId)` + 부모 id 로 안쪽 앞에 끼워 넣는다(`modal-surface.tsx` 와 같은 수법).
- **⚠️ 새로고침하면 깊이 표시가 남는다.** 되돌리면 이전 문서로 가는 **전체 페이지 로드**가 되므로
  설치할 때 `replaceState` 로 지운다.
- **⚠️ `modal-back.tsx` 에 react-router 를 들이지 말 것.** `ProfileDialogWrapper` 처럼
  `BrowserRouter` **밖**에서 렌더되는 모달이 있어 `useLocation` 이 던진다. 라우터 동기화를 별도
  컴포넌트로 뺀 이유다.
- **⚠️ 모달 닫기 핸들러에서 `navigate(-1)`·`history.back()` 을 부르지 말 것.** 관리자가 이미 항목을
  치우므로 두 번 되돌아간다. 화면별로 popstate 를 직접 다루는 코드도 만들지 말 것 — 뒤로가기 처리는
  이 관리자 한 곳이다.
- **한계(우리가 막을 수 없는 것)**: 크롬은 **사용자 조작 없이** 쌓인 기록을 뒤로가기 버튼이 건너뛴다
  (history manipulation intervention). 페이지를 열자마자 딥링크로 **자동으로 열린** 모달은 뒤로가기가
  종전처럼 이전 페이지로 갈 수 있다. 사용자가 눌러서 연 모달은 해당하지 않는다. 또, 뒤로가기로 닫은
  모달의 항목은 **앞으로가기로 되돌아가지 않는다**(닿으면 되튕긴다 — 고아가 되지 않게).

### 검증

```powershell
npx tsx --tsconfig tsconfig.app.json scripts/modal-back-test/run.mts   # 88건 — 가짜 세션 기록 + 가짜 라우터 시뮬레이션 + 배선 정적 검사
# 실제 크롬 (개발 서버를 먼저 켠다) — 본문은 browser-checks.js 하나를 Playwright MCP 와 공유한다
node scripts/modal-back-test/run-browser.mjs
```

2026-09-22 실측(크롬, CDP 터치 에뮬레이션, fixture `/scripts/modal-back-test/index.html`) — 16/16 통과,
콘솔 오류 0: 열기=항목 +1 · 뒤로가기=모달만 닫힘(URL 불변) · 중첩=안쪽만 · Esc 로 닫으면 항목 정리 ·
저장 중 가드=두 번 눌러도 페이지 유지 · AlertDialog·Sheet·비제어 Dialog 닫힘 · 형제 갈아타기=기록 불변 ·
`?item=1` 모달 재오픈 없음 · 모달 안에서 이동 후 뒤로가기 한 번에 원래 화면.
별도 비터치 컨텍스트: `pointer: coarse`=false, 항목을 쌓지 않고 뒤로가기는 이전 URL 로(종전 그대로).

## 검증 (모바일)

```powershell
npx tsx scripts/mobile-modal-test/run.mts      # 90건 — 유도·경계값·특이도·피커 배선
npm run build

# 기능별 실제 모달 스크린샷 + 불변식 (개발 서버를 먼저 켠다)
$env:PLAYWRIGHT_MODULE = "C:\path\to\playwright\index.mjs"   # node_modules 에 없을 때만
$env:MODAL_TEST_URL = "http://localhost:8081"                  # 기본 8080
node scripts/mobile-modal-test/run-screenshots.mjs             # → .tmp/mobile-shots/
```

**정적 검사와 스크린샷은 잡는 것이 다르다.** 위 두 결함(입력 16px 구멍 · 잘린 금요일)은
정적 검사를 전부 통과하면서 화면에서만 틀려 있었다. 모달 모양을 건드렸으면 둘 다 돌릴 것.

`run-screenshots.mjs` 는 실제 기능 컴포넌트를 그대로 띄우고 백엔드만 메모리로 세운다
(기존 `scripts/modal-ui-test/run-*-previews.mjs` 와 같은 route-mock 방식). 검사 항목 =
표시 방식·화면을 채우는지·가로 넘침·**`overflow:hidden` 안에서의 잘림**·16px 미만 입력·
저장 버튼에 닿는지, 그리고 드롭다운을 눌렀을 때 시트가 **폭을 채우고 아래에 붙고 모달
위에 오고 포커스를 받고 열자마자 키보드를 띄우지 않는지**.
**⚠️ 목 모듈은 실제 모듈의 반환 모양을 그대로 흉내 내야 한다** — `useResourceSelect` 의
`individualItems` 한 칸을 빠뜨렸더니 모달이 아예 렌더되지 않았다(원인 메시지는
`Cannot read properties of undefined` 하나뿐이라 스택을 함께 찍게 해 뒀다).

브라우저 fixture = `/scripts/mobile-modal-test/index.html`(실제 데이터 없음). 개발 서버에서
390×844 로 열어 ①간단/복잡/편집기/강제 네 모달 ②피커 시트 ③시트를 닫은 뒤 페이지가
다시 클릭되는지(`body` 의 `pointer-events` 고착)를 본다.

2026-09-20 실측(390×844): 복잡 모달 = 0,0,390,844 · `max-width:none` · `transform:none` ·
`border-radius:0` · `animation-name: app-modal-rise` · 푸터 바닥 고정(bottom=844) ·
푸터 버튼 44px · 피커 시트 = 전체 폭, 85dvh, 항목 44px, 검색 16px, 포커스가 시트 안,
z-index 1021 > 모달 1001 · 닫은 뒤 `body: auto`.
1280×900 실측: 모달 672×455 · 모서리 24px · `animation-name: enter` · 뷰포트 `grid` ·
패딩 24px · 피커는 팝오버 · 목록 200px · 항목 32px · 검색 14px · 자동 포커스 — **전부 종전 그대로**.

기능별 실측(2026-09-20, 390×844, 전부 `fullscreen` 0,0,390,844):

| 영역 | 모달 | 푸터 |
|---|---|---|
| 공지사항 | 공지 작성 `NoticeFormDialog` | 흐름(닿음) |
| 시간표 | 활동 추가 `TimetableAddActivityDialog` | 흐름(닿음) |
| 협업 보드 | 보드 만들기 `CreateBoardDialog` + 카테고리 시트 | — |
| 업무 관리 | 표 제출 `SpreadsheetSubmissionDialog` | 붙박이(844) |
| 서류함 | 문서 추가 `AddDocumentDialog` | 흐름(닿음) |
| 도구 모음 · 스케줄 부가 기능 (2026-09-28 스케줄에도 추가) | 회의 시간 찾기 `MeetingTimeSearchDialog` | — |
| 구매 신청 | 페이지 만들기 `PageFormDialog` + 공동 작업자 시트 | — |
| 스케줄 | 일정 추가 `ScheduleCreateDialog` | — |

두 시트 모두 폭 꽉참 · 아래 붙음 · 모달 위(z-index) · 포커스가 시트 안 ·
열자마자 키보드 안 뜸 · 항목 44px 이상.

## 검증

```powershell
npm run build
npx tsx scripts/modal-layer-test/run.mts
npx tsx --test src/lib/__tests__/appQueryClient.test.ts src/components/ui/__tests__/dialogLayout.test.ts
```

브라우저 회귀 fixture는 `/scripts/modal-ui-test/index.html`에 있으며 실제 데이터를 쓰지 않는다.
Playwright가 설치된 환경에서 개발 서버를 켠 뒤 다음을 실행한다.

```powershell
# 필요하면 외부에 설치한 playwright/index.mjs 절대 경로를 지정
$env:PLAYWRIGHT_MODULE = "C:\path\to\playwright\index.mjs"
# 기본 개발 서버 주소가 다르면 MODAL_TEST_URL 지정
node scripts/modal-ui-test/run.mjs
```

Edge headless에서 모달 밖 드롭다운 클릭, 검색/단일 선택, 자식 form 제출 격리,
중첩 확인창, 포커스 복귀, Escape, 반복 열기/닫기, 새로고침 없는 대시보드 갱신,
긴 일정/고정 높이 편집기의 스크롤·푸터, 모바일 폭을 검증한다. 일정/편집기 스크린샷은
OS 임시 디렉터리의 `spacekijun-modal-{schedule,editor}.png`에 남긴다.

공통 동작은 자동 검증했으며 모든 권한 조합의 개별 화면 저장 흐름을 실제 계정으로
전수 검증한 것은 아니다. 전체 저장소에는 기존 ESLint 진단이 남아 있으므로 변경 파일의
기존 진단과 신규 진단을 구분해 확인한다. 이 작업에는 DB 마이그레이션이 없다.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

### 2. 모달 — `components/tasks/dialogDesign.tsx` 공용 부품

클래스 문자열을 복붙하지 말고 import한다. `DIALOG_HEADER_CLASS` /
`DIALOG_FOOTER_CLASS` / `FOOTER_BUTTON_CLASS` / `SectionLabel` / `TitleIconChip`.

- 3단 구조: 헤더(border-b, 그라데이션) → 본문(`px-4 sm:px-6`) → 푸터(border-t)
- **동작 버튼은 전부 푸터에 ghost**, 주행동(저장)만 solid primary. 파괴적 동작은 rose
- 긴 파일명·업체명 대비: 행은 **`min-w-0` + `truncate` + `title`** 3종 세트
  (`DialogContent`는 grid라 직계 자식만 `min-w-0`이 걸려 있다 — 중간에 flex 컨테이너를
  새로 만들면 거기서 다시 끊긴다)

**모달 안에 모달을 넣기 전에 `docs/nested-modal-pitfalls.md`를 읽을 것 (2026-09-04)**.
이 조합은 **오류 없이 조용히** 앱을 망가뜨린다 — 전자서명 확인 모달 하나가 **사이트 전체를 클릭 불가**로
만들었고, 원인은 우리 코드가 아니라 **Radix 하위 의존성의 사본이 갈라진 것**이었다(모듈 전역 상태를 가진
4종이 서로의 레이어를 못 본다). 같은 사고가 **세 층에서 따로 재발한다** — ①디스크(`package.json` 의
`overrides`) ②Vite 사전 번들(`resolve.dedupe`, 이미 갈라졌으면 `rm -rf node_modules/.vite`)
③**lockfile**(npm 과 bun 이 갈라져 **로컬 빌드는 성공하고 배포만 죽었다** → `bun.lockb` 삭제·gitignore).
증상·진단·검증은 전부 그 문서에 있다 — **관리하지 않을 lockfile 은 두지 말 것**이 거기서 나온 결론이다.
- **회귀 `npx tsx scripts/modal-layer-test/run.mts`** — 사본 수·`resolve.dedupe` 목록·**추적되는 bun lockfile 이 없는지**를 함께 검사한다. Radix 패키지를 새로
  추가하면 다시 갈라질 수 있는데 **갈라져도 빌드·타입 검사는 통과**하므로 이게 유일한 방어선이다.
- **런타임 안전망** `src/lib/modalPointerEvents.ts`(`main.tsx`에서 1회 설치): "열린 모달이 없는데
  body가 `none`"이면 해제하고 `console.warn`. 이 경고가 보이면 사본이 갈라진 것.
- 코드 규약 3가지: ①안쪽을 열 때 **바깥을 닫지 않는다**(겹쳐 띄우기이지 바꿔치기가 아니다),
  둘을 함께 닫아야 하면 바깥은 `requestAnimationFrame`으로 미룬다 ②`AlertDialogAction`에서
  비동기 작업을 하면 **`e.preventDefault()` 먼저**(기본 즉시 닫기를 막아야 실패 시 모달이 남는다)
  ③**중첩 `Dialog`는 `container`를 넘기지 않는다**(body 포털) — `DialogContent`의 `translate-*`가
  `fixed`의 기준 상자가 되어 화면이 아니라 바깥 모달 가운데에 뜬다. **Popover/Select는 정반대로
  `usePortalContainer`로 DialogContent 안에 넣는다**(위 dialog.tsx 주석) — 둘의 규칙이 반대다.

### 2-1. 모달의 휴대폰 표시 방식 — 손으로 정하지 않는다 (2026-09-20)

**`DialogContent` 가 알아서 고른다.** 휴대폰(<640px)에서 내용이 많은 모달은 화면을 통째로
쓰고(`fullscreen`), 입력 한두 개짜리는 종전처럼 가운데 뜬다(`center`). 판정은 화면마다
사람이 다시 하는 것이 아니라 **작성자가 이미 선언해 둔 데스크톱 크기에서 유도**한다 —
`max-w-lg`(512px) 이상이거나 `max-h-[80vh]` 이상이면 "내용이 많다"로 읽는다. 단일 출처 =
`src/components/ui/dialog-layout.ts` 의 `resolveMobilePresentation`, 배치는 **전부 CSS**
(`ui/modal.css`, 경계값 `MOBILE_MODAL_BREAKPOINT`=640). **유도가 틀리는 모달만**
`mobile="fullscreen"|"center"` 로 못 박는다(현재 3곳) — 목록을 손으로 관리하지 않기
위해서다. `AlertDialog`(확인창)는 언제나 가운데다.
- **⚠️ 배치를 JS 로 하지 말 것** — 뷰포트를 재면 첫 렌더가 폭을 모른 채 한 번 잘못 그려지고
  회전·키보드마다 다시 계산해야 한다. JS(`useIsMobileModal`)는 **구조가 달라지는 것**
  (팝오버↔시트·자동 포커스·[완료] 버튼)에만 쓴다. `use-mobile.tsx`(768px)와 섞지 말 것.
- **⚠️ 특이도를 눈대중하지 말 것** — Tailwind 변형 유틸리티(`data-[state=open]:animate-in`)는
  **0-2-0** 이다. 배치 규칙은 속성 2개, 애니메이션 규칙은 **3개**로 둔 이유가 이것이다
  (2026-09-12 토스트 사고와 같은 부류).
- **⚠️ 전체화면은 기본 `grid` 뷰포트의 행을 벌린다** — `align-content` 기본값이 auto 트랙을
  늘려 남는 세로 공간이 입력칸 **사이사이로** 배분된다(데스크톱에서는 남는 공간이 없어
  드러나지 않는다). 전체화면에서만 세로 flex 로 바꾸고 푸터를 바닥에 붙인다.
- **⚠️ `DialogContent` 에 inline `padding` 을 되살리지 말 것** — 안전영역
  (`env(safe-area-inset-*)`) 패딩이 조용히 죽는다. 그래서 `p-0` 은 클래스에 있다.

**드롭다운 선택기는 휴대폰에서 시트로 뜬다** — `ui/responsive-picker.tsx`
(`PickerRoot`/`PickerTrigger`/`PickerContent`). **새 검색 선택기에 `Popover` 를 직접 쓰지
말 것.** 적용 = `SearchableMultiSelect`·`SearchableSelect`·`DepartmentSelect` +
직접 만든 콤보박스 3종. 시트는 목록 높이·포커스·키보드를 **스스로** 책임지므로 소비처는
분기를 넣지 않는다. 남은 미적용 2곳(시험 감독·탐구 설계 과목 선택)은 문서에 적어 두었다.

**손가락·글자 크기**: 모달 푸터 버튼·목록 항목·닫기 버튼 = 휴대폰 44px(데스크톱 밀도는
`sm:` 에서 되돌린다), 입력류 = 휴대폰 **16px** — **16px 미만은 iOS 가 포커스 때 화면을
확대하고 되돌리지 않는다**(모달 안에서는 저장 버튼이 화면 밖으로 밀린다).
- **⚠️ `Input`/`Textarea` 기본값(`text-base md:text-sm`)만으로는 안 지켜진다** — 호출부가
  `text-sm` 을 주면 tailwind-merge 가 `text-base` 를 **지운다**. 그래서 `modal.css` 가
  모달 안 입력에 16px 를 한 번 더 건다. **새 모달의 입력에 `text-xs`·`text-sm` 을 쓰더라도
  휴대폰에서는 16px 로 뜬다** — 그걸 전제로 폭을 잡을 것.

회귀 2종 = `npx tsx scripts/mobile-modal-test/run.mts`(90건, 정적 — 이 부류는 **데스크톱에서
아무 증상이 없어** 정적 검사가 방어선이다) + `node scripts/mobile-modal-test/run-screenshots.mjs`
(8개 영역의 **실제 모달**을 390×844 로 띄워 스크린샷 + 잘림·글자·푸터·시트 검사 —
위 16px 구멍과 회의시간 표의 잘린 금요일은 **여기서만** 드러났다).
상세 = `docs/features/modal-system.md`.

### 2-2. 휴대폰 뒤로가기 = 맨 위 모달 닫기 — 손으로 만들지 않는다 (2026-09-22)

**터치 기기(`pointer: coarse`)에서 모달이 열려 있으면 뒤로가기는 페이지 이동이 아니라 맨 위
모달 하나를 닫는다.** `Dialog`·`AlertDialog`·`Sheet`·`Drawer`·선택 시트의 Root 가 전부
`createBackClosableRoot`(`ui/modal-back.tsx`)라 **소비처는 아무것도 하지 않는다.** 관리자 =
`lib/modalBackHistory.ts`(규칙은 하나 — "기록 깊이 = 열린 모달 수"), 데스크톱은 종전 그대로.
- **뒤로가기는 Esc 와 같은 규칙** — `onEscapeKeyDown` 에서 `preventDefault()` 하거나
  `onOpenChange(false)` 를 거부하면 닫히지 않고 **다음 뒤로가기도 페이지를 떠나지 않는다**
  (저장 중 가드가 그대로 작성 내용을 지킨다).
- **Radix 를 직접 쓰는 오버레이는 `useModalBackClose(open, onClose)` 를 부를 것** — 회귀가
  `@radix-ui/react-(alert-)dialog`·`vaul` 을 직접 import 하는 파일을 찾아 검사한다.
- **⚠️ 모달 닫기에서 `navigate(-1)`·`history.back()` 을 부르지 말 것**(관리자가 이미 치우므로
  두 칸 되돌아간다). 화면별로 popstate 를 다루는 코드도 만들지 말 것.
- **⚠️ `ModalBackRouterSync` 는 `BrowserRouter` 안에 하나만, 설치는 `main.tsx` 에서 렌더 전에** —
  모달 전환 popstate 를 라우터에게서 감춰야 `?task=id` 처럼 URL 로 여는 모달이 **닫히자마자 다시
  열리지 않는다.** `modal-back.tsx` 에 react-router 를 들이지 말 것(라우터 밖 모달이 있다).
- 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/modal-back-test/run.mts`(88건 — 데스크톱에서는
  아무 증상이 없는 부류라 이것이 방어선이다) + 실제 크롬 `node scripts/modal-back-test/run-browser.mjs`.
  상세·조용히 틀리는 자리 = `docs/features/modal-system.md` "휴대폰 뒤로가기".

### 모달 안 긴 파일명·긴 문자열 넘침 (2026-08-14)
- **원인은 `truncate` 누락이 아니라 조상의 `min-width:auto`**: `DialogContent`/`AlertDialogContent`는 `display:grid`라 직계 자식이 기본 `min-width:auto`를 갖는다(=내용의 min-content보다 좁아질 수 없다). `보고서_최종_수정본_v3.hwpx`처럼 **밑줄·점만 있는 파일명은 줄바꿈 기회가 없는 한 단어**라 min-content가 곧 전체 폭이 되고, 그 자식이 모달 폭을 넘겨 밀려난다. 여러 모달에 붙어 있는 `overflow-x-hidden`은 **치료가 아니라 은폐** — 넘친 부분을 잘라내므로 증상이 "안 보인다"로 나타난다.
- **공용 부품이 이미 막는다**: `dialog.tsx`·`alert-dialog.tsx`의 Content에 `[&>*]:min-w-0`, Title/Description에 `break-words`가 들어 있다. **직계 자식만 덮으므로** 그 아래 `flex`/`grid` 컨테이너를 새로 만들면 거기서 다시 끊긴다.
- **파일명을 그리는 행의 규약 = `min-w-0` + `truncate` + `title` 3종 세트**. `truncate`는 `overflow:hidden`을 포함해 자기 자신의 자동 최소 크기를 0으로 떨어뜨리므로 **직접 붙은 요소는 안전하지만, 사이에 `min-w-0` 없는 flex 항목이 하나라도 끼면 무력화**된다(`<div className="flex flex-col">` 안의 truncate가 대표적 함정 — `EventCreateDialog`·`TaskEditDialog`에서 실제로 죽어 있었다). 잘린 이름을 확인할 길이 없으면 안 되므로 `title`은 선택이 아니다.
- **제목엔 `truncate`, 본문엔 `break-all`**: 제목이 파일명이면 한 줄로 자르고(줄바꿈이 미리보기 영역을 잠식), 설명문에 파일명을 끼워 넣을 때는 `break-all`로 접는다. `break-words`(=`overflow-wrap:break-word`)는 **min-content 크기를 줄이지 않으므로** 조상의 `min-w-0`과 반드시 짝으로만 효과가 있다.
- **MIME 문자열도 같은 부류**: `file.type.split('/')[1]`이 `vnd.openxmlformats-officedocument.wordprocessingml.document`처럼 60자 비분할 토큰으로 온다(`multi-file-upload`에서 실제 넘침 원인).
- 적용 파일 = `ui/dialog.tsx`·`ui/alert-dialog.tsx`·`ui/file-upload.tsx`·`ui/multi-file-upload.tsx`·`ui/file-list/EnhancedFileList.tsx`(미리보기/삭제/키워드/정보 4개 모달)·`tasks/EventCreateDialog.tsx`·`tasks/TaskEditDialog.tsx`·`schedule/ScheduleEditDialog.tsx`
