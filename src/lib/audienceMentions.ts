/**
 * `@` 이름 지정 — 과목·동아리·선생님·부서… **실제 목록의 정확한 이름**을 골라 넣는다 (2026-10-01 사용자 요청).
 *
 * AI 조건 만들기에서 틀린 것의 대부분이 **이름 추측**이었다(「심리 동아리」 둘 중 하나 · 「천문학」→「문학」 ·
 * 「물리2」·「두잇」 표기 · 동명이인). `@` 로 고른 이름은 추측이 아니므로 모델은 문장의 **구조**만 풀면 된다.
 *
 * 쓰는 곳 두 군데 — 같은 목록을 쓴다:
 * - 조건 패널의 문장 칸: 고른 이름이 AI 프롬프트에 「확정된 이름」으로 실리고, 사람은 id 로 확정된다.
 * - 선택기 기본 검색창: `@방송부` 를 고르면 AI 없이 그 조건(`criterion`) 하나를 서버가 풀어 바로 더한다.
 */
import type { AudienceCriterion } from '@/lib/audienceRule';
import type { StudentAudienceVocab, StudentCriterion } from '@/lib/studentAudienceRule';
import type { AudienceTarget, FacultyAudienceVocab } from '@/hooks/useStudentAudience';
import type { DraftStudent } from '@/lib/studentRuleDraft';
import { nameKey } from '@/lib/studentRuleDraft';

export type MentionKind =
  | 'course' | 'past_course' | 'club' | 'teacher' | 'student'
  | 'department' | 'seat' | 'tag' | 'teaching' | 'faculty' | 'advisor';

export const MENTION_KIND_LABEL: Record<MentionKind, string> = {
  course: '과목',
  past_course: '지난 과목',
  club: '동아리',
  teacher: '선생님 수업',
  student: '학생',
  department: '부서',
  seat: '업무분장',
  tag: '태그',
  teaching: '수업 교사',
  faculty: '교직원',
  advisor: '동아리 지도',
};

export interface MentionItem {
  key: string;
  target: AudienceTarget;
  kind: MentionKind;
  /** 목록에 보이는 이름 */
  label: string;
  /** 문장에 들어가는 글자(`@` 다음) — 학기·종류가 붙어 모델이 헷갈리지 않는다 */
  insert: string;
  hint?: string;
  /** 이 이름 하나로 만드는 조건 — 기본 검색창에서 AI 없이 더할 때. 사람(학생·교직원)은 없다(검색으로 고른다) */
  criterion?: StudentCriterion | AudienceCriterion;
  /** 사람 항목의 resource id — 문장 속 이름을 id 로 확정한다(동명이인) */
  id?: string;
  /** AI 프롬프트에 「확정된 이름」으로 적을 한 줄 */
  promptLine: string;
}

const termLabel = (term: string) => {
  const [g, s] = term.split('-');
  return `${g}학년 ${s}학기`;
};

export function buildStudentMentions(vocab: StudentAudienceVocab | undefined, students: DraftStudent[] = []): MentionItem[] {
  if (!vocab) return [];
  const items: MentionItem[] = [];
  for (const s of vocab.subjects) {
    items.push({
      key: `s-course:${s.subject}`, target: 'student', kind: 'course', label: s.subject, insert: s.subject,
      hint: `${s.grades.map((g) => `${g}학년`).join('·')} · ${s.count}명`,
      criterion: { type: 'course', subjects: [s.subject] },
      promptLine: `「${s.subject}」 = 이번 학기 과목(course)`,
    });
  }
  // 지난 학기 과목은 학년·학기마다 따로 — 「프로그래밍(2학년 1학기)」 하나로 조건이 정해진다
  for (const p of vocab.past_subjects ?? []) {
    for (const term of p.terms) {
      const [g, sem] = term.split('-').map(Number);
      const label = `${p.subject}(${termLabel(term)})`;
      items.push({
        key: `s-past:${p.subject}:${term}`, target: 'student', kind: 'past_course', label, insert: label,
        hint: '성적 기록',
        criterion: { type: 'past_course', grade: g, semester: sem, subjects: [p.subject] },
        promptLine: `「${label}」 = 지난 학기 과목(past_course) grade ${g}, semester ${sem}, subjects ["${p.subject}"]`,
      });
    }
  }
  for (const c of vocab.clubs) {
    items.push({
      key: `s-club:${c.name}`, target: 'student', kind: 'club', label: c.name, insert: c.name, hint: `${c.count}명`,
      criterion: { type: 'club', names: [c.name] },
      promptLine: `「${c.name}」 = 동아리(club)`,
    });
  }
  for (const t of vocab.teachers ?? []) {
    items.push({
      key: `s-teacher:${t.id}`, target: 'student', kind: 'teacher', label: `${t.name} 선생님`, insert: `${t.name} 선생님`,
      hint: t.subjects.slice(0, 2).join('·'), id: t.id,
      criterion: { type: 'teacher_students', teacher_ids: [t.id] },
      promptLine: `「${t.name} 선생님」 = 그 선생님 수업(teacher_students) teacher_names ["${t.name}"]`,
    });
  }
  for (const s of students) {
    items.push({
      key: `s-person:${s.id}`, target: 'student', kind: 'student', label: s.name, insert: s.name, id: s.id,
      promptLine: `「${s.name}」 = 학생 이름(people_names)`,
    });
  }
  return items;
}

export function buildFacultyMentions(vocab: FacultyAudienceVocab | undefined, faculty: DraftStudent[] = []): MentionItem[] {
  if (!vocab) return [];
  const items: MentionItem[] = [];
  for (const d of vocab.departments) {
    items.push({
      key: `f-dept:${d.id}`, target: 'faculty', kind: 'department', label: d.name, insert: d.name,
      criterion: { type: 'department', ids: [d.id] },
      promptLine: `「${d.name}」 = 부서(department)`,
    });
  }
  for (const seat of vocab.seats) {
    items.push({
      key: `f-seat:${seat}`, target: 'faculty', kind: 'seat', label: seat, insert: seat,
      criterion: { type: 'seat', names: [seat] },
      promptLine: `「${seat}」 = 업무분장 자리(seat)`,
    });
  }
  for (const t of vocab.tags) {
    items.push({
      key: `f-tag:${t.id}`, target: 'faculty', kind: 'tag', label: t.name, insert: t.name,
      criterion: { type: 'tag', ids: [t.id] },
      promptLine: `「${t.name}」 = 태그(tag)`,
    });
  }
  for (const c of vocab.clubs) {
    items.push({
      key: `f-club:${c}`, target: 'faculty', kind: 'advisor', label: c, insert: c,
      criterion: { type: 'club', names: [c] },
      promptLine: `「${c}」 = 동아리(club) — 그 지도 교사`,
    });
  }
  for (const s of vocab.subjects) {
    items.push({
      key: `f-subject:${s.subject}`, target: 'faculty', kind: 'teaching', label: s.subject, insert: s.subject,
      hint: s.grades.map((g) => `${g}학년`).join('·'),
      criterion: { type: 'teaching', grades: [], subjectGroups: [], subjectClusters: [], subjects: [s.subject] },
      promptLine: `「${s.subject}」 = 가르치는 과목(teaching subjects)`,
    });
  }
  for (const f of faculty) {
    items.push({
      key: `f-person:${f.id}`, target: 'faculty', kind: 'faculty', label: f.name, insert: f.name, id: f.id,
      promptLine: `「${f.name}」 = 교직원 이름(people_names)`,
    });
  }
  return items;
}

/**
 * `@` 뒤 글자로 거른다 — 이름 첫머리 일치를 먼저, 그다음 포함. 공백·가운뎃점·로마 숫자 표기는 무시(nameKey).
 * 같은 이름이 여러 종류(「정보」 과목 · 「정보화부」 부서)면 종류 표시로 갈린다.
 */
export function filterMentions(items: MentionItem[], query: string, limit = 8): MentionItem[] {
  const q = nameKey(query);
  if (!q) return items.filter((i) => i.criterion).slice(0, limit);
  const starts: MentionItem[] = [];
  const contains: MentionItem[] = [];
  for (const item of items) {
    const k = nameKey(item.label);
    if (k.startsWith(q)) starts.push(item);
    else if (k.includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 문장 속 `@이름` 중 지금도 남아 있는 것 — 사람이 지웠으면 빼야 한다 */
export function activeMentions(sentence: string, picked: MentionItem[]): MentionItem[] {
  const seen = new Set<string>();
  return picked.filter((m) => {
    if (seen.has(m.key) || !sentence.includes(`@${m.insert}`)) return false;
    seen.add(m.key);
    return true;
  });
}

/** AI 프롬프트에 붙일 「확정된 이름」 절 — 비어 있으면 빈 문자열 */
export function mentionPromptSection(mentions: MentionItem[]): string {
  if (mentions.length === 0) return '';
  return [
    '',
    '## 사람이 목록에서 고른 이름 (정확하다 — 이 이름을 그대로, 이 종류로 쓸 것. 문장에는 앞에 @ 가 붙어 있다)',
    ...mentions.map((m) => `- ${m.promptLine}`),
  ].join('\n');
}
