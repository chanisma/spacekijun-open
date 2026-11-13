# 요즘 세상 · 기사별 4컷 만화 생성

## 제작 규칙

- 참조: `public/images/world-today/academy-observers.png`. 리아·루온의 얼굴, 머리·눈 색, 의상과 로판 화풍을 유지한다.
- 기사마다 별도 대본과 장면을 만든다. 1~3컷은 해당 기사의 문제·방법·의미, 4컷은 탐구 질문이다. 기사에 없는 숫자나 성과는 만들지 않는다.
- 2×2 완성 이미지의 말풍선 안에 자연스러운 친구 사이 반말을 넣는다. 한글·화자·말풍선 꼬리를 검토한다.
- 아카데미 관측창으로 현실을 살펴보는 컨셉. 마법을 실제 연구 방법처럼 설명하지 않는다.
- 생성 결과를 자르지 않고 전체 표시한다. 원본 확대 링크와 동일 대사의 텍스트 대체본을 제공한다.
- 검토한 결과를 저장하고 `src/features/world-today/data/newsComics.ts`에 원문 URL별로 등록한다. 미등록 기사는 텍스트로 표시하며 공통 삽화를 기사 만화로 대체하지 않는다.
- 일일 자동 생성 파이프라인은 아직 없다. 요청한 한 편을 생성했다. 홈의 시리즈 소개 그림은 기존 공통 삽화를 유지한다.

## 생성한 기사

`ai_news.id=15`, 로봇신문, 「사람 많은 곳에서도 요리조리…DGIST, 충돌 줄이는 소형 AI 모델 개발」.
원문: https://www.irobotnews.com/news/articleView.html?idxno=48451

2026-09-12 DB의 summary와 why_it_matters를 확인해 대본 작성. 사람의 움직임 예측과 로봇 경로 계획을 하나의 소형 모델에서 함께 처리하면서 성능 저하를 줄였다는 범위만 다룬다. 실제 현장 사진이 아닌 교육용 재구성이다.

결과: `public/images/world-today/dgist-robot-paths-48451.png` (1254×1254). 원본 그대로 복사. 네 컷과 8개 말풍선의 한글, 캐릭터 일관성을 확인했다.

`ai_news.id=8`, 인공지능신문, 「메탄 배출, 우주에서 AI가 '범인' 찾는다…구글·NASA, AI 위성영상 분석해 배출원 추적」.
원문: https://www.aitimes.kr/news/articleView.html?idxno=41858

2026-09-12 수집 파이프라인이 기사 전문을 받아 만든 summary 를 근거로 대본 작성. 메탄이 눈에 보이지 않지만 특정 파장의 빛을 흡수한다는 점, EMIT 초분광 관측, 암석·토양이 비슷한 분광 특성을 보여 오판할 수 있다는 점, 그래서 바람을 따라 퍼지는 플룸 모양과 주변 지형 맥락까지 함께 본다는 점까지만 다룬다. 탐지율·학습 표본 수 같은 수치는 말풍선에 넣지 않았다.

결과: `public/images/world-today/methane-satellite-41858.png` (1254×1254, 생성 원본 2880×2880을 기존 4컷 규격으로 축소). **codex + gpt-image-2.5-sunburst** 로 생성(참조 이미지를 images/edits 에 넣어 캐릭터 유지). 네 컷과 8개 말풍선의 한글, 지정 대사 일치, 말꼬리 화자 대응을 확인했다. 말풍선 외에 '메탄의 흡수 신호'·'암석 지역(유사 신호)'·'신뢰도' 같은 **도해 라벨**이 그림 안에 들어갔다 — 캡션 상자가 아니라 관측창 안의 설명이고 기사 근거 범위 안이라 그대로 두었다.

## 생성 도구

`academy-observers.png` 는 내장 image_gen 으로 만들었고, 이후 기사별 4컷은 **codex CLI** 로 생성한다.
codex 에는 image_gen 도구가 없으므로 `exec_command` 로 OpenAI images/edits 를 직접 호출한다.

```bash
CODEX=~/.openclaw/npm/projects/openclaw-codex-*/node_modules/@openai/codex/bin/codex.js
node "$CODEX" exec --sandbox danger-full-access --skip-git-repo-check < 작업지시.txt
```

- 모델 `gpt-image-2.5-sunburst`(실패 시 `-flare`), 참조 이미지 = `academy-observers.png`
- codex 에 저장된 API 키가 만료돼 있으면 401 이 난다 — `printenv OPENAI_API_KEY | codex login --with-api-key`
- 프롬프트는 파일로 넘겨 **요약·변형 없이 그대로** 쓰게 한다

## 파이프라인 템플릿 (기계가 읽는다)

**이 블록은 `ai-news-notice` 스킬의 `generate-comics.js` 가 실행 시점에 읽어 간다.**
여기를 고치면 다음 자동 생성부터 그대로 반영된다 — 코드에 옮겨 적지 말 것.
`{{FACTS}}` 는 기사 근거, `{{PANELS}}` 는 컷별 장면·대사로 치환된다.

```prompt-template
Create a finished Korean educational romance-fantasy webtoon comic, exactly FOUR panels in a 2x2 grid, read top-left, top-right, bottom-left, bottom-right. One complete image, thin ivory gutters, large readable Korean speech bubbles INSIDE the artwork, no text outside the panels. Preserve EXACT character identities, face shapes, hair, eyes and costumes of the attached reference: Ria the brown long wavy-haired violet-eyed woman wearing ivory ruffled blouse and plum vest with gold jewelry, Ruon the silver-haired blue-eyed man wearing navy high-collar academy uniform with gold trim. Same exquisite luminous romance-fantasy illustration style, ivory plum navy antique-gold palette. Keep both recurring characters and academy observatory story continuity; use magical observation windows to look at the real world, NOT claim researchers use magic. New article-specific scenes, NOT copies of the reference poses. High resolution, prioritize legible clean Korean lettering, speech tails clearly point to the correct speaker, leave generous negative space for bubbles.

ARTICLE FACTS ONLY: {{FACTS}} Do not invent numbers, institutions or results beyond these facts.

{{PANELS}}

Natural friendly peer Korean banmal as specified, no archaic princess talk, no excessive exposition. EXACT two bubbles per panel with the given words, do not add caption boxes or titles or random text. Maintain correct anatomy, consistent character appearances, visually distinct panel action, all FOUR panels fully visible and uncropped.
```

## 실제 생성 프롬프트

```text
Create a finished Korean educational romance-fantasy webtoon comic, exactly FOUR panels in a 2x2 grid, read top-left, top-right, bottom-left, bottom-right. One complete image, thin ivory gutters, large readable Korean speech bubbles INSIDE the artwork, no text outside the panels. Preserve EXACT character identities, face shapes, hair, eyes and costumes of attached reference: Ria the brown long wavy-haired violet-eyed woman wearing ivory ruffled blouse and plum vest with gold jewelry, Ruon the silver-haired blue-eyed man wearing navy high-collar academy uniform gold trim. Same exquisite luminous romance-fantasy illustration style, ivory plum navy antique-gold palette. Keep both recurring characters and academy observatory story continuity; use magical observation windows showing contemporary robots and pedestrians, NOT claim researchers use magic. New article-specific scenes, NOT copy original generic book poses. High resolution, prioritize legible clean Korean lettering, speech tails clearly point to correct speaker, leave generous negative space for bubbles.
ARTICLE FACTS ONLY: DGIST and KAIST researchers developed a learning method for a small AI model that jointly predicts nearby people's movements and plans robot routes, reducing performance degradation between the two tasks. No invented numerical results, no claims of perfect collision avoidance.
Panel 1: Ria and Ruon at academy observation balcony watch a small wheeled service robot approaching pedestrians in a glowing window, footprints and branching paths visualized. Ria bubble EXACT: "사람이 이렇게 많은데, 로봇은 어떻게 길을 찾지?" Ruon bubble EXACT: "사람들이 어디로 움직일지 예상해야 해."
Panel 2: Ruon demonstrates one compact glowing AI crystal linking pedestrian trajectory and robot route diagrams while Ria watches thoughtfully. Ria bubble EXACT: "그럼 움직임 예측과 길 찾기를 같이 하는 거네?" Ruon bubble EXACT: "응. DGIST와 KAIST 연구팀이 작은 AI 모델 하나로 함께 처리했대."
Panel 3: Ria traces two balanced paths, robot safely navigating shown as explanatory illustration in observation window, Ruon explains at her side. Ruon bubble EXACT: "두 일을 함께 배울 때 성능이 떨어지는 문제도 줄였대." Ria bubble EXACT: "더 안전하게 움직이도록 돕는 기술이구나!"
Panel 4: Both at academy inquiry desk with miniature robot and movable pedestrian tokens, Ria looks invitingly toward reader holding pencil, Ruon points at experimental map. Final panel must pose inquiry not deliver answer. Ria bubble EXACT: "사람이 많아지면 로봇의 속도와 안전은 어떻게 달라질까?" Ruon bubble EXACT: "사람 수를 바꿔 가며 비교해 볼까?"
Natural friendly peer Korean banmal as specified, no archaic princess talk, no excessive exposition. EXACT two bubbles per panel with the given words, do not add caption boxes or titles or random text. Maintain correct anatomy, consistent character appearances, visually distinct panel action, all FOUR panels fully visible and uncropped.
```

다음 기사에서는 ARTICLE FACTS ONLY와 네 컷의 장면·대사를 해당 기사 근거로 모두 교체한다. 동일 캐릭터 참조·팔레트·패널 순서·마지막 질문 규칙은 유지한다.

### 메탄 위성 편 프롬프트에서 달라진 부분

관측창이 보여 주는 대상이 로봇·보행자에서 **궤도에서 본 지구·위성·산업시설**로 바뀌었고, ARTICLE FACTS ONLY 단락과 네 컷의 장면·대사 8개를 메탄 기사 근거로 전부 교체했다. 4컷은 종전과 같이 질문으로 끝난다(「지형이 복잡한 곳에서는 왜 더 헷갈릴까?」) — 기사가 복잡한 지형에서 신뢰도가 낮아진다고 밝힌 대목에서 나온 질문이다.
