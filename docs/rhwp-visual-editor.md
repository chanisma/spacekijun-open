# 공용 rhwp 시각 편집기

## 목적과 경계

rhwp 관련 코드는 특정 기능의 하위 모듈이 아니라 HWP/HWPX를 다루는 여러 기능에서 재사용하는 공용 자산이다.

- `public/rhwp-studio`: 같은 출처에서 제공하는 rhwp Studio 정적 런타임
- `src/lib/rhwp/config.ts`: 런타임 버전과 Studio 주소·출처 검증
- `src/lib/rhwp/aiEditing.ts`: Studio의 커서·선택 영역 AI 편집 RPC 계약
- `src/lib/rhwp/aiDocumentWriter.ts`: 전체 문맥 분석과 위치별 초안 생성
- `src/components/rhwp/RhwpVisualEditor.tsx`: 문서 공급 방식을 알지 못하는 공용 React 편집기
- `src/components/rhwp/RhwpAiAssistant.tsx`: 어느 rhwp 편집 화면에서도 재사용할 수 있는 검토형 AI 패널
- 각 feature의 어댑터: 인증, Storage, 업무 규칙, 저장 방식만 담당

현재 연결 지점은 다음 두 곳이다.

- `src/pages/HwpxEditor.tsx`: 도구 모음에서 로컬 문서를 열고 HWPX/HWP/HML로 내려받는 독립 편집기
- `DocumentTemplateVisualEditor`: 업무 흐름에서 비공개 템플릿을 열고 새 버전으로 저장하는 어댑터

공용 편집기에는 Supabase, Task, WORK, 템플릿 버전 개념이 없다.

## 사용

`loadSource`는 `Blob`, `ArrayBuffer`, `Uint8Array` 중 하나를 반환한다. 부모가 다시 렌더링될 때 문서를 불필요하게 다시 열지 않도록 `useCallback`으로 고정한다.

```tsx
const editorRef = useRef<RhwpVisualEditorHandle | null>(null);
const loadSource = useCallback(() => fetch('/document.hwpx').then((r) => r.blob()), []);

<RhwpVisualEditor
  ref={editorRef}
  fileName="document.hwpx"
  loadSource={loadSource}
  onStateChange={setEditorState}
/>;

const hwpxBytes = await editorRef.current?.exportHwpx();
```

공용 ref API는 문서 교체, 페이지 수, 페이지 SVG, 렌더러 진단, HWP/HWPX/HML 내보내기, HWP 재로드 검증과 아래 AI 편집 메서드를 제공한다. 저장 위치와 버전 정책은 호출하는 feature가 결정한다.

- `getAiEditingContext()`: 현재 커서 또는 텍스트 선택 범위와 같은 문단의 앞뒤 문맥을 캡처
- `replaceAiEditingTarget(text, expected)`: 캡처 당시 대상이 그대로일 때만 텍스트를 한 번의 undo 단위로 적용
- `getAiFillableFields()`: 기존 양식을 유지하며 자동 작성할 수 있는 ClickHere 필드, AI 작업 영역 여부·작성 지시와 현재 값을 조회
- `applyAiFieldValues(values, expected)`: 생성 이후 필드가 바뀌지 않았을 때 여러 값을 한 번의 undo 단위로 적용

## AI 활용 양식 만들기

rhwp 빠른 실행의 줄 간격 컨트롤 오른쪽에 있는 `AI✦` 버튼으로 AI가 작성해야 할 위치를 문서 자체에 지정한다. Windows/Linux에서는 `Ctrl+Alt+A`, macOS에서는 `Command+Option+A`로도 실행할 수 있다.

1. 새 입력 위치에 커서를 놓거나, 기존 안내 문구를 드래그한다.
2. `AI✦`를 누르고 사람이 알아볼 영역 이름, 문서에 표시할 안내문, AI가 따라야 할 작성 지시를 입력한다.
3. 선택한 일반 텍스트는 같은 위치의 ClickHere 필드로 바뀐다. 기존 ClickHere 안에서 실행하면 위치·현재 값·서식을 유지한 채 AI 작업 필드로 전환된다.
4. HWP/HWPX로 저장하면 영역 이름과 안내문, `SPACEKIJUN_AI_WORK_V1` 식별자 및 작성 지시가 필드 메타데이터에 함께 보존된다.

AI 작업 필드는 단순한 시각 표시가 아니다. 전체 필드 자동 작성 시 `isAiWorkField`와 `aiInstruction`으로 전달되어 일반 누름틀보다 먼저 검토되고, 문서 전체 맥락 및 사용자의 최신 요청과 함께 해당 영역의 생성 기준으로 사용된다. 사용자 최신 요청이 영역 지시와 충돌하면 사용자 요청을 우선한다.

정확도를 위해 영역 이름은 `내용1` 같은 번호보다 `추진 목적`, `세부 운영 일정`, `기대 효과`처럼 역할이 드러나게 작성한다. 작성 지시에는 필요한 근거, 포함·제외할 내용, 문체와 대략적인 분량을 적는다. AI가 사실을 임의로 만들면 안 되는 영역에는 “문서 안에서 확인되는 사실만 사용하고 부족하면 비워 둔다”와 같이 검증 조건을 명시한다.

영역 생성·전환은 하나의 undo 단위다. 대화상자를 연 뒤 커서, 선택 내용 또는 대상 필드가 바뀌면 잘못된 위치에 적용하지 않고 다시 지정을 요구한다. 기존 누름틀이 섞인 범위를 통째로 감싸는 중첩 필드는 만들지 않는다.

## AI 작성 흐름

독립 편집기의 AI 패널은 다음 순서를 따른다.

1. 현재 편집 상태를 HWPX로 메모리 내보내기하고 전체 본문을 파싱한다.
2. 45,000자 이하는 한 번에, 그보다 긴 문서는 순서가 유지된 청크로 나누어 전체 목적, 독자, 구조, 주요 사실, 문체, 반복 양식과 작성 필요 영역을 분석한다.
3. 사용자가 커서를 놓거나 범위를 선택하면 Studio가 정확한 위치와 인접 문맥을 캡처한다.
4. 전체 문맥 분석, 선택 내용, 앞뒤 문장과 사용자 요청을 함께 사용해 일반 텍스트 초안을 만든다.
5. 사용자가 초안을 확인하고 수정한 뒤 `문서에 적용`을 눌러야 실제 문서가 바뀐다.
6. 생성 이후 문서 바이트, 커서, 선택 범위 또는 선택 내용이 달라졌으면 적용을 거부하고 재생성을 요구한다.

선택 영역 대체와 커서 삽입은 시작 위치의 기존 글자·문단 서식을 이어받는다. ClickHere 입력 필드가 있는 양식 문서는 AI가 전체 필드 중 작성이 필요한 항목을 판단하고 값을 한꺼번에 생성한다. 명시적으로 지정한 AI 작업 필드는 저장된 영역별 작성 지시를 우선 사용한다. 사용자는 적용 전 화면에서 `AI 지정` 표시와 작성 지시, 필드별 값과 근거를 확인하고 값을 수정하거나 제외할 수 있으며, 기존 필드 서식은 유지되고 Ctrl+Z 한 번으로 전체 적용을 되돌릴 수 있다.

ClickHere가 아닌 자유 형식 문서에서 AI가 찾은 작성 필요 영역은 패널에 제안으로 표시하며, 사용자가 실제 위치를 확인해 선택한 뒤 하나씩 적용한다. 자유 형식 문서 전체에 여러 변경을 자동 적용하려면 HWPX 구조와 Studio 위치를 잇는 안정적인 앵커 계약 및 변경별 검토 화면이 추가로 필요하다.

현재 위치 편집 범위는 본문과 일반·중첩 표 셀이다. 중첩 표에서도 커서 삽입, 같은 최종 셀 안의 단일·다중 문단 선택 대체, AI 작업 영역 생성과 저장을 지원한다. 머리말·꼬리말, 각주, 글상자와 여러 셀에 걸친 선택은 잘못된 위치 변경을 막기 위해 거부한다.

## 런타임과 보안

- npm SDK와 정적 Studio는 모두 `0.7.19`로 고정한다.
- 기본 진입점은 `/rhwp-studio/index.html`이다. Vite의 SPA fallback과 혼동하지 않도록 디렉터리 주소가 아닌 파일 주소를 사용한다.
- `VITE_RHWP_STUDIO_URL`로 경로를 바꿀 수 있지만, 공용 설정은 현재 애플리케이션과 같은 HTTP(S) 출처만 허용한다.
- 비공개 문서는 인증된 애플리케이션이 내려받아 같은 출처 iframe에 전달한다. 공용 편집기가 임의 외부 서버로 문서를 전송하지 않는다.
- 일반 편집과 내보내기는 브라우저 안에서 처리된다. 사용자가 AI 분석이나 초안 생성을 실행한 경우에만 파싱된 문서 텍스트가 인증이 필요한 Supabase `openai-proxy`를 거쳐 AI 제공자에 전달된다.
- 문서 원문은 프롬프트 지시가 아닌 신뢰할 수 없는 데이터로 취급한다. AI 응답은 구조 검증 후 미리보기로만 제공하며 자동 적용하지 않는다.
- Studio가 비표준 HWPX 또는 글꼴 선택을 요청할 수 있으므로 로딩 안내는 iframe 조작을 가리지 않는다.

## 배포와 갱신

정적 Studio는 `edwardkim/rhwp`의 `v0.7.19`, commit `f137b4c9468eaff5bb43e25108e9c9d39a2ed15b`에서 `/rhwp-studio/` base로 빌드했다. SPACEKIJUN의 `spacekijun-ai-edit-v1`, `spacekijun-ai-template-v1`, `spacekijun-ai-nested-table-v1` 확장을 적용했으며 샘플 문서와 PWA 서비스 워커는 제외하고 라이선스 파일은 함께 배포한다.

버전을 올릴 때는 다음을 한 변경으로 맞춘다.

1. `@rhwp/editor`의 정확한 버전
2. `RHWP_STUDIO_VERSION`
3. `spacekijun-ai-edit-v1`의 위치 캡처, stale 대상 차단과 단일 undo 계약
4. `spacekijun-ai-template-v1`의 AI 필드 메타데이터, 빠른 실행 버튼과 단축키
5. `spacekijun-ai-nested-table-v1`의 중첩 표 커서 삽입·같은 셀 선택 대체·AI 작업 영역 생성
6. `public/rhwp-studio` 빌드와 라이선스
7. 실제 HWPX/HWP의 로드, AI 작업 영역 생성·기존 누름틀 전환·저장 후 재조회, 커서 삽입, 선택 영역 대체, 필드 일괄 적용, undo, stale 대상 거부와 HWPX 재내보내기 브라우저 검사

정적 런타임은 약 40MB이므로 첫 접근에서 WASM과 글꼴 로딩 시간이 필요하다. 애플리케이션 JavaScript에는 동적 import로 분리되어 편집기를 열 때만 SDK를 불러온다.
