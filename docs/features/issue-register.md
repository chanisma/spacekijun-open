# issue-register

> CLAUDE.md 에서 분리한 상세 문서. 스키마·마이그레이션은 `docs/database/*.md` 참조.

발급번호 관리 (가정통신문·봉사활동 개인/단체/동아리). 연도별 자동 채번(`YYYY-NNN`; 봉사 개인+단체+동아리 통합 시퀀스·가정통신문 별도), 발급 대장(통합검색·연도필터·작성자/admin 수정·삭제), HWPX 확인서 자동 생성(jszip 템플릿 셀 clone). 봉사 탭=**단체**(과거 "반별")/**동아리**/개인 — 모두 **하나의 발급 모달**(`IssueCreateDialog`, 칩으로 유형 전환). 페이지 유형별 분리(`/issue-register/volunteer`·`/gajeong`), 데이터·채번 공유. 단체 참여자=`SearchableMultiSelect`(filterByStudent+enableClassSearch).

**대장 아코디언**(`IssueClassRows`·`IssueClubRows`)은 **컬럼 헤더 행** 표시, **`IssueLedger` "전체 내용" 토글**(기본 OFF=모두 접힘)로 전 행 동시 펼침(overrides 셋으로 개별 행 재토글).

**아코디언 행 표시 범위**(`useLedgerScope`): 일반 교사는 본인 담임 반(`isHomeroomOf`)·담당 동아리(`isClubAdvisor`) 행만, **admin·학교관리자(=사이트 관리자)·발급대장담당자 태그**는 전체 행(연수담당자 `useIsTrainingManager` 패턴, `SEE_ALL_TAGS`).

**동아리**(`volunteer_club`): 모달에서 동아리를 `SearchableMultiSelect`로 검색·다중 선택("모든 동아리" 센티넬=전체 토글, `ClubFormFields`)→`club_info`에서 명단·담당교사(+`teacher_resource_id`) 자동 스냅샷, 공통 양식(주관영역·구분·기관·장소)+**활동 일시(날짜·시간) 시드**(`ClubScheduleField`, 선택)만 입력(제목·봉사 내용 입력 없음).

**활동(날짜·시간·내용)은 동아리별**로 발급 후 **대장 아코디언**의 각 동아리 행에서 작성(`ClubActivityEditDialog`, 모달 시드 일시로 seed되나 **여기서 일시 직접 추가/삭제 가능**, 최대 9건; `seedClubActivities`로 병합).

**담당교사 수정 권한**: `canEditClub`(UI 노출=작성자/admin/그 동아리 담당교사명) + `update_club_activities` RPC(SECURITY DEFINER, 서버는 `teacher_resource_id`/이름으로 최종 판정 → 담당교사가 자기 동아리 활동만 저장, RLS는 작성자/admin만).

**다운로드 미리보기**(`ClubExportPreviewDialog`): 학생×활동일자 **매트릭스**로 날짜별 참가(√) 조정 + **제외 학생** 선택 → 다운로드 클릭 시 `update_club_attendance` RPC로 **DB 저장**(`clubs[].attendance`·`excludedResourceIds`, 재열람 복원) 후 `downloadClubHwpx(issue, clubId, {attendance, excludedResourceIds})`. 저장 권한 없으면 이번 다운로드만 적용. 전용 템플릿(`club-template.hwpx`)+`clubFormFill.ts`(순수 치환: 주관영역 √·활동 N행·명단 날짜열 N개 가변 재구성·`ClubFillStudent.attend[]`로 학생별 날짜 √·**학생별 인정시간=참가일 Σhours**·확인자 직위=동아리 담당교사.

**스코프 박스는 템플릿 기존 (√)/(  ) 안 마크만 교체(중복 금지)**·**인정시간 셀 2문단**·**"각 동아리명" 자리표시자→동아리명 치환**). `generateClubHwpx(issue, clubId?, opts?)`=동아리1장 또는 전체 페이지분리(opts 없으면 각 동아리 저장된 attendance/excluded로 폴백). form_data=`{kind:'club', scope/area/org…, schedule:[{date,hours}], clubs:[{club_id,club_name,teacher_name,teacher_resource_id,students[],activities[],attendance?,excludedResourceIds?}]}`(`isClubFormData`; schedule 없는 옛 레코드는 `?.`로 호환), `document_issue.students`=전 동아리 union.

**개인**(`volunteer_personal`): 학생 1명=발급 1건(발급번호 1개)이 원칙이나, 발급 모달에서 같은 내용을 여러 학생이 함께 수행한 경우를 위해 `SearchableMultiSelect`로 **다중 선택**을 허용 — 제출 시 학생마다 **별도 `create_document_issue` 호출**로 별도 행 생성(`IssueCreateDialog.submitPersonal`, `Promise.allSettled` 부분 실패 허용), 같은 제출 묶음은 클라이언트 생성 `batch_id`를 **`document_issue.meta.batch_id`**에 기록해 표시만 묶는다(저장은 항상 행 단위). 확인자 성명은 선택 학생들의 (학년,반)이 전부 동일할 때만 담임으로 자동 시딩(`useHomeroomTeachers`), 반이 섞이면 직접 입력 안내. 대장은 `groupByBatch()`로 배치를 대표 행 1개(+펼치면 학생별 발급번호가 보이는 `IssuePersonalRows` 하위 행)로 표시, 배치 전체 통합 다운로드(`generatePersonalHwpxBatch`, 학생별 페이지 분리)를 대표 행에서 제공. 전용 템플릿(`personal-template.hwpx`, "봉사활동 계획 및 확인서(개인)")은 **로스터 표가 없어**(학생 1명) 행 복제 로직 불필요 — `personalFormFill.ts`가 계획서·확인서 두 블록(완전히 동일 정보, 대부분 필드 **2회 등장**)을 라벨 정규식 `/g`로 동시 치환.

**학생 서명란은 실물 서명 대상이라 의도적으로 미치환**, 확인자 성명 치환은 "성명:" 라벨 없는 confirmer 전용 들여쓰기 줄로 앵커링해 학생 서명란과 구분. `create_document_issue` RPC는 `p_meta jsonb` 파라미터로 `batch_id`를 insert 시점에 원자적 기록(옛 9-인자 오버로드는 PostgREST 모호성 방지를 위해 `DROP FUNCTION`). 변경 시 `useIssues`가 `['document-issue']` prefix로 폭넓게 무효화. 회귀: `run-hwpx.mts`·`run-rezip.mts`·`run-club.mts`(부분참가·스코프박스·동아리명 케이스 포함)·`run-club-e2e.mts`·`run-club-multi.mts`·`run-personal.mts`(2회 등장 필드·학생 서명 미치환·확인자 앵커링)·`run-personal-batch.mts`(배치 페이지분리+재개봉) | `hwpx/volunteerFormFill.ts`·`clubFormFill.ts`·`personalFormFill.ts`(순수 치환)·`generateVolunteerHwpx.ts`/`generateClubHwpx.ts`/`generatePersonalHwpx.ts`(mimetype STORE-first), `components/ClubFormFields.tsx`·`ClubScheduleField.tsx`·`ClubActivityEditDialog.tsx`·`ClubExportPreviewDialog.tsx`·`IssueClubRows.tsx`·`PersonalFormFields.tsx`·`IssuePersonalRows.tsx`, `hooks/useClubs.ts`·`useIssueAccess.ts`·`useHomeroomTeachers.ts`, `document_issue`(doc_type에 `volunteer_club`/`volunteer_personal`, `meta.batch_id`)·`club_info` 테이블 + `next_document_issue_no`/`create_document_issue`(p_meta)/`update_club_activities`/`update_club_attendance` RPC

---

## CLAUDE.md 에서 옮긴 원문 (2026-10-23)

> 2026-10-23 CLAUDE.md 정리 때 **한 줄도 고치지 않고** 옮긴 원문이다. 요약·포인터는 CLAUDE.md 에 남아 있다.

| `issue-register` | 발급번호 관리 (가정통신문·봉사 개인/단체/동아리) + HWPX 확인서 자동 생성 | `hwpx/*FormFill.ts`, `document_issue` 테이블 · `docs/features/issue-register.md` |
