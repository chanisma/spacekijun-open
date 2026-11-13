// 파서 레코드 → DB 행 변환 (순수 모듈).
//
// 서비스(schoolExamService.ts)가 아니라 여기 두는 이유: 적재 스크립트(Node)가 같은 변환을
// 써야 하는데, 서비스는 브라우저용 supabase 클라이언트를 import 하므로 Node에서 못 부른다.
// 변환 규칙이 갈라지면 화면으로 올린 데이터와 스크립트로 올린 데이터의 모양이 달라진다.

import type { SchoolExamAnswerRecord, SchoolExamQuestionRecord } from './schoolExamCsv';

export function toQuestionRow(record: SchoolExamQuestionRecord) {
  return {
    academic_year: record.academicYear,
    semester: record.semester,
    exam_round: record.examRound,
    exam_name: record.examName,
    grade: record.grade,
    subject_section: record.subjectSection,
    subject_name: record.subjectName,
    subject_code: record.subjectCode,
    credits: record.credits,
    answer_type: record.answerType,
    problem_number: record.problemNumber,
    content_area: record.contentArea,
    designated_difficulty: record.designatedDifficulty,
    points: record.points,
    answer: record.answer,
    has_multiple_answers: record.hasMultipleAnswers,
    standard_code: record.standardCode,
    standard_text: record.standardText,
    subject_max_score: record.subjectMaxScore,
  };
}

export function toResultRow(record: SchoolExamAnswerRecord & { studentCode: string }) {
  return {
    student_code: record.studentCode,
    academic_year: record.academicYear,
    semester: record.semester,
    exam_round: record.examRound,
    exam_name: record.examName,
    grade: record.grade,
    subject_section: record.subjectSection,
    subject_name: record.subjectName,
    class_label: record.classLabel,
    student_number: record.studentNumber,
    is_cross_class: record.isCrossClass,
    attendance: record.attendance,
    selective_score: record.selectiveScore,
    descriptive_score: record.descriptiveScore,
    etc_score: record.etcScore,
    total_score: record.totalScore,
    answers: record.answers,
    correct: record.correct,
    // 파생 채점 여부를 남긴다 — 화면이 "채점 미확정" 배지를 띄우는 근거이고,
    // 나중에 NEIS 확정 채점이 오면 덮어쓸 대상을 찾는 열쇠이기도 하다.
    meta: record.derivedScoring ? { scoring: 'derived' } : {},
  };
}

export const QUESTION_CONFLICT_TARGET =
  'academic_year,semester,exam_round,grade,subject_section,answer_type,problem_number';
export const RESULT_CONFLICT_TARGET =
  'student_code,academic_year,semester,exam_round,subject_section';
