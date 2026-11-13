/**
 * 면접 준비 — 화면이 쓰는 순수 판정·조립. React·supabase 비의존.
 *
 * **표현은 컴포넌트에, 판정은 여기에** 둔다(업무 관리의 `taskInboxUtils` 와 같은 규약).
 * 학생 화면과 교사 화면이 같은 데이터를 **다른 축**으로 본다 — 학생은 날짜축("오늘 뭘
 * 답할까"), 교사는 활동축("이 세특을 방어할 수 있나"). 렌더러는 둘이지만 판정은 하나다.
 *
 * 회귀 = `npx tsx scripts/interview-prep-test/run.mts`
 */
import {
  rubricAverages,
  type InterviewEvaluation,
  type InterviewPrepAnswerRow,
  type InterviewPrepQuestionRow,
} from '../../../supabase/functions/_shared/interviewPrep';

export interface InterviewThread {
  question: InterviewPrepQuestionRow;
  /** version 오름차순. 마지막이 가장 최근에 다듬은 답변이다. */
  answers: InterviewPrepAnswerRow[];
  /** 꼬리 질문. 화면에서 같은 카드 안에 들여써 쌓인다. */
  children: InterviewThread[];
}

/**
 * 질문·답변 행 → 꼬리 질문까지 이어 붙인 묶음.
 *
 * **부모를 못 찾은 꼬리 질문도 버리지 않는다** — 부모가 아직 로드되지 않았거나(페이징)
 * 지워졌을 수 있는데, 그때 조용히 사라지면 학생이 답한 기록이 화면에서 없어진다.
 * 뿌리로 올려 보여주는 편이 낫다.
 */
export function buildInterviewThreads(
  questions: InterviewPrepQuestionRow[],
  answers: InterviewPrepAnswerRow[],
): InterviewThread[] {
  const answersByQuestion = new Map<string, InterviewPrepAnswerRow[]>();
  for (const answer of answers) {
    const list = answersByQuestion.get(answer.question_id) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.question_id, list);
  }
  for (const list of answersByQuestion.values()) list.sort((a, b) => a.version - b.version);

  const nodes = new Map<string, InterviewThread>();
  for (const question of questions) {
    nodes.set(question.id, {
      question,
      answers: answersByQuestion.get(question.id) ?? [],
      children: [],
    });
  }
  const roots: InterviewThread[] = [];
  for (const node of nodes.values()) {
    const parent = node.question.parent_id ? nodes.get(node.question.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byOldest = (a: InterviewThread, b: InterviewThread) =>
    a.question.created_at < b.question.created_at ? -1 : 1;
  for (const node of nodes.values()) node.children.sort(byOldest);
  // 뿌리는 최신이 위 — 학생·교사 모두 "최근에 무엇을 했나"부터 본다.
  return roots.sort((a, b) => -byOldest(a, b));
}

/** 꼬리 질문까지 펼친 평면 목록. 이력 집계·특정 질문 찾기에 쓴다. */
export function flattenThreads(threads: InterviewThread[]): InterviewThread[] {
  const out: InterviewThread[] = [];
  const walk = (list: InterviewThread[]) => {
    for (const node of list) { out.push(node); walk(node.children); }
  };
  walk(threads);
  return out;
}

/** 이 묶음에서 가장 최근에 제출한 답변(꼬리 질문은 보지 않는다). */
export function latestAnswer(thread: InterviewThread): InterviewPrepAnswerRow | null {
  return thread.answers.length ? thread.answers[thread.answers.length - 1] : null;
}

/** 평가까지 끝난 마지막 답변. 화면이 점수를 그릴 때 쓴다(생성 중·실패는 제외). */
export function latestEvaluatedAnswer(thread: InterviewThread): InterviewPrepAnswerRow | null {
  for (let i = thread.answers.length - 1; i >= 0; i -= 1) {
    const answer = thread.answers[i];
    if (answer.status === 'ready' && answer.evaluation) return answer;
  }
  return null;
}

/** 묶음과 그 꼬리 질문 전체의 평가 목록. 평균·약점 계산의 입력. */
export function evaluationsOf(threads: InterviewThread[]): InterviewEvaluation[] {
  const out: InterviewEvaluation[] = [];
  const walk = (list: InterviewThread[]) => {
    for (const node of list) {
      for (const answer of node.answers) {
        if (answer.status === 'ready' && answer.evaluation) out.push(answer.evaluation);
      }
      walk(node.children);
    }
  };
  walk(threads);
  return out;
}

export interface InterviewActivityGroup {
  /** 활동 질문이면 KG 엔티티 id, 공통 질문이면 `theme:<id>`, 둘 다 없으면 `etc`. */
  key: string;
  label: string;
  grade: number | null;
  threads: InterviewThread[];
  /** 이 묶음(꼬리 포함)에서 평가가 끝난 답변 수. */
  answeredCount: number;
}

const GRADE_PATTERN = /(\d)학년/;

/**
 * 활동축 그룹. **교사 화면의 기본 정렬**이고 학생의 [기록] 탭도 같은 단위를 쓴다.
 *
 * 학년은 `source_ref.grade` 를 먼저 보고, 없으면 라벨에서 읽는다 — 옛 행이나 공통
 * 질문처럼 `source_ref` 가 비어 있어도 학년 구획이 무너지지 않게 한다.
 */
export function groupThreadsByActivity(threads: InterviewThread[]): InterviewActivityGroup[] {
  const groups = new Map<string, InterviewActivityGroup>();
  for (const thread of threads) {
    const q = thread.question;
    const key = q.activity_entity_id ?? (q.theme_id ? `theme:${q.theme_id}` : 'etc');
    const refGrade = typeof q.source_ref?.grade === 'number' ? q.source_ref.grade as number : null;
    const labelGrade = q.source_label?.match(GRADE_PATTERN);
    const group = groups.get(key) ?? {
      key,
      label: q.source_label ?? '기타',
      grade: refGrade ?? (labelGrade ? Number(labelGrade[1]) : null),
      threads: [],
      answeredCount: 0,
    };
    group.threads.push(thread);
    group.answeredCount += evaluationsOf([thread]).length;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    // 학년 오름차순 → 활동이 학생의 시간 순서대로 읽힌다. 학년 없는 것(공통 질문)은 뒤.
    const gradeA = a.grade ?? Number.MAX_SAFE_INTEGER;
    const gradeB = b.grade ?? Number.MAX_SAFE_INTEGER;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.label.localeCompare(b.label, 'ko');
  });
}

/** 가장 약한 기준 N개. 화면이 "무엇부터 보완할지"를 말할 수 있게. */
export function weakestCriteria(threads: InterviewThread[], limit = 2) {
  return rubricAverages(evaluationsOf(threads)).slice(0, limit);
}

/**
 * 답변이 아직 평가를 기다리는가.
 *
 * **임대 만료를 함께 본다** — 서버가 죽어 행이 `generating` 으로 남으면 화면이 영원히
 * "평가 중"을 돈다. 임대가 지났으면 다시 눌러 볼 수 있어야 한다.
 */
export function isInFlight(
  row: { status: string; lease_until: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!row || row.status !== 'generating') return false;
  return !!row.lease_until && new Date(row.lease_until).getTime() > now;
}

/** 초안 localStorage 키. 질문 id 로 갈라 두 질문의 초안이 섞이지 않게 한다. */
export const draftKey = (questionId: string) => `interview-prep-draft-v1:${questionId}`;

/**
 * 글자 수 → 말하기 예상 시간(초).
 *
 * 한국어 면접 발화 속도를 분당 약 330자로 잡는다. **정밀한 값이 아니라 감각**이고,
 * 화면도 "약 1분"처럼 어림으로만 적는다 — 초 단위로 적으면 학생이 그 수를 맞추려 든다.
 */
export function speakingSeconds(charCount: number): number {
  return Math.round((charCount / 330) * 60);
}

export function speakingLabel(charCount: number): string {
  const seconds = speakingSeconds(charCount);
  if (seconds < 30) return '30초 미만';
  if (seconds < 90) return '약 1분';
  const minutes = Math.round(seconds / 30) / 2;
  return `약 ${minutes % 1 === 0 ? minutes : minutes.toFixed(1)}분`;
}
