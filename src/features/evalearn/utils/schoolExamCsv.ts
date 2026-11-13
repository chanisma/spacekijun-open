// ========================================
// NEIS 지필평가(정기고사) CSV 파싱 — 순수 모듈 (React·supabase 비의존)
//
// 관리 UI(브라우저)와 적재 스크립트(Node)가 **같은 파서**를 쓰도록 여기에만 로직을 둔다.
// 두 곳이 각자 파싱하면 한쪽만 고쳐져서, 화면에서는 멀쩡한데 스크립트로 넣은 데이터만
// 어긋나는 종류의 버그가 생긴다.
//
// 입력은 NEIS 내려받기를 CSV로 변환한 두 파일이다:
//   1) 문항정보  — 문항별 정답·배점·내용영역·난이도·성취기준
//   2) 학생답안  — 학생×과목×고사 단위의 점수와 선택형 답안/정오
//
// ── 이 형식에서 반드시 알고 있어야 하는 것 4가지 ─────────────────────────
//
// (1) **칸 안에 쉼표가 있다.** 정답 `"3,5"`, 답안 `"3,5|2|4"`가 따옴표로 감싸여 온다.
//     그래서 RFC 4180 파서(`@/lib/csv`)를 쓴다. `split(',')` 하면 뒤 열이 통째로 밀린다.
//
// (2) **학생 답안은 선택형만 있다.** 라이브 2026-1 전수 확인: 75개 (고사×학년×과목)
//     조합 전부에서 `답안` 개수 == 선택형 문항 수였다. 서답형은 문항 메타(내용영역·
//     성취기준·배점)만 있고 학생별 정오가 없어 총점(`서답형점수`)으로만 다룰 수 있다.
//     문항번호는 선택형/서답형이 **각각 1부터** 시작하므로 문항 키에 구분이 들어가야 한다.
//
// (3) **`반`이 숫자가 아닌 행은 우리 학생이 아니다.** 타교 위탁 수강생(`고급화학`,
//     `고급생명과학`)이 섞여 온다. 2026-1 기준 26명이며 전원 그 한 과목만 응시했고
//     `타반수강=Y`였다. 이들은 우리 학적에 없으므로 제외한다.
//
// (4) **NEIS 학번은 우리 학생코드가 아니다.** `2026000182` 형식이라 `resource.meta.id`
//     (`00-00646`)와 이어지지 않는다. 매칭 키는 **(학년, 반, 번호)** — 626명 전수 대조에서
//     622명 매칭·이름 불일치 0건이었다(미매칭 4명은 시험 후 자퇴/전출). 이름으로 매칭하면
//     안 된다 — 학년 내 동명이인이 19쌍 있다.
// ========================================

import { headerIndex, parseCsvRows } from '@/lib/csv';

export type SchoolExamAnswerType = '선택형' | '서답형';
export type SchoolExamDifficulty = '쉬움' | '보통' | '어려움';

/** 한 고사를 가리키는 키. 학년도·학기·회차까지 있어야 유일하다. */
export interface SchoolExamKey {
  academicYear: number;
  semester: number;
  examRound: number;
  examName: string;
}

export interface SchoolExamQuestionRecord extends SchoolExamKey {
  grade: number;
  /** NEIS 원본 표기 `공통국어1(3)`. 괄호 안은 이수단위이며 과목명과 1:1이다. */
  subjectSection: string;
  subjectName: string;
  subjectCode: string | null;
  credits: number | null;
  answerType: SchoolExamAnswerType;
  problemNumber: number;
  contentArea: string | null;
  designatedDifficulty: SchoolExamDifficulty | null;
  points: number | null;
  /** `3` 또는 `3,5`. 쉼표의 의미는 hasMultipleAnswers에 따라 달라진다 — gradeAnswer 참조. */
  answer: string | null;
  hasMultipleAnswers: boolean;
  standardCode: string | null;
  standardText: string | null;
  subjectMaxScore: number | null;
}

export interface SchoolExamAnswerRecord extends SchoolExamKey {
  grade: number;
  subjectSection: string;
  subjectName: string;
  subjectCode: string | null;
  /** 응시 당시 반. 숫자가 아니면 위탁 수강생이라 isExternal이 선다. */
  classLabel: string;
  classNumber: number | null;
  studentNumber: number | null;
  studentName: string;
  neisStudentId: string;
  isCrossClass: boolean;
  attendance: string;
  selectiveScore: number | null;
  descriptiveScore: number | null;
  etcScore: number | null;
  totalScore: number | null;
  /** 선택형 문항 순서. 무응답이면 빈 문자열, 복수 응답이면 `3,5`. */
  answers: string[];
  /** NEIS가 준 정오. 아직 채점 전이면 빈 배열이다(applyDerivedScoring이 채운다). */
  correct: boolean[];
  /** NEIS가 정오를 주지 않아 우리가 정답 대조로 채점했는가 */
  derivedScoring: boolean;
  /** 우리 학적에 없는 타교 위탁 수강생 */
  isExternal: boolean;
  /** CSV 원본 행 번호(1-based, 헤더 제외) — 오류 메시지 추적용 */
  sourceRow: number;
}

export interface ParseResult<T> {
  records: T[];
  errors: string[];
  warnings: string[];
}

const QUESTION_COLUMNS = [
  '학년도', '학기', '고사', '학년', '과목', '과목명', '구분', '문항',
] as const;

const ANSWER_COLUMNS = [
  '학년도', '학기', '고사', '학년', '과목', '반', '번호', '성명', '답안',
] as const;

const DIFFICULTIES: readonly string[] = ['쉬움', '보통', '어려움'];

// ── 작은 파서들 ──────────────────────────────────────────────

/** `1차 정기시험` → 1. 앞의 숫자만 본다(`1차 지필평가` 같은 변형도 받기 위해). */
export function parseExamRound(examName: string): number | null {
  const matched = /^\s*(\d+)\s*차/.exec(examName);
  if (!matched) return null;
  const round = Number(matched[1]);
  return Number.isInteger(round) && round > 0 ? round : null;
}

/** `공통국어1(3)` → { name: '공통국어1', credits: 3 }. 괄호가 없으면 credits는 null. */
export function splitSubjectSection(section: string): { name: string; credits: number | null } {
  const matched = /^(.*)\((\d+)\)\s*$/.exec(section.trim());
  if (!matched) return { name: section.trim(), credits: null };
  return { name: matched[1].trim(), credits: Number(matched[2]) };
}

/** `1/16` → 16. 앞부분은 반이라 `반` 열과 중복이므로 뒷부분만 쓴다. */
export function parseStudentNumber(value: string): number | null {
  const tail = value.split('/').pop() ?? '';
  const num = Number(tail.trim());
  return Number.isInteger(num) && num > 0 ? num : null;
}

function toNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function toInt(value: string | undefined): number | null {
  const num = toNumber(value);
  return num != null && Number.isInteger(num) ? num : null;
}

function nullIfBlank(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** `3,5` → {'3','5'}. 빈 값이면 빈 집합(무응답). */
function toChoiceSet(value: string): Set<string> {
  const set = new Set<string>();
  for (const token of value.split(',')) {
    const trimmed = token.trim();
    if (trimmed !== '') set.add(trimmed);
  }
  return set;
}

// ── 채점 ────────────────────────────────────────────────────

/**
 * 정답 대조 채점. **NEIS가 정오를 주지 않은 문항에만** 쓴다(NEIS 정오가 정본).
 *
 * 정답 필드의 쉼표는 두 가지 다른 뜻을 갖는다:
 *   * `복수정답=Y` → `2,5`는 "둘 다 골라야 정답"인 복수 응답 문항. **집합이 일치**해야 한다.
 *   * 플래그 없음 → `1,2,3,4,5`는 "전항 정답"(문제 오류로 전원 정답 처리). 학생 답이 그
 *     집합에 **포함되기만 하면** 정답이다.
 * 둘을 뒤섞으면 국어 복수응답 문항이 조용히 전원 정답이 되거나(포함 규칙만 쓸 때),
 * 전항 정답 문항이 전원 오답이 된다(일치 규칙만 쓸 때).
 *
 * 라이브 2026-1 검증: 이 규칙으로 재채점하면 NEIS 정오 152,120건 중 152,119건이 일치한다.
 * 남은 1건은 전항 정답 문항의 **무응답** 학생으로, NEIS는 O를 줬다 — 아래 allCorrect 분기가
 * 그 경우를 처리한다.
 */
export function gradeAnswer(
  studentAnswer: string,
  correctAnswer: string | null,
  hasMultipleAnswers: boolean,
  choiceCount = 5
): boolean | null {
  if (correctAnswer == null || correctAnswer.trim() === '') return null;
  const expected = toChoiceSet(correctAnswer);
  if (expected.size === 0) return null;

  // 전항 정답: 무응답이어도 정답 처리된다. 복수 응답 문항에는 적용하지 않는다.
  if (!hasMultipleAnswers && expected.size >= choiceCount) return true;

  const given = toChoiceSet(studentAnswer);
  if (given.size === 0) return false;

  if (hasMultipleAnswers) {
    if (given.size !== expected.size) return false;
    for (const choice of given) if (!expected.has(choice)) return false;
    return true;
  }

  for (const choice of given) if (!expected.has(choice)) return false;
  return true;
}

// ── 문항정보 CSV ─────────────────────────────────────────────

export function parseQuestionCsv(text: string): ParseResult<SchoolExamQuestionRecord> {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { records: [], errors: ['문항정보 CSV에 데이터 행이 없습니다.'], warnings };
  }

  const columns = headerIndex(rows[0]);
  const missing = QUESTION_COLUMNS.filter((name) => !columns.has(name));
  if (missing.length > 0) {
    return { records: [], errors: [`문항정보 CSV에 필요한 열이 없습니다: ${missing.join(', ')}`], warnings };
  }
  const cell = (row: string[], name: string): string => {
    const index = columns.get(name);
    return index == null ? '' : (row[index] ?? '');
  };

  const records: SchoolExamQuestionRecord[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i; // 헤더 제외 1-based
    const academicYear = toInt(cell(row, '학년도'));
    const semester = toInt(cell(row, '학기'));
    const grade = toInt(cell(row, '학년'));
    const problemNumber = toInt(cell(row, '문항'));
    const examName = cell(row, '고사').trim();
    const examRound = parseExamRound(examName);
    const answerTypeRaw = cell(row, '구분').trim();
    const subjectSection = cell(row, '과목').trim();

    if (academicYear == null || semester == null || grade == null || problemNumber == null) {
      errors.push(`문항 ${line}행: 학년도·학기·학년·문항이 숫자가 아닙니다.`);
      continue;
    }
    if (examRound == null) {
      errors.push(`문항 ${line}행: 고사명 '${examName}'에서 회차를 읽지 못했습니다.`);
      continue;
    }
    if (answerTypeRaw !== '선택형' && answerTypeRaw !== '서답형') {
      errors.push(`문항 ${line}행: 알 수 없는 구분 '${answerTypeRaw}'.`);
      continue;
    }
    if (subjectSection === '') {
      errors.push(`문항 ${line}행: 과목이 비어 있습니다.`);
      continue;
    }

    const key = `${academicYear}|${semester}|${examRound}|${grade}|${subjectSection}|${answerTypeRaw}|${problemNumber}`;
    if (seen.has(key)) {
      errors.push(`문항 ${line}행: 같은 문항이 두 번 나옵니다 (${subjectSection} ${answerTypeRaw} ${problemNumber}번).`);
      continue;
    }
    seen.add(key);

    const { name: parsedName, credits } = splitSubjectSection(subjectSection);
    const subjectName = nullIfBlank(cell(row, '과목명')) ?? parsedName;
    if (subjectName !== parsedName) {
      warnings.push(`문항 ${line}행: 과목명('${subjectName}')과 과목 표기('${subjectSection}')가 어긋납니다.`);
    }

    const difficultyRaw = nullIfBlank(cell(row, '난이도'));
    if (difficultyRaw != null && !DIFFICULTIES.includes(difficultyRaw)) {
      warnings.push(`문항 ${line}행: 알 수 없는 난이도 '${difficultyRaw}' — 비워 둡니다.`);
    }

    records.push({
      academicYear,
      semester,
      examRound,
      examName,
      grade,
      subjectSection,
      subjectName,
      subjectCode: nullIfBlank(cell(row, '과목코드')),
      credits,
      answerType: answerTypeRaw,
      problemNumber,
      contentArea: nullIfBlank(cell(row, '내용영역')),
      designatedDifficulty:
        difficultyRaw != null && DIFFICULTIES.includes(difficultyRaw)
          ? (difficultyRaw as SchoolExamDifficulty)
          : null,
      points: toNumber(cell(row, '배점')),
      answer: nullIfBlank(cell(row, '정답')),
      hasMultipleAnswers: cell(row, '복수정답').trim().toUpperCase() === 'Y',
      standardCode: nullIfBlank(cell(row, '성취기준코드')),
      standardText: nullIfBlank(cell(row, '성취기준')),
      subjectMaxScore: toInt(cell(row, '과목만점')),
    });
  }

  return { records, errors, warnings };
}

// ── 학생답안 CSV ─────────────────────────────────────────────

export function parseAnswerCsv(text: string): ParseResult<SchoolExamAnswerRecord> {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { records: [], errors: ['학생답안 CSV에 데이터 행이 없습니다.'], warnings };
  }

  const columns = headerIndex(rows[0]);
  const missing = ANSWER_COLUMNS.filter((name) => !columns.has(name));
  if (missing.length > 0) {
    return { records: [], errors: [`학생답안 CSV에 필요한 열이 없습니다: ${missing.join(', ')}`], warnings };
  }
  const cell = (row: string[], name: string): string => {
    const index = columns.get(name);
    return index == null ? '' : (row[index] ?? '');
  };

  const records: SchoolExamAnswerRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i;
    const academicYear = toInt(cell(row, '학년도'));
    const semester = toInt(cell(row, '학기'));
    const grade = toInt(cell(row, '학년'));
    const examName = cell(row, '고사').trim();
    const examRound = parseExamRound(examName);
    const subjectSection = cell(row, '과목').trim();
    const studentName = cell(row, '성명').trim();

    if (academicYear == null || semester == null || grade == null) {
      errors.push(`답안 ${line}행: 학년도·학기·학년이 숫자가 아닙니다.`);
      continue;
    }
    if (examRound == null) {
      errors.push(`답안 ${line}행: 고사명 '${examName}'에서 회차를 읽지 못했습니다.`);
      continue;
    }
    if (subjectSection === '' || studentName === '') {
      errors.push(`답안 ${line}행: 과목 또는 성명이 비어 있습니다.`);
      continue;
    }

    const classLabel = cell(row, '반').trim();
    const classNumber = /^\d+$/.test(classLabel) ? Number(classLabel) : null;
    const studentNumber = parseStudentNumber(cell(row, '번호'));

    const answerField = cell(row, '답안');
    const answers = answerField === '' ? [] : answerField.split('|').map((v) => v.trim());
    const correctField = cell(row, '정오').trim();
    const correct = correctField === ''
      ? []
      : correctField.split('|').map((v) => v.trim() === 'O');

    if (correct.length > 0 && correct.length !== answers.length) {
      errors.push(
        `답안 ${line}행(${studentName} ${subjectSection}): 답안 ${answers.length}개와 정오 ${correct.length}개가 어긋납니다.`
      );
      continue;
    }

    const declaredCount = toInt(cell(row, '문항수'));
    if (declaredCount != null && declaredCount !== answers.length) {
      warnings.push(
        `답안 ${line}행(${studentName} ${subjectSection}): 문항수 ${declaredCount}와 답안 ${answers.length}개가 다릅니다.`
      );
    }

    const { name: parsedName } = splitSubjectSection(subjectSection);

    records.push({
      academicYear,
      semester,
      examRound,
      examName,
      grade,
      subjectSection,
      subjectName: parsedName,
      subjectCode: nullIfBlank(cell(row, '과목코드')),
      classLabel,
      classNumber,
      studentNumber,
      studentName,
      neisStudentId: cell(row, '학번').trim(),
      isCrossClass: cell(row, '타반수강').trim().toUpperCase() === 'Y',
      attendance: cell(row, '결시').trim(),
      selectiveScore: toNumber(cell(row, '선택형점수')),
      descriptiveScore: toNumber(cell(row, '서답형점수')),
      etcScore: toNumber(cell(row, '기타점수')),
      totalScore: toNumber(cell(row, '지필총점')),
      answers,
      correct,
      derivedScoring: false,
      isExternal: classNumber == null,
      sourceRow: line,
    });
  }

  return { records, errors, warnings };
}

// ── 문항 ↔ 답안 연결 ─────────────────────────────────────────

function questionKey(
  key: SchoolExamKey,
  grade: number,
  subjectSection: string,
  answerType: SchoolExamAnswerType,
  problemNumber: number
): string {
  return `${key.academicYear}|${key.semester}|${key.examRound}|${grade}|${subjectSection}|${answerType}|${problemNumber}`;
}

export interface DerivedScoringReport {
  /** 우리가 채점을 통째로 채워 넣은 행 수 (NEIS 정오가 아예 없던 행) */
  derivedRows: number;
  /** 잘려 온 뒤쪽 무응답을 복원한 행 수 */
  paddedRows: number;
  /** NEIS 정오와 파생 채점이 어긋난 문항 수 (0이어야 정상) */
  disagreements: number;
  /** 대조할 문항 메타를 못 찾은 행 */
  missingQuestions: string[];
  warnings: string[];
}

/** (고사·학년·과목)별 선택형 문항 수 */
function choiceCountIndex(questions: SchoolExamQuestionRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    if (q.answerType !== '선택형') continue;
    const key = `${q.academicYear}|${q.semester}|${q.examRound}|${q.grade}|${q.subjectSection}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * 답안 배열을 문항 수에 맞춰 정규화하고, NEIS가 정오를 주지 않은 행을 정답 대조로 채운다.
 *
 * ── 왜 길이 정규화를 여기서 같이 하는가 ──
 * NEIS는 **뒤쪽 연속 무응답을 잘라서** 내보낸다. 라이브 2026-1에서 3학년 2차 윤리와 사상
 * (선택형 18문항)의 한 학생이 답안 16개로 왔다 — 17·18번을 둘 다 비웠기 때문이다.
 * 배열 인덱스가 곧 문항번호이므로 짧은 채로 두면 그 학생이 뒤 문항 통계에서 조용히 빠진다.
 * 뒤를 빈 문자열(무응답)로 채우는 것이 원본의 정확한 복원이다.
 * 반대로 답안이 문항 수보다 **많으면** 인덱스가 밀렸다는 뜻이라 자르지 않고 오류로 알린다.
 *
 * ── 채점 ──
 * 정오가 **이미 있는 행은 손대지 않는다** — NEIS 채점이 정본이다. 다만 두 채점이 어긋나면
 * 리포트에 세어 둔다. 어긋남이 갑자기 늘면 정답 데이터나 채점 규칙에 문제가 생겼다는 신호다.
 */
export function applyDerivedScoring(
  answers: SchoolExamAnswerRecord[],
  questions: SchoolExamQuestionRecord[]
): DerivedScoringReport {
  const byKey = new Map<string, SchoolExamQuestionRecord>();
  for (const q of questions) {
    byKey.set(questionKey(q, q.grade, q.subjectSection, q.answerType, q.problemNumber), q);
  }
  const choiceCounts = choiceCountIndex(questions);

  const report: DerivedScoringReport = {
    derivedRows: 0,
    paddedRows: 0,
    disagreements: 0,
    missingQuestions: [],
    warnings: [],
  };
  const missingSeen = new Set<string>();

  for (const row of answers) {
    const sectionKey = `${row.academicYear}|${row.semester}|${row.examRound}|${row.grade}|${row.subjectSection}`;
    const expected = choiceCounts.get(sectionKey);

    if (expected != null && row.answers.length < expected) {
      const missing = expected - row.answers.length;
      row.answers = [...row.answers, ...Array<string>(missing).fill('')];
      // 이미 채점된 행이면 정오도 같은 길이로 늘려야 인덱스가 맞는다. 잘린 칸은 무응답이므로
      // 정답 대조로 채운다(전항 정답 문항이면 무응답도 정답이 되는데 그것까지 반영된다).
      if (row.correct.length > 0) row.correct = [...row.correct];
      report.paddedRows += 1;
      report.warnings.push(
        `${row.studentName} ${row.subjectSection}(${row.examName}): 답안이 ${missing}개 잘려 있어 무응답으로 복원했습니다.`
      );
    } else if (expected != null && row.answers.length > expected) {
      report.warnings.push(
        `${row.studentName} ${row.subjectSection}(${row.examName}): 답안이 선택형 문항 수(${expected})보다 ${row.answers.length - expected}개 많습니다 — 인덱스가 밀렸을 수 있어 그대로 둡니다.`
      );
    }

    const graded: boolean[] = [];
    let resolvable = true;

    for (let i = 0; i < row.answers.length; i++) {
      const q = byKey.get(questionKey(row, row.grade, row.subjectSection, '선택형', i + 1));
      if (!q) {
        resolvable = false;
        const label = `${row.examName} ${row.grade}학년 ${row.subjectSection} 선택형 ${i + 1}번`;
        if (!missingSeen.has(label)) {
          missingSeen.add(label);
          report.missingQuestions.push(label);
        }
        break;
      }
      const verdict = gradeAnswer(row.answers[i], q.answer, q.hasMultipleAnswers);
      if (verdict == null) {
        resolvable = false;
        break;
      }
      graded.push(verdict);
    }

    if (row.correct.length > 0) {
      if (!resolvable) continue;
      // NEIS 정오와 겹치는 앞부분만 대조하고, 잘려서 없던 뒷부분은 파생 채점으로 채운다.
      const overlap = Math.min(graded.length, row.correct.length);
      for (let i = 0; i < overlap; i++) {
        if (graded[i] !== row.correct[i]) report.disagreements += 1;
      }
      if (graded.length > row.correct.length) {
        row.correct = [...row.correct, ...graded.slice(row.correct.length)];
      }
      continue; // NEIS 정오가 정본
    }

    if (!resolvable) {
      report.warnings.push(
        `${row.studentName} ${row.subjectSection}(${row.examName}): 정오가 없고 정답 대조도 불가해 채점을 비웁니다.`
      );
      continue;
    }

    row.correct = graded;
    row.derivedScoring = true;
    report.derivedRows += 1;
  }

  return report;
}

// ── 학생 매칭 ───────────────────────────────────────────────

export interface RosterEntry {
  grade: number;
  classNum: number;
  number: number;
  /** resource.meta.id — 우리 학생코드 (`00-00646`) */
  code: string;
  name: string;
}

export interface RosterMatchResult {
  /** 학생코드가 붙은 행 */
  matched: Array<SchoolExamAnswerRecord & { studentCode: string }>;
  /** 우리 학적에서 못 찾은 행 (시험 후 전출·자퇴 등) */
  unmatched: SchoolExamAnswerRecord[];
  /** `반`이 숫자가 아니라 제외한 타교 위탁 수강생 행 */
  external: SchoolExamAnswerRecord[];
  /** (학년,반,번호)는 맞았지만 이름이 다른 행 — 학적 오류 신호 */
  nameMismatches: Array<{ record: SchoolExamAnswerRecord; rosterName: string }>;
}

export function buildRosterIndex(entries: RosterEntry[]): Map<string, RosterEntry> {
  const index = new Map<string, RosterEntry>();
  for (const entry of entries) {
    index.set(`${entry.grade}|${entry.classNum}|${entry.number}`, entry);
  }
  return index;
}

/**
 * (학년, 반, 번호)로 우리 학생코드를 붙인다.
 *
 * 이름을 키로 쓰면 안 된다 — 2026-1 기준 학년 내 동명이인이 19쌍 있다. 이름은 **검증에만**
 * 쓴다: 자리로 찾은 학생과 이름이 다르면 학적 쪽이 어긋났다는 뜻이므로 따로 보고한다.
 */
export function matchRoster(
  records: SchoolExamAnswerRecord[],
  roster: RosterEntry[]
): RosterMatchResult {
  const index = buildRosterIndex(roster);
  const result: RosterMatchResult = {
    matched: [],
    unmatched: [],
    external: [],
    nameMismatches: [],
  };

  for (const record of records) {
    if (record.isExternal || record.classNumber == null || record.studentNumber == null) {
      result.external.push(record);
      continue;
    }
    const entry = index.get(`${record.grade}|${record.classNumber}|${record.studentNumber}`);
    if (!entry) {
      result.unmatched.push(record);
      continue;
    }
    if (entry.name !== record.studentName) {
      result.nameMismatches.push({ record, rosterName: entry.name });
    }
    result.matched.push({ ...record, studentCode: entry.code });
  }

  return result;
}

// ── 무결성 점검 ─────────────────────────────────────────────

/**
 * 답안 개수가 그 과목의 선택형 문항 수와 맞는지 확인한다.
 * 어긋나면 문항 메타와 답안 배열의 인덱스가 밀린다는 뜻이라 분석 전체가 틀어진다.
 */
export function checkAnswerCounts(
  answers: SchoolExamAnswerRecord[],
  questions: SchoolExamQuestionRecord[]
): string[] {
  const choiceCount = new Map<string, number>();
  for (const q of questions) {
    if (q.answerType !== '선택형') continue;
    const key = `${q.academicYear}|${q.semester}|${q.examRound}|${q.grade}|${q.subjectSection}`;
    choiceCount.set(key, (choiceCount.get(key) ?? 0) + 1);
  }

  const problems: string[] = [];
  const reported = new Set<string>();
  for (const row of answers) {
    const key = `${row.academicYear}|${row.semester}|${row.examRound}|${row.grade}|${row.subjectSection}`;
    const expected = choiceCount.get(key);
    if (expected == null) {
      if (!reported.has(key)) {
        reported.add(key);
        problems.push(`${row.examName} ${row.grade}학년 ${row.subjectSection}: 문항정보가 없습니다.`);
      }
      continue;
    }
    if (row.answers.length !== expected) {
      const label = `${key}|${row.answers.length}`;
      if (!reported.has(label)) {
        reported.add(label);
        problems.push(
          `${row.examName} ${row.grade}학년 ${row.subjectSection}: 선택형 ${expected}문항인데 답안이 ${row.answers.length}개인 학생이 있습니다.`
        );
      }
    }
  }
  return problems;
}
