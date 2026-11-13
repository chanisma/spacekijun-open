import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { parseMentionContent } from '@/hooks/useStudentMention';

interface Props {
  bracketContent: string; // 괄호 안 내용: "1-3-15:김민준" 또는 "황하준"
}

export function StudentMentionPopup({ bracketContent }: Props) {
  const parsed = parseMentionContent(bracketContent);

  const { data, isLoading } = useQuery({
    queryKey: ['mention-popup', bracketContent],
    queryFn: async () => {
      if (parsed.type === 'student') {
        const { data, error } = await supabase
          .from('student_dashboard_view')
          .select('name, grade, class_num, number, picture, birthday')
          .eq('grade', parsed.grade)
          .eq('class_num', parsed.classNum)
          .eq('number', parsed.number)
          .single();
        if (error) throw error;
        return { ...data, kind: 'student' as const };
      } else {
        const { data, error } = await supabase
          .from('resource')
          .select('id, name')
          .eq('type', 'teacher')
          .eq('name', parsed.name)
          .single();
        if (error) throw error;
        return {
          name: data.name,
          kind: 'teacher' as const,
        };
      }
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="w-52 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-3/4" />
      </div>
    );
  }

  if (!data) return null;

  const isStudent = data.kind === 'student';
  const initial = data.name?.charAt(0) ?? '?';
  const picture = isStudent ? (data as any).picture : null;

  const formatBirthday = (birthday: string | null | undefined) => {
    if (!birthday) return '—';
    const d = new Date(birthday);
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="w-52">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center ${isStudent ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
          {picture ? (
            <img
              src={picture}
              alt={data.name}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span className={`text-sm font-bold ${isStudent ? 'text-indigo-600' : 'text-emerald-600'}`}>
              {initial}
            </span>
          )}
        </div>
        <div>
          <p className="font-semibold text-sm text-slate-800">{data.name}</p>
          <p className="text-xs text-slate-400">
            {isStudent
              ? `${(data as any).grade}학년 ${(data as any).class_num}반 ${(data as any).number}번`
              : '교사'
            }
          </p>
        </div>
      </div>

      {/* 상세 정보 */}
      {isStudent && (
        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">생년월일</span>
            <span className="font-medium text-slate-700">{formatBirthday((data as any).birthday)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
