// ========================================
// 기록 · 성찰 패널 (Phase 2)
//
// 소통 루프 A가 사는 자리다: 학생이 성찰을 남기고 → 교사가 댓글로 답하고 →
// 그 축적이 생기부 창체 문구의 근거가 된다.
//
// 설계 결정 두 가지
//   ① **빈 상태에 사람이 보이게 한다.** "아직 성찰이 없습니다" 대신
//      "○○ 선생님이 첫 기록을 기다리고 있어요" — 소통 시스템의 빈 화면은
//      기능 부재가 아니라 초대여야 한다.
//   ② **작성자 이름은 조인으로만 얻는다.** 졸업하면 `YYYY입학NNN` 별칭이
//      자동으로 따라오고, 글은 남는다(FK가 SET NULL이라 지워지지 않는다).
// ========================================

import { useState } from 'react';
import {
  Eye,
  Loader2,
  Lock,
  MessageCircle,
  PenLine,
  Send,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useActivityPosts,
  useCreateActivityComment,
  useCreateActivityPost,
  useDeleteActivityComment,
  useDeleteActivityPost,
} from '../hooks/useActivityPosts';
import {
  notifyFeedbackReceived,
  notifyReflectionPosted,
  resolveStudentResourceIds,
} from '../services/activityNotificationService';
import type {
  ActivityPostRow,
  ActivityPostVisibility,
  ActivityWithContext,
} from '../types';

const VISIBILITY_LABELS: Record<ActivityPostVisibility, string> = {
  private: '선생님만',
  participants: '함께한 사람',
  school: '전교 공개',
};

const VISIBILITY_HINTS: Record<ActivityPostVisibility, string> = {
  private: '담당 선생님만 볼 수 있습니다.',
  participants: '선생님들과 이 활동을 함께한 친구들이 볼 수 있습니다.',
  school: '전교생이 볼 수 있습니다. 후배들이 이 활동을 참고합니다.',
};

interface ActivityPostPanelProps {
  activity: ActivityWithContext;
  /** 로그인한 사용자가 학생이면 학생코드 */
  myStudentCode: string | null;
  /** 이 활동을 관리할 수 있는가(담당교사·창체담당자·admin) */
  canManage: boolean;
  /** 현재 사용자 profiles.id — 내 글 판정용 */
  myProfileId: string | null;
  /** 학생이 이 활동의 참여자인가 — 성찰 작성 가능 여부 */
  isParticipant: boolean;
}

export function ActivityPostPanel({
  activity,
  myStudentCode,
  canManage,
  myProfileId,
  isParticipant,
}: ActivityPostPanelProps) {
  const { data: posts = [], isLoading } = useActivityPosts(activity.id);
  const createPost = useCreateActivityPost();
  const deletePost = useDeleteActivityPost(activity.id);

  const [draft, setDraft] = useState('');
  const [visibility, setVisibility] = useState<ActivityPostVisibility>('participants');

  const isStudent = !!myStudentCode;
  // 학생은 참여자일 때만 성찰을 쓸 수 있다(서버 RLS와 같은 조건).
  const canWrite = isStudent ? isParticipant : canManage;
  const writeKind = isStudent ? 'reflection' : 'log';

  const teacherName = activity.teachers[0]?.name;

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    await createPost.mutateAsync({
      activity_id: activity.id,
      kind: writeKind,
      content,
      visibility: isStudent ? visibility : 'participants',
      student_code: isStudent ? myStudentCode : null,
    });
    setDraft('');

    // 학생이 성찰을 남기면 담당 교사에게 알린다 — 교사가 답할 계기가 없으면 루프가 끊긴다.
    // 알림 실패는 성찰을 되돌리지 않는다(서비스가 안에서 삼킨다).
    if (isStudent) {
      void notifyReflectionPosted({
        activityId: activity.id,
        activityName: activity.name,
        teacherResourceIds: activity.teachers.map((t) => t.resource_id),
        studentName: null,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 작성 ── */}
      {canWrite ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <PenLine className="h-3.5 w-3.5" />
            {isStudent ? '성찰 남기기' : '활동 기록 남기기'}
          </div>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="resize-none bg-white text-sm"
            aria-label={isStudent ? '성찰 내용' : '활동 기록 내용'}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isStudent && (
              <div className="flex min-w-0 items-center gap-1.5">
                <Select
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as ActivityPostVisibility)}
                >
                  <SelectTrigger className="h-7 w-[7.5rem] bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['private', 'participants', 'school'] as const).map((v) => (
                      <SelectItem key={v} value={v}>
                        {VISIBILITY_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="min-w-0 truncate text-[11px] text-slate-400">
                  {VISIBILITY_HINTS[visibility]}
                </span>
              </div>
            )}

            <Button
              size="sm"
              className="ml-auto h-7 gap-1.5 text-xs"
              onClick={submit}
              disabled={!draft.trim() || createPost.isPending}
            >
              {createPost.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              남기기
            </Button>
          </div>

          {isStudent && (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              졸업 후에도 글은 남고 이름만 별칭으로 바뀝니다. 여기 적은 내용이 생활기록부
              창의적 체험활동 기록의 근거가 됩니다.
            </p>
          )}
        </div>
      ) : (
        isStudent && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            이 활동의 참여자로 등록되면 성찰을 남길 수 있습니다.
          </p>
        )
      )}

      {/* ── 목록 ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
          <MessageCircle className="h-6 w-6 text-slate-300" />
          {/* 빈 화면은 기능 부재가 아니라 초대여야 한다 */}
          <p className="text-sm font-medium text-slate-600">
            {teacherName
              ? `${teacherName} 선생님이 첫 기록을 기다리고 있어요`
              : '아직 남긴 기록이 없어요'}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-400">
            무엇을 해봤고 무엇을 알게 됐는지 짧게 적어도 충분합니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              activityId={activity.id}
              activityName={activity.name}
              myStudentCode={myStudentCode}
              myProfileId={myProfileId}
              canManage={canManage}
              onDelete={() => deletePost.mutate(post.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------

function PostCard({
  post,
  activityId,
  activityName,
  myStudentCode,
  myProfileId,
  canManage,
  onDelete,
}: {
  post: ActivityPostRow;
  activityId: string;
  activityName: string;
  myStudentCode: string | null;
  myProfileId: string | null;
  canManage: boolean;
  onDelete: () => void;
}) {
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const createComment = useCreateActivityComment(activityId);
  const deleteComment = useDeleteActivityComment(activityId);

  const isMine = !!myProfileId && post.author_profile_id === myProfileId;
  const isReflection = post.kind === 'reflection';

  const submitReply = async () => {
    const content = reply.trim();
    if (!content) return;
    await createComment.mutateAsync({
      postId: post.id,
      content,
      studentCode: myStudentCode,
    });
    setReply('');
    setReplying(false);

    // 교사가 학생 성찰에 답하면 그 학생에게 알린다 — 학생이 답을 못 보면 루프가 끊긴다.
    // 학생끼리 단 댓글은 알리지 않는다(자기 글에 자기가 다는 경우가 대부분).
    if (!myStudentCode && post.student_code) {
      const map = await resolveStudentResourceIds([post.student_code]);
      const resourceId = map.get(post.student_code);
      if (resourceId) {
        void notifyFeedbackReceived({
          activityId,
          activityName,
          studentResourceId: resourceId,
        });
      }
    }
  };

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              'h-[18px] px-1.5 text-[10px]',
              isReflection
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            )}
          >
            {isReflection ? '성찰' : '활동 기록'}
          </Badge>
          <span className="truncate text-[12.5px] font-medium text-slate-800">
            {post.author_name ?? '(작성자 없음)'}
          </span>
          {post.visibility !== 'participants' && (
            <span className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400">
              {post.visibility === 'private' ? (
                <Lock className="h-2.5 w-2.5" />
              ) : (
                <Eye className="h-2.5 w-2.5" />
              )}
              {VISIBILITY_LABELS[post.visibility]}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {post.created_at.slice(0, 10)}
        </span>
      </div>

      <p className="whitespace-pre-wrap px-3 py-2 text-[13.5px] leading-relaxed text-slate-700">
        {post.content}
      </p>

      {/* 댓글 — 교사 피드백이 사는 자리 */}
      {post.comments.length > 0 && (
        <ul className="space-y-1.5 border-t border-slate-100 px-3 py-2">
          {post.comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  c.is_student ? 'bg-slate-300' : 'bg-emerald-400'
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    'mr-1.5 font-medium',
                    c.is_student ? 'text-slate-600' : 'text-emerald-700'
                  )}
                >
                  {c.author_name ?? '(작성자 없음)'}
                </span>
                <span className="whitespace-pre-wrap text-slate-700">{c.content}</span>
              </div>
              {!!myProfileId && c.author_profile_id === myProfileId && (
                <button
                  type="button"
                  onClick={() => deleteComment.mutate(c.id)}
                  className="shrink-0 text-slate-300 transition hover:text-rose-600"
                  aria-label="댓글 삭제"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-1.5">
        {replying ? (
          <>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              autoFocus
              className="min-h-0 resize-none py-1.5 text-[12.5px]"
              aria-label="댓글 내용"
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter로 바로 보낸다 — 한 줄 피드백이 대부분이다
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submitReply();
              }}
            />
            <Button
              size="sm"
              className="h-7 shrink-0 gap-1 text-xs"
              onClick={submitReply}
              disabled={!reply.trim() || createComment.isPending}
            >
              {createComment.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-1 text-[11.5px] text-slate-400 transition hover:text-slate-700"
          >
            <MessageCircle className="h-3 w-3" />
            {post.comments.length > 0 ? `댓글 ${post.comments.length}` : '댓글 남기기'}
          </button>
        )}

        {(isMine || canManage) && !replying && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-slate-300 transition hover:text-rose-600"
          >
            <Trash2 className="h-3 w-3" />
            삭제
          </button>
        )}
      </div>
    </li>
  );
}
