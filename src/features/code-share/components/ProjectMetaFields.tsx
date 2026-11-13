/** 올리기·수정 모달이 함께 쓰는 메타 입력 묶음(제목·설명·공개 범위·만든 도구·태그) */
import { Globe, Link2, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { VISIBILITY_HINTS, VISIBILITY_LABELS, type CodeProjectVisibility } from '@/lib/codeShare';

export interface ProjectMeta {
  title: string;
  description: string;
  visibility: CodeProjectVisibility;
  originTool: string;
  tagsText: string;
}

export const emptyProjectMeta = (): ProjectMeta => ({
  title: '', description: '', visibility: 'school', originTool: '', tagsText: '',
});

export function parseTags(text: string): string[] {
  return Array.from(new Set(text.split(/[,\s#]+/).map((t) => t.trim()).filter(Boolean))).slice(0, 10);
}

const VISIBILITY_ICONS = { school: Globe, link: Link2, private: Lock } as const;
const VISIBILITY_ORDER: CodeProjectVisibility[] = ['school', 'link', 'private'];

export function ProjectMetaFields({ value, onChange, idPrefix = 'cs' }: {
  value: ProjectMeta;
  onChange: (next: ProjectMeta) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof ProjectMeta>(k: K, v: ProjectMeta[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs">제목</Label>
        <Input id={`${idPrefix}-title`} value={value.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="예: 급식 메뉴 투표 사이트" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-desc`} className="text-xs">설명 <span className="font-normal text-slate-400">— 무엇을 하는 코드인지, 어떻게 응용하면 좋을지</span></Label>
        <Textarea id={`${idPrefix}-desc`} value={value.description} onChange={(e) => set('description', e.target.value)} rows={3} className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">공개 범위</Label>
        <RadioGroup value={value.visibility} onValueChange={(v) => set('visibility', v as CodeProjectVisibility)} className="grid gap-1.5 sm:grid-cols-3">
          {VISIBILITY_ORDER.map((v) => {
            const Icon = VISIBILITY_ICONS[v];
            const active = value.visibility === v;
            return (
              <label
                key={v}
                htmlFor={`${idPrefix}-vis-${v}`}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                  active ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <RadioGroupItem id={`${idPrefix}-vis-${v}`} value={v} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-800"><Icon className="h-3.5 w-3.5" />{VISIBILITY_LABELS[v]}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{VISIBILITY_HINTS[v]}</span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-origin`} className="text-xs">만든 도구 <span className="font-normal text-slate-400">(선택)</span></Label>
          <Input id={`${idPrefix}-origin`} value={value.originTool} onChange={(e) => set('originTool', e.target.value)} maxLength={60} placeholder="Claude · ChatGPT · Cursor …" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-tags`} className="text-xs">태그 <span className="font-normal text-slate-400">(쉼표로 구분, 최대 10개)</span></Label>
          <Input id={`${idPrefix}-tags`} value={value.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="게임, 투표, 시간표" />
        </div>
      </div>
    </div>
  );
}
