# CSS 레이아웃·스크롤 함정 (사례 기록)

전역 레이아웃에서 스크롤바가 이중으로 생기거나, 화면에 보이지도 않는 요소가 페이지 높이를 늘리는 문제들을 실측과 함께 기록한다. 증상이 같아도 원인이 전혀 다를 수 있으므로 **추측 전에 재는 절차**를 먼저 둔다.

## 0. 진단 절차 (추측하지 말고 이 순서로 잰다)

스크롤바가 두 개 보이면 **"어느 요소가 스크롤 중인가"를 먼저 확정**한다. 코드를 읽어 원인을 상상하는 것은 마지막이다. 실제로 이 사건에서 코드만 보고 세운 가설 두 개가 연속으로 틀렸고, 아래 3줄이 5초 만에 범인을 지목했다.

```js
// 1) 문서가 스크롤 중인가? (뷰포트보다 크면 문서가 범인)
document.documentElement.scrollHeight, document.documentElement.clientHeight

// 2) 스크롤 컨테이너 전수 조사 — rect의 x좌표로 화면의 어느 스크롤바인지 매칭된다
[...document.querySelectorAll('*')]
  .filter(el => el.scrollHeight - el.clientHeight > 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))
  .map(el => [el.tagName, String(el.className).slice(0,50), el.getBoundingClientRect(), el.scrollHeight - el.clientHeight])

// 3) 문서가 늘어났다면 — 컨테이닝 블록이 "문서"인 요소를 찾는다 (모든 클리핑을 뚫는 요소)
[...document.querySelectorAll('*')].filter(el => {
  const cs = getComputedStyle(el);
  return cs.position === 'absolute' && (el.offsetParent === null || el.offsetParent === document.body);
})
```

`offsetParent`가 `null`이거나 `body`라는 것은 **위치 지정된 조상이 하나도 없다**는 뜻이고, 곧 그 요소의 컨테이닝 블록이 초기 컨테이닝 블록(문서)이라는 뜻이다.

**조사 시 흔한 자책골**: 3번을 돌릴 때 "스크롤 컨테이너 바깥"만 보려고 `!main.contains(el)`로 걸러내면 안 된다. 탈출하는 요소는 **클리핑만 벗어날 뿐 여전히 그 컨테이너의 DOM 자손**이라, 그 필터가 정확히 범인만 지운다(실제로 한 번 놓쳤다).

---

## 1. `sr-only`가 문서 높이를 늘린다 (2026-08-11 `/tasks` 내 업무 탭)

### 증상
업무 관리 "내 업무" 탭에서만 세로 스크롤바가 2개. 업무 흐름·이벤트 관리·타임라인 탭은 정상. 홈 대시보드도 정상.

### 실측
```
document.scrollHeight = 6150      (뷰포트 922)
마지막 SPAN.sr-only   = 문서좌표 @6149..6150   ← 문서 높이와 픽셀 단위로 일치
그 부모               = A.inline-flex...  (= WorkflowLinkButton의 <Link>)
```

### 원인
**Tailwind `sr-only`는 `position: absolute`다.**

```css
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px;
           overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
```

`WorkflowLinkButton`의 `<a>`에도, 그것을 담은 `ImprovedCard`에도 `relative`가 없어 이 span의 **컨테이닝 블록이 문서**가 됐다. 그러면:

- `main`의 `overflow: auto`에 **잘리지 않는다**
- `Layout` 최상위의 `overflow: hidden`에도 **잘리지 않는다**
- 대신 자기 정적 위치(목록 깊숙한 곳, 6149px)만큼 **문서의 스크롤 영역을 늘린다**

이벤트 카드마다 하나씩 있으니 문서 높이가 목록 길이만큼 끌려갔다. **화면에 1px도 보이지 않는 요소가 스크롤바를 만든 것이다.**

> 클리핑(`overflow`)은 "컨테이닝 블록이 내 안에 있는 자손"에만 적용된다. 이 한 문장이 이 사건의 전부다. `clip: rect(0,0,0,0)`은 **그리기만** 막고 레이아웃·스크롤 영역에는 관여하지 않는다.

### 왜 탭마다 달랐나
같은 `WorkflowLinkButton`을 쓰는데도 이벤트 탭은 멀쩡했다.

| 위치 | 카드 클래스 | 결과 |
|---|---|---|
| `EventCard.tsx:147` | `relative overflow-hidden rounded-2xl ...` | span이 카드에 갇힘 → 정상 |
| `IntegratedTaskView.tsx` 이벤트 카드 | `overflow-hidden ...` (relative 없음) | span이 문서로 탈출 → 버그 |

### 수정
1. `WorkflowLinkButton`의 `sr-only` span 제거 — `<Link>`에 이미 `aria-label`이 있고 **`aria-label`은 내용 텍스트보다 우선**하므로 접근성 이름에 아무 기여도 못 하는 죽은 요소였다.
2. `IntegratedTaskView`의 이벤트 카드에 `relative` 추가 (`EventCard`와 동일 패턴).

### 재발 방지 규칙
- **`sr-only`(또는 임의의 `absolute`)를 넣을 때는 위치 지정된 조상이 있는지 확인한다.** 아이콘 전용 버튼에서는 `aria-label` 하나로 충분하고, `aria-label`과 `sr-only`를 **함께 쓰는 것은 그 자체로 냄새**다(하나는 반드시 죽어 있다).
- `position: fixed`는 스크롤 영역에 기여하지 않으므로 이 현상을 만들지 않는다. 플로팅 버튼류는 용의선상에서 제외해도 된다.
- 카드/행 컴포넌트를 새로 만들 때 `overflow-hidden`을 쓴다면 `relative`도 같이 붙이는 편이 안전하다. 이 저장소는 `EventCard`가 이미 그 패턴이다.

---

## 2. `overflow-x: hidden`만 지정하면 세로 스크롤 컨테이너가 딸려 온다

### 규칙
CSS 명세상 **한 축이 `visible`이 아니면 다른 축의 `visible`은 `auto`로 계산된다.** 즉 `overflow-x: hidden`만 쓰면 `overflow-y`는 자동으로 `auto`가 된다(실측 computed `overflowX: "hidden", overflowY: "auto"`).

```jsx
// 가로만 자르려던 의도였지만, 세로 스크롤 컨테이너가 하나 생긴다
<div className="flex h-dvh overflow-x-hidden">
```

`auto`는 넘칠 때만 스크롤바를 그리므로 **평소에는 아무 증상이 없다.** 안쪽 내용이 1px이라도 넘치는 순간 창 전체 높이의 스크롤바가 하나 더 그려진다 — 전형적인 잠복 버그다.

- 가로만 자르고 싶으면 `overflow-hidden`(양축)을 쓰거나, 세로를 명시적으로 `overflow-y-visible`로 되돌린다.
- `overflow-auto overflow-x-hidden` 조합은 **안전하다**. `overflow-auto`가 먼저 양축을 `auto`로 두고 x만 덮어쓰기 때문. 위험한 것은 `overflow-x-hidden` **단독** 사용이다.

### 실측 재현 (1094×922)
루트를 단 1px 넘치게 하면:

| | 정상 | 1px 넘침 |
|---|---|---|
| 루트 스크롤바 폭 | 0 | 15px |
| 콘텐츠 컬럼 우측 끝 | 1094 | 1079 |
| `main` 내용 우측 끝 | 1079 | 1063 |

즉 **스크롤바 하나가 생기면 안쪽 컬럼이 통째로 15px 밀린다.** 스크린샷만으로 "어느 스크롤바인지" 판정할 때 이 좌표 이동이 유용한 단서가 된다.

---

## 3. 뷰포트 단위(`vh`)를 중첩해서 쓰지 않는다

`Layout`이 `h-dvh`인데 그 안의 `Sidebar`가 `h-screen`(=`100vh`=large viewport)이었다.

- 데스크톱 브라우저에서는 `100vh == 100dvh`라 **개발 중에는 절대 재현되지 않는다.**
- 접히는 UI가 있는 환경(모바일 브라우저, 앱 내장 웹뷰)에서는 `100vh > 100dvh`라 자식이 부모를 넘친다. 배율에 따른 서브픽셀 반올림으로도 어긋날 수 있다.

**규칙: 뷰포트 단위는 최상위 한 곳에서만 쓰고, 아래는 `h-full`로 물려받는다.** `h-full`(=`height:100%`)은 부모가 flex stretch로 높이를 받은 경우에도 정상 해석된다(실측: 사이드바 922px, 푸터 하단 고정, 내부 ScrollArea 클리핑 유지).

---

## 4. 이 저장소의 레이아웃 계약

`src/components/layout/Layout.tsx`

```
<div class="flex h-dvh overflow-hidden">        ← 세로 스크롤 금지. 여기서 스크롤바가 보이면 버그다
  <div class="hidden md:flex"><Sidebar h-full /></div>
  <div class="flex flex-1 flex-col h-full overflow-hidden">
    <Header />
    <main class="flex-1 overflow-auto overflow-x-hidden">   ← 세로 스크롤은 여기 하나뿐
```

- **정상 상태에서 스크롤 컨테이너는 `main` 하나**다(+사이드바 내부 ScrollArea). 그 외에 스크롤바가 보이면 뭔가 탈출한 것이다.
- `main`에는 `relative`가 없다. 그래서 `main` 안의 위치 지정 안 된 `absolute`는 문서로 탈출한다. `main`에 `relative`를 넣으면 이 부류 전체를 구조적으로 차단할 수 있지만, `main` 안 모든 absolute 요소의 기준점이 바뀌므로 별도 판단이 필요하다(미적용).
- `main`이 `flex-1`인데도 정상 축소되는 이유: `overflow:auto`는 flex 아이템의 자동 최소 크기(`min-height:auto`)를 0으로 만든다. 스크롤 컨테이너가 아닌 flex 아이템은 내용 크기 아래로 줄어들지 않으므로, 이 구조에서 `overflow`를 빼면 레이아웃이 무너진다.
