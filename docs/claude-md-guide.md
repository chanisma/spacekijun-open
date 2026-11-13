# CLAUDE.md 작성 규약과 정리 이력

## 2026-10-23 정리

CLAUDE.md 가 다시 **1,133줄 342KB** 로 불어나(9-12 정리 직후 155KB) 같은 규약을 한 번 더 적용했다 — **565줄 55KB**.
- 고쳐 쓴 절은 원문을 **한 줄도 고치지 않고** 그 기능의 문서 끝 «CLAUDE.md 에서 옮긴 원문 (2026-10-23)» 절로 옮겼다(기존 문서 46곳 + 새 문서 14개). 손대지 않은 절은 그대로다.
- 검증: 옛 CLAUDE.md 의 비어 있지 않은 모든 줄이 새 CLAUDE.md 또는 docs/ 어딘가에 그대로 있다(누락 0) · 새 CLAUDE.md 가 가리키는 경로 161개가 전부 존재한다.
- 새 문서: `docs/features/` auth-and-roles · task-management · ui-conventions · navigation · admin · calls-directory · browser-notifications · shared-patterns · google-drive · ai-chat · chart-animation · app-resilience, 그리고 `docs/gotchas.md`·이 파일.
- **다시 불어나는 원인**: 기능을 만들 때마다 Feature Modules 표의 한 칸이나 «Task Management» 에 문단을 덧붙였다(가장 긴 줄 하나가 7,500자). 새 기능은 **한두 줄 + 포인터**, ⚠️ 는 다른 기능을 깨뜨리는 것만.

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

---

**개발 프롬프트 기록**: 기능을 **왜 그렇게 만들었는지**는 이 파일과 `docs/features/*.md`가 결론 형태로 담고, **그 결론에 이르게 한 요구·질문·뒤집힌 판단의 순서**는 각 기능 폴더의 `PROMPTS.md`에 남긴다(색인 = 루트 [`PROMPTS.md`](PROMPTS.md)). 특히 **재봤다가 기각한 것**은 결론 문서에 잘 안 남는데 같은 아이디어가 몇 달 뒤 다시 제안되므로, 측정값과 함께 그쪽에 보존한다. 2026-09-04 이후 세션분만 있고 그 이전은 남아 있지 않다(지어내지 않았다).

**Note**: DATABASE_TABLES.md is a navigation index — detailed per-domain schema lives in `docs/database/*.md` (core, _shared, education-ontology, admission, knowledge-graph, timetable, purchase-request, training-certificate, document-issue).

**모듈·컴포넌트 상세 노트**: 이 파일에는 각 기능의 요약만 남기고, 상세 설계·동작·gotcha 노트는 `docs/features/*.md`로 분리했다 (2026-09-02). Feature Modules 표와 Component Architecture의 각 항목이 해당 문서를 가리킨다. 새 기능을 추가할 때도 CLAUDE.md에는 요약+포인터만 남기고 상세는 `docs/features/<모듈>.md`에 둘 것.

**2026-09-12 정리**: 그 규약을 이 파일 자신에게 적용했다 — **1,164줄 324KB → 847줄 155KB**. 옮긴 것은 셋이고 **한 줄도 버리지 않았다**(전수 대조 확인): ①`## Gotchas` 의 모의고사·성적예측 278줄 → `docs/features/evalearn.md` + `docs/features/grade-prediction.md` ②`#### 전자서명` 의 기능 내부 노트 22줄 → `docs/features/e-signature.md`(거기서 얻은 **전역 규칙 5종**은 `## Gotchas` 로 옮겼다 — 전자서명만의 이야기가 아니다) ③중첩 모달 사고 경위 32줄 → 이미 같은 내용을 갖고 있던 `docs/nested-modal-pitfalls.md` 로 접고 포인터만.

**무엇을 이 파일에 남기는가** — 판단 기준은 "**이 줄을 모르고 다른 기능을 고치면 사고가 나는가**"다. 그렇다면 남기고(전역 규칙·계약·역할/RLS 판정·공용 부품), 한 기능 안에서만 참인 설계·UI·측정·기각 기록은 그 기능의 문서로 보낸다. **재봤다가 기각한 것은 특히 기능 문서에 남긴다** — 결론만 적어 두면 같은 제안이 몇 달 뒤 다시 올라온다.
