import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NamePreview } from "@/components/ui/name-list-overlay";
import { CriterionEditor as FacultyCriterionEditor } from "@/components/audience/AudienceRuleBuilder";
import {
  DAY_LABELS,
  EMPTY_STUDENT_RULE,
  STUDENT_CRITERION_LABEL,
  STUDENT_CRITERION_MENU,
  canonicalRule,
  describeStudentRule,
  gradeBreakdown,
  narrowRuleToGrade,
  newStudentCriterion,
  resolutionWarnings,
  studentCriterionEmpty,
  studentNameBook,
  validateStudentRule,
  type StudentAudienceResolution,
  type StudentAudienceRule,
  type StudentAudienceVocab,
  type StudentCriterion,
} from "@/lib/studentAudienceRule";
import {
  EMPTY_FACULTY_RULE,
  FACULTY_CRITERION_LABEL,
  FACULTY_CRITERION_MENU,
  describeFacultyRule,
  facultyResolutionWarnings,
  newFacultyCriterion,
  validateFacultyRule,
  type FacultyAudienceResolution,
  type FacultyAudienceRule,
} from "@/lib/facultyAudienceRule";
import { criterionEmpty, type AudienceCriterion } from "@/lib/audienceRule";
import {
  useFacultyAudienceResolution,
  useFacultyAudienceVocab,
  useRecordStudentRule,
  useSavedFacultyRules,
  useSavedStudentRules,
  useStudentAudienceResolution,
  useStudentAudienceVocab,
  useUpdateSavedStudentRule,
  type AudienceTarget,
  type SavedRule,
} from "@/hooks/useStudentAudience";
import { useAcademicTerm } from "@/hooks/useAcademicTerm";
import { generateStudentRuleDraft } from "@/services/studentRuleDraftService";
import { generateFacultyRuleDraft } from "@/services/facultyRuleDraftService";
import { STUDENT_RULE_DRAFT_MAX_INPUT, type DraftStudent } from "@/lib/studentRuleDraft";
import {
  MENTION_KIND_LABEL,
  activeMentions,
  buildFacultyMentions,
  buildStudentMentions,
  filterMentions,
  type MentionItem,
} from "@/lib/audienceMentions";

/**
 * 조건으로 고르기 패널 (2026-10-01) — `SearchableMultiSelect` 의 [조건] 토글이 연다.
 *
 * - **대상이 둘이다**: 학생(`resolve_student_audience`) · 교직원(`resolve_faculty_rule`). 선택기가 둘 다 고를 수
 *   있으면 위쪽 [학생 | 교직원] 토글로 고른다 — 두 규칙은 모양이 달라 한 편집기에 섞지 않는다(결과는 한 선택에 섞여도 된다).
 * - 묶음 카드 하나 = 조건들의 AND(「현재 3학년 **중** 2학년 때 3반」), 카드끼리 = OR, 제외 묶음.
 * - 명단은 서버가 푼다. 여기는 규칙을 편집하고 결과를 보여 줄 뿐이다.
 * - **새 모달을 띄우지 않는다** — 선택기 자체가 대개 모달 안이다(docs/nested-modal-pitfalls.md).
 * - 문장 → 조건(AI)은 편집기를 **채울 뿐**이고, 추가는 사람이 [N명 추가]로 한다.
 * - 최근·즐겨찾기: [N명 추가]한 조건이 대상마다 저절로 쌓이고(별표 없는 것은 8개만), 별표한 것만 남는다.
 *
 * 공통 뼈대(`RulePanelCore`) + 대상별 설정(`useStudentConfig` · `useFacultyConfig`). 화면 부품을 두 벌로 만들지 않는다.
 * 설계 = docs/plans/2026-10-01-student-audience-selection.md
 */

type Side = "include" | "exclude";
type RuleLike<C> = { include: Array<{ all: C[] }>; exclude: Array<{ all: C[] }> };
type ResolutionLike = {
  rows: Array<{ resource_id: string }>;
  groups: Array<{ side: Side; index: number; count: number; criteria: Array<{ count: number }> }>;
  excluded: number;
};

interface CoreConfig<C extends { type: string }, Res extends ResolutionLike> {
  target: AudienceTarget;
  menu: C["type"][];
  labels: Record<string, string>;
  newCriterion: (type: C["type"]) => C;
  isEmpty: (c: C) => boolean;
  describe: (rule: RuleLike<C>) => string;
  validate: (rule: RuleLike<C>) => string | null;
  renderEditor: (c: C, onChange: (next: C) => void) => React.ReactNode;
  resolution: UseQueryResult<Res>;
  /** 결과 행 → 미리보기 이름 */
  rowLabel: (row: Res["rows"][number]) => string;
  warnings: (res: Res) => string[];
  /** 결과 상자에 더 그릴 것(학생 = 현재 학년별 분해) */
  extra?: (res: Res, editRule: (fn: (prev: RuleLike<C>) => RuleLike<C>) => void) => React.ReactNode;
  saved: UseQueryResult<SavedRule<RuleLike<C>>[]>;
  draft?: { ready: boolean; placeholder: string; run: (sentence: string, mentions: MentionItem[]) => Promise<{ rule: RuleLike<C>; issues: string[] }> };
  /** 문장 칸의 `@` 후보 */
  mentions: MentionItem[];
  meta?: string;
  metaError?: string | null;
}

const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors sm:h-6 sm:px-2 sm:text-[11px]",
    active
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  );

function toggle<T>(values: T[] | undefined, value: T): T[] {
  const list = values ?? [];
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 이름 목록에서 여러 개 고르기 — 검색칸 + 스크롤 목록. 고른 것이 위로 온다 */
function OptionList({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: Array<{ value: string; label?: string; hint?: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().replace(/\s+/g, "");
  const text = (o: { value: string; label?: string }) => o.label ?? o.value;
  const filtered = options.filter((o) => !q || text(o).replace(/\s+/g, "").includes(q));
  const ordered = [
    ...filtered.filter((o) => selected.includes(o.value)),
    ...filtered.filter((o) => !selected.includes(o.value)),
  ];
  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-400"
        // 목록 위 Command 의 키보드 처리에 끌려가지 않게
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="max-h-32 overflow-y-auto overscroll-contain rounded-md border border-slate-100">
        {ordered.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-slate-400">찾는 항목이 없습니다.</div>
        ) : (
          ordered.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(toggle(selected, o.value))}
                className={cn(
                  "flex min-h-9 w-full min-w-0 items-center gap-2 px-2 text-left text-xs sm:min-h-7",
                  on ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"
                )}
              >
                <span className={cn("h-3 w-3 shrink-0 rounded-sm border", on ? "border-blue-600 bg-blue-600" : "border-slate-300")} />
                <span className="min-w-0 flex-1 truncate" title={text(o)}>{text(o)}</span>
                {o.hint && <span className="shrink-0 text-[10px] text-slate-400">{o.hint}</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 학생 조건 편집기 ─────────────────────────────────────────────────────────

function StudentCriterionBody({
  criterion,
  vocab,
  onChange,
}: {
  criterion: StudentCriterion;
  vocab: StudentAudienceVocab | undefined;
  onChange: (next: StudentCriterion) => void;
}) {
  const grades = [...new Set((vocab?.classes ?? []).map((c) => c.grade))].sort((a, b) => a - b);
  const classesOf = (gradeFilter?: number[]) =>
    [...new Set((vocab?.classes ?? [])
      .filter((c) => !gradeFilter || gradeFilter.length === 0 || gradeFilter.includes(c.grade))
      .map((c) => c.class))].sort((a, b) => a - b);
  const maxClass = Math.max(10, ...(vocab?.classes ?? []).map((c) => c.class));
  const periods = Array.from({ length: vocab?.max_period ?? 7 }, (_, i) => i + 1);

  switch (criterion.type) {
    case "current_class":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {grades.map((g) => (
              <button key={g} type="button" className={chipClass(!!criterion.grades?.includes(g))}
                onClick={() => onChange({ ...criterion, grades: toggle(criterion.grades, g) })}>{g}학년</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {classesOf(criterion.grades).map((n) => (
              <button key={n} type="button" className={chipClass(!!criterion.classes?.includes(n))}
                onClick={() => onChange({ ...criterion, classes: toggle(criterion.classes, n) })}>{n}반</button>
            ))}
          </div>
        </div>
      );
    case "past_class":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            {[1, 2, 3].map((g) => (
              <button key={g} type="button" className={chipClass(criterion.grade === g)}
                onClick={() => onChange({ ...criterion, grade: g })}>{g}학년 때</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: maxClass }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={chipClass(criterion.classes.includes(n))}
                onClick={() => onChange({ ...criterion, classes: toggle(criterion.classes, n) })}>{n}반</button>
            ))}
          </div>
        </div>
      );
    case "past_course": {
      // 끝난 학기 과목(성적 기록) — 고른 학년(·학기)에 있었던 과목만 선택지로
      const term = `${criterion.grade}-${criterion.semester ?? ""}`;
      const options = (vocab?.past_subjects ?? [])
        .filter((s) => s.terms.some((t) => (criterion.semester ? t === term : t.startsWith(`${criterion.grade}-`))))
        .map((s) => ({ value: s.subject, hint: `${s.count}명` }));
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            {[1, 2, 3].map((g) => (
              <button key={g} type="button" className={chipClass(criterion.grade === g)}
                onClick={() => onChange({ ...criterion, grade: g })}>{g}학년</button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
            {[undefined, 1, 2].map((s) => (
              <button key={String(s)} type="button" className={chipClass(criterion.semester === s)}
                onClick={() => onChange({ ...criterion, semester: s })}>{s ? `${s}학기` : "두 학기 모두"}</button>
            ))}
          </div>
          <OptionList placeholder="과목 이름 검색" options={options} selected={criterion.subjects}
            onChange={(subjects) => onChange({ ...criterion, subjects })} />
          <p className="text-[10px] text-slate-400">생기부 성적 기록 기준 — 이번 학기는 「수강 과목(이번 학기)」으로 고르세요.</p>
        </div>
      );
    }
    case "club":
      return (
        <OptionList placeholder="동아리 이름 검색"
          options={(vocab?.clubs ?? []).map((c) => ({ value: c.name, hint: `${c.count}명` }))}
          selected={criterion.names} onChange={(names) => onChange({ ...criterion, names })} />
      );
    case "course":
      return (
        <OptionList placeholder="과목 이름 검색"
          options={(vocab?.subjects ?? []).map((s) => ({
            value: s.subject, hint: `${s.grades.map((g) => `${g}학년`).join("·")} ${s.count}명`,
          }))}
          selected={criterion.subjects} onChange={(subjects) => onChange({ ...criterion, subjects })} />
      );
    case "teacher_students": {
      const chosen = (vocab?.teachers ?? []).filter((t) => criterion.teacher_ids.includes(t.id));
      const subjects = [...new Set(chosen.flatMap((t) => t.subjects))].sort((a, b) => a.localeCompare(b, "ko"));
      return (
        <div className="space-y-1">
          <OptionList placeholder="선생님 이름 검색"
            options={(vocab?.teachers ?? []).map((t) => ({ value: t.id, label: t.name, hint: t.subjects.slice(0, 2).join("·") }))}
            selected={criterion.teacher_ids} onChange={(teacher_ids) => onChange({ ...criterion, teacher_ids })} />
          {subjects.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              {subjects.map((s) => (
                <button key={s} type="button" className={chipClass(!!criterion.subjects?.includes(s))}
                  onClick={() => onChange({ ...criterion, subjects: toggle(criterion.subjects, s) })}>{s}</button>
              ))}
              <span className="text-[10px] text-slate-400">고르지 않으면 그 선생님 수업 전부</span>
            </div>
          )}
        </div>
      );
    }
    case "slot":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.slice(0, 5).map((label, i) => (
              <button key={label} type="button" className={chipClass(!!criterion.days?.includes(i + 1))}
                onClick={() => onChange({ ...criterion, days: toggle(criterion.days, i + 1) })}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {periods.map((p) => (
              <button key={p} type="button" className={chipClass(!!criterion.periods?.includes(p))}
                onClick={() => onChange({ ...criterion, periods: toggle(criterion.periods, p) })}>{p}교시</button>
            ))}
          </div>
          <OptionList placeholder="과목도 정하려면 검색 (선택)"
            options={(vocab?.subjects ?? []).map((s) => ({ value: s.subject }))}
            selected={criterion.subjects ?? []} onChange={(subjects) => onChange({ ...criterion, subjects })} />
        </div>
      );
    case "my_students":
      return (vocab?.my_subjects ?? []).length === 0 ? (
        <p className="text-[11px] text-slate-400">이번 학기 시간표에 내 수업이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {(vocab?.my_subjects ?? []).map((s) => (
            <button key={s} type="button" className={chipClass(!!criterion.subjects?.includes(s))}
              onClick={() => onChange({ ...criterion, subjects: toggle(criterion.subjects, s) })}>{s}</button>
          ))}
          <span className="self-center text-[10px] text-slate-400">고르지 않으면 내 수업 전부</span>
        </div>
      );
    case "my_homeroom":
      return (
        <p className="text-[11px] text-slate-500">
          {(vocab?.my_homeroom ?? []).length > 0
            ? vocab!.my_homeroom.map((h) => `${h.grade}학년 ${h.class}반`).join(", ")
            : "담임 반이 없습니다(태그 「N학년 M반」 기준)."}
        </p>
      );
    default:
      return null;
  }
}

// ── `@` 이름 지정 입력칸 ───────────────────────────────────────────────────────

/** 캐럿 바로 앞의 `@검색어` — 없으면 null. 공백·@ 를 만나면 끝난다 */
function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)@([^\s@]{0,20})$/);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/**
 * 문장 입력칸 + `@` 자동완성 (2026-10-01 사용자 요청). 후보는 **입력칸 바로 아래**에 펼친다 —
 * 선택기 자체가 대개 모달·팝오버 안이라 팝오버를 또 띄우지 않는다(docs/nested-modal-pitfalls.md).
 * 고르면 `@이름 ` 이 들어가고 그 항목을 기록한다(보낼 때 문장에 남아 있는 것만 쓴다).
 */
function MentionInput({
  value,
  onChange,
  items,
  onPick,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  items: MentionItem[];
  onPick: (item: MentionItem) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const at = mentionQueryAt(value, caret);
  const options = at && !dismissed ? filterMentions(items, at.query) : [];
  const open = options.length > 0;

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length);
  const pick = (item: MentionItem) => {
    if (!at) return;
    const insert = `@${item.insert} `;
    const next = value.slice(0, at.start) + insert + value.slice(caret);
    onChange(next);
    onPick(item);
    const pos = at.start + insert.length;
    setCaret(pos);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setDismissed(false);
          setHighlight(0);
        }}
        onSelect={syncCaret}
        onClick={syncCaret}
        onKeyDown={(e) => {
          e.stopPropagation(); // 목록의 Command 키보드 처리에 끌려가지 않게
          if (e.nativeEvent.isComposing) return;
          if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setHighlight((h) => (h + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
            return;
          }
          if (open && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(options[Math.min(highlight, options.length - 1)]);
            return;
          }
          if (open && e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label="찾을 대상을 문장으로"
        aria-autocomplete="list"
        aria-expanded={open}
        className="h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-blue-400 sm:h-8"
      />
      {open ? (
        <div role="listbox" aria-label="이름 고르기" className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          {options.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === highlight}
              // 입력칸 포커스를 잃지 않게(눌러도 캐럿 자리가 남아 있어야 바꿔 넣을 수 있다)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              className={cn(
                "flex min-h-9 w-full min-w-0 items-center gap-2 px-2 text-left text-xs sm:min-h-7",
                i === highlight ? "bg-blue-50" : "hover:bg-slate-50"
              )}
            >
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{MENTION_KIND_LABEL[item.kind]}</span>
              <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
              {item.hint && <span className="shrink-0 text-[10px] text-slate-400">{item.hint}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">
          <span className="font-medium text-slate-500">@</span> 를 치면 과목·동아리·선생님 같은 이름을 목록에서 정확히 고를 수 있습니다.
        </p>
      )}
    </div>
  );
}

// ── 공통 뼈대 ─────────────────────────────────────────────────────────────────

function AddCriterion<T extends string>({ label, menu, labels, onAdd }: {
  label: string;
  menu: T[];
  labels: Record<string, string>;
  onAdd: (type: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-xs text-blue-600 hover:bg-blue-50 sm:h-6 sm:text-[11px]">
        <Plus className="h-3 w-3" />{label}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {menu.map((type) => (
        <button key={type} type="button" className={chipClass(false)}
          onClick={() => { onAdd(type); setOpen(false); }}>
          {labels[type]}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} aria-label="닫기"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 sm:h-6 sm:w-6">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function RulePanelCore<C extends { type: string }, Res extends ResolutionLike>({
  config,
  rule,
  setRule,
  onApply,
}: {
  config: CoreConfig<C, Res>;
  rule: RuleLike<C>;
  setRule: React.Dispatch<React.SetStateAction<RuleLike<C>>>;
  onApply: (ids: string[], label: string) => void;
}) {
  // ── 문장 → 조건 (AI). 사람이 버튼을 누를 때만 부르고, 결과는 아래 편집기에 채울 뿐이다 ──
  const [sentence, setSentence] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);
  /** AI 가 이해한 결과 — 못 찾은 말·맞춘 이름. 사람이 고치면 사라진다(더 이상 AI 결과가 아니다) */
  const [draftNote, setDraftNote] = React.useState<{ sentence: string; issues: string[] } | null>(null);
  /** `@` 로 고른 이름 — 문장에서 지워진 것은 보낼 때 뺀다(activeMentions) */
  const [picked, setPicked] = React.useState<MentionItem[]>([]);
  const runDraft = async () => {
    if (!config.draft?.ready || !sentence.trim() || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const result = await config.draft.run(sentence, activeMentions(sentence, picked));
      setRule(result.rule);
      setDraftNote({ sentence: sentence.trim(), issues: result.issues });
    } catch (error) {
      setDraftError((error as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  const editRule = (next: RuleLike<C> | ((prev: RuleLike<C>) => RuleLike<C>)) => {
    setDraftNote(null);
    setRule(next);
  };

  const validation = config.validate(rule);
  const resolution = config.resolution;
  // 규칙이 비었거나 미완성이면 이전 결과를 보이지 않는다(placeholderData 로 남아 있어도)
  const data = validation === null ? resolution.data : undefined;

  // ── 최근·즐겨찾기 ──
  const recordRule = useRecordStudentRule(config.target);
  const updateSaved = useUpdateSavedStudentRule(config.target);
  const currentKey = rule.include.length > 0 ? canonicalRule(rule) : null;
  const currentSaved = React.useMemo(
    () => (currentKey ? config.saved.data?.find((s) => canonicalRule(s.rule) === currentKey) : undefined),
    [currentKey, config.saved.data]
  );
  const record = (pin: boolean) => {
    if (!currentKey) return;
    recordRule.mutate(
      { rule, ruleKey: currentKey, label: config.describe(rule), sentence: draftNote?.sentence ?? null, pin },
      // 기록 실패가 선택을 막아서는 안 된다(추가는 이미 끝났다) — 콘솔에만 남긴다
      { onError: (error) => console.warn("[audience-rule] 최근 조건 기록 실패", error) }
    );
  };
  const toggleCurrentPin = () => {
    if (currentSaved?.pinned) updateSaved.mutate({ id: currentSaved.id, pinned: false });
    else record(true);
  };

  const updateGroup = (side: Side, gi: number, all: C[]) => {
    editRule((prev) => {
      const groups = [...prev[side]];
      if (all.length === 0) groups.splice(gi, 1);
      else groups[gi] = { all };
      return { ...prev, [side]: groups };
    });
  };
  const addGroup = (side: Side, type: C["type"]) => {
    editRule((prev) => ({ ...prev, [side]: [...prev[side], { all: [config.newCriterion(type)] }] }));
  };

  const rows = data?.rows ?? [];
  const warnings = data ? config.warnings(data) : [];

  const renderSide = (side: Side) =>
    rule[side].map((group, gi) => {
      const groupResult = data?.groups.find((g) => g.side === side && g.index === gi);
      return (
        <React.Fragment key={`${side}-${gi}`}>
          {gi > 0 && <div className="text-center text-[10px] font-medium text-slate-400">또는</div>}
          <div className={cn("min-w-0 space-y-1.5 rounded-lg border bg-white p-2",
            side === "exclude" ? "border-rose-200" : "border-slate-200")}>
            {group.all.map((criterion, ci) => {
              const empty = config.isEmpty(criterion);
              const result = groupResult?.criteria[ci];
              return (
                <React.Fragment key={ci}>
                  {ci > 0 && <div className="pl-1 text-[10px] font-medium text-slate-400">그리고 (이 중에서)</div>}
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {config.labels[criterion.type]}
                      </span>
                      <span className={cn("ml-auto shrink-0 text-[11px] tabular-nums", empty ? "text-amber-600" : "text-slate-500")}>
                        {empty ? "값을 고르세요" : result ? `${result.count}명` : ""}
                      </span>
                      <button type="button" aria-label="조건 지우기"
                        onClick={() => updateGroup(side, gi, group.all.filter((_, i) => i !== ci))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:h-5 sm:w-5">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {config.renderEditor(criterion, (next) => updateGroup(side, gi, group.all.map((c, i) => (i === ci ? next : c))))}
                  </div>
                </React.Fragment>
              );
            })}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1">
              <AddCriterion label="조건 더해 좁히기" menu={config.menu} labels={config.labels}
                onAdd={(type) => updateGroup(side, gi, [...group.all, config.newCriterion(type)])} />
              {groupResult && group.all.length > 1 && (
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-700">이 묶음 {groupResult.count}명</span>
              )}
            </div>
          </div>
        </React.Fragment>
      );
    });

  return (
    <div className="space-y-2">
      {config.meta && <div className="text-[10px] text-slate-400">{config.meta}</div>}
      {config.metaError && <p className="text-[11px] text-rose-600">{config.metaError}</p>}

      {/* 문장으로 조건 만들기 — @ 로 정확한 이름을 골라 넣을 수 있다 */}
      {config.draft && (
        <div className="space-y-1">
          <div className="flex min-w-0 items-start gap-1.5">
            <MentionInput
              value={sentence}
              onChange={(next) => setSentence(next.slice(0, STUDENT_RULE_DRAFT_MAX_INPUT))}
              items={config.mentions}
              onPick={(item) => setPicked((prev) => [...prev, item])}
              onSubmit={() => void runDraft()}
              placeholder={config.draft.placeholder}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1 px-2.5 text-xs sm:h-8"
              // ⚠ 진행 중에 disabled 로 바꾸지 말 것 — 눌린 버튼이 비활성되면 포커스가 빠지고, 바깥 모달의
              //   포커스 가두기가 포커스를 팝오버 밖으로 끌어가 **선택기 팝오버가 닫힌다**(2026-10-01 데스크톱
              //   스크린샷에서 확인 — 휴대폰 시트는 멀쩡해 놓치기 쉽다). 중복 실행은 runDraft 가 막는다.
              disabled={!config.draft.ready || !sentence.trim()}
              aria-busy={drafting}
              onClick={() => void runDraft()}
            >
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-violet-500" />}
              조건 만들기
            </Button>
          </div>
          {draftError && <p className="text-[11px] text-rose-600">{draftError}</p>}
          {draftNote && (
            <div className="rounded-md border border-violet-100 bg-violet-50/60 px-2 py-1.5 text-[11px] text-slate-600">
              <p className="min-w-0 break-words">
                「{draftNote.sentence}」 →{" "}
                <span className="font-medium text-slate-800">
                  {rule.include.length > 0 ? config.describe(rule) : "만들 수 있는 조건이 없었습니다"}
                </span>
              </p>
              {draftNote.issues.map((issue) => (
                <p key={issue} className="text-amber-700">{issue}</p>
              ))}
              <p className="text-[10px] text-slate-400">AI 가 만든 조건입니다 — 아래에서 확인하고 고칠 수 있습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 최근·즐겨찾기 — 조건이 비어 있을 때만(편집 중엔 자리를 차지하지 않는다). 누르면 편집기에 불러온다 */}
      {rule.include.length === 0 && (config.saved.data?.length ?? 0) > 0 && (
        <div className="min-w-0 space-y-1">
          <div className="text-[10px] font-medium text-slate-400">즐겨찾기 · 최근</div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {config.saved.data!.map((saved) => (
              <div key={saved.id} className="flex min-h-10 min-w-0 items-center gap-1 border-b border-slate-100 px-1.5 last:border-b-0 sm:min-h-8">
                <button
                  type="button"
                  onClick={() => updateSaved.mutate({ id: saved.id, pinned: !saved.pinned })}
                  aria-label={saved.pinned ? "즐겨찾기 해제" : "즐겨찾기"}
                  aria-pressed={saved.pinned}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 sm:h-6 sm:w-6"
                >
                  <Star className={cn("h-3.5 w-3.5", saved.pinned ? "fill-amber-400 text-amber-500" : "text-slate-300")} />
                </button>
                <button
                  type="button"
                  onClick={() => editRule(saved.rule)}
                  className="flex min-w-0 flex-1 flex-col items-start py-1 text-left"
                  title={saved.sentence ? `「${saved.sentence}」` : saved.label}
                >
                  <span className="w-full truncate text-xs text-slate-700">{saved.title ?? config.describe(saved.rule)}</span>
                  {saved.sentence && <span className="w-full truncate text-[10px] text-slate-400">「{saved.sentence}」</span>}
                </button>
                {saved.use_count > 1 && <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{saved.use_count}회</span>}
                {/* 별표한 것은 여기서 지우지 않는다 — 별표를 풀면 최근으로 내려가 저절로 빠진다(확인 창 없이 실수로 잃지 않게) */}
                {!saved.pinned && (
                  <button
                    type="button"
                    onClick={() => updateSaved.mutate({ id: saved.id, remove: true })}
                    aria-label="최근에서 지우기"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-600 sm:h-6 sm:w-6"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {renderSide("include")}
      <AddCriterion label={rule.include.length === 0 ? "조건 추가" : "또는 다른 조건"} menu={config.menu} labels={config.labels}
        onAdd={(type) => addGroup("include", type)} />

      {rule.exclude.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium text-rose-500">제외</div>
          {renderSide("exclude")}
        </div>
      )}
      {rule.include.length > 0 && (
        <AddCriterion label="제외할 조건" menu={config.menu} labels={config.labels} onAdd={(type) => addGroup("exclude", type)} />
      )}

      {rule.include.length > 0 && (
        // 결과 상자는 스크롤 영역 바닥에 붙는다 — 조건을 편집하는 내내 인원과 [N명 추가]가 보여야 한다
        <div className="sticky bottom-0 min-w-0 space-y-1.5 rounded-lg border border-blue-100 bg-white p-2 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.15)]">
          <div className="flex min-w-0 items-center gap-2">
            {resolution.isFetching && validation === null && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <span className="text-xs font-semibold tabular-nums text-slate-800">
              {validation !== null ? validation : data ? `${rows.length}명` : "계산 중…"}
            </span>
            {data && data.excluded > 0 && (
              <span className="text-[10px] text-slate-400">(제외 {data.excluded}명)</span>
            )}
          </div>
          {resolution.isError && validation === null && (
            <p className="text-[11px] text-rose-600">{(resolution.error as Error).message}</p>
          )}
          {data && config.extra?.(data, editRule)}
          {warnings.map((w) => (
            <p key={w} className="text-[11px] text-amber-700">{w}</p>
          ))}
          {rows.length > 0 && (
            <NamePreview names={rows.map(config.rowLabel)} className="block text-[11px] text-slate-500" />
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleCurrentPin}
              disabled={validation !== null}
              aria-pressed={!!currentSaved?.pinned}
              className="inline-flex h-9 items-center gap-1 rounded-md px-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40 sm:h-7 sm:text-[11px]"
            >
              <Star className={cn("h-3.5 w-3.5", currentSaved?.pinned ? "fill-amber-400 text-amber-500" : "text-slate-400")} />
              {currentSaved?.pinned ? "즐겨찾기됨" : "즐겨찾기"}
            </button>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-blue-600 px-3 text-xs hover:bg-blue-700 sm:h-7"
              disabled={!data || rows.length === 0}
              onClick={() => {
                if (!data) return;
                record(false); // 최근에 쌓기(같은 조건이면 사용 횟수만 는다)
                onApply(rows.map((r) => r.resource_id), config.describe(rule));
              }}
            >
              {data ? `${rows.length}명 추가` : "추가"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 대상별 설정 ───────────────────────────────────────────────────────────────

function StudentSide({ students, onApply, active }: {
  students: DraftStudent[];
  onApply: (ids: string[], label: string) => void;
  active: boolean;
}) {
  const [rule, setRule] = React.useState<StudentAudienceRule>(EMPTY_STUDENT_RULE);
  const vocabQuery = useStudentAudienceVocab(active);
  const vocab = vocabQuery.data;
  const book = React.useMemo(() => studentNameBook(vocab), [vocab]);
  const mentions = React.useMemo(() => buildStudentMentions(vocab, students), [vocab, students]);
  const resolution = useStudentAudienceResolution(rule, active);
  const saved = useSavedStudentRules(active);
  const config: CoreConfig<StudentCriterion, StudentAudienceResolution> = {
    target: "student",
    menu: STUDENT_CRITERION_MENU,
    labels: STUDENT_CRITERION_LABEL,
    newCriterion: newStudentCriterion,
    isEmpty: studentCriterionEmpty,
    describe: (r) => describeStudentRule(r as StudentAudienceRule, book),
    validate: (r) => validateStudentRule(r as StudentAudienceRule),
    renderEditor: (c, onChange) => <StudentCriterionBody criterion={c} vocab={vocab} onChange={onChange} />,
    resolution,
    rowLabel: (r) => `${r.grade ?? ""}${String(r.class ?? "").padStart(2, "0")}${String(r.number ?? "").padStart(2, "0")} ${r.name}`,
    warnings: resolutionWarnings,
    // 현재 학년별 분해 — 「2학년 때 3반」이 지금 2학년(아직 그 반)과 3학년을 함께 담는 것을 드러낸다.
    // 누르면 그 학년으로 좁힌다 = 「현재 N학년 중」을 붙인 것과 같은 규칙
    extra: (res, editRule) => {
      const breakdown = gradeBreakdown(res.rows);
      if (breakdown.length <= 1) return null;
      return (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-400">현재 학년별</span>
          {breakdown.map((b) => (
            <button key={b.grade} type="button" className={chipClass(false)} title={`현재 ${b.grade}학년만 남기기`}
              onClick={() => editRule((prev) => narrowRuleToGrade(prev as StudentAudienceRule, b.grade))}>
              {b.grade}학년 {b.count}명만
            </button>
          ))}
        </div>
      );
    },
    saved,
    draft: {
      ready: !!vocab,
      placeholder: "예: 현재 3학년 중 2학년 때 3반이었던 학생",
      run: (sentence, mentions) => generateStudentRuleDraft(sentence, vocab!, students, undefined, mentions),
    },
    mentions,
    meta: vocab ? `${vocab.academic_year}학년도 ${vocab.semester}학기 · 재학생` : undefined,
    metaError: vocabQuery.isError ? `선택지를 불러오지 못했습니다: ${(vocabQuery.error as Error).message}` : null,
  };
  return <RulePanelCore config={config} rule={rule} setRule={setRule as React.Dispatch<React.SetStateAction<RuleLike<StudentCriterion>>>} onApply={onApply} />;
}

function FacultySide({ faculty, onApply, active }: {
  faculty: DraftStudent[];
  onApply: (ids: string[], label: string) => void;
  active: boolean;
}) {
  const [rule, setRule] = React.useState<FacultyAudienceRule>(EMPTY_FACULTY_RULE);
  const { data: term } = useAcademicTerm();
  const vocabQuery = useFacultyAudienceVocab(active, term?.year ?? null);
  const vocab = vocabQuery.data;
  const book = React.useMemo(() => ({
    departments: new Map((vocab?.departments ?? []).map((d) => [d.id, d.name])),
    tags: new Map((vocab?.tags ?? []).map((t) => [t.id, t.name])),
    people: new Map(faculty.map((f) => [f.id, f.name])),
  }), [vocab, faculty]);
  const mentions = React.useMemo(() => buildFacultyMentions(vocab, faculty), [vocab, faculty]);
  const resolution = useFacultyAudienceResolution(rule, active);
  const saved = useSavedFacultyRules(active);
  const config: CoreConfig<AudienceCriterion, FacultyAudienceResolution> = {
    target: "faculty",
    menu: FACULTY_CRITERION_MENU,
    labels: FACULTY_CRITERION_LABEL,
    newCriterion: newFacultyCriterion,
    isEmpty: criterionEmpty,
    describe: (r) => describeFacultyRule(r as FacultyAudienceRule, book),
    validate: (r) => validateFacultyRule(r as FacultyAudienceRule),
    // 조건 하나의 편집기는 「입력 받기」·「메시지 보내기」의 것을 그대로 쓴다(두 벌 금지)
    renderEditor: (c, onChange) => <FacultyCriterionEditor value={c} onChange={onChange} />,
    resolution,
    rowLabel: (r) => r.name,
    warnings: facultyResolutionWarnings,
    saved,
    draft: {
      ready: !!vocab,
      placeholder: "예: 2학년 담임 중 수학 선생님",
      run: (sentence, mentions) => generateFacultyRuleDraft(sentence, vocab!, faculty, undefined, mentions),
    },
    mentions,
    meta: "교직원 · 업무분장·태그·시간표 기준",
    metaError: vocabQuery.isError ? `선택지를 불러오지 못했습니다: ${(vocabQuery.error as Error).message}` : null,
  };
  return <RulePanelCore config={config} rule={rule} setRule={setRule as React.Dispatch<React.SetStateAction<RuleLike<AudienceCriterion>>>} onApply={onApply} />;
}

// ── 패널 ─────────────────────────────────────────────────────────────────────

const AUDIENCE_TARGET_LABEL: Record<AudienceTarget, string> = { student: "학생", faculty: "교직원" };

export function AudienceRulePanel({
  targets,
  onApply,
  onClose,
  students = [],
  faculty = [],
}: {
  /** 이 선택기에서 조건으로 고를 수 있는 대상(권한까지 반영해 선택기가 정한다) */
  targets: AudienceTarget[];
  /** 결과를 선택에 더한다. label = 규칙 요약(그룹 칩 라벨) */
  onApply: (ids: string[], label: string) => void;
  onClose: () => void;
  /** 문장 속 학생 이름을 맞출 재학생 명단(선택기가 이미 들고 있는 것). AI 에는 보내지 않는다 */
  students?: DraftStudent[];
  /** 문장 속 교직원 이름을 맞출 명단 */
  faculty?: DraftStudent[];
}) {
  const [active, setActive] = React.useState<AudienceTarget>(targets[0]);
  const both = targets.length > 1;
  // 둘 다 고를 수 있으면 그룹 칩 라벨에 대상을 붙인다(「학생 · 현재 3학년」) — 섞인 선택에서 칩이 무엇인지 알 수 있게
  const apply = (target: AudienceTarget) => (ids: string[], label: string) =>
    onApply(ids, both ? `${AUDIENCE_TARGET_LABEL[target]} · ${label}` : label);

  return (
    // 높이: 휴대폰 시트에서는 남은 공간(flex-1 min-h-0), 데스크톱 팝오버에서는 화면에 남은 높이까지.
    // 고정 60vh 만 두면 팝오버가 화면 아래로 넘쳐 [N명 추가]가 잘린다(2026-10-01 스크린샷에서 확인).
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain border-b bg-slate-50/70 p-2.5 max-h-[min(60vh,calc(var(--radix-popover-content-available-height,100dvh)-3.5rem))]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800">조건으로 고르기</span>
        {both && (
          <div className="inline-flex rounded-lg border border-slate-100 bg-slate-100/50 p-0.5" role="tablist" aria-label="고를 대상">
            {targets.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active === t}
                onClick={() => setActive(t)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs sm:h-6 sm:px-2.5 sm:text-[11px]",
                  active === t ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"
                )}
              >
                {AUDIENCE_TARGET_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="조건 패널 닫기"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 sm:h-6 sm:w-6">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* 두 쪽을 함께 띄워 두고 숨기기만 한다 — 대상을 오가도 만들던 조건이 사라지지 않게 */}
      {targets.includes("student") && (
        <div hidden={active !== "student"}>
          <StudentSide students={students} onApply={apply("student")} active={active === "student"} />
        </div>
      )}
      {targets.includes("faculty") && (
        <div hidden={active !== "faculty"}>
          <FacultySide faculty={faculty} onApply={apply("faculty")} active={active === "faculty"} />
        </div>
      )}
    </div>
  );
}
