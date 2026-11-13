// ========================================
// 활동 상세
//
// 탭 3종(Phase 1): 개요 / 참여자 / 계보.
// 성찰·회고 탭은 Phase 2~3에서 붙는다.
//
// 계보 탭이 이 모달의 주장이다 — 활동이 해마다 어떻게 이어지고 갈라졌는지
// 보여주는 자리이며, 그것이 "발전시켜 나간다"의 증거다.
// ========================================

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  Building2,
  CalendarDays,
  ClipboardList,
  CornerDownRight,
  GitBranch,
  Loader2,
  MapPin,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useActivityParticipants, useLineageNodes } from '../hooks/useActivities';
import { useActivityPosts } from '../hooks/useActivityPosts';
import { ActivityPostPanel } from './ActivityPostPanel';
import { notifyReflectionRequested } from '../services/activityNotificationService';
import {
  buildLineageIndex,
  buildLineageTree,
  findLineageRoot,
  type LineageTreeNode,
} from '../utils/lineage';
import { budgetPerParticipant, countedParticipants } from '../utils/hours';
import {
  formatActivityPeriod,
  getAreaGroup,
  getAreaGroupLabel,
  getAreaGroupTone,
  getBudgetSourceLabel,
  getHostKindLabel,
  getOperatorLabel,
  getParticipationRoleLabel,
  getParticipationStatusLabel,
  getScaleLabel,
  getStatusClass,
  getStatusLabel,
  getTeacherRoleLabel,
} from '../utils/activityLabels';
import type { ActivityWithContext } from '../types';

interface ActivityDetailDialogProps {
  activity: ActivityWithContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onEdit: (activity: ActivityWithContext) => void;
  onDelete: (activity: ActivityWithContext) => void;
  isDeleting?: boolean;
  /** 로그인한 사용자가 학생이면 학생코드 */
  myStudentCode?: string | null;
  /** 현재 사용자 profiles.id — 내 글 판정용 */
  myProfileId?: string | null;
  /** '이 활동 이어가기' — 제안 폼을 이 활동을 계보 부모로 열어 준다 */
  onContinue?: (activity: ActivityWithContext) => void;
}

export function ActivityDetailDialog({
  activity,
  open,
  onOpenChange,
  canManage,
  onEdit,
  onDelete,
  isDeleting,
  myStudentCode = null,
  myProfileId = null,
  onContinue,
}: ActivityDetailDialogProps) {
  const [tab, setTab] = useState('overview');
  const [requesting, setRequesting] = useState(false);
  const { data: participants = [], isLoading: participantsLoading } = useActivityParticipants(
    open && activity ? activity.id : null
  );
  const { data: lineageNodes = [] } = useLineageNodes();
  const { data: posts = [] } = useActivityPosts(open && activity ? activity.id : null);

  const lineage = useMemo(() => {
    if (!activity) return null;
    const index = buildLineageIndex(lineageNodes);
    const root = findLineageRoot(activity.id, index);
    if (!root) return null;
    return { tree: buildLineageTree(root.id, index), index };
  }, [activity, lineageNodes]);

  if (!activity) return null;

  const areaGroup = getAreaGroup(activity.area);
  const tone = getAreaGroupTone(areaGroup);
  const counted = countedParticipants(participants);
  const perHead = budgetPerParticipant(activity.budget_spent ?? activity.budget_planned, counted);
  const hasLineage = (lineage?.tree?.children.length ?? 0) > 0 || activity.lineage_generation >= 2;
  // 성찰 작성 가능 여부는 서버 RLS와 같은 조건(그 활동의 참여자인가)으로 판정한다.
  const isParticipant = !!myStudentCode && participants.some((p) => p.student_code === myStudentCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-2">
            <TitleIconChip icon={Sparkles} tone="indigo" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', tone.chip)}>
                  {getAreaGroupLabel(areaGroup)}
                </Badge>
                {activity.hosts.map((h) => (
                  <span key={h.id} className="text-[11px] text-slate-500">
                    <span className="text-slate-400">[{getHostKindLabel(h.kind)}]</span> {h.name}
                    {h.role === 'primary' && activity.hosts.length > 1 && (
                      <span className="ml-0.5 text-[9px] text-slate-400">대표</span>
                    )}
                  </span>
                ))}
                {activity.lineage_generation >= 2 && (
                  <span className="rounded border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                    {activity.lineage_generation}년째
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={cn('h-5 px-1.5 text-[10px]', getStatusClass(activity.status))}
                >
                  {getStatusLabel(activity.status)}
                </Badge>
              </div>
              <DialogTitle className="break-words text-base leading-snug">
                {activity.name}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-4 sm:px-6">
            <TabsList className="h-9 bg-transparent p-0">
              <TabsTrigger value="overview" className="h-8 text-xs">
                개요
              </TabsTrigger>
              <TabsTrigger value="participants" className="h-8 gap-1 text-xs">
                참여자
                {/* 세지 않았으면(학생 시점) 숫자를 적지 않는다 — 탭은 남긴다. */}
                {activity.participant_count != null && (
                  <span className="tabular-nums text-slate-400">{activity.participant_count}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="posts" className="h-8 gap-1 text-xs">
                기록·성찰
                {posts.length > 0 && (
                  <span className="tabular-nums text-slate-400">{posts.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="lineage" className="h-8 gap-1 text-xs">
                계보
                {hasLineage && <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" />}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-h-[calc(92vh-14rem)] overflow-y-auto px-4 py-4 sm:px-6">
            {/* ── 개요 ── */}
            <TabsContent value="overview" className="mt-0 space-y-5">
              {activity.content && (
                <section className="space-y-1.5">
                  <SectionLabel icon={ClipboardList}>내용</SectionLabel>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {activity.content}
                  </p>
                </section>
              )}

              <section className="space-y-2">
                <SectionLabel icon={CalendarDays}>언제 · 어디서</SectionLabel>
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <Field icon={CalendarDays} label="기간">
                    {formatActivityPeriod(activity.starts_on, activity.ends_on)}
                    <span className="ml-1.5 text-xs text-slate-400">
                      {activity.academic_year}학년도
                      {activity.semester ? ` ${activity.semester}학기` : ' 연간'}
                    </span>
                  </Field>
                  {activity.place && (
                    <Field icon={MapPin} label="장소">
                      {activity.place}
                    </Field>
                  )}
                  <Field icon={Users} label="규모">
                    {getScaleLabel(activity.scale)}
                  </Field>
                </dl>
              </section>

              <section className="space-y-2">
                <SectionLabel icon={Wallet}>운영 · 예산</SectionLabel>
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <Field icon={Building2} label="운영 주체">
                    {getOperatorLabel(activity.operator_type)}
                    {activity.operator_name && (
                      <span className="ml-1.5 text-xs text-slate-500">{activity.operator_name}</span>
                    )}
                  </Field>
                  <Field icon={Wallet} label="예산 출처">
                    {getBudgetSourceLabel(activity.budget_source)}
                    {activity.budget_program && (
                      <span className="ml-1.5 text-xs text-slate-500">{activity.budget_program}</span>
                    )}
                  </Field>
                  {activity.budget_planned != null && (
                    <Field icon={Wallet} label="계획 예산">
                      <span className="tabular-nums">
                        {activity.budget_planned.toLocaleString()}원
                      </span>
                    </Field>
                  )}
                  {activity.budget_spent != null && (
                    <Field icon={Wallet} label="집행 예산">
                      <span className="tabular-nums">
                        {activity.budget_spent.toLocaleString()}원
                      </span>
                      {/* 참여자 0명이면 1인당을 계산하지 않는다 — 0원으로 찍으면 '무료'로 오독된다 */}
                      {perHead !== null && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          1인당 {perHead.toLocaleString()}원
                        </span>
                      )}
                    </Field>
                  )}
                </dl>
              </section>

              {(activity.keywords.length > 0 ||
                activity.related_subjects.length > 0 ||
                activity.career_fields.length > 0) && (
                <section className="space-y-2">
                  <SectionLabel icon={ClipboardList}>분류</SectionLabel>
                  <div className="space-y-1.5 text-sm">
                    {activity.keywords.length > 0 && (
                      <TagRow label="키워드" values={activity.keywords} prefix="#" />
                    )}
                    {activity.related_subjects.length > 0 && (
                      <TagRow label="연계 교과" values={activity.related_subjects} />
                    )}
                    {activity.career_fields.length > 0 && (
                      <TagRow label="진로·분야" values={activity.career_fields} />
                    )}
                  </div>
                </section>
              )}

              {activity.teachers.length > 0 && (
                <section className="space-y-2">
                  <SectionLabel icon={Users}>담당 교사</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {activity.teachers.map((t) => (
                      <span
                        key={t.resource_id}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                      >
                        {t.name || '(이름 없음)'}
                        <span className="text-[10px] text-slate-400">
                          {getTeacherRoleLabel(t.role)}
                        </span>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            {/* ── 참여자 ── */}
            <TabsContent value="participants" className="mt-0 space-y-3">
              {participantsLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : participants.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="아직 참여자가 없습니다"
                  hint={
                    canManage
                      ? '활동 수정에서 참여 학생을 등록하면 여기에 시수와 함께 남습니다.'
                      : '담당 선생님이 참여자를 등록하면 표시됩니다.'
                  }
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs tabular-nums text-slate-600">
                    <span>
                      집계 참여 <b className="text-slate-800">{counted}</b>명
                    </span>
                    {participants.length !== counted && (
                      <span className="text-slate-400">
                        (신청·이탈 {participants.length - counted}명 제외)
                      </span>
                    )}
                    {/* 성찰 요청 — 학생은 요청이 없으면 이 기능의 존재를 모른다(루프 A의 시작) */}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 gap-1 px-2 text-[11px] text-slate-500 hover:text-fuchsia-700"
                        disabled={requesting}
                        onClick={async () => {
                          setRequesting(true);
                          try {
                            const ids = participants
                              .map((p) => p.student_resource_id)
                              .filter((v): v is string => !!v);
                            const sent = await notifyReflectionRequested({
                              activityId: activity.id,
                              activityName: activity.name,
                              studentResourceIds: ids,
                            });
                            toast.success(`${sent}명에게 성찰을 요청했습니다.`);
                          } finally {
                            setRequesting(false);
                          }
                        }}
                      >
                        {requesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        성찰 요청
                      </Button>
                    )}
                  </div>

                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                    {participants.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        <span className="w-12 shrink-0 tabular-nums text-xs text-slate-400">
                          {p.grade && p.class_num ? `${p.grade}-${p.class_num}` : '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={p.student_name ?? p.student_code}>
                          {p.student_name ?? p.student_code}
                        </span>
                        {p.role !== 'member' && (
                          <Badge
                            variant="outline"
                            className="h-5 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700"
                          >
                            {getParticipationRoleLabel(p.role)}
                          </Badge>
                        )}
                        {p.status !== 'active' && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-slate-500">
                            {getParticipationStatusLabel(p.status)}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TabsContent>

            {/* ── 기록·성찰 (소통 루프 A) ── */}
            <TabsContent value="posts" className="mt-0">
              <ActivityPostPanel
                activity={activity}
                myStudentCode={myStudentCode}
                canManage={canManage}
                myProfileId={myProfileId}
                isParticipant={isParticipant}
              />
            </TabsContent>

            {/* ── 계보 ── */}
            <TabsContent value="lineage" className="mt-0 space-y-3">
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                이 활동이 해마다 어떻게 이어지고 갈라져 왔는지 보여줍니다. 후배가 이어받을 때
                무엇이 이미 시도됐는지 알 수 있는 자리입니다.
              </p>
              {lineage?.tree ? (
                <div className="rounded-md border border-slate-200 p-2.5">
                  <LineageBranch node={lineage.tree} currentId={activity.id} depth={0} />
                </div>
              ) : (
                <EmptyState
                  icon={GitBranch}
                  title="아직 계보가 없습니다"
                  hint="활동을 수정해 '이전 활동에서 이어짐'을 연결하면 여기에 타임라인이 그려집니다."
                />
              )}
              {activity.lineage_note && (
                <div className="rounded-md border-l-2 border-fuchsia-300 bg-fuchsia-50/60 px-3 py-2 text-[12.5px] text-slate-700">
                  <span className="font-medium text-fuchsia-700">이번에 달라진 점 </span>
                  {activity.lineage_note}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
              onClick={() => onDelete(activity)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              삭제
            </Button>
          )}
          {/* 이어가기 — 학생·교사 모두. 소통 루프 C의 입구다 */}
          {onContinue && (
            <Button
              type="button"
              variant="ghost"
              className={cn(FOOTER_BUTTON_CLASS, 'text-fuchsia-600 hover:bg-fuchsia-50 hover:text-fuchsia-700')}
              onClick={() => onContinue(activity)}
              title="이 활동을 이어받는 활동을 제안합니다"
            >
              <GitBranch className="h-3.5 w-3.5" />
              이어가기
            </Button>
          )}
          <div className="flex-1" />
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
              onClick={() => onEdit(activity)}
            >
              <Pencil className="h-3.5 w-3.5" />
              수정
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
      <div className="min-w-0">
        <dt className="text-[11px] text-slate-400">{label}</dt>
        <dd className="break-words text-slate-700">{children}</dd>
      </div>
    </div>
  );
}

function TagRow({ label, values, prefix = '' }: { label: string; values: string[]; prefix?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      {values.map((v) => (
        <span key={v} className="text-[12.5px] text-slate-600">
          {prefix}
          {v}
        </span>
      ))}
    </div>
  );
}

/** 계보 가지 — 분기를 들여쓰기로 표현한다. 실제로 활동은 갈라지며 발전한다. */
function LineageBranch({
  node,
  currentId,
  depth,
}: {
  node: LineageTreeNode<{ id: string; name: string; academic_year: number; lineage_parent_id: string | null }>;
  currentId: string;
  depth: number;
}) {
  const isCurrent = node.node.id === currentId;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm',
          isCurrent && 'bg-fuchsia-50 font-medium text-fuchsia-800'
        )}
        style={{ marginLeft: depth * 16 }}
      >
        {depth > 0 && <CornerDownRight className="h-3 w-3 shrink-0 text-slate-300" />}
        <span className="w-11 shrink-0 tabular-nums text-xs text-slate-400">
          {node.node.academic_year}
        </span>
        <span className="min-w-0 truncate" title={node.node.name}>
          {node.node.name}
        </span>
        {isCurrent && (
          <span className="shrink-0 text-[10px] text-fuchsia-600">지금 보는 활동</span>
        )}
      </div>
      {node.children.map((child) => (
        <LineageBranch key={child.node.id} node={child} currentId={currentId} depth={depth + 1} />
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-slate-200 px-4 py-10 text-center">
      <Icon className="h-6 w-6 text-slate-300" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}
