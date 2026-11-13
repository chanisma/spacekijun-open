import { useMemo } from 'react';
import { Shield, Users, FileCode2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useResourceTags } from '@/hooks/useResourceTags';
import { useTagMembers } from './useTagMembers';
import {
  FEATURE_PERMISSIONS,
  type FeaturePermission,
  type TagRule,
} from '@/config/permissionMatrix';

const toneBadgeClass: Record<TagRule['tone'], string> = {
  full: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  scoped: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  exclude: 'bg-rose-100 text-rose-600 hover:bg-rose-100',
};

/**
 * 기능 → 태그 "역방향" 뷰.
 * 각 기능을 카드로 두고, 그 기능이 인식하는 태그 규칙과 현재 그 태그를 보유한
 * 교직원을 함께 보여준다. "이 기능에 누가 접근하나?"를 빠르게 파악하는 용도.
 */
export function FeaturePermissionView() {
  const { data: dbTags = [], isLoading: tagsLoading } = useResourceTags();
  const { data: members, isLoading: membersLoading } = useTagMembers();
  const isLoading = tagsLoading || membersLoading;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" />
          기능별 권한 현황
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          권한이 적용된 각 기능이 어떤 태그를 요구하고, 현재 누가 그 권한을
          보유하는지 보여줍니다.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {FEATURE_PERMISSIONS.map((feature) => (
            <FeatureCard
              key={feature.key}
              feature={feature}
              dbTags={dbTags}
              members={members}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FeatureCardProps {
  feature: FeaturePermission;
  dbTags: { id: string; name: string; color: string }[];
  members?: Map<string, { resourceId: string; name: string }[]>;
}

function FeatureCard({ feature, dbTags, members }: FeatureCardProps) {
  // 이 기능의 각 규칙에 대해: 매칭되는 DB 태그 + 보유 교직원 이름
  const ruleRows = useMemo(() => {
    return feature.rules.map((rule) => {
      const matchedTags = dbTags.filter((t) =>
        rule.kind === 'exact' ? t.name === rule.label : rule.pattern?.test(t.name) ?? false
      );
      const memberNames = new Map<string, string>();
      matchedTags.forEach((t) => {
        (members?.get(t.id) ?? []).forEach((m) =>
          memberNames.set(m.resourceId, m.name)
        );
      });
      return {
        rule,
        matchedTags,
        members: Array.from(memberNames.values()).sort((a, b) =>
          a.localeCompare(b, 'ko')
        ),
      };
    });
  }, [feature.rules, dbTags, members]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{feature.label}</CardTitle>
        <CardDescription className="text-xs">{feature.description}</CardDescription>
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground font-mono">
          <FileCode2 className="h-3 w-3 shrink-0" />
          <span className="truncate" title={feature.source}>
            {feature.source.replace('src/', '')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {feature.adminFullAccess && (
          <div className="text-xs text-muted-foreground border-b pb-2">
            <Badge variant="secondary" className="mr-1.5">admin</Badge>
            관리자는 항상 전체 접근
          </div>
        )}
        {ruleRows.map(({ rule, matchedTags, members: ruleMembers }) => (
          <div key={`${rule.kind}:${rule.label}`} className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-medium">
                {rule.label}
              </Badge>
              <Badge className={cn('font-medium', toneBadgeClass[rule.tone])}>
                {rule.grant}
              </Badge>
              {matchedTags.length === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  (해당 태그 DB에 없음)
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground pl-0.5">{rule.detail}</p>
            {ruleMembers.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
                <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                {ruleMembers.map((name) => (
                  <span
                    key={name}
                    className="text-[11px] bg-muted rounded px-1.5 py-0.5"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : matchedTags.length > 0 ? (
              <p className="text-[11px] text-muted-foreground pl-0.5 italic">
                보유 교직원 없음
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
