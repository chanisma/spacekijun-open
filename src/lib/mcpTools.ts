/**
 * MCP 에이전트 연결 — 도구 허용 카탈로그 (2026-10-18 시험판).
 *
 * 허용 단위(grant)는 «무엇을 할 수 있는가» 하나이고, 에이전트에게 보이는 도구 이름은 그 아래에 있다.
 * 화면 묶음(feature)은 관리 화면 «도구 설명» 탭이 기능별로 모아 보이는 단위다(MCP_FEATURES).
 * 누가 쓰는가 = 교사 기본(mcp_tool_policy) ∪ 사람별 추가(mcp_tool_grant) − 사람별 해제(mcp_tool_block) — 2026-10-24.
 * 기능마다 허용 하나 — 읽기·쓰기를 나누지 않는다(2026-10-24 통합). 나눠 두는 것은 남에게 번지는 쓰기(일정 관리·페이지 만들기·명단 배정)뿐.
 * ⚠️ 이 목록은 세 곳이 같아야 한다 — 마이그레이션의 `mcp_tool_grant.tool`·`mcp_tool_policy.tool` CHECK(가장 최근 정의 — 20261024140000) ·
 *    엣지 함수 `supabase/functions/mcp/handler.js` 의 TOOLS · 여기. 회귀 scripts/mcp-agent-test/run.mts 가 대조한다.
 *    한쪽에만 넣으면 관리 화면에서 켜도 저장이 거부되거나(CHECK), 켰는데 에이전트에게 도구가 안 보인다(TOOLS).
 */
export const MCP_TOOL_GRANTS = [
  {
    key: 'schedule.mine',
    label: '일정 조회·개인일정',
    description: '내가 웹에서 볼 수 있는 일정을 기간으로 읽고, 내 개인일정을 만들고 고치고 지운다 — 개인일정은 나만 보이고 다른 사람에게 알림이 가지 않는다',
    tools: ['list_schedules', 'create_personal_schedule', 'update_schedule', 'delete_schedule'],
    writes: true,
  },
  {
    key: 'schedule.manage',
    label: '일정 만들기·고치기',
    description: '연수·업무·출장·학사일정을 참석자와 함께 만들고, 내가 만든 일정을 고치거나 지운다(연수 서명 링크 보기·기한 포함) — 연수·업무는 교사 참석자에게 알림이 간다',
    tools: ['find_staff', 'create_schedule', 'update_schedule', 'get_training_sign_links', 'set_training_sign_link_expiry', 'delete_schedule'],
    writes: true,
  },
  {
    key: 'homeroom.read',
    label: '우리 반 명단·시간표',
    description: '담임 반(태그 «N학년 N반»)의 재학생 번호와 시간표를 읽는다 — 이름은 주지 않고, 호출은 기록된다',
    tools: ['homeroom_roster', 'homeroom_timetable'],
    writes: false,
  },
  {
    key: 'task.mine',
    label: '내 업무',
    description: '내 할 일·할 일 자세히·내가 책임자인 업무 현황을 읽고, 내가 담당자인 할 일을 완료하거나 되돌린다 — 담당자이거나 책임자인 것만, 명단은 책임자에게만, 제출이 남으면 완료가 거부된다',
    tools: ['list_my_tasks', 'get_task', 'list_managed_works', 'set_my_task_status'],
    writes: true,
  },
  {
    key: 'purchase.request',
    label: '구매 신청',
    description: '구매 신청 페이지·내 신청 품목(상태·사유·품의 진행)을 읽고, 열린 페이지에 품목을 신청하고 처리 대기인 내 품목을 고치거나 취소한다 — 새 신청은 페이지 담당자에게 알림이 간다. 내가 담당자(작성자·공동 작업자)인 페이지에서는 신청을 읽고 품목 상태(승인·불가·완료)를 바꾸고 품의 차수·품의 품목을 정리하고 차수 상태(품의 완료·구매 완료 — 연결된 품목 상태도 같이 바뀐다)를 바꾼다 — 상태 변경은 신청자에게 알림이 가지 않는다. 담당자는 남의 신청 품목의 칸(물품명·가격·개수 등)을 고치고, 신청의 수정 이력을 읽고, 품의에 안 담긴 신청을 통째로 지울 수도 있다(지우기는 되돌릴 수 없다). 학생 신청자는 학반 번호로만',
    tools: ['list_purchase_pages', 'list_my_purchase_requests', 'list_managed_purchase_requests', 'submit_purchase_request', 'update_my_purchase_item', 'cancel_my_purchase_item', 'set_purchase_item_status', 'list_purchase_orders', 'create_purchase_order_batch', 'update_purchase_order_batch', 'delete_purchase_order_batch', 'save_purchase_order_line', 'delete_purchase_order_lines', 'set_purchase_order_status', 'update_purchase_item_cells', 'list_purchase_request_history', 'delete_purchase_request'],
    writes: true,
  },
  {
    key: 'purchase.page',
    label: '구매 신청 페이지 만들기',
    description: '새 구매 신청 페이지(대상·기간·칸)를 만들고, 내가 담당자인 페이지의 제목·안내문·기간·보관을 고친다 — 만든 사람이 담당자가 되고, 대상·칸·공동 작업자 수정은 웹에서',
    tools: ['create_purchase_page', 'update_purchase_page'],
    writes: true,
  },
  {
    key: 'docgen.create',
    label: '문서 생성 방식 만들기',
    description: '한글 양식(.hwpx)을 올리고, 에이전트가 고른 채울 자리로 문서 생성 «생성 방식»을 만들고, 내 생성 방식의 이름·설명·공개를 고치거나 (쓴 기록이 없으면) 지운다 — 기본은 나만 보인다. 만들기는 셸이 있는 에이전트(Claude Code 등)만',
    tools: ['start_template_upload', 'read_template_upload', 'create_document_generation', 'update_document_generation', 'delete_document_generation'],
    writes: true,
  },
  {
    key: 'docgen.fill',
    label: '생성 방식으로 문서 만들기',
    description: '내 것과 공개된 문서 생성 «생성 방식»의 칸을 에이전트가 채워 한글 파일을 만들고, 실행 기록·완성 문서로 저장하며, 내 완성 문서를 보고 확정하거나 초안을 지운다 — 서버는 AI 를 부르지 않는다',
    tools: ['list_document_generations', 'get_document_generation', 'create_document', 'list_generated_documents', 'finalize_document', 'delete_generated_document'],
    writes: true,
  },
  {
    key: 'work.manage',
    label: '업무 만들기·고치기',
    description: '업무·할 일(단계·마감·담당자)을 만들고 고치고, 할 일에 작업(바로가기·나이스·외부 시스템·문서 생성·입력/제출 받기·메시지의 설정)을 연결하며, 할 일 전체를 완료·취소하고 진행 기록이 있는 작업은 보관한다 — 할 일·작업은 내가 책임자인 업무만, 진행 기록이 있으면 지우지 않는다, 요청·발송은 «업무 진행하기»',
    tools: ['get_work', 'create_work', 'update_work', 'delete_work', 'create_task', 'update_task', 'delete_task', 'add_action', 'update_action', 'remove_action', 'archive_action', 'set_task_status'],
    writes: true,
  },
  {
    key: 'work.run',
    label: '업무 진행하기',
    description: '담당자의 지시로 업무를 이어서 진행한다 — 진행 상황(다음 할 일·자동화 수준) · 입력/제출 요청 보내기 · 안 낸 사람 다시 알림 · 메시지 발송(알림이 가는 것은 미리보기 → 사용자 확인 → 실행) · 결과 읽기 · 돌아보기 지표 · 인사이트 남기기 · 업무 기능 안내. 내가 책임자인 업무만',
    tools: ['get_work_progress', 'send_request', 'remind_pending', 'send_message', 'get_action_results', 'review_work', 'save_work_insight', 'decide_work_insight',
      'list_work_knowledge', 'save_work_knowledge', 'update_work_knowledge', 'get_work_guide'],
    writes: true,
  },
  {
    key: 'workflow.manage',
    label: '업무 흐름 만들기·연결',
    description: '업무를 업무 흐름(캔버스)에 자동 배치하고, 노드 사이 연결(흐름·선행·인계·관련)을 더하고 빼고, 노드를 빼고, 흐름 이름·부서를 바꾸고 내 흐름을 지운다 — 내 흐름만 바꾼다',
    tools: ['list_workflows', 'get_workflow', 'place_work', 'connect_nodes', 'disconnect_nodes', 'delete_workflow', 'update_workflow', 'remove_workflow_node'],
    writes: true,
  },
  {
    key: 'issue.register',
    label: '발급 대장',
    description: '가정통신문·봉사활동(개인·단체·동아리) 발급 대장을 읽고, 가정통신문 발급번호를 받거나 봉사활동을 발급하며 내가 받은 것(봉사 양식·명단 포함, 반별 명단은 그 반 담임도)을 고치거나 취소한다 — 번호는 되돌릴 수 없다(취소해도 결번), 학생은 학년·반·번호로, 학생 이름이 들어 있어 호출은 기록된다, 확인서 한글 파일은 웹에서',
    tools: ['list_issues', 'get_issue', 'create_gajeong_issue', 'update_gajeong_issue', 'cancel_gajeong_issue', 'list_clubs', 'create_volunteer_personal', 'create_volunteer_group', 'create_volunteer_club', 'set_club_activities', 'cancel_volunteer_issues', 'update_volunteer_issue', 'set_volunteer_class_roster'],
    writes: true,
  },
  {
    key: 'planner.mine',
    label: '플래너',
    description: '내 플래너의 계획(날짜·시간·완료·목표·메모·돌아보기)과 목표(장기·단기)를 읽고, 계획을 적고 고치고 옮기고 지우며 완료·돌아보기·목표를 적는다 — 오늘 계획 완료 보상은 웹과 같다, 목표 지우기는 웹에서',
    tools: ['list_planner', 'list_planner_goals', 'save_plan', 'set_plan_done', 'delete_plan', 'save_plan_reflection', 'save_planner_goal', 'set_planner_goal_status'],
    writes: true,
  },
  // 시간표·스케줄 부가 기능(2026-10-23) — 판정은 웹 순수 함수(mcpSchoolOps), 만들기는 서버가 다시 확인
  {
    key: 'timetable.memo',
    label: '시간표 메모',
    description: '시간표의 교시 메모와 수업 중 학생별 메모를 읽고 적는다 — 학생은 학년-반-번호로만(이름 없음), 학생 메모는 호출이 기록된다',
    tools: ['list_timetable_memos', 'save_timetable_memo', 'list_lesson_students', 'save_student_memo'],
    writes: true,
  },
  {
    key: 'swap.class',
    label: '수업 교체',
    description: '내 수업 교체·대체 요청과 내 수업 하나의 교체·대체 후보(웹과 같은 판정 — 수강생·선생님 시간·상대 부담)를 보고, 교체·대체를 신청하고 받은 요청을 수락·거절하고 내 신청을 취소한다 — 서버가 후보 판정을 다시 하고 상대에게 알림이 간다',
    tools: ['list_class_swaps', 'find_swap_candidates', 'request_class_swap', 'request_substitute', 'respond_class_swap', 'cancel_class_swap'],
    writes: true,
  },
  {
    key: 'schedule.meeting',
    label: '회의 가능 시간',
    description: '여러 선생님이 함께 비는 시간을 주간 시간표에서 찾는다(이름·부서·태그)',
    tools: ['find_meeting_times'],
    writes: false,
  },
  {
    key: 'schedule.survey',
    label: '일정 설문',
    description: '나에게 온 일정 설문에 답하고, 설문을 만들고(대상자 알림) 결과를 보고 고치고 마감하거나 지우며 결과의 날짜로 일정을 만든다 — 학생 대상자·응답자는 학년-반-번호로만',
    tools: ['list_schedule_surveys', 'respond_schedule_survey', 'create_schedule_survey', 'get_schedule_survey_result', 'set_schedule_survey_status', 'create_schedule_from_survey', 'update_schedule_survey', 'delete_schedule_survey'],
    writes: true,
  },
  {
    key: 'mealduty.plan',
    label: '급식지도 명단',
    description: '웹과 같은 규칙으로 한 달 급식지도 초안을 만들고, 확인한 명단을 업무 일정으로 만들고 내가 만든 급식지도 일정을 고치거나 지운다 — 만들 때 담당 교사에게 알림이 간다',
    tools: ['draft_meal_duty', 'create_meal_duty_schedules', 'update_schedule', 'delete_schedule'],
    writes: true,
  },
  {
    key: 'supervision.plan',
    label: '자습 감독 배정',
    description: '웹과 같은 규칙으로 한 학년의 한 달 자습 감독 초안을 만들고 일정으로 만들며 내가 만든 감독 일정을 고치거나 지운다 — 그 학년 학년부장·담임 태그(관리자 = 전 학년)만',
    tools: ['draft_supervision', 'create_supervision_schedules', 'update_schedule', 'delete_schedule'],
    writes: true,
  },
  {
    key: 'supervision.mine',
    label: '내 자습 감독·교체',
    description: '내가 맡은 자습 감독을 보고 교체를 신청·수락·취소하며, «못 하는 날»을 적고 지운다',
    tools: ['list_my_supervisions', 'request_supervision_swap', 'respond_supervision_swap', 'cancel_supervision_swap', 'set_supervision_unavailability', 'delete_supervision_unavailability'],
    writes: true,
  },
  // 서류함 · 공지 · 결재·서명 · 코드 공유 · 나이스 안내(2026-10-24) — 기능마다 허용 하나(읽기·쓰기를 나누지 않는다)
  {
    key: 'document.library',
    label: '서류함',
    description: '서류함 문서를 찾고 파일을 받으며(드라이브·링크 문서는 바로 열기), 파일을 올리거나 드라이브 링크를 등록하고, 폴더를 보고 만들며, 내가 올린 문서의 제목·폴더·분류를 고치거나 지운다',
    tools: ['list_documents', 'list_document_folders', 'create_document_folder', 'update_document', 'start_document_upload', 'finish_document_upload', 'add_document_link', 'get_document_file', 'delete_document'],
    writes: true,
  },
  {
    key: 'notice.board',
    label: '공지사항',
    description: '내가 볼 수 있는 부서 공지를 읽고, 공지를 쓰고 고치고 지운다(내가 쓴 것만) — 대상을 정하지 않으면 모든 교직원이 본다, 알림·첨부는 없다',
    tools: ['list_notices', 'get_notice', 'create_notice', 'update_notice', 'delete_notice'],
    writes: true,
  },
  {
    key: 'sign.request',
    label: '결재·전자서명',
    description: '내 결재·서명 요청(내 차례·내가 올린 것)과 결재선·서명자를 자세히 보고, 전자서명 문서(원본·완성본)를 받고, 서명자별 로그인 없는 서명 링크(QR)를 꺼내고, 문서 생성으로 만든 한글 문서로 서명 요청을 만들고(서명란 위치까지), 내 차례 요청을 반려하거나 내가 올린 요청의 마감을 바꾸거나 취소한다 — 승인·서명은 웹에서 본인이',
    tools: ['list_sign_requests', 'get_sign_request', 'get_sign_file', 'get_sign_links', 'create_sign_request', 'reject_sign_request', 'cancel_sign_request', 'set_sign_request_due'],
    writes: true,
  },
  {
    key: 'code.share',
    label: '코드 공유',
    description: '내 코드 프로젝트를 보고 올리고 고치고 지우며(이미지 같은 이진 파일 올리기·받기 포함), 볼 수 있는 프로젝트를 가져간다 — 기본은 «나만», 남의 프로젝트는 링크 id 로 하나만 열고 학생 주인은 «학생»으로만',
    tools: ['list_code_projects', 'get_code_project', 'create_code_project', 'update_code_project', 'delete_code_project', 'start_code_file_upload', 'finish_code_file_upload', 'get_code_files', 'fork_code_project'],
    writes: true,
  },
  {
    key: 'neis.guide',
    label: '나이스 안내',
    description: '나이스 업무를 어느 화면에서 하는지 찾고 그 화면의 절차·주의·선행 업무를 읽는다 — 웹 «나이스 안내»와 같은 자료, 나이스를 조작하지는 않는다',
    tools: ['search_neis_guide', 'get_neis_guide'],
    writes: false,
  },
  // 공문 판단함(2026-10-30) — 교사 기본 꺼짐, 관리자에게만 사람별 허용(표 RLS 도 관리자만)
  {
    key: 'official.doc',
    label: '공문 판단함',
    description: '서버 PC 가 모은 새 접수 공문과 AI 1차 판정을 읽고, 사용자가 확정한 결정(업무 연결·참고·무시 + 규칙)을 남긴다 — 할 일은 업무 도구로 만든다',
    tools: ['list_official_docs', 'get_official_doc', 'decide_official_doc'],
    writes: true,
  },
  // 에듀파인 공문 읽기(2026-11-12, 사용자 결정 — 교직원 누구나 모든 접수 공문) — 교사 기본 켜짐, 읽기만.
  // 넓힘은 이 RPC 안에서만(트랜잭션 한정 설정 mcp.read_official_docs) — 웹·데스크의 공문 범위는 그대로
  {
    key: 'official.read',
    label: '에듀파인 공문 읽기',
    description: '학교가 접수한 에듀파인 공문을 낱말·발신·담당·기간으로 찾고, 본문·공문 정보(붙임 목록)·AI 판정·결정·원/후속/비슷한 공문을 읽는다 — 결정은 남기지 않는다, 호출은 기록된다',
    tools: ['search_official_docs', 'read_official_doc'],
    writes: false,
  },
  // 내 알림(2026-11-04) — 읽기만. 표의 RESTRICTIVE 정책(Realtime 차단)은 이 RPC 가 켠 트랜잭션 안에서만 통과한다
  {
    key: 'notification.mine',
    label: '내 알림',
    description: '웹 «알림»에 온 내 알림(쿨메신저 쪽지·쪽지·일정·요청 등)을 읽는다 — 읽음 표시는 바꾸지 않고, 놀이 알림은 기본 숨김, 호출은 기록된다',
    tools: ['list_notifications'],
    writes: false,
  },
  // 자습실(seaton 열람실) 관리(2026-11-05, 교사 기본 켜짐 — 사용자 결정) — seaton 웹과 같은 표·칸, 학생 = 학년-반-번호 + 이름
  {
    key: 'studyroom.manage',
    label: '자습실 관리',
    description: '자습실(seaton) — 열람실 목록·날짜별 출석 보기·출석 처리·통계는 모든 교사, 열람실 설정(학년·운영 기간·요일·교시 시각·신청 기간·규칙)은 학년 부장, 학생 자습 추가·옮기기·지우기(보관함·되살리기)는 그 학생의 학년 부장·담임 — 역할은 태그로 서버가 판정한다',
    tools: ['list_study_rooms', 'update_study_room', 'set_booking_windows', 'get_study_room_attendance', 'set_study_room_attendance', 'get_study_room_stats', 'add_study_room_reservations', 'move_study_room_reservations', 'delete_study_room_reservations', 'list_study_room_trash', 'restore_study_room_reservations'],
    writes: true,
  },
  // 학교 맥락 목록(2026-11-06, 교사 기본 켜짐) — 지식이 어디에 어떤 구조로 있는지 + 새 맥락(note). source 는 관리자만(서버가 판정)
  {
    key: 'knowledge.context',
    label: '학교 맥락',
    description: '학교 지식이 어디에 어떤 구조로 있는지(정기시험 계획·성취기준·업무분장·업무 지식 …) 목록에서 찾고, 목록에 없던 학교 지식을 새 맥락으로 남기고 고친다 — 개별 자료는 원래 자리에서 읽는다. 문서 맥락(문서 생성에 붙이는 배경 글)을 읽고, 내 것을 쓰고 고치고 지우고 생성 방식에 연결한다',
    tools: ['list_contexts', 'get_context', 'save_context', 'archive_context', 'list_doc_contexts', 'get_doc_context', 'save_doc_context', 'delete_doc_context', 'link_doc_context'],
    writes: true,
  },
  // 입시 정보(2026-11-09, 교사 기본 켜짐 — 사용자 결정) — 웹 /ipsi 와 같은 표. 직원은 웹에서도 막혀 있어 서버가 교사·관리자만 받는다
  {
    key: 'ipsi.hub',
    label: '입시 정보',
    description: '입시 기사·영상을 본문·자막까지 찾아 읽고, 지난 복합 분석을 보고, 여러 자료를 묶은 분석을 남긴다. 입시 영상을 더하고 내가 올린 영상을 고치거나 지우며, 수집기가 모으지 않은 기사를 직접 더한다(기사 고치기·지우기는 관리자) — 피드는 학생도 본다',
    tools: ['search_ipsi', 'get_ipsi_item', 'list_ipsi_analyses', 'get_ipsi_analysis', 'save_ipsi_analysis', 'add_ipsi_video', 'update_ipsi_video', 'delete_ipsi_video', 'add_ipsi_news', 'update_ipsi_news', 'delete_ipsi_news'],
    writes: true,
  },
  // 예산 관리(2026-11-10, 교사 기본 켜짐) — 웹 «업무 관리 › 예산»과 같은 표. 표 RLS 가 «내가 담당인 사업»으로 좁힌다(관리자 = 읽기만)
  {
    key: 'budget.manage',
    label: '예산 관리',
    description: '내가 담당인 예산 사업의 집행 현황(원인행위·결재 대기·남은 계획·미배정·반납 위험)을 보고, 사업관리카드 줄을 반영하고, 계획 항목을 쓰고, 추경 초안을 맞춰 보고 확정하며, 계획을 품의 품목·업무와 잇는다 — 관리자는 모든 사업을 읽기만',
    tools: ['list_budgets', 'get_budget', 'apply_budget_card', 'save_budget_plan', 'set_budget_line', 'simulate_budget_revision', 'confirm_budget_revision', 'link_budget_order', 'link_budget_work'],
    writes: true,
  },
  // 동아리(2026-11-11, 교사 기본 켜짐) — 웹 «동아리»(/clubs)와 같은 RPC. 쓰기 판정(지도교사·동아리 담당자)은 서버 club_* 한 곳
  {
    key: 'club.manage',
    label: '동아리',
    description: '동아리 목록·한 장 보기(명단·기장·지난 기록)를 읽고, 지도교사·동아리 담당자는 정보·지도교사·명단(확정·거절·빼기)·기장을 고친다. 누가기록 근거(활동·참여·요청 응답)를 읽어 부원별 초안을 남기고(웹은 문장을 만들지 않는다), 담당자는 동아리들에 요청(누가기록·활동 보고)을 보내고 진척을 본다 — 명단은 발급대장·대상 규칙·창체에 자동 반영, 명단·누가기록 읽기는 기록된다',
    tools: ['get_club_overview', 'get_club', 'save_club', 'set_club_advisors', 'set_club_members', 'decide_club_members', 'set_club_leader',
      'get_club_notes', 'save_club_note', 'list_club_requests', 'send_club_request',
      'get_club_finance', 'set_club_finance', 'open_club_purchase_page',
      'list_club_recruits', 'save_club_recruit', 'get_club_applications', 'judge_club_applications', 'finalize_club_applications',
      'decide_club_proposal', 'roll_over_clubs', 'list_club_host_candidates', 'link_club_host'],
    writes: true,
  },
  // 학생 쪽지 답장(2026-11-04, 교사 기본 켜짐 — 사용자 결정) — 받는 학생은 원래 쪽지에서 서버가 정한다, 보내기는 send_desk_message_v2
  {
    key: 'desk.message',
    label: '학생 쪽지 답장',
    description: '학생이 보낸 쪽지에 답장한다 — 받는 학생은 그 쪽지로 정해지고(고르지 않는다) 미리보기 → 확인 뒤 보낸다, 학생의 대화 요청에 답하면 대화가 열린다, 호출은 기록된다',
    tools: ['reply_desk_message'],
    writes: true,
  },
  // 에이전트 작업 요청(2026-11-11, 교사 기본 켜짐) — 보낸 사람이 수행 방식을 안내하고, 받는 사람은 자기 에이전트에게 넘긴다
  {
    key: 'agent.request',
    label: '에이전트 작업 요청',
    description: '다른 선생님에게 «이 일을 이렇게 해 달라»(요청 내용·수행 안내·연결할 문서 생성 방식·업무·할 일·스킬)를 미리보기 → 확인 뒤 보내고, 받은 요청을 읽고 완료·거절로 답한다 — 받는 쪽은 데스크·모바일·웹에서 자기 에이전트에게 넘긴다',
    tools: ['send_agent_request', 'list_agent_requests', 'get_agent_request', 'reply_agent_request'],
    writes: true,
  },
  // 데이터 카탈로그(2026-10-20) — 영역 넷이 같은 두 도구(list_data·read_data)를 쓴다. 어느 데이터셋이 어느 영역인지는 DB 카탈로그가 정한다
  {
    key: 'data.school',
    label: '학교 데이터',
    description: '학교 정보·학사일정·급식·교내 전화번호(내선)·부서, 교육과정 편제·성취기준·개설 과목, 대입 자료(학과별 컷·입시 결과·교과/종합 전형·대학별고사 일정·변경 사항·대학 정보)를 읽는다 — 개인정보 없음',
    tools: ['list_data', 'read_data'],
    writes: false,
  },
  {
    key: 'data.staff',
    label: '교직원 데이터',
    description: '교직원 명단(부서·태그·담당 교과)·업무분장·교사 시간표를 읽는다 — 이메일·연락처는 주지 않는다',
    tools: ['list_data', 'read_data'],
    writes: false,
  },
  {
    key: 'data.my',
    label: '내 데이터',
    description: '내 정보(부서·태그·담임 반·담당 교과·업무분장)·내 시간표를 읽는다',
    tools: ['list_data', 'read_data'],
    writes: false,
  },
  {
    key: 'data.student',
    label: '학생 데이터',
    description: '전교 재학생의 명단·동아리·수강 과목·시간표, 내 담임 반·내 수업 반 학생의 자습실 출결, 담임 반(학년 부장은 그 학년)의 수시 지원 목록·과목 선택 제출 현황을 읽는다 — 내신·모의고사·생기부·상담은 없고, 호출은 기록된다',
    tools: ['list_data', 'read_data'],
    writes: false,
  },
] as const;

export type McpToolGrantKey = (typeof MCP_TOOL_GRANTS)[number]['key'];

export const MCP_TOOL_GRANT_KEYS: readonly McpToolGrantKey[] = MCP_TOOL_GRANTS.map((g) => g.key);

export const mcpGrantLabel = (key: string): string =>
  MCP_TOOL_GRANTS.find((g) => g.key === key)?.label ?? key;

/**
 * 관리 화면 «도구 설명»·«권한 배정»의 기능 묶음 — 허용이 어느 기능 화면에 속하는가.
 * 허용을 새로 만들면 여기 한 곳에도 넣는다(회귀 run.mts 가 «모든 허용이 정확히 한 묶음에» 를 본다).
 */
export const MCP_FEATURES = [
  { key: 'schedule', menu: '/schedule', label: '일정', description: '일정 조회·만들기, 회의 가능 시간, 일정 설문', grants: ['schedule.mine', 'schedule.manage', 'schedule.meeting', 'schedule.survey'] },
  { key: 'duty', menu: '/schedule', label: '급식지도·자습 감독', description: '한 달 명단 초안과 일정 만들기, 내 감독 교체', grants: ['mealduty.plan', 'supervision.plan', 'supervision.mine'] },
  { key: 'timetable', menu: '/timetable', label: '시간표', description: '시간표 메모, 수업 교체·대체, 우리 반', grants: ['timetable.memo', 'swap.class', 'homeroom.read'] },
  { key: 'task', menu: '/my-tasks', label: '업무', description: '내 할 일, 업무·할 일·작업 만들기, 업무 진행하기, 업무 흐름', grants: ['task.mine', 'work.manage', 'work.run', 'workflow.manage'] },
  { key: 'planner', menu: '/planner', label: '플래너', description: '내 계획과 목표', grants: ['planner.mine'] },
  { key: 'purchase', menu: '/purchase-requests', label: '구매 신청', description: '신청 페이지·품목 신청', grants: ['purchase.request', 'purchase.page'] },
  { key: 'budget', menu: '/tasks/budget', label: '예산', description: '사업관리카드 반영·계획·추경 초안·확정, 품의·업무 연결', grants: ['budget.manage'] },
  { key: 'docgen', menu: '/document-generation', label: '문서 생성', description: '한글 양식으로 생성 방식 만들기·문서 쓰기', grants: ['docgen.create', 'docgen.fill'] },
  { key: 'club', menu: '/clubs', label: '동아리', description: '동아리 목록·명단·기장·지도교사, 명단 확정', grants: ['club.manage'] },
  { key: 'issue', menu: '/issue-register/volunteer', label: '발급 대장', description: '가정통신문 발급번호·봉사활동 확인서', grants: ['issue.register'] },
  { key: 'documents', menu: '/documents', label: '서류함', description: '문서 찾기·받기·올리기·폴더·고치기·지우기', grants: ['document.library'] },
  { key: 'notice', menu: '/notices', label: '공지사항', description: '부서 공지 읽기·쓰기', grants: ['notice.board'] },
  { key: 'sign', menu: '/signatures', label: '결재·전자서명', description: '내 요청 보기·문서 받기·반려·취소', grants: ['sign.request'] },
  { key: 'code', menu: '/code-share', label: '코드 공유', description: '내 코드 프로젝트·이진 파일·가져가기', grants: ['code.share'] },
  { key: 'neis', menu: '/neis-guide', label: '나이스 안내', description: '나이스 화면 찾기·절차 안내', grants: ['neis.guide'] },
  { key: 'officialDoc', menu: '/tasks/docs', label: '공문', description: '에듀파인 접수 공문 찾기·읽기, 판단함 판정·결정 남기기(관리자)', grants: ['official.doc', 'official.read'] },
  { key: 'studyRoom', menu: '/study-room-stats', label: '자습실', description: '열람실 설정·신청 기간·출석 처리·통계(seaton)', grants: ['studyroom.manage'] },
  { key: 'notification', menu: '/notifications', label: '알림·쪽지', description: '내 알림 읽기, 학생 쪽지 답장', grants: ['notification.mine', 'desk.message'] },
  { key: 'agentRequest', menu: '/agents', label: '에이전트 작업 요청', description: '다른 선생님에게 수행 방식을 담은 작업 요청 보내기, 받은 요청 읽기·완료·거절', grants: ['agent.request'] },
  { key: 'ipsi', menu: '/ipsi', label: '입시 정보', description: '입시 기사·영상 찾기·읽기, 복합 분석 이력·남기기, 영상·기사 더하기', grants: ['ipsi.hub'] },
  { key: 'context', menu: '/contexts', label: '학교 맥락', description: '학교 지식의 목록·구조·위치 찾기, 새 맥락 남기기, 문서 맥락 읽기·쓰기·생성 방식 연결', grants: ['knowledge.context'] },
  { key: 'data', menu: '', label: '학교 데이터', description: '학교·교직원·내 정보·학생 데이터 읽기(list_data·read_data)', grants: ['data.school', 'data.staff', 'data.my', 'data.student'] },
] as const satisfies ReadonlyArray<{ key: string; menu: string; label: string; description: string; grants: readonly McpToolGrantKey[] }>;

export type McpFeatureKey = (typeof MCP_FEATURES)[number]['key'];
export type McpFeature = (typeof MCP_FEATURES)[number];

/**
 * 관리 화면의 기능 순서 = **왼쪽 메뉴에 보이는 순서** (2026-10-25 사용자 결정). `menu` = 그 기능의 메뉴 주소.
 * 메뉴 배치는 관리자가 바꾸므로 순서를 여기 적지 않고 보이는 메뉴 href 목록에서 유도한다.
 * 같은 메뉴를 가리키면(일정 · 급식지도) 이 배열의 순서를, 메뉴가 없거나 안 보이면(학교 데이터) 맨 뒤.
 */
export function orderFeaturesByMenu(menuHrefs: readonly string[]): McpFeature[] {
  const rank = (f: McpFeature) => {
    const i = f.menu ? menuHrefs.indexOf(f.menu) : -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return MCP_FEATURES.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
}

export const mcpGrant = (key: string) => MCP_TOOL_GRANTS.find((g) => g.key === key);

/**
 * 한 사람의 허용 상태(화면 표시용 — 판정 정본은 DB mcp_private.my_grants()).
 *   default = 교사 기본으로 켜짐 · added = 사람별 추가 · blocked = 기본이지만 이 사람만 끔 · off = 꺼짐
 * 직원(staff)은 교사 기본을 받지 않는다.
 */
export type McpGrantState = 'default' | 'added' | 'blocked' | 'off';

export function grantState(
  key: string,
  person: { type: string; explicit: ReadonlySet<string>; blocked: ReadonlySet<string> },
  teacherDefaults: ReadonlySet<string>,
): McpGrantState {
  if (person.explicit.has(key)) return 'added';
  if (person.type !== 'teacher' || !teacherDefaults.has(key)) return 'off';
  return person.blocked.has(key) ? 'blocked' : 'default';
}

export const grantOn = (state: McpGrantState) => state === 'default' || state === 'added';

/**
 * 한 칸을 켜고 끌 때 무엇을 바꾸는가 — 교사 기본인 허용은 «해제 줄»을 넣고 빼고, 아니면 «추가 줄»을 넣고 뺀다.
 * 끌 때는 추가 줄도 함께 지운다(추가 줄이 남으면 해제가 이기지 못한다).
 */
export function planToggle(
  key: string,
  on: boolean,
  person: { type: string; explicit: ReadonlySet<string>; blocked: ReadonlySet<string> },
  teacherDefaults: ReadonlySet<string>,
) {
  const isDefault = person.type === 'teacher' && teacherDefaults.has(key);
  return {
    addGrant: on && !isDefault && !person.explicit.has(key),
    removeGrant: !on && person.explicit.has(key),
    addBlock: !on && isDefault && !person.blocked.has(key),
    removeBlock: on && person.blocked.has(key),
  };
}

/** 에이전트에 등록할 MCP 서버 주소. */
export const mcpServerUrl = (supabaseUrl: string): string =>
  `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mcp`;

/** 사람 한 명의 허용 행들 → 허용 목록(카탈로그 순서). 모르는 값은 버린다(오래된 행이 화면을 깨지 않게). */
export function grantsOf(rows: ReadonlyArray<{ tool: string }>): McpToolGrantKey[] {
  const have = new Set(rows.map((r) => r.tool));
  return MCP_TOOL_GRANT_KEYS.filter((k) => have.has(k));
}

/**
 * 관리 화면의 체크 상태 → 저장할 변경. 화면이 들고 있던 값이 아니라 **지금 DB 값**과 비교해
 * 바뀐 것만 넣고 뺀다(전부 지우고 다시 넣으면 허용 시각·허용한 사람 기록이 매번 바뀐다).
 */
export function planGrantChanges(current: readonly string[], wanted: readonly string[]) {
  const now = new Set(current);
  const next = new Set(wanted.filter((k) => (MCP_TOOL_GRANT_KEYS as readonly string[]).includes(k)));
  return {
    add: [...next].filter((k) => !now.has(k)) as McpToolGrantKey[],
    remove: [...now].filter((k) => !next.has(k)),
  };
}
