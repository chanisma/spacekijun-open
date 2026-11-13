# 업무 제출 양식 실행 연결 복구

> **⚠️ 은퇴한 기능의 기록이다 (2026-10-05)** — 옛 제출 `task.meta.submission` 은 2026-10-01 에 「제출 받기」 작업(`submit.*`,
> `docs/features/submit-action.md`)으로 대체됐고, 2026-10-05 에 이 문서가 설명하는 **화면 코드를 걷어 냈다**
> (운영 옛 설정 0건 · `task_submission` 0행). DB 표·RPC 는 다음 릴리스에 정리한다 — `docs/database/core.md` §8-1.
> 아래의 판단(명단 비노출·상태에서 유도한 서버 가드·RUN 미기록 등)은 새 제출 받기의 설계 근거로 남긴다.

2026-09-07. 업무의 `meta.submission.template`과 작성 실행에 필요한 `meta.submission.workId`는 다른 값이다. 제출 모달은 후자를 사용한다.

## 확인한 원인

실제 ‘3차 정보공시’ 업무에는 ‘협의록 양식’ 참조와 같은 양식을 사용하는 task_work가 있었지만 submission.workId가 없었다. 기존 모달은 카드가 가진 workId만 읽어, 이 경우 조회 자체가 실행되지 않고 ‘제출 양식을 찾지 못했습니다’로 표시했다.

추가로 ensureSubmissionWork의 신규 생성 경로는 execution_mode=shared, verification_mode=review를 보냈다. 실제 DB CHECK 제약은 각각 manual/assisted/automatic과 none/automatic/human_review만 허용하므로 해당 insert는 실패한다. 업무 편집은 이 실패를 알린 뒤 일반 저장 완료 흐름을 계속 실행했다.

## 변경

- 신규 제출용 WORK는 assisted/human_review로 생성한다. TypeScript의 TaskWork 모드 타입으로도 검사한다.
- 모달은 task ID로 최신 제출 설정을 읽은 뒤, 저장된 workId·task_id·work_type과 보관 여부를 확인해 실행 항목을 조회한다. 카드의 오래된 메타데이터에 의존하지 않는다.
- 제출 양식 연결 실패 시 편집 화면을 유지한다.
- 신규 업무 저장 후 연결만 실패하면 생성된 task ID를 유지해 재시도에서 업무를 중복 생성하지 않는다.
- 설정 누락, 현재 제출 방식 변경, 삭제·보관·열람 불가, 조회 오류를 구분해 표시한다.
- 문서 재구성용 HWPX 모듈은 실제 재구성 시에만 불러온다.

## 데이터 복구 및 검증

해당 업무의 submission.workId 하나만 기존 연결 WORK ID로 복구했다. task_id·양식 ID 일치, 활성 상태와 기존 연결값 부재를 조건으로 적용했다. SQL 재조회에서 연결·양식 일치·활성·공개 열람 조건을 확인했다. 스키마와 RLS는 변경하지 않았다.

```powershell
npx --yes tsx --tsconfig tsconfig.app.json --test src/services/__tests__/taskSubmissionWork.test.ts
npx --yes tsx --tsconfig tsconfig.app.json scripts/task-spec-submission-test/run.mts
```

신규 테스트는 최신 저장 설정 조회, 누락 설정 처리, DB에서 허용하는 모드로 신규 WORK 생성 경로를 검사한다. 기존 제출 설정·검증·CSV 회귀도 실행했다. 실제 담당자 UI에서 작성 후 최종 제출까지 수행한 검증은 아니다.
