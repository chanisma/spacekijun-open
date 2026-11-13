import { ChevronDown, FileSpreadsheet, Database, ArrowRight, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface WorkflowInfoBannerProps {
  step: number;
  totalSteps?: number;
  title: string;
  description?: string;
  files: string[];
  table: string;
  prerequisites?: { step: number; label: string }[];
  enables?: { step: number; label: string }[];
  defaultOpen?: boolean;
}

export function WorkflowInfoBanner({
  step,
  totalSteps = 4,
  title,
  description,
  files,
  table,
  prerequisites = [],
  enables = [],
  defaultOpen = true,
}: WorkflowInfoBannerProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="border rounded-lg bg-muted/30">
        <CollapsibleTrigger className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 rounded-lg group">
          <Badge variant="secondary" className="text-[11px] font-bold tabular-nums shrink-0">
            {step}/{totalSteps}
          </Badge>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {description}
          </span>
          <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1 grid gap-3 md:grid-cols-2 text-xs">
            <InfoBlock
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              label="입력 파일"
            >
              {files.length === 0 ? (
                <span className="text-muted-foreground">없음</span>
              ) : (
                <ul className="space-y-0.5">
                  {files.map((f, i) => (
                    <li key={i} className="font-mono text-[11px] break-all">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </InfoBlock>

            <InfoBlock
              icon={<Database className="h-3.5 w-3.5" />}
              label="저장 테이블"
            >
              <code className="font-mono text-[11px]">{table}</code>
            </InfoBlock>

            {prerequisites.length > 0 && (
              <InfoBlock
                icon={<ArrowLeft className="h-3.5 w-3.5" />}
                label="선행 작업 (이게 채워져야 자동 매칭됨)"
              >
                <ul className="space-y-0.5">
                  {prerequisites.map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1 h-4 tabular-nums">
                        {p.step}
                      </Badge>
                      {p.label}
                    </li>
                  ))}
                </ul>
              </InfoBlock>
            )}

            {enables.length > 0 && (
              <InfoBlock
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                label="이 작업이 풀어주는 후속 매칭"
              >
                <ul className="space-y-0.5">
                  {enables.map((e, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1 h-4 tabular-nums">
                        {e.step}
                      </Badge>
                      {e.label}
                    </li>
                  ))}
                </ul>
              </InfoBlock>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function InfoBlock({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}
