# 모달 속 모달 (중첩 모달) 규약

> 2026-09-10: 공통 디자인·portal overflow·중첩 surface 순서·저장 후 갱신 규약은
> [공통 모달 시스템](features/modal-system.md)을 참고한다. 실제 브라우저 회귀는
> `scripts/modal-ui-test/run.mjs`에 추가했다.

> 2026-09-04 신설. 계기 = 전자서명 "요청 삭제" 확인 모달에서 **취소·삭제·바깥 클릭
> 어느 쪽으로 닫아도 사이트 전체가 클릭되지 않는** 사고(새로고침해야 복구).
>
> 회귀 = `npx tsx scripts/modal-layer-test/run.mts`

모달 안에서 다른 모달을 여는 일은 흔하다 — 확인 다이얼로그, 이미지 확대, 하위 편집기.
그런데 이 조합은 **오류를 내지 않고 조용히 앱을 망가뜨리는** 방식으로 실패한다.
아래 세 가지만 지키면 된다.

---

## 0. 가장 중요한 것 — Radix 레이어 모듈 사본은 **하나**여야 한다

### 무슨 일이 일어났나

Radix 의 `DismissableLayer` 는 모달이 열리면 `document.body.style.pointerEvents` 를
`'none'` 으로 바꾸고, 원래 값을 **모듈 스코프 변수** 에 적어 뒀다가 마지막 레이어가
닫힐 때 되돌린다.

```js
// @radix-ui/react-dismissable-layer/dist/index.js
var originalBodyPointerEvents;          // ← 모듈 스코프
…
if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
  originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;  // 원래 값 저장
  ownerDocument.body.style.pointerEvents = "none";
}
…
return () => {
  if (disableOutsidePointerEvents && context.layersWithOutsidePointerEventsDisabled.size === 1) {
    ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;   // 복구
  }
};
```

상태가 모듈 스코프이므로 **사본이 둘이면 변수도 둘이고, 두 사본은 서로의 레이어를
보지 못한다.** 실제로 이 저장소는 이렇게 설치돼 있었다:

| 컴포넌트 | 거쳐 가는 패키지 | dismissable-layer |
|---|---|---|
| `Dialog` | `@radix-ui/react-dialog@1.1.15` | **1.1.11** (중첩 설치) |
| `AlertDialog` | `@radix-ui/react-alert-dialog@1.1.2` → `react-dialog@1.1.2` | **1.1.1** (호이스팅) |

그래서 이런 순서가 된다:

1. `Dialog` 열림 → 사본① "지금 열린 레이어 없음" → `원본₁ = ''` 저장, body = `none`
2. `AlertDialog` 열림 → 사본② 도 **"지금 열린 레이어 없음"** (①의 레이어가 안 보인다)
   → `원본₂ = 'none'` ← **이미 오염된 값을 "원래 값" 으로 저장**
3. 둘이 같은 커밋에서 닫힘 → ①이 `''` 로 복구 → ②가 **`'none'` 으로 되돌림**

**마지막에 쓴 쪽이 이긴다.** `body { pointer-events: none }` 이 남아 새로고침 전까지
아무것도 클릭되지 않는다. 콘솔에 오류도 경고도 없다.

같은 이유로 `Esc` 키가 **두 모달을 한꺼번에** 닫는 현상도 생긴다 — "내가 맨 위
레이어인가" 판정 역시 사본별 레이어 집합으로 계산되기 때문이다.

### 왜 npm 이 알아서 합쳐 주지 않나

**Radix 는 의존성을 정확한 버전으로 고정한다**(`"1.1.1"`, `^` 없음). 그래서
`react-dialog` 가 `1.1.11` 을, `react-popover` 등 8개가 `1.1.1` 을 요구하면
npm 은 합칠 수 없고 한쪽을 중첩 설치한다.

### 해결 — `package.json` 의 `overrides`

```json
"overrides": {
  "@radix-ui/react-dismissable-layer": "1.1.11",
  "@radix-ui/react-focus-guards": "1.1.3",
  "@radix-ui/react-focus-scope": "1.1.7",
  "react-remove-scroll": "2.7.2"
}
```

넷 다 "열린 레이어를 모듈 전역에 쌓아 두고 마지막 하나가 닫힐 때 되돌린다" 는 같은
구조라, 갈라지면 같은 종류의 고착이 생긴다:

| 패키지 | 갈라지면 생기는 증상 |
|---|---|
| `react-dismissable-layer` | **클릭이 죽는다** (body 의 `pointer-events`) |
| `react-focus-guards` | 포커스 가드 `<span>` 이 body 에 남는다 |
| `react-focus-scope` | 포커스 트랩이 안 풀린다(Tab 이 모달 밖으로 못 나간다) |
| `react-remove-scroll` | 스크롤 잠금이 안 풀린다 |

**`@radix-ui/react-dialog` 자체는 일부러 합치지 않았다** — 지금도 사본이 3개다
(root `1.1.15` · alert-dialog 안 `1.1.2` · cmdk 안 `1.0.5`). 이 패키지에는 모듈 전역
**가변 상태가 없고** React 컨텍스트뿐이라, 사본이 갈라져도 `Dialog` 와 `AlertDialog`
가 서로의 컨텍스트를 볼 일이 애초에 없어 무해하다. 반대로 합치려 들면 cmdk 를
`1.0.5` → `1.1.15` 로 끌어올리게 돼 위험만 커진다.

### ⚠️ 디스크 사본을 합치는 것만으로는 부족하다 — Vite 캐시 (2026-09-04 실제 재발)

`overrides` 를 넣고 `npm install` 을 했는데도 **개발 서버에서 그대로 재발했다.**
Vite 는 사전 번들 결과를 `node_modules/.vite/deps` 에 캐시하는데, **의존성을 고치기 전에
만들어진 캐시가 남아 있으면 브라우저는 여전히 옛 사본 둘을 받는다.** 실측:

```
node_modules/.vite/deps/@radix-ui_react-dialog.js        → 레이어 상태를 자기 안에 인라인
node_modules/.vite/deps/@radix-ui_react-alert-dialog.js  → 공유 청크에서 가져옴   = 사본 2개
```

**이때의 증상이 "모달 안 버튼을 누르면 모든 모달이 함께 닫힌다"** 이다. 사본이 갈라지면
바깥 `Dialog` 가 안쪽 `AlertDialog` 를 **자기 레이어로 못 보므로**, 그 안의 클릭을
**바깥 클릭으로 판정**해 스스로 닫힌다. `Esc` 가 둘을 한꺼번에 닫는 것도 같은 이유다.

**프로덕션 빌드는 영향이 없다**(rollup 은 디스크 사본 하나 = 모듈 하나). 이 함정은
개발 서버에서만 나타나므로 "빌드는 되는데 dev 에서만 이상하다" 로 보인다.

**대응 두 가지, 둘 다 필요하다**:
1. `vite.config.ts` 의 **`resolve.dedupe`** 에 같은 목록을 적는다 — 해석이 하나로 고정되고,
   이 파일이 바뀌면 Vite 가 최적화 캐시를 다시 만든다. `scripts/modal-layer-test` 가 검사한다.
2. 이미 갈라진 캐시가 있으면 **`rm -rf node_modules/.vite` 후 dev 서버 재시작**.
   (의존성을 바꾼 직후에는 항상 이렇게 하는 편이 안전하다.)

### ⚠️⚠️ 버전을 못 박았으면 lockfile 도 하나여야 한다 — 배포 빌드 실패 (2026-09-04)

`overrides` 를 넣은 그날 **Lovable 배포가 죽었다.** 증상은 rollup 빌드 실패:

```
node_modules/@radix-ui/react-dialog/dist/index.mjs (12:27):
"useDismissableLayerSurface" is not exported by
"node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs"
```

**로컬 `npm run build` 는 27초 만에 성공한다.** 같은 커밋, 같은 소스인데 결과가 다르다.

**원인은 lockfile 이 둘이라는 것이다.** 이 저장소는 npm 으로 관리하지만(`package-lock.json`)
Lovable 은 **bun** 으로 빌드하고, `bun.lockb` 는 **2025-08-03 저장소 생성 이후 한 번도
갱신되지 않았다**(그 뒤 추가된 pdf-lib·framer-motion·zustand·uuid·dompurify·garu-ko 가
전부 빠져 있었다).

그리고 bun 의 동작이 핵심이다:

| bun lockfile | bun 이 하는 일 |
|---|---|
| **없다** | `package-lock.json` 을 마이그레이션해 **같은 트리**를 만든다 |
| **있다** | 그쪽을 정본으로 삼고, **package.json 범위를 만족하지 않는 항목만** 새로 푼다 |

**가장 위험한 것은 이 "반쯤 고정된" 상태다.** 전부 고정이면 재현되고, 전부 새로 풀면
일관되는데, 그 중간에서는 조합이 조용히 어긋난다. 실제로 일어난 일:

```
낡은 bun.lockb 에 @radix-ui/react-dialog 가 옛 범위로 기록됨
        ↓  package.json 이 ^1.1.15 로 올라가 범위 불일치 → 이것만 재해석
bun 이 dialog 를 최신 1.1.23 으로 새로 품
        ↓  Radix 는 하위 의존성을 caret 없이 정확 버전으로 고정한다
dialog 1.1.23 은 dismissable-layer "1.1.19" 를 요구
        ↓  그런데 overrides 가 1.1.11 로 덮는다
1.1.11 에는 useDismissableLayerSurface 가 없다 → 빌드 실패
```

로컬 npm 이 무사했던 이유는 하나뿐이다 — `package-lock.json` 이 dialog 를 **1.1.15** 에
묶어 두어 그 새 API 를 쓰지 않았다. 즉 **개발자 기계에서는 재현되지 않는 사고**다.

**해결 = `bun.lockb` 를 지우고 `.gitignore` 에 넣는다.** bun 이 `package-lock.json` 을
채택하므로 로컬과 배포가 **같은 트리**가 된다(검증: dialog·dismissable-layer·focus-guards·
focus-scope·react-remove-scroll·alert-dialog·popover·select **8종 버전 전부 일치**,
bun 빌드 통과). lockfile 을 이중 관리하지 않아도 된다.

**`overrides` 는 건드리지 않았다.** 어제 신중히 고른 값이고 회귀 테스트가 지키는 값이라,
검증되지 않은 변경을 얹을 이유가 없다. 그리고 실측상 원인은 override 버전이 아니라
**lockfile 이 갈라진 것**이었다 — override 를 빼도 lockfile 만 낡아 있으면 같은 종류의
어긋남이 생긴다.

**교훈: 관리하지 않을 lockfile 은 두지 않는 것이 낫다.** 1년간 0회 갱신된 lockfile 은
"오래된 파일"이 아니라 **성실히 관리해 온 lockfile 을 가로막는 장애물**이다.

### 재발 방지

- **회귀 테스트** `scripts/modal-layer-test/run.mts` 가 사본 수를 센다.
  Radix 패키지를 새로 추가하면 의존성이 다시 갈라질 수 있는데, **갈라져도 빌드도
  타입 검사도 통과하고 오류도 안 나므로** 이 테스트가 유일한 방어선이다.
- **lockfile 검사**(같은 테스트) — 추적되는 bun lockfile 이 있으면 실패한다. 위 배포
  사고가 정확히 그 경로였고, **로컬 빌드로는 잡히지 않는다.**
- **런타임 안전망** `src/lib/modalPointerEvents.ts` (진입점 `main.tsx` 에서 1회 설치).
  "열린 모달이 하나도 없는데 body 가 `none`" 이면 해제하고 `console.warn` 을 남긴다.
  이 경고가 보이면 사본이 갈라진 것이니 위 테스트부터 돌릴 것.

---

## 1. 겹쳐 띄우되, **바꿔치기 하지 말 것**

```tsx
// ✅ 안쪽을 열 때 바깥은 그대로 둔다
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    …
    <Dialog open={zoomed} onOpenChange={setZoomed}>…</Dialog>
  </DialogContent>
</Dialog>
```

```tsx
// ❌ 같은 틱에 하나를 닫고 다른 하나를 연다
setA(false);
setB(true);
```

두 모달이 같은 커밋에서 각각 언마운트·마운트되면 body 스타일의 저장/복구가
서로의 중간 상태를 보게 된다. **닫는 것도 마찬가지** — 둘을 함께 닫아야 하면
바깥은 다음 프레임으로 미룬다:

```tsx
setConfirmDelete(false);
requestAnimationFrame(() => onOpenChange(false));
```

`AlertDialogAction` / `AlertDialogCancel` 은 **누르는 즉시 스스로 닫는다.**
비동기 작업을 하려면 `e.preventDefault()` 로 기본 닫기를 막고 닫는 시점을 직접
정해야 한다(그래야 실패했을 때 모달이 남는다 — `composeEventHandlers` 규약):

```tsx
<AlertDialogAction
  disabled={remove.isPending}
  onClick={async (e) => {
    e.preventDefault();
    await remove.mutateAsync(request);
    setConfirmDelete(false);
    requestAnimationFrame(() => onOpenChange(false));
  }}
>
```

---

## 2. 포털 대상 — `Dialog` 는 body 로, `Popover`/`Select` 는 DialogContent 안으로

**둘의 규칙이 반대다.** 헷갈리면 둘 다 깨진다.

| | 포털 대상 | 이유 |
|---|---|---|
| 중첩 **Dialog** | `document.body` (기본값 그대로) | `DialogContent` 는 `translate-x-[-50%] translate-y-[-50%]` 를 갖는다. **transform 은 `position:fixed` 의 기준 상자가 된다** — 그 안으로 포털하면 화면 가운데가 아니라 **바깥 모달 가운데**에 뜬다 |
| **Popover / Select / Combobox** | `DialogContent` 안 (`usePortalContainer`) | body 로 포털하면 Select 의 `hideOthers()` 가 `DialogContent` 를 통째로 `aria-hidden` 시켜 클릭이 안 먹는다 (`ui/dialog.tsx` 상단 주석) |

즉 중첩 `Dialog` 에는 `container` 를 **넘기지 않는다**(우리 `DialogContent` 는
`DialogPortal` 을 container 없이 쓰므로 기본이 body 다 — 그대로 두면 된다).

그리고 Popover 를 쓰는 모달은 **`DialogContent` 에 `overflow-hidden` 을 걸면 안 된다** —
드롭다운이 모달 경계에서 잘린다. 필요하면 안쪽 스크롤 패널에 걸고, 모서리는
`rounded-t-lg` / `rounded-b-lg` 로 맞춘다.

---

## 3. 애니메이션 도중 강제 언마운트를 피할 것

```tsx
if (!request) return null;   // ← 부모가 selected 를 null 로 만들면 여기서 즉시 사라진다
```

이 패턴은 모달이 닫히는 애니메이션(기본 200ms) 중에 트리 전체를 없앤다.
React 는 언마운트 시 정리 함수를 반드시 부르므로 **사본이 하나라면 안전하지만**,
닫히는 모습이 뚝 끊기고 사본이 갈라진 상태에서는 위 0번 사고를 유발한다.
가능하면 닫힘 상태를 한 프레임 유지하고 나서 데이터를 비운다.

---

## 점검 목록

새로 모달 안에 모달을 넣을 때:

- [ ] 안쪽을 열 때 바깥을 닫지 않는다
- [ ] 둘을 함께 닫아야 하면 바깥은 `requestAnimationFrame` 으로 미룬다
- [ ] `AlertDialogAction` 에서 비동기 작업을 하면 `e.preventDefault()` 를 먼저 부른다
- [ ] 중첩 `Dialog` 에 `container` 를 넘기지 않는다 (Popover 는 반대 — 넘긴다)
- [ ] Popover 가 있는 `DialogContent` 에 `overflow-hidden` 이 없다
- [ ] `npx tsx scripts/modal-layer-test/run.mts` 통과
