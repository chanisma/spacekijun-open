import { ArrowDown, ArrowUp, Plus, Smartphone, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isNavGroup, type NavItem, type NavSection } from '@/config/navigation';
import { MOBILE_BOTTOM_MAX } from '@/lib/navMobileLayout';

/**
 * Admin ▸ 메뉴 관리 — 모바일 하단 바 편집 (2026-10-25).
 *
 * 하단 바는 사이드바 순서와 **따로** 정한다(`menu_layout.<kind>.mobileBottom`). 휴대폰 하단 바 모양 그대로
 * 그려서 «무엇이 어느 칸에 오는지»를 보면서 고친다. 고를 수 있는 메뉴 = 그 네비의 현재 배치(편집 중인 트리)다.
 * 노출이 꺼진 메뉴를 고르면 그 사람들의 하단 바에서는 빠진다(판정 `pickMobileBottomItems` — 칸이 당겨진다).
 */
interface MobileBottomEditorProps {
  tree: NavSection[];
  hrefs: string[];
  isDirty: boolean;
  /** 지금 노출이 꺼진 메뉴 — 고를 수는 있되 표시한다 */
  hiddenHrefs: Set<string>;
  onChange: (next: string[]) => void;
}

export function MobileBottomEditor({ tree, hrefs, isDirty, hiddenHrefs, onChange }: MobileBottomEditorProps) {
  const groups = tree.map((section) => ({
    id: section.id,
    label: section.label || '(이름 없는 범례)',
    items: section.items.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry])),
  })).filter((g) => g.items.length > 0);
  const byHref = new Map<string, NavItem>(groups.flatMap((g) => g.items.map((item) => [item.href, item] as const)));

  const replace = (index: number, href: string) => {
    const next = [...hrefs];
    const dup = next.indexOf(href);
    if (dup >= 0 && dup !== index) next[dup] = next[index]; // 이미 다른 칸에 있으면 자리를 맞바꾼다
    next[index] = href;
    onChange(next);
  };
  const move = (index: number, delta: -1 | 1) => {
    const next = [...hrefs];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const remove = (index: number) => onChange(hrefs.filter((_, i) => i !== index));
  const add = () => {
    const first = groups.flatMap((g) => g.items).find((item) => !hrefs.includes(item.href));
    if (first) onChange([...hrefs, first.href]);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />모바일 하단 메뉴
            {isDirty && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">변경됨</Badge>}
          </CardTitle>
          <Button variant="ghost" size="sm" disabled={hrefs.length >= MOBILE_BOTTOM_MAX} onClick={add}>
            <Plus className="mr-1 h-4 w-4" />칸 추가
          </Button>
        </div>
        <CardDescription>
          휴대폰 아래쪽에 늘 보이는 칸입니다(최대 {MOBILE_BOTTOM_MAX}개). 위 범례·메뉴 순서와 따로 정하며,
          전체 메뉴(☰)는 데스크톱 왼쪽 메뉴와 같은 순서로 나옵니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 미리보기 — 휴대폰 하단 바 모양 그대로(누르는 칸이 아니다). 고치기는 아래 줄에서 */}
        <div className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white px-2 pb-3 pt-1 shadow-sm" aria-label="하단 바 미리보기">
          <div className="mx-auto mb-2 mt-1 h-1 w-8 rounded-full bg-slate-300" aria-hidden />
          {hrefs.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">칸이 없으면 기본 칸으로 돌아갑니다.</p>
          ) : (
            <div className="flex items-start justify-around">
              {hrefs.map((href, index) => {
                const item = byHref.get(href);
                const Icon = item?.icon ?? X;
                return (
                  <div key={`${href}:${index}`} className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 ${hiddenHrefs.has(href) ? 'opacity-40' : ''}`}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${index === 0 ? 'bg-blue-100 text-blue-600' : 'text-gray-500'}`}><Icon className="h-4 w-4" /></span>
                    <span className="w-full truncate text-center text-[11px] font-medium text-gray-600">{item?.name ?? '없는 메뉴'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ol className="mx-auto max-w-xl space-y-1.5">
          {hrefs.map((href, index) => (
            <li key={`${href}:${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2 py-1.5">
              <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span>
              <Select value={href} onValueChange={(value) => replace(index, value)}>
                <SelectTrigger className="h-10 min-w-0 flex-1 text-sm" aria-label={`${index + 1}번째 칸`}>
                  <SelectValue placeholder="메뉴 고르기">
                    <span className="truncate">{byHref.get(href)?.name ?? '없는 메뉴'}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectGroup key={group.id}>
                      <SelectLabel className="text-[11px]">{group.label}</SelectLabel>
                      {group.items.map((option) => (
                        <SelectItem key={option.href} value={option.href} className="text-sm">
                          {option.name}{hiddenHrefs.has(option.href) ? ' (꺼짐)' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {hiddenHrefs.has(href) && <span className="hidden shrink-0 text-[11px] text-amber-600 sm:inline">노출 꺼짐</span>}
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" disabled={index === 0} onClick={() => move(index, -1)} aria-label="앞 칸으로">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" disabled={index === hrefs.length - 1} onClick={() => move(index, 1)} aria-label="뒤 칸으로">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-rose-500 hover:text-rose-600" onClick={() => remove(index)} aria-label="칸 빼기">
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
        <p className="text-center text-[11px] text-muted-foreground">
          역할이나 노출 설정 때문에 그 사람이 볼 수 없는 메뉴(흐리게 보임)는 그 사람의 하단 바에서 빠지고 칸이 당겨집니다.
        </p>
      </CardContent>
    </Card>
  );
}
