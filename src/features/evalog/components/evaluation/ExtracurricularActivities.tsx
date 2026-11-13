import React from 'react';
import { Student } from '../../types';
import { Calendar, Clock, MapPin, Activity, BookOpen, User, Sparkles, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateByteSize, extractRealContent } from '../../utils/textUtils';
import BlurredContent from '../ui/BlurredContent';
import type { EvalogGranularPermissions } from '../../types/permissions';
import { useActivitySegmentation, findSegmentation, type SegmentationRecord } from '../../hooks/useActivitySegmentation';
import ActivitySegmentationDialog from './ActivitySegmentationDialog';
import SegmentedContent from './SegmentedContent';

interface ExtracurricularActivitiesProps {
  student: Student;
  permissions: EvalogGranularPermissions;
}

/** 서랍 열림 상태 저장 키. 학생과 무관하게 유지한다 — 관심 영역은 학생을 바꿔도 대개 같다. */
const SECTION_STATE_KEY = 'evalog-extracurricular-sections-v1';
/** 전체 접기/펼치기 대상. 아래 `Section title=`과 문자열이 일치해야 한다. */
const SECTION_TITLES = [
  '출결상황', '행동특성 및 종합의견', '진로활동', '자율활동', '동아리활동',
  '세부능력 및 특기사항', '봉사활동',
] as const;

/**
 * 영역별 서랍. 비교과는 7개 영역이 세로로 길게 늘어서 원하는 영역을 찾으려면
 * 계속 스크롤해야 했다. 접을 수 있게 해 필요한 것만 편다.
 *
 * **모듈 레벨에 둔다.** 컴포넌트 안에서 정의하면 렌더마다 타입이 새로 만들어져
 * 서랍 하나를 접을 때 7개 영역 전체가 리마운트된다. 같은 feature의
 * `GradeAnalysis.CollapsibleSection`도 같은 이유로 바깥에 있다.
 */
const SectionShell: React.FC<{
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}> = ({ title, icon: Icon, children, className, count, open, onToggle }) => (
  <div className={cn('glass-panel p-5', className)}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn('w-full flex items-center gap-2 text-left', open && 'mb-4 pb-2 border-b border-gray-100/50')}
    >
      <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
        <Icon size={18} />
      </div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {/* 접힌 상태에서도 안에 무엇이 얼마나 있는지는 보여야 편다/만다를 정할 수 있다. */}
      {typeof count === 'number' && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium">
          {count}
        </span>
      )}
      <ChevronDown size={16} className={cn('ml-auto text-slate-400 transition-transform', !open && '-rotate-90')} />
    </button>
    {open && children}
  </div>
);

const ExtracurricularActivities: React.FC<ExtracurricularActivitiesProps> = ({ student, permissions }) => {

  const canView = (key: 'attendance' | 'autonomy' | 'club' | 'career_activity' | 'volunteer' | 'behavior') =>
    permissions[key];
  const canViewSeteuk = (subjectGroup: string) =>
    permissions.canViewSeteuk(subjectGroup);

  // 활동 분절(연구 §6·§14). 분석된 기록에만 배지가 붙고, 없으면 화면은 이전 그대로다.
  const { data: segMap } = useActivitySegmentation(student.studentId);
  const [selected, setSelected] = React.useState<{ record: SegmentationRecord; heading: string } | null>(null);
  // 본문 하이라이트 on/off. 분절이 없는 학생에게는 토글 자체를 띄우지 않는다.
  const [highlight, setHighlight] = React.useState(true);
  const hasSegmentation = !!segMap && segMap.size > 0;

  // 영역별 서랍의 열림 상태. 키는 섹션 제목이라 영역이 늘어도 그대로 동작한다.
  // 저장에 실패해도(사파리 프라이빗 등) 화면은 정상 동작해야 하므로 전부 감싼다.
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SECTION_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const writeSections = (next: Record<string, boolean>) => {
    setOpenSections(next);
    try { localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(next)); } catch { /* 저장 실패는 무시 */ }
  };
  const toggleSection = (title: string) =>
    writeSections({ ...openSections, [title]: !(openSections[title] ?? true) });
  // 전체 토글은 **현재 화면에 있는 영역만** 대상으로 한다(학생마다 영역 구성이 다르다).
  const setAllSections = (open: boolean) =>
    writeSections(Object.fromEntries(SECTION_TITLES.map((t) => [t, open])));
  const allCollapsed = SECTION_TITLES.every((t) => (openSections[t] ?? true) === false);

  /**
   * 기록 내용으로 분절을 찾아 배지를 낸다. 없으면 아무것도 렌더하지 않는다 —
   * 미분석 기록에 빈 배지를 두면 "분석했는데 활동이 0개"와 구분이 안 된다.
   */
  const SegBadge: React.FC<{ content: string | null | undefined; heading: string }> = ({ content, heading }) => {
    const rec = findSegmentation(segMap, content);
    if (!rec) return null;
    const n = rec.segmentation.activities.length;
    return (
      <button
        type="button"
        onClick={() => setSelected({ record: rec, heading })}
        title="이 기록에 담긴 활동을 나눠서 봅니다"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 text-[10px] font-medium hover:bg-brand-100 hover:border-brand-300 transition-colors"
      >
        <Sparkles size={11} />
        활동 {n}개
      </button>
    );
  };

  /**
   * 본문. 분절이 있고 하이라이트가 켜져 있으면 활동별로 칠하고, 아니면 원문 그대로다.
   * 조각을 이어 붙이면 원문과 정확히 같으므로(계약) 켜고 꺼도 글이 달라지지 않는다.
   */
  const RecordBody: React.FC<{ content: string; heading: string; className?: string }> = ({ content, heading, className }) => {
    const rec = findSegmentation(segMap, content);
    return (
      <SegmentedContent
        content={content}
        segmentation={rec?.segmentation}
        enabled={highlight}
        className={className}
        onActivityClick={rec ? () => setSelected({ record: rec, heading }) : undefined}
      />
    );
  };


  /** 호출부를 그대로 두기 위한 얇은 래퍼. 실제 렌더는 모듈 레벨 `SectionShell`이 한다. */
  const Section = (props: { title: string; icon: LucideIcon; children: React.ReactNode; className?: string; count?: number }) => (
    <SectionShell
      {...props}
      open={openSections[props.title] ?? true}
      onToggle={() => toggleSection(props.title)}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 -mb-2 flex-wrap">
        {hasSegmentation && (
          <>
            <span className="text-[11px] text-slate-400 mr-auto">
              기록 안의 탐구 활동을 색으로 구분합니다
            </span>
            <button
              type="button"
              onClick={() => setHighlight((v) => !v)}
              aria-pressed={highlight}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors',
                highlight
                  ? 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
              )}
            >
              <Sparkles size={12} />
              활동 하이라이트 {highlight ? '켬' : '끔'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setAllSections(allCollapsed)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-500 text-[11px] font-medium hover:bg-slate-50 transition-colors"
        >
          {allCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
          {allCollapsed ? '전체 펼치기' : '전체 접기'}
        </button>
      </div>

      {/* 학적사항 - Removed as it's no longer in student object directly.
          If strictly needed, it should be derived from header or other sections. 
          For now, hiding it to fix build error. */}
      {/* 
      {student.academicStatusHistory && ... } 
      */}

      {/* 출결상황 */}
      {(student.section2_attendance && student.section2_attendance.length > 0) && (() => {
        const attendanceData: any[] = student.section2_attendance;

        return (
          <Section title="출결상황" icon={Clock} count={attendanceData.length}>
            {canView('attendance') ? (
            <div className="overflow-hidden rounded-xl border border-gray-100 shadow-sm bg-white/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                    <th className="p-3 text-center font-medium" rowSpan={2}>학년</th>
                    <th className="p-3 text-center font-medium" rowSpan={2}>수업일수</th>
                    <th className="p-3 text-center font-medium border-l border-gray-100" colSpan={3}>결석</th>
                    <th className="p-3 text-center font-medium border-l border-gray-100" colSpan={3}>지각</th>
                    <th className="p-3 text-center font-medium border-l border-gray-100" colSpan={3}>조퇴</th>
                    <th className="p-3 text-center font-medium border-l border-gray-100" colSpan={3}>결과</th>
                    <th className="p-3 text-center font-medium border-l border-gray-100" rowSpan={2}>특기사항</th>
                  </tr>
                  <tr className="bg-slate-50/50 border-b border-gray-100 text-slate-400">
                    <th className="py-2 text-center font-normal border-l border-gray-100">질병</th>
                    <th className="py-2 text-center font-normal">미인정</th>
                    <th className="py-2 text-center font-normal">기타</th>
                    <th className="py-2 text-center font-normal border-l border-gray-100">질병</th>
                    <th className="py-2 text-center font-normal">미인정</th>
                    <th className="py-2 text-center font-normal">기타</th>
                    <th className="py-2 text-center font-normal border-l border-gray-100">질병</th>
                    <th className="py-2 text-center font-normal">미인정</th>
                    <th className="py-2 text-center font-normal">기타</th>
                    <th className="py-2 text-center font-normal border-l border-gray-100">질병</th>
                    <th className="py-2 text-center font-normal">미인정</th>
                    <th className="py-2 text-center font-normal">기타</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {attendanceData.map((record: any, idx: number) => (
                    <tr key={idx} className="hover:bg-brand-50/30 transition-colors">
                      <td className="p-3 text-center font-semibold text-brand-600">{record.grade}학년</td>
                      <td className="p-3 text-center text-slate-600">{record.schoolDays}</td>
                      {/* 결석 */}
                      <td className="p-3 text-center text-slate-500 border-l border-gray-100/50">{record.absence?.disease ?? (record.absenceDays || 0)}</td>
                      <td className={`p-3 text-center font-medium ${record.absence?.unapproved > 0 ? 'text-red-500' : 'text-slate-300'}`}>{record.absence?.unapproved ?? 0}</td>
                      <td className="p-3 text-center text-slate-300">{record.absence?.other ?? 0}</td>
                      {/* 지각 */}
                      <td className="p-3 text-center text-slate-500 border-l border-gray-100/50">{record.tardiness?.disease ?? (record.late || 0)}</td>
                      <td className={`p-3 text-center font-medium ${record.tardiness?.unapproved > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{record.tardiness?.unapproved ?? 0}</td>
                      <td className="p-3 text-center text-slate-300">{record.tardiness?.other ?? 0}</td>
                      {/* 조퇴 */}
                      <td className="p-3 text-center text-slate-500 border-l border-gray-100/50">{record.earlyLeave?.disease ?? 0}</td>
                      <td className={`p-3 text-center font-medium ${record.earlyLeave?.unapproved > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{record.earlyLeave?.unapproved ?? 0}</td>
                      <td className="p-3 text-center text-slate-300">{record.earlyLeave?.other ?? 0}</td>
                      {/* 결과 */}
                      <td className="p-3 text-center text-slate-500 border-l border-gray-100/50">{record.classSkip?.disease ?? 0}</td>
                      <td className={`p-3 text-center font-medium ${record.classSkip?.unapproved > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{record.classSkip?.unapproved ?? 0}</td>
                      <td className="p-3 text-center text-slate-300">{record.classSkip?.other ?? 0}</td>
                      {/* 특기사항 */}
                      <td className="p-3 text-slate-600 border-l border-gray-100/50">{record.notes || record.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <BlurredContent message="출결상황 열람 권한이 없습니다" />
            )}
          </Section>
        );
      })()}

      {/* 행동특성 및 종합의견 */}
      {(student.section8_behavior_characteristics && student.section8_behavior_characteristics.length > 0) && (() => {
        const behaviors = student.section8_behavior_characteristics;

        return (
          <Section title="행동특성 및 종합의견" icon={User} count={behaviors.length}>
            <div className="grid gap-4">
              {[1, 2, 3].map(grade => {
                const gradeRecord = behaviors.find((r: any) => r.grade === grade);
                if (!gradeRecord) return null;
                const realContent = extractRealContent(gradeRecord.content);
                if (!realContent?.trim()) return null;

                const byteSize = calculateByteSize(realContent);

                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold shadow-sm border border-amber-200">
                        {grade}
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">학년</span>
                    </div>
                    <div className="flex-1 bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2 text-xs items-center">
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md">{byteSize}바이트</span>
                          <SegBadge content={gradeRecord.content} heading={`${grade}학년 행동특성 및 종합의견`} />
                        </div>
                      </div>
                      {canView('behavior') ? (
                        <RecordBody
                          content={realContent}
                          heading={`${grade}학년 행동특성 및 종합의견`}
                          className="text-sm text-slate-700 leading-relaxed font-normal"
                        />
                      ) : (
                        <BlurredContent message="행동특성 열람 권한이 없습니다" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        );
      })()}

      {/* 진로활동 */}
      {((student.section5_creative_activities)) && (() => {
        const activities = student.section5_creative_activities
          ? student.section5_creative_activities.filter((a: any) => a.type === '진로활동')
          : [];

        if (activities.length === 0) return null;

        return (
          <Section title="진로활동" icon={MapPin} count={activities.length}>
            <div className="grid gap-4">
              {[1, 2, 3].map(grade => {
                const gradeActivities = activities.filter((a: any) => a.grade === grade);
                if (gradeActivities.length === 0) return null;
                const activity = gradeActivities[0];
                const realContent = extractRealContent(activity.content);
                if (!realContent?.trim()) return null;
                const byteSize = calculateByteSize(realContent);
                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shadow-sm border border-emerald-200">
                        {grade}
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">학년</span>
                    </div>
                    <div className="flex-1 bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2 text-xs flex-wrap items-center">
                          {activity.hours && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">{activity.hours}시간</span>}
                          {activity.field && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100 font-medium">{activity.field}</span>}
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md">{byteSize}바이트</span>
                          <SegBadge content={activity.content} heading={`${grade}학년 진로활동`} />
                        </div>
                      </div>
                      {canView('career_activity') ? (
                        <RecordBody
                          content={realContent}
                          heading={`${grade}학년 진로활동`}
                          className="text-sm text-slate-700 leading-relaxed font-normal"
                        />
                      ) : (
                        <BlurredContent message="진로활동 열람 권한이 없습니다" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* 자율활동 */}
      {((student.section5_creative_activities)) && (() => {
        const activities = student.section5_creative_activities
          ? student.section5_creative_activities.filter((a: any) => a.type === '자율활동')
          : [];

        if (activities.length === 0) return null;

        return (
          <Section title="자율활동" icon={Activity} count={activities.length}>
            <div className="grid gap-4">
              {[1, 2, 3].map(grade => {
                const gradeActivities = activities.filter((a: any) => a.grade === grade);
                if (gradeActivities.length === 0) return null;
                const activity = gradeActivities[0];
                const realContent = extractRealContent(activity.content);
                if (!realContent?.trim()) return null;
                const byteSize = calculateByteSize(realContent);
                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shadow-sm border border-brand-200">
                        {grade}
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">학년</span>
                    </div>
                    <div className="flex-1 bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2 text-xs items-center">
                          {activity.hours && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">{activity.hours}시간</span>}
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md">{byteSize}바이트</span>
                          <SegBadge content={activity.content} heading={`${grade}학년 자율활동`} />
                        </div>
                      </div>
                      {canView('autonomy') ? (
                        <RecordBody
                          content={realContent}
                          heading={`${grade}학년 자율활동`}
                          className="text-sm text-slate-700 leading-relaxed font-normal"
                        />
                      ) : (
                        <BlurredContent message="자율활동 열람 권한이 없습니다" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* 동아리활동 */}
      {((student.section5_creative_activities)) && (() => {
        const activities = student.section5_creative_activities
          ? student.section5_creative_activities.filter((a: any) => a.type === '동아리활동')
          : [];

        if (activities.length === 0) return null;

        return (
          <Section title="동아리활동" icon={User} count={activities.length}>
            <div className="grid gap-4">
              {[1, 2, 3].map(grade => {
                const gradeActivities = activities.filter((a: any) => a.grade === grade);
                if (gradeActivities.length === 0) return null;
                const activity = gradeActivities[0];
                const realContent = extractRealContent(activity.content);
                if (!realContent?.trim()) return null;
                const byteSize = calculateByteSize(realContent);
                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold shadow-sm border border-violet-200">
                        {grade}
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">학년</span>
                    </div>
                    <div className="flex-1 bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2 text-xs items-center">
                          {activity.hours && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">{activity.hours}시간</span>}
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md">{byteSize}바이트</span>
                          <SegBadge content={activity.content} heading={`${grade}학년 동아리활동`} />
                        </div>
                      </div>
                      {canView('club') ? (
                        <RecordBody
                          content={realContent}
                          heading={`${grade}학년 동아리활동`}
                          className="text-sm text-slate-700 leading-relaxed font-normal"
                        />
                      ) : (
                        <BlurredContent message="동아리활동 열람 권한이 없습니다" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* 세부능력 및 특기사항 */}
      {(student.section6_academic_development && student.section6_academic_development.length > 0) && (() => {
        const allSubjects = student.section6_academic_development;

        // 3학년 2학기 제외
        const subjects = allSubjects.filter((s: any) => !(s.grade === 3 && s.semester === 2));

        // 학년별로 그룹화
        const groupedByGrade: Record<string, any[]> = {};
        subjects.forEach((subject: any) => {
          const grade = subject.grade?.toString() || subject.semester?.split('-')[0];
          if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
          groupedByGrade[grade].push(subject);
        });

        return (
          <Section title="세부능력 및 특기사항" icon={BookOpen} count={allSubjects.length}>
            <div className="space-y-6">
              {['1', '2', '3'].map(grade => {
                const gradeSubjectsRaw = groupedByGrade[grade];
                if (!gradeSubjectsRaw || gradeSubjectsRaw.length === 0) return null;

                // [Fix] 동일 과목(1학기/2학기) 병합 로직
                const mergedSubjectsMap = new Map<string, any>();

                gradeSubjectsRaw.forEach((subject: any) => {
                  const subjectName = subject.subject;
                  const rawContent = subject.content || subject.remarks || '';
                  const content = extractRealContent(rawContent);

                  if (!content.trim()) return; // 내용이 없으면 스킵 (선택사항)

                  if (mergedSubjectsMap.has(subjectName)) {
                    const existing = mergedSubjectsMap.get(subjectName);
                    // 내용 병합 (줄바꿈 구분)
                    if (content !== existing.content) {
                      // 중복 내용 방지 (혹시나해서)
                      existing.content = existing.content + '\n' + content;
                    }
                    // 바이트 사이즈 재계산 등을 위해 업데이트
                  } else {
                    // 깊은 복사 or 새 객체 생성하여 원본 보존
                    mergedSubjectsMap.set(subjectName, {
                      ...subject,
                      content: content
                    });
                  }
                });

                const gradeSubjects = Array.from(mergedSubjectsMap.values());

                if (gradeSubjects.length === 0) return null;

                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-12 pt-2 text-center hidden sm:block">
                      <div className="h-full w-0.5 bg-gray-200 mx-auto relative">
                        <span className="absolute top-0 left-1/2 -translate-x-1/2 bg-white border-2 border-gray-200 text-gray-400 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                          {grade}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-1 gap-3">
                      <h4 className="text-sm font-semibold text-slate-500 pl-1 mb-1 block sm:hidden">{grade}학년</h4>
                      {gradeSubjects.map((subject: any, idx: number) => {
                        const content = subject.content;
                        const byteSize = calculateByteSize(content);

                        return (
                          <div key={`${grade}-${idx}`} className="bg-white/70 p-4 rounded-xl border border-white/60 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium border border-slate-200">
                                  {subject.subject_group || subject.category}
                                </span>
                                <span className="text-sm font-bold text-slate-800">
                                  {subject.subject}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <SegBadge content={content} heading={`${grade}학년 ${subject.subject}`} />
                                <span className="text-[10px] text-slate-300 font-mono group-hover:text-slate-400 transition-colors">{byteSize}B</span>
                              </div>
                            </div>
                            {canViewSeteuk(subject.subject_group || subject.category || '') ? (
                              <RecordBody
                                content={content}
                                heading={`${grade}학년 ${subject.subject}`}
                                className="text-sm text-slate-600 leading-relaxed font-normal"
                              />
                            ) : (
                              <BlurredContent message="세특 열람 권한이 없습니다" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        );
      })()}

      {/* 봉사활동 */}
      {(student.volunteer_activities && student.volunteer_activities.length > 0) && (() => {
        const activities = student.volunteer_activities;

        // 학년별로 그룹화
        const groupedByGrade: Record<number, any[]> = {};
        activities.forEach((activity: any) => {
          if (!groupedByGrade[activity.grade]) groupedByGrade[activity.grade] = [];
          groupedByGrade[activity.grade].push(activity);
        });

        // 전체 누계 시간
        const totalHours = activities.reduce((sum: number, a: any) => sum + a.hours, 0);

        return (
          <Section title="봉사활동" icon={Activity} count={activities.length}>
            <div className="grid gap-6">
              {[1, 2, 3].map(grade => {
                const gradeActivities = groupedByGrade[grade];
                if (!gradeActivities || gradeActivities.length === 0) return null;

                return (
                  <div key={grade} className="flex gap-4">
                    <div className="flex-shrink-0 w-16 pt-2 text-center">
                      <div className="w-10 h-10 mx-auto rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold shadow-sm border border-orange-200">
                        {grade}
                      </div>
                      <span className="text-xs text-slate-500 mt-1 block">학년</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      {gradeActivities.map((activity: any, idx: number) => (
                        <div key={idx} className="bg-white/60 p-3 rounded-xl border border-white/50 shadow-sm flex items-start sm:items-center gap-3 flex-col sm:flex-row">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                              <Calendar size={14} />
                            </div>
                            <span className="text-xs font-medium text-slate-700">{activity.dateOrPeriod}</span>
                          </div>
                          {canView('volunteer') ? (
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-slate-800">{activity.institution || activity.place || '장소 없음'}</div>
                              <div className="text-xs text-slate-600 mt-0.5">{activity.activity || extractRealContent(activity.content)}</div>
                            </div>
                          ) : (
                            <div className="flex-1">
                              <BlurredContent message="봉사활동 열람 권한이 없습니다" className="py-3" />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100">{activity.hours}시간</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-end pt-4 border-t border-dashed border-gray-200">
                <div className="flex items-center gap-3 bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
                  <span className="text-sm text-brand-700">전체 누계 시간</span>
                  <span className="text-xl font-bold text-brand-600">{totalHours}시간</span>
                </div>
              </div>
            </div>
          </Section>
        );
      })()}

      <ActivitySegmentationDialog
        record={selected?.record ?? null}
        heading={selected?.heading}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </div>
  );
};

export default ExtracurricularActivities;
