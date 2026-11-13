import { useMemo, useState } from 'react';
import { Shield, Users, Info, Tag as TagIcon, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useResourceTags } from '@/hooks/useResourceTags';
import { useTagAssignmentCounts } from './useTagAssignmentCounts';
import {
  FEATURE_PERMISSIONS,
  buildKnownTagRows,
  matchKnownTag,
  type TagRule,
} from '@/config/permissionMatrix';
import { TagAssignmentDialog, type DialogTagTarget } from './TagAssignmentDialog';

const toneCellClass: Record<TagRule['tone'], string> = {
  full: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scoped: 'bg-amber-50 text-amber-700 border-amber-200',
  exclude: 'bg-rose-50 text-rose-600 border-rose-200',
};

/**
 * 권한이 적용된 모든 기능을 "태그 × 기능" 매트릭스로 보여준다.
 * - 행: 코드가 권한 게이트로 인식하는 태그(담임/학년부장/부장 패턴 + 고정 이름 태그)
 * - 열: 권한이 적용되는 기능(위기노트/수시/생기부/연수/감독/학급관리)
 * - 셀: 그 태그가 그 기능에서 부여하는 권한(전체/담임반/학년/제외)
 *
 * 패턴 태그(담임 등)는 DB에 동적으로 존재하므로 "현재 보유 인원"은 매칭되는
 * 모든 태그의 할당을 합산해 표시한다. 행 클릭 시 소속 교직원을 보고 편집할 수 있다.
 */
export function TagPermissionMatrix() {
  const { data: dbTags = [], isLoading: tagsLoading } = useResourceTags();
  const { data: counts, isLoading: countsLoading } = useTagAssignmentCounts();
  const [dialogTarget, setDialogTarget] = useState<DialogTagTarget | null>(null);

  const knownRows = useMemo(() => buildKnownTagRows(), []);

  // 각 알려진 태그 행에 대해: 그 행에 매칭되는 실제 DB 태그들 + 보유 인원 합계
  const rowsWithDbInfo = useMemo(() => {
    return knownRows.map((row) => {
      const matchedDbTags = dbTags.filter((t) => {
        if (row.kind === 'exact') return t.name === row.label;
        return row.pattern?.test(t.name) ?? false;
      });
      const totalMembers = matchedDbTags.reduce(
        (sum, t) => sum + (counts?.get(t.id) ?? 0),
        0
      );
      return { row, matchedDbTags, totalMembers };
    });
  }, [knownRows, dbTags, counts]);

  // 코드가 권한 게이트로 인식하지 못하는 "일반 태그"(권한과 무관) — 참고용으로 별도 표시
  const unmatchedDbTags = useMemo(
    () => dbTags.filter((t) => matchKnownTag(t.name, knownRows) === null),
    [dbTags, knownRows]
  );

  const isLoading = tagsLoading || countsLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              태그 권한 매트릭스
            </CardTitle>
            <CardDescription>
              교직원에게 부여된 <strong>태그</strong>가 각 기능의 접근을 어떻게 제어하는지
              한눈에 보여줍니다. 행(태그)을 클릭하면 그 태그를 가진 교직원을 확인하고
              편집할 수 있습니다. <span className="text-muted-foreground">관리자(admin)는
              감독 배정을 제외한 모든 기능에 전체 접근합니다.</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px] sticky left-0 bg-card z-10">
                        태그
                      </TableHead>
                      <TableHead className="w-[90px] text-center">보유 인원</TableHead>
                      {FEATURE_PERMISSIONS.map((f) => (
                        <TableHead key={f.key} className="text-center min-w-[88px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help inline-flex items-center gap-1">
                                {f.shortLabel}
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px]">
                              <p className="font-medium">{f.label}</p>
                              <p className="text-xs mt-1">{f.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsWithDbInfo.map(({ row, matchedDbTags, totalMembers }) => {
                      const rowId = `${row.kind}:${row.label}`;
                      const clickable = matchedDbTags.length > 0;
                      return (
                        <TableRow
                          key={rowId}
                          className={cn(clickable && 'cursor-pointer hover:bg-muted/50')}
                          onClick={() =>
                            clickable &&
                            setDialogTarget({
                              label: row.label,
                              kind: row.kind,
                              dbTags: matchedDbTags,
                            })
                          }
                        >
                          <TableCell className="font-medium sticky left-0 bg-card z-10">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={row.kind === 'pattern' ? 'outline' : 'secondary'}
                                className="font-medium whitespace-nowrap"
                              >
                                {row.label}
                              </Badge>
                              {row.kind === 'pattern' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <TagIcon className="h-3 w-3 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[240px]">
                                    <p className="text-xs">
                                      패턴 태그입니다. "{row.label}" 형식의 모든 태그
                                      (예: 1학년 1반, 2학년 3반…)가 이 권한을 받습니다.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {matchedDbTags.length === 0 ? (
                              <span className="text-muted-foreground">미정의</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Users className="h-3 w-3" />
                                {totalMembers}
                              </span>
                            )}
                          </TableCell>
                          {FEATURE_PERMISSIONS.map((f) => {
                            const grant = row.grants[f.key];
                            return (
                              <TableCell key={f.key} className="text-center">
                                {grant ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={cn(
                                          'inline-block rounded border px-2 py-0.5 text-xs font-medium cursor-help',
                                          toneCellClass[grant.tone]
                                        )}
                                      >
                                        {grant.grant}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[260px]">
                                      <p className="text-xs">{grant.detail}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground/40">·</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* 범례 */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn('inline-block rounded border px-2 py-0.5', toneCellClass.full)}>
                  전체
                </span>
                전 범위 접근
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn('inline-block rounded border px-2 py-0.5', toneCellClass.scoped)}>
                  담임반/학년
                </span>
                범위 제한 접근
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn('inline-block rounded border px-2 py-0.5', toneCellClass.exclude)}>
                  제외
                </span>
                기능에서 제외됨
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">미정의</span>
                = 이 패턴/이름의 태그가 DB에 아직 없음
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 권한과 무관한 일반 태그 안내 */}
        {unmatchedDbTags.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                권한과 무관한 태그 ({unmatchedDbTags.length})
              </CardTitle>
              <CardDescription>
                아래 태그는 현재 어떤 기능의 권한 게이트와도 연결되어 있지 않습니다
                (참여자 일괄 선택 등 다른 용도). 권한을 부여하려면 위 매트릭스의
                태그 이름 규칙을 따라야 합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unmatchedDbTags.map((t) => (
                  <Badge
                    key={t.id}
                    style={{ backgroundColor: t.color, color: 'white' }}
                    className="font-medium"
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <TagAssignmentDialog
          target={dialogTarget}
          open={!!dialogTarget}
          onOpenChange={(open) => !open && setDialogTarget(null)}
        />
      </div>
    </TooltipProvider>
  );
}
