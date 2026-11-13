// ========================================
// 활동 참여자 선택
//
// 설계의 요점: **소속 명단에서 상속하되 활동 단위로 확정한다.**
// 동아리 부원 17명을 매번 손으로 고르게 하면 기록이 안 쌓인다. 그렇다고
// 소속=참여로 자동 확정하면 "부원이지만 그날 빠진 학생"이 참여한 것이 되어
// 시수가 부풀려진다. 그래서 한 번의 클릭으로 명단을 불러오고, 빠진 사람만
// 체크를 해제하게 한다.
//
// SearchableMultiSelect의 값은 resource.id(UUID)이고 우리 도메인 키는
// student_code다. 그 변환을 여기서 한 번만 한다.
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserMinus, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import { cn } from '@/lib/utils';
import { useActivityHostMembers } from '../hooks/useActivityHosts';
import type { ParticipantInput } from '../types';

interface ParticipantPickerProps {
  value: ParticipantInput[];
  onChange: (next: ParticipantInput[]) => void;
  /** 주최 맥락이 있으면 그 소속 명단을 한 번에 불러올 수 있다 */
  hostId?: string | null;
  hostName?: string | null;
  academicYear: number;
  disabled?: boolean;
}

export function ParticipantPicker({
  value,
  onChange,
  hostId,
  hostName,
  academicYear,
  disabled,
}: ParticipantPickerProps) {
  const { items, isLoading: resourceLoading } = useResourceSelect({ resourceType: 'student' });
  const { data: hostMembers, isLoading: membersLoading } = useActivityHostMembers(
    hostId ?? null,
    hostId ? academicYear : null
  );

  // resource.id → 학생 메타. SearchableMultiSelect가 UUID를 주므로 필요하다.
  const byResourceId = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; grade: number | null; classNum: number | null }
    >();
    for (const item of items) {
      if (!item.studentCode) continue;
      map.set(item.value, {
        code: item.studentCode,
        name: item.label,
        grade: item.studentGrade ?? null,
        classNum: item.studentClass ?? null,
      });
    }
    return map;
  }, [items]);

  const byStudentCode = useMemo(() => {
    const map = new Map<string, { resourceId: string; name: string }>();
    for (const [resourceId, meta] of byResourceId) {
      map.set(meta.code, { resourceId, name: meta.name });
    }
    return map;
  }, [byResourceId]);

  // 현재 선택을 SearchableMultiSelect가 이해하는 resource.id 배열로 되돌린다.
  const selectedResourceIds = useMemo(
    () =>
      value
        .map((p) => p.student_resource_id ?? byStudentCode.get(p.student_code)?.resourceId)
        .filter((id): id is string => !!id),
    [value, byStudentCode]
  );

  const handleSelectionChange = (resourceIds: string[]) => {
    const existing = new Map(value.map((p) => [p.student_code, p]));
    const next: ParticipantInput[] = [];

    for (const resourceId of resourceIds) {
      const meta = byResourceId.get(resourceId);
      if (!meta) continue;
      // 이미 있던 참여자는 역할·시수를 보존한다(선택만 다시 그린다고 값이 날아가면 안 된다).
      const prev = existing.get(meta.code);
      next.push(
        prev ?? {
          student_code: meta.code,
          student_resource_id: resourceId,
          grade: meta.grade,
          class_num: meta.classNum,
          role: 'member',
          status: 'active',
        }
      );
    }
    onChange(next);
  };

  /** 소속 명단을 통째로 더한다(기존 선택은 보존 — 덮어쓰기가 아니라 합집합) */
  const loadHostMembers = () => {
    if (!hostMembers?.length) return;
    const existing = new Map(value.map((p) => [p.student_code, p]));
    const merged = [...value];

    for (const m of hostMembers) {
      if (existing.has(m.student_code)) continue;
      merged.push({
        student_code: m.student_code,
        student_resource_id: m.student_resource_id,
        grade: m.grade,
        class_num: m.class_num,
        role: m.role === 'leader' ? 'leader' : 'member',
        status: 'active',
      });
    }
    onChange(merged);
  };

  const removeParticipant = (code: string) => {
    onChange(value.filter((p) => p.student_code !== code));
  };

  // 명단이 준비되면 어떤 부원이 아직 빠져 있는지 알려준다.
  const missingFromHost = useMemo(() => {
    if (!hostMembers?.length) return 0;
    const selected = new Set(value.map((p) => p.student_code));
    return hostMembers.filter((m) => !selected.has(m.student_code)).length;
  }, [hostMembers, value]);

  const nameOf = (p: ParticipantInput) =>
    byStudentCode.get(p.student_code)?.name ?? p.student_code;

  return (
    <div className="space-y-2.5">
      {/* 소속 명단 상속 — 기록 부담을 한 클릭으로 줄이는 자리 */}
      {hostId && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
            {membersLoading ? (
              '소속 명단 불러오는 중…'
            ) : hostMembers?.length ? (
              <>
                <span className="font-medium text-slate-700">{hostName}</span>
                <span className="text-slate-500"> {academicYear}학년도 소속 {hostMembers.length}명</span>
                {missingFromHost > 0 && (
                  <span className="text-amber-600"> · {missingFromHost}명 미선택</span>
                )}
              </>
            ) : (
              `${academicYear}학년도 소속 명단이 없습니다`
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={loadHostMembers}
            disabled={disabled || membersLoading || !missingFromHost}
          >
            {membersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            명단 불러오기
          </Button>
        </div>
      )}

      <SearchableMultiSelect
        items={undefined}
        selectedValues={selectedResourceIds}
        onSelectionChange={handleSelectionChange}
        filterByStudent
        enableClassSearch
        placeholder="학생을 검색해 추가하세요"
        searchPlaceholder="이름·학번·2학년 1반…"
        disabled={disabled || resourceLoading}
        maxSelectedDisplay={0}
      />

      {/* 선택 명단 — 빠진 사람만 체크 해제하는 자리 */}
      {value.length > 0 && (
        <div className="rounded-md border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              참여자 {value.length}명
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-slate-400 transition hover:text-rose-600"
              >
                전체 해제
              </button>
            )}
          </div>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-2.5">
            {value.map((p) => (
              <span
                key={p.student_code}
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full border border-slate-200',
                  'bg-white py-0.5 pl-2 pr-1 text-xs text-slate-700'
                )}
              >
                {p.grade && p.class_num && (
                  <span className="tabular-nums text-[10px] text-slate-400">
                    {p.grade}-{p.class_num}
                  </span>
                )}
                <span className="max-w-[8rem] truncate" title={nameOf(p)}>
                  {nameOf(p)}
                </span>
                {p.role === 'leader' && (
                  <Badge
                    variant="outline"
                    className="h-4 border-amber-200 bg-amber-50 px-1 text-[9px] text-amber-700"
                  >
                    리더
                  </Badge>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.student_code)}
                    className="rounded-full p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`${nameOf(p)} 제외`}
                  >
                    <UserMinus className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
