import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS } from '@/components/timetable/timetableDialogDesign';
import { useState, useRef } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { teacherSectionName, classNumberFromLabel } from '@/lib/timetableSource';
import {
  parseTeacherTimetableXlsx,
  slotsToSectionMeta,
  type ParseTeacherTimetableResult,
  type ParsedSlot,
} from '../utils/parseTeacherTimetableXlsx';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAcademicYear: number;
  defaultSemester: number;
  /** 업로드 성공 시(워크플로 WORK 완료 기록용) */
  onImported?: () => void;
}

/**
 * 업로드한 학기의 분반에 대응하는 `section` 행을 보장한다(없는 것만 생성).
 *
 * `section` 은 학기 키가 없는 레거시 표지만 여전히 학년/반·`section_id` 의 정본이라,
 * 새 학기에 신설된 과목의 행이 없으면 그 수업은 화면에서 학년·반을 잃고
 * `class_swap`(NOT NULL FK) 신청 자체가 불가능해진다.
 *
 * 실패해도 던지지 않는다 — 시간표 적재는 이미 끝난 뒤이고, 여기서 던지면
 * 성공한 업로드가 실패로 보인다(INSERT RLS 는 admin 전용).
 */
async function ensureSectionRows(slots: MatchedSlot[]): Promise<number> {
  interface Draft {
    grade: number;
    classNum: number;
    subjectName: string;
    times: { name: string; time: number }[];
  }

  const drafts = new Map<string, Draft>();
  for (const slot of slots) {
    if (!slot.teacher_resource_id || !slot.class_label || !slot.subject_name) continue;
    const classNum = classNumberFromLabel(slot.class_label);
    if (!classNum) continue;

    const name = teacherSectionName(slot);
    const draft =
      drafts.get(name) ??
      { grade: slot.grade, classNum: Number(classNum), subjectName: slot.subject_name, times: [] };
    draft.times.push({ name: slot.teacher_name, time: slot.day_of_week * 10 + slot.period });
    drafts.set(name, draft);
  }
  if (drafts.size === 0) return 0;

  try {
    const names = [...drafts.keys()];
    const existing = new Set<string>();
    const LOOKUP_CHUNK = 200;
    for (let i = 0; i < names.length; i += LOOKUP_CHUNK) {
      const { data, error } = await supabase
        .from('section')
        .select('name')
        .in('name', names.slice(i, i + LOOKUP_CHUNK));
      if (error) throw error;
      (data ?? []).forEach((row) => existing.add(row.name));
    }

    const rows = names
      .filter((name) => !existing.has(name))
      .map((name) => {
        const draft = drafts.get(name)!;
        return {
          name,
          meta: {
            grade: draft.grade,
            class: draft.classNum,
            subject_name: draft.subjectName,
            weekday_time: draft.times,
          },
        };
      });
    if (rows.length === 0) return 0;

    const { data, error } = await supabase.from('section').insert(rows).select('id');
    if (error) throw error;
    // RLS 차단은 오류가 아니라 0행이므로 반환 행으로 실제 반영을 확인한다.
    return data?.length ?? 0;
  } catch (err) {
    console.warn('section 행 생성 실패 (시간표 적재는 완료됨):', err);
    return 0;
  }
}

interface MatchedSlot extends ParsedSlot {
  teacher_resource_id: string | null;
  school_curriculum_id: string | null;
  course_offering_id: string | null;
  credits: number | null;
}

interface MatchSummary {
  totalSlots: number;
  teacherMatched: number;
  curriculumMatched: number;
  offeringMatched: number;
  uniqueTeachers: number;
  uniqueTeachersMatched: number;
}

export function TeacherTimetableUploadDialog({
  open,
  onOpenChange,
  onImported,
  defaultAcademicYear,
  defaultSemester,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: academicTerm } = useAcademicTerm();
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [semester, setSemester] = useState(defaultSemester);
  const [parseResult, setParseResult] = useState<ParseTeacherTimetableResult | null>(null);
  const [matched, setMatched] = useState<MatchedSlot[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [phase, setPhase] = useState<'select' | 'parsing' | 'preview' | 'saving'>('select');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase('parsing');
    setParseResult(null);
    setMatched([]);
    setSummary(null);
    try {
      const result = await parseTeacherTimetableXlsx(file);
      setParseResult(result);
      if (result.academicYear) setAcademicYear(result.academicYear);
      if (result.semester) setSemester(result.semester);

      const ay = result.academicYear ?? academicYear;
      const sem = result.semester ?? semester;
      const enriched = await matchSlots(result.slots, ay, sem);
      setMatched(enriched.matched);
      setSummary(enriched.summary);
      setPhase('preview');
    } catch (err) {
      toast({
        title: '파싱 실패',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setPhase('select');
    }
  };

  // 업로드 학기가 학사력(현행)과 같은지 — meta.section dual-write 여부를 결정한다.
  // 학사력 미설정이면 구 동작(항상 갱신)을 유지한다.
  const isCurrentTerm =
    !academicTerm ||
    (academicTerm.year === academicYear && academicTerm.semester === semester);

  const handleSave = async () => {
    if (matched.length === 0) return;
    setPhase('saving');
    setProgress({ current: 0, total: matched.length });
    // 이 학기 전체를 지우고 다시 넣는 구조라, 삭제 이후에 실패하면 **기존 시간표가
    // 이미 사라진 상태**다. 그냥 "저장 실패"만 띄우면 관리자는 아무 일도 없었다고
    // 오해하고 그대로 닫는다 — 그 순간 학기 시간표가 통째로 비어 있게 된다.
    let alreadyDeleted = false;
    try {
      // 1) Replace teacher_timetable rows for this term
      const { error: delErr } = await supabase
        .from('teacher_timetable')
        .delete()
        .eq('academic_year', academicYear)
        .eq('semester', semester);
      if (delErr) throw delErr;
      alreadyDeleted = true;

      // 2) Insert in chunks
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < matched.length; i += CHUNK) {
        const chunk = matched.slice(i, i + CHUNK).map((s) => ({
          academic_year: academicYear,
          semester,
          day_of_week: s.day_of_week,
          period: s.period,
          grade: s.grade,
          subject_name: s.subject_name,
          class_label: s.class_label,
          activity_type: s.activity_type,
          credits: s.credits,
          teacher_name: s.teacher_name,
          teacher_resource_id: s.teacher_resource_id,
          school_curriculum_id: s.school_curriculum_id,
          course_offering_id: s.course_offering_id,
          meta: { teacher_username: s.teacher_username, raw: s.raw, source: 'xlsx_teacher_timetable' },
        }));
        const { error: insErr } = await supabase.from('teacher_timetable').insert(chunk);
        if (insErr) throw insErr;
        inserted += chunk.length;
        setProgress({ current: inserted, total: matched.length });
      }

      // 3) Dual-write resource.meta.section per teacher (legacy 소비자용)
      //    교사 시간표 화면·대체 교사 조회·교체 후보는 2026-07-28 부터 teacher_timetable 을
      //    읽는다. meta.section 은 학기 필드가 없는 단일 스냅샷이라 "현행 학기"만 담을 수
      //    있으므로, 비현행 학기 업로드에서는 갱신하지 않고 보존한다.
      let metaUpdated = 0;
      if (isCurrentTerm) {
        const byTeacher = new Map<string, ParsedSlot[]>();
        for (const s of matched) {
          if (!s.teacher_resource_id) continue;
          const arr = byTeacher.get(s.teacher_resource_id) ?? [];
          arr.push(s);
          byTeacher.set(s.teacher_resource_id, arr);
        }
        for (const [resourceId, slots] of byTeacher) {
          const section = slotsToSectionMeta(slots);
          const { data: cur } = await supabase
            .from('resource').select('meta').eq('id', resourceId).single();
          const existingMeta = (cur?.meta as Record<string, unknown> | null) ?? {};
          const newMeta = { ...existingMeta, section };
          const { error: upErr } = await supabase
            .from('resource').update({ meta: newMeta }).eq('id', resourceId);
          if (upErr) throw upErr;
          metaUpdated++;
        }
      }

      // 4) 이 학기 분반의 section 행 보장
      //    section 은 학기 키가 없는 레거시 표인데 여러 기능이 여기서만 학년/반과
      //    section_id 를 얻는다(수업 교체 후보·class_swap FK·학생 명단). 새 학기에
      //    새로 생긴 과목의 행을 만들지 않으면 그 수업들은 학년·반을 잃고 교체 신청이
      //    아예 불가능해진다 — 2026-2 에서 실제로 216개 분반이 비어 있었다.
      const sectionsCreated = await ensureSectionRows(matched);

      toast({
        title: '저장 완료',
        description: [
          `${inserted}슬롯 적재`,
          isCurrentTerm
            ? `${metaUpdated}명 resource.meta.section 갱신`
            : '비현행 학기라 resource.meta.section은 보존',
          sectionsCreated > 0 ? `분반 ${sectionsCreated}건 신규 등록` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
      qc.invalidateQueries({ queryKey: ['teacher_timetable'] });
      onImported?.();
      onOpenChange(false);
      setPhase('select');
      setParseResult(null);
      setMatched([]);
      setSummary(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toast({
        title: alreadyDeleted ? '저장 실패 — 기존 시간표가 삭제된 상태입니다' : '저장 실패',
        description: alreadyDeleted
          ? `${academicYear}-${semester} 기존 시간표를 이미 지운 뒤 실패했습니다. 이 학기 시간표가 비어 있거나 일부만 남아 있으니 반드시 다시 저장해 주세요. (원인: ${reason})`
          : `기존 데이터는 그대로입니다. (원인: ${reason})`,
        variant: 'destructive',
        duration: alreadyDeleted ? 30000 : undefined,
      });
      setPhase('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle>교사 시간표 업로드</DialogTitle>
          <DialogDescription>
            교사별 주간 시간표 엑셀 파일을 등록하세요. 선택한 학년도의 학기 시간표가 새 파일의 내용으로 교체됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{academicYear}학년도 {semester}학기</strong>로 등록됩니다.
              {isCurrentTerm ? (
                <> 현재 학사력 학기이므로 교사 화면에 즉시 반영됩니다.</>
              ) : (
                <>
                  {' '}현재 학사력({academicTerm?.year}학년도 {academicTerm?.semester}학기)과 다른 학기입니다 —
                  데이터는 적재되지만 교사 화면에는 학사력을 이 학기로 바꿀 때 나타납니다.
                  현행 학기 스냅샷(resource.meta.section)은 건드리지 않습니다.
                </>
              )}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ttt-ay">운영 학년도</Label>
              <Input
                id="ttt-ay"
                type="number"
                min={2020}
                max={2040}
                value={academicYear}
                onChange={(e) => setAcademicYear(parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <Label htmlFor="ttt-sem">학기</Label>
              <Input
                id="ttt-sem"
                type="number"
                min={1}
                max={2}
                value={semester}
                onChange={(e) => setSemester(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ttt-file">xlsx 파일</Label>
            <input
              ref={fileRef}
              id="ttt-file"
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              disabled={phase === 'parsing' || phase === 'saving'}
              className="block w-full mt-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          {phase === 'parsing' && (
            <Alert><AlertDescription>파싱 및 매칭 중...</AlertDescription></Alert>
          )}

          {summary && phase === 'preview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="총 슬롯" value={summary.totalSlots} />
                <Stat label="교사 매칭" value={`${summary.uniqueTeachersMatched}/${summary.uniqueTeachers}`} ok />
                <Stat label="교과 매칭" value={`${summary.curriculumMatched}/${summary.totalSlots}`} />
                <Stat label="분반 매칭" value={`${summary.offeringMatched}/${summary.totalSlots}`} />
              </div>

              {parseResult && parseResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    파싱 경고 {parseResult.errors.length}건 (콘솔 확인)
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  저장 시 해당 학년도·학기의 기존 teacher_timetable 행을 모두 삭제 후 재삽입합니다.
                  resource.meta.section은 매칭된 교사의 기존 키를 덮어씁니다.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {phase === 'saving' && (
            <Alert>
              <AlertDescription>
                저장 중... {progress.current} / {progress.total}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={matched.length === 0 || phase !== 'preview'}>
            <Upload className="h-4 w-4 mr-2" /> 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${ok ? 'text-green-600' : ''}`}>{value}</div>
    </div>
  );
}

async function matchSlots(
  slots: ParsedSlot[],
  academicYear: number,
  semester: number
): Promise<{ matched: MatchedSlot[]; summary: MatchSummary }> {
  // 1) Teacher map: name → resource.id
  const teacherMap = new Map<string, string>();
  {
    const { data } = await supabase
      .from('resource').select('id, name, meta').eq('type', 'teacher');
    for (const r of data ?? []) {
      if (r.name) teacherMap.set(r.name.trim(), r.id);
      const email = (r.meta as { email?: string } | null)?.email;
      if (email) {
        const username = email.split('@')[0];
        if (username) teacherMap.set(`u:${username}`, r.id);
      }
    }
  }

  // 2) Curriculum map: (admission_year, semester, grade, subject) → id, credits
  const curriculumMap = new Map<string, { id: string; credits: number | null }>();
  {
    const { data } = await supabase
      .from('school_curriculum')
      .select('id, admission_year, semester, grade, subject, credits');
    for (const r of data ?? []) {
      const k = `${r.admission_year}|${r.semester}|${r.grade}|${(r.subject ?? '').trim()}`;
      curriculumMap.set(k, { id: r.id, credits: r.credits });
    }
  }

  // 3) Offering map: (ay, sem, grade, subject, class_label) → id
  // Try multiple class_label normalizations since teacher xlsx uses "3" while
  // course_offering xlsx may store "1반" or "3".
  const offeringMap = new Map<string, string>();
  const offeringKey = (ay: number, sem: number, grade: number, subject: string, label: string) =>
    `${ay}|${sem}|${grade}|${subject.trim()}|${label}`;
  const labelVariants = (raw: string | null): string[] => {
    const v = (raw ?? '').trim();
    if (!v) return [''];
    const stripped = v.replace(/반$/, '').trim();
    return Array.from(new Set([v, stripped, `${stripped}반`]));
  };
  {
    const { data } = await supabase
      .from('course_offering')
      .select('id, academic_year, semester, grade, subject_name, class_label')
      .eq('academic_year', academicYear)
      .eq('semester', semester);
    for (const r of data ?? []) {
      if (r.grade == null) continue;
      for (const variant of labelVariants(r.class_label)) {
        offeringMap.set(
          offeringKey(r.academic_year, r.semester, r.grade, r.subject_name ?? '', variant),
          r.id
        );
      }
    }
  }

  let curMatched = 0, offMatched = 0;
  const teacherSeen = new Set<string>();
  const teacherMatchedSet = new Set<string>();

  const matched: MatchedSlot[] = slots.map((s) => {
    teacherSeen.add(s.teacher_username);
    const tid =
      teacherMap.get(s.teacher_name) ??
      teacherMap.get(`u:${s.teacher_username}`) ??
      null;
    if (tid) teacherMatchedSet.add(s.teacher_username);

    const admissionYear = academicYear - s.grade + 1;
    const cKey = `${admissionYear}|${semester}|${s.grade}|${s.subject_name}`;
    const cur = curriculumMap.get(cKey) ?? null;
    if (cur) curMatched++;

    let offering: string | null = null;
    for (const variant of labelVariants(s.class_label)) {
      const oKey = offeringKey(academicYear, semester, s.grade, s.subject_name, variant);
      const hit = offeringMap.get(oKey);
      if (hit) { offering = hit; break; }
    }
    if (offering) offMatched++;

    return {
      ...s,
      teacher_resource_id: tid,
      school_curriculum_id: cur?.id ?? null,
      course_offering_id: offering,
      credits: cur?.credits ?? null,
    };
  });

  return {
    matched,
    summary: {
      totalSlots: slots.length,
      teacherMatched: matched.filter((m) => m.teacher_resource_id).length,
      curriculumMatched: curMatched,
      offeringMatched: offMatched,
      uniqueTeachers: teacherSeen.size,
      uniqueTeachersMatched: teacherMatchedSet.size,
    },
  };
}
