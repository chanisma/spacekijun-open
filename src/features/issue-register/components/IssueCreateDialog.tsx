import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Users, User, Users2 } from 'lucide-react';
import {
  isClubFormData, seedClubActivities,
  type DocType, type DocumentIssue, type ParticipantSnapshot, type VolunteerFormData,
  type ClubEntry, type ClubVolunteerFormData, type ClubScheduleEntry, type PersonalVolunteerFormData,
} from '../types';
import { useIssues } from '../hooks/useIssues';
import { useClubs, type Club, type ClubStudent } from '../hooks/useClubs';
import { useHomeroomTeachers } from '../hooks/useHomeroomTeachers';
import { VolunteerFormFields } from './VolunteerFormFields';
import { ClubFormFields, type ClubShared } from './ClubFormFields';
import { PersonalFormFields } from './PersonalFormFields';

// 교내 봉사활동 기본값: 기관·장소가 학교면 연락처도 학교 대표번호로 함께 채운다.
const SCHOOL_NAME = '샘플고등학교';
const SCHOOL_TEL = '000-0000-0032';
const EMPTY_FORM: VolunteerFormData = {
  period_start: '', period_end: undefined,
  org: SCHOOL_NAME, org_tel: SCHOOL_TEL, place: SCHOOL_NAME,
  area: '환경보호활동', content: '', scope: '정규교육과정 내', hours: 1,
};
const EMPTY_CLUB_SHARED: ClubShared = {
  scope: '정규교육과정 내', area: '동아리', org: SCHOOL_NAME, orgTel: SCHOOL_TEL, place: SCHOOL_NAME,
};
const EMPTY_PERSONAL_FORM: PersonalVolunteerFormData = {
  period_start: '', period_end: undefined,
  org: SCHOOL_NAME, org_tel: SCHOOL_TEL, place: SCHOOL_NAME,
  area: '환경보호활동', content: '', hours: 1,
  note: undefined, opinion: undefined,
  confirmer_title: '교사', confirmer_name: undefined,
};

const VOLUNTEER_CHOICES: { value: DocType; label: string; desc: string; Icon: typeof Users }[] = [
  { value: 'volunteer_class', label: '단체', desc: '여러 학생 · 확인서', Icon: Users },
  { value: 'volunteer_club', label: '동아리', desc: '동아리별 명단 자동', Icon: Users2 },
  { value: 'volunteer_personal', label: '개인', desc: '학생별 발급번호', Icon: User },
];

function clubStudentToSnapshot(s: ClubStudent): ParticipantSnapshot {
  return {
    resource_id: s.resource_id, code: s.code,
    grade: s.grade, class: s.class, number: s.number, name: s.name,
  };
}

interface Props {
  open: boolean;
  docType: DocType;
  docTypesForList: DocType[];   // invalidate 대상
  /** 새 발급 시 모달 안에서 단체/동아리/개인 선택을 허용 (봉사 페이지 전용). 편집·가정통신문은 false */
  allowVolunteerTypeChoice?: boolean;
  editing?: DocumentIssue;      // 있으면 편집 모드
  /** 반별 편집 범위 — 지정 시 그 반 명단만 수정하고 나머지 반은 보존해 통합 저장 */
  classScope?: { grade: number; cls: number };
  onClose: () => void;
  /** 신규 발급 성공 시 호출(부분 성공 포함) — 워크플로 WORK 임베드의 완료 기록용 */
  onCreated?: () => void;
}

export function IssueCreateDialog({
  open, docType, docTypesForList, allowVolunteerTypeChoice = false, editing, classScope, onClose, onCreated,
}: Props) {
  const { create, update, updateClassRoster } = useIssues(docTypesForList);
  const { clubs } = useClubs();
  // 발급할 문서 유형 — 새 봉사 발급일 때 모달 안에서 전환 가능. 편집 시 기존 유형 고정.
  const [docTypeState, setDocTypeState] = useState<DocType>(docType);
  const [title, setTitle] = useState('');
  const [issuedOn, setIssuedOn] = useState(new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState('');
  const [remarks, setRemarks] = useState('');
  const [selected, setSelected] = useState<string[]>([]);   // resource.id[]
  const [form, setForm] = useState<VolunteerFormData>(EMPTY_FORM);
  // 동아리 전용 상태
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);   // club_info.id[]
  const [clubShared, setClubShared] = useState<ClubShared>(EMPTY_CLUB_SHARED);
  const [clubSchedule, setClubSchedule] = useState<ClubScheduleEntry[]>([{ date: '', hours: 1 }]);
  // 개인봉사 전용 상태 — 여러 학생을 선택해도 저장은 학생별로 분리(같은 batch_id로 묶음)
  const [personalForm, setPersonalForm] = useState<PersonalVolunteerFormData>(EMPTY_PERSONAL_FORM);
  const { homeroomOf } = useHomeroomTeachers();

  const isClass = docTypeState === 'volunteer_class';
  const isClub = docTypeState === 'volunteer_club';
  const isPersonal = docTypeState === 'volunteer_personal';
  const needsStudents = docTypeState !== 'gajeong' && !isClub;
  // 유형 선택 칩은 새 봉사 발급일 때만 (편집 시 유형은 발급 시점에 확정되어 변경 불가)
  const showTypeChoice = allowVolunteerTypeChoice && !editing;

  // 편집 모드: 기존 값 주입 (open 토글 시)
  useEffect(() => {
    if (!open) return;
    setDocTypeState(editing ? editing.doc_type : docType);
    if (editing) {
      setTitle(editing.title);
      setIssuedOn(editing.issued_on);
      setDepartment(editing.department ?? '');
      setRemarks(editing.remarks ?? '');
      // 반별 편집이면 그 반 학생만 미리 선택, 아니면 전체
      const scoped = classScope
        ? editing.students.filter(s => s.grade === classScope.grade && s.class === classScope.cls)
        : editing.students;
      setSelected(scoped.map(s => s.resource_id));
      if (isClubFormData(editing.form_data)) {
        const fd = editing.form_data;
        setSelectedClubs(fd.clubs.map(c => c.club_id));
        setClubShared({ scope: fd.scope, area: fd.area, org: fd.org, orgTel: fd.org_tel, place: fd.place });
        setClubSchedule(fd.schedule?.length ? fd.schedule : [{ date: '', hours: 1 }]);
        setForm(EMPTY_FORM);
        setPersonalForm(EMPTY_PERSONAL_FORM);
      } else if (editing.doc_type === 'volunteer_personal') {
        setSelectedClubs([]);
        setClubShared(EMPTY_CLUB_SHARED);
        setClubSchedule([{ date: '', hours: 1 }]);
        setForm(EMPTY_FORM);
        setPersonalForm((editing.form_data as PersonalVolunteerFormData | null) ?? EMPTY_PERSONAL_FORM);
      } else {
        setSelectedClubs([]);
        setClubShared(EMPTY_CLUB_SHARED);
        setClubSchedule([{ date: '', hours: 1 }]);
        setForm(editing.form_data ?? EMPTY_FORM);
        setPersonalForm(EMPTY_PERSONAL_FORM);
      }
    } else {
      setTitle('');
      setIssuedOn(new Date().toISOString().slice(0, 10));
      setDepartment('');
      setRemarks('');
      setSelected([]);
      setForm(EMPTY_FORM);
      setPersonalForm(EMPTY_PERSONAL_FORM);
      setSelectedClubs([]);
      setClubShared(EMPTY_CLUB_SHARED);
      setClubSchedule([{ date: '', hours: 1 }]);
    }
    // classScope는 객체라 identity가 매 렌더 바뀌므로 primitive(grade/cls)로 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, docType, classScope?.grade, classScope?.cls]);

  // 선택된 학생 resource를 스냅샷으로 변환하기 위해 student 데이터 로드 (단체/개인)
  const { items: studentItems } = useResourceSelect({
    resourceType: 'student',
    includeClassGroups: isClass,
    enabled: needsStudents,
  });
  const byId = useMemo(
    () => new Map(studentItems.map(s => [s.value, s])),
    [studentItems],
  );

  const buildSnapshots = (): ParticipantSnapshot[] =>
    selected.map(id => {
      const s = byId.get(id);
      // 편집 모드에서 student 데이터가 아직 로드 안된 항목은 기존 스냅샷 유지
      const prev = editing?.students.find(p => p.resource_id === id);
      return {
        resource_id: id,
        code: s?.studentCode ?? prev?.code,
        grade: s?.studentGrade ?? prev?.grade,
        class: s?.studentClass ?? prev?.class,
        number: s?.studentNumber ?? prev?.number,
        name: s?.label ?? prev?.name ?? '',
        hours: prev?.hours ?? 1,
      };
    });

  // 개인봉사 확인자 자동 시딩: 선택된 학생들의 (학년,반)이 전부 동일하면 그 반 담임으로
  // 1회 채운다. 반이 섞여 있으면 자동 시딩하지 않고 안내만(잘못된 담임이 일괄 채워지는 것 방지).
  const selectedGradeClasses = useMemo(() => {
    const pairs = selected.map(id => {
      const s = byId.get(id);
      const prev = editing?.students.find(p => p.resource_id === id);
      return { grade: s?.studentGrade ?? prev?.grade, cls: s?.studentClass ?? prev?.class };
    });
    const uniq = new Set(pairs.map(p => `${p.grade}_${p.cls}`));
    return { pairs, uniform: uniq.size === 1 ? pairs[0] : null };
  }, [selected, byId, editing]);
  const personalConfirmerHint = isPersonal && selected.length > 1 && !selectedGradeClasses.uniform
    ? '선택한 학생들의 학년·반이 다릅니다. 확인자를 직접 입력하세요.'
    : undefined;
  useEffect(() => {
    if (!isPersonal || !open || editing) return;
    const u = selectedGradeClasses.uniform;
    if (!u || u.grade == null || u.cls == null) return;
    const homeroom = homeroomOf(u.grade, u.cls);
    // homeroomOf가 의존성에 있어야 한다: 담임 맵은 비동기 로드라 캐시 없는 첫 진입에서는
    // undefined를 돌려주는데, 의존성에서 빼면 맵 도착 후 재시도가 없어 확인자가 영영 빈다.
    // 재실행돼도 confirmer_name이 이미 있으면 건너뛰므로 사용자 입력은 덮어쓰지 않는다.
    if (homeroom) setPersonalForm(prev => (prev.confirmer_name ? prev : { ...prev, confirmer_name: homeroom }));
  }, [isPersonal, open, editing, selectedGradeClasses.uniform?.grade, selectedGradeClasses.uniform?.cls, homeroomOf]);

  const clubsById = useMemo(() => new Map(clubs.map(c => [c.id, c])), [clubs]);

  // 동아리 발급/수정: 선택 동아리들로 ClubEntry 구성. 일시(schedule)는 발급 공통 시드(선택),
  // 각 동아리 활동에 채워 넣되 기존 활동은 보존 — 봉사 내용·동아리별 일시는 대장에서 작성.
  const submitClub = async () => {
    if (selectedClubs.length === 0) { toast.error('동아리를 선택하세요'); return; }
    const cleanSchedule = clubSchedule.filter(s => s.date);   // 일시는 선택 — 동아리별로 추가 가능
    const priorClubs: ClubEntry[] = isClubFormData(editing?.form_data) ? editing!.form_data.clubs : [];
    const clubEntries: ClubEntry[] = selectedClubs.map(cid => {
      const club: Club | undefined = clubsById.get(cid);
      const prior = priorClubs.find(p => p.club_id === cid);
      const students = club ? club.students.map(clubStudentToSnapshot) : (prior?.students ?? []);
      return {
        club_id: cid,
        club_name: club?.name ?? prior?.club_name ?? '',
        teacher_name: club?.teacher_name ?? prior?.teacher_name ?? undefined,
        teacher_resource_id: club?.teacher_resource_id ?? prior?.teacher_resource_id ?? undefined,
        students,
        // 공통 일시를 활동에 시드(기존 활동·내용 보존, 없는 날짜만 추가)
        activities: seedClubActivities(prior?.activities ?? [], cleanSchedule),
      };
    });
    // 대장 표시·검색용 union 명단 (resource_id 중복 제거)
    const seen = new Set<string>();
    const unionStudents = clubEntries.flatMap(c => c.students).filter(s => {
      if (seen.has(s.resource_id)) return false;
      seen.add(s.resource_id);
      return true;
    });
    const formData: ClubVolunteerFormData = {
      kind: 'club',
      scope: clubShared.scope, area: clubShared.area,
      org: clubShared.org, org_tel: clubShared.orgTel, place: clubShared.place,
      schedule: cleanSchedule,
      clubs: clubEntries,
    };
    const autoTitle = clubEntries.length === 1
      ? `${clubEntries[0].club_name} 동아리 봉사활동`
      : `동아리 봉사활동 (${clubEntries.length}개 동아리)`;
    const patch = {
      title: autoTitle,
      issued_on: issuedOn,
      department: department || null,
      students: unionStudents,
      grade: null,
      class_number: null,
      form_data: formData,
      remarks: remarks || null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch });
      } else {
        await create.mutateAsync({ doc_type: 'volunteer_club', ...patch });
        toast.success('발급번호가 부여되었습니다. 대장에서 각 동아리 활동 내용을 작성하세요.');
        onCreated?.();
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(editing ? '수정하지 못했습니다' : '발급하지 못했습니다');
    }
  };

  // 개인봉사 신규 발급: 선택된 학생마다 별도 document_issue 행(=별도 발급번호)을 생성하되,
  // 같은 제출 묶음임을 표시하기 위해 batch_id를 공유한다. 실패한 학생만 안내(부분 실패 허용
  // — 성공분은 이미 채번되었으므로 롤백하지 않음).
  const submitPersonal = async () => {
    if (selected.length === 0) { toast.error('학생을 선택하세요'); return; }
    if (!personalForm.content.trim()) { toast.error('활동 내용을 입력하세요'); return; }

    const snapshots = buildSnapshots();
    const batchId = crypto.randomUUID();
    const results = await Promise.allSettled(
      snapshots.map(s => create.mutateAsync({
        doc_type: 'volunteer_personal',
        title: personalForm.content.trim(),
        issued_on: issuedOn,
        department: department || null,
        students: [s],
        grade: s.grade ?? null,
        class_number: s.class ?? null,
        form_data: personalForm,
        remarks: remarks || null,
        meta: { batch_id: batchId },
      })),
    );

    const failed = results
      .map((r, i) => ({ r, name: snapshots[i].name }))
      .filter((x): x is { r: PromiseRejectedResult; name: string } => x.r.status === 'rejected');

    if (failed.length === 0) {
      toast.success(`${snapshots.length}명에게 발급번호가 부여되었습니다`);
      onCreated?.();
      onClose();
    } else if (failed.length < snapshots.length) {
      toast.error(`${failed.map(f => f.name).join(', ')} 발급에 실패했습니다 (나머지는 발급됨)`);
      onCreated?.();
      onClose();
    } else {
      console.error(failed.map(f => f.r.reason));
      toast.error('발급하지 못했습니다');
    }
  };

  const handleSubmit = async () => {
    // 반별 편집(classScope): 그 반 명단만 교체. 서버 RPC가 권한(작성자/admin/담임)
    // 판정 + 다른 반 보존 머지를 원자적으로 수행 → 담임이 자기 반만 수정 가능.
    if (classScope && editing) {
      if (selected.length === 0) { toast.error('학생을 선택하세요'); return; }
      try {
        await updateClassRoster.mutateAsync({
          issueId: editing.id, grade: classScope.grade, cls: classScope.cls, students: buildSnapshots(),
        });
        onClose();
      } catch (e) {
        console.error(e);
        toast.error('수정하지 못했습니다. 권한을 확인해 주세요.');
      }
      return;
    }

    if (isClub) { await submitClub(); return; }
    if (isPersonal && !editing) { await submitPersonal(); return; }

    if (!title.trim()) { toast.error('제목/내용을 입력하세요'); return; }
    if (needsStudents && selected.length === 0) { toast.error('학생을 선택하세요'); return; }

    const students = needsStudents ? buildSnapshots() : [];
    // 대표 학년/반: 단일 학년이면 그 학년, 여러 학년이면 null (학년·반 컬럼은 명단에서 파생)
    const grades = [...new Set(students.map(s => s.grade).filter((g): g is number => g != null))];
    const repGrade = grades.length === 1 ? grades[0] : null;
    const repClass = (() => {
      const classes = [...new Set(students.filter(s => s.grade === repGrade).map(s => s.class).filter(c => c != null))];
      return classes.length === 1 ? (classes[0] as number) : null;
    })();
    const patch = {
      title: title.trim(),
      issued_on: issuedOn,
      department: department || null,
      students,
      grade: repGrade,
      class_number: repClass,
      form_data: isClass ? form : isPersonal ? personalForm : null,
      remarks: remarks || null,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch });
      } else {
        await create.mutateAsync({ doc_type: docTypeState, ...patch });
        toast.success('발급번호가 부여되었습니다');
        onCreated?.();
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(editing ? '수정하지 못했습니다' : '발급하지 못했습니다');
    }
  };

  const titleText = editing
    ? classScope ? `${classScope.grade}학년 ${classScope.cls}반 명단 수정`
      : isClub ? '동아리 봉사활동 수정' : '발급 내역 수정'
    : docTypeState === 'gajeong' ? '가정통신문 발급'
    : docTypeState === 'volunteer_personal' ? '개인 봉사활동 발급'
    : docTypeState === 'volunteer_club' ? '동아리 봉사활동 발급'
    : '단체 봉사활동 발급';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        {classScope && (
          <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
            이 반의 명단만 수정합니다. 다른 반과 발급정보는 그대로 유지됩니다.
          </p>
        )}

        <div className="space-y-3">
          {showTypeChoice && (
            <div className="grid grid-cols-3 gap-2">
              {VOLUNTEER_CHOICES.map(({ value, label, desc, Icon }) => {
                const active = docTypeState === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDocTypeState(value)}
                    aria-pressed={active}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all',
                      active
                        ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400',
                    )}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-medium', active ? 'text-brand-700' : 'text-slate-700')}>
                        {label}
                      </span>
                      <span className="block text-[11px] text-slate-400">{desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* record-level 필드(내용·날짜·부서·양식·비고)는 전체 편집/발급에서만.
              반별 편집(classScope)은 명단만 다루고 발급정보는 보존한다. */}
          {!classScope && (
            <>
              {/* 동아리는 제목(봉사활동내용) 입력 없음 — 활동 내용에 작성.
                  개인 신규 발급도 PersonalFormFields의 "활동 내용"이 제목을 대신한다(중복 입력 방지).
                  개인 편집은 단일 행 title을 그대로 쓰므로 노출 유지. */}
              {!isClub && !(isPersonal && !editing) && (
                <div><Label>{docTypeState === 'gajeong' ? '제목' : '봉사활동내용'}</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} /></div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{docTypeState === 'gajeong' ? '발급일' : '제출일자'}</Label>
                  <Input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} />
                  {(isClass || isClub || isPersonal) && (
                    <p className="mt-1 text-[11px] text-slate-400">확인서 하단 날짜로 들어갑니다</p>
                  )}
                </div>
                <div><Label>활동담당부서</Label>
                  <Input value={department} onChange={e => setDepartment(e.target.value)} /></div>
              </div>
            </>
          )}

          {/* 동아리: 동아리 선택 + 공통 양식 (활동 내용은 대장에서 작성) */}
          {isClub && !classScope && (
            <ClubFormFields
              clubs={clubs}
              selectedClubs={selectedClubs}
              onSelectedClubsChange={setSelectedClubs}
              shared={clubShared}
              onSharedChange={patch => setClubShared(prev => ({ ...prev, ...patch }))}
              schedule={clubSchedule}
              onScheduleChange={setClubSchedule}
            />
          )}

          {needsStudents && (
            <div>
              <Label>
                {classScope ? `${classScope.grade}학년 ${classScope.cls}반 명단`
                  : isClass ? '참여자 명단 (학생 다수)'
                  : isPersonal && !editing ? '대상 학생 (다중 선택 가능 — 학생별로 발급번호가 부여됩니다)'
                  : '대상 학생'}
              </Label>
              <SearchableMultiSelect
                selectedValues={selected}
                onSelectionChange={
                  (isClass || (isPersonal && !editing)) ? setSelected : (v) => setSelected(v.slice(-1))
                }
                filterByStudent
                enableClassSearch={isClass}
                placeholder={isClass ? '#학년 #반 또는 이름 검색' : '학생 이름 검색'}
                searchPlaceholder="이름 또는 #2학년 #3반"
              />
            </div>
          )}

          {isClass && !classScope && <VolunteerFormFields value={form} onChange={setForm} />}
          {isPersonal && !classScope && (
            <PersonalFormFields
              value={personalForm}
              onChange={setPersonalForm}
              confirmerHint={personalConfirmerHint}
            />
          )}

          {!classScope && (
            <div><Label>비고</Label>
              <Input value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending || updateClassRoster.isPending}>
            {editing ? '저장' : '발급'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
