import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, FolderPlus, Info, ListChecks, PackagePlus, Pencil, RotateCcw, Save, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility, useUpdateMenuVisibility } from '@/hooks/useMenuVisibility';
import { useMenuLayout, useUpdateMenuLayout } from '@/hooks/useMenuLayout';
import { MANAGED_MENUS, MANAGED_MENU_BY_KEY } from '@/config/menuRegistry';
import { isNavGroup, type NavGroup, type NavItem, type NavSection } from '@/config/navigation';
import { buildManageableBase } from '@/lib/navAssembly';
import {
  addGroup, addSection, applyNavLayout, canDeleteGroup, canDeleteSection, containerKeyOf, deleteGroup, deleteSection,
  deriveNavLayout, isCustomGroup, isCustomSection, isLockedSection, listContainers, listGroups, moveGroupBy, moveGroupTo,
  moveItemBy, moveItemTo, moveSection, renameGroup, renameSection, sameNavShape, sectionKeyOfGroup,
  type NavKind, type NavLayoutConfig,
} from '@/lib/navLayout';
import {
  MENU_AUDIENCE_LABELS, buildMenuVisibilityPayload, defaultVisibilityOf, isSameVisibility,
  isStaffClosedByDefault, resolveMenuVisibility, type MenuAudience, type MenuVisibility,
} from '@/lib/menuVisibility';
import { DEFAULT_MOBILE_BOTTOM_HREFS, isDefaultMobileBottom } from '@/lib/navMobileLayout';
import { MobileBottomEditor } from './MobileBottomEditor';

/**
 * Admin ▸ 메뉴 관리 (2026-09-21 개편).
 *
 * 세 가지를 한 화면에서 한다 — 판정은 전부 순수 모듈에 있고 여기는 그리기만 한다:
 *   ① **범례(섹션)** 추가·이름 변경·삭제·순서 ………… `lib/navLayout.ts`
 *   ② **메뉴 이동**(다른 범례·서랍으로, 같은 자리 안에서 위아래) … `lib/navLayout.ts`
 *   ②' **서랍** 추가·이름 변경·삭제·다른 범례로 이동·위아래 (2026-10-11) … `lib/navLayout.ts`
 *   ③ **노출 대상** — 학생 / 교사 / 직원 / 관리자 따로 ……… `lib/menuVisibility.ts`
 *
 * 화면은 **실제 사이드바와 같은 구조**로 그린다(네비가 두 벌이라 세그먼트도 둘). 예전처럼 카탈로그의
 * 그룹으로 묶으면 "관리 화면의 묶음"과 "사이드바의 범례"가 따로 놀아, 메뉴를 옮겨도 어디로 갔는지 안 보인다.
 *
 * 저장은 둘로 나뉜다(`menu_layout`·`menu_visibility` — 둘 다 `system_settings` 의 키). 코드 기본값과
 * 같은 것은 저장하지 않는다 — 건드린 적 없는 메뉴가 옛 기본값에 고정되는 유령 설정을 만들지 않기 위해서다.
 */

type VisibilityDraft = Record<string, MenuVisibility>;
type Trees = Record<NavKind, NavSection[]>;
type Bottoms = Record<NavKind, string[]>;

function buildBottoms(layout: NavLayoutConfig): Bottoms {
  return {
    teacher: layout.teacher?.mobileBottom ?? [...DEFAULT_MOBILE_BOTTOM_HREFS.teacher],
    student: layout.student?.mobileBottom ?? [...DEFAULT_MOBILE_BOTTOM_HREFS.student],
  };
}

const KIND_LABELS: Record<NavKind, string> = { teacher: '교사·직원 메뉴', student: '학생 메뉴' };
/** 그 네비를 보는 대상 — 학생 네비에 교사 스위치를 두면 아무 일도 하지 않는 스위치가 된다 */
const KIND_AUDIENCES: Record<NavKind, MenuAudience[]> = { teacher: ['teacher', 'staff'], student: ['student'] };

function buildVisibilityDraft(config: Parameters<typeof resolveMenuVisibility>[0]): VisibilityDraft {
  const draft: VisibilityDraft = {};
  for (const menu of MANAGED_MENUS) draft[menu.key] = resolveMenuVisibility(config, menu.key);
  return draft;
}

function buildTrees(layout: NavLayoutConfig): Trees {
  return {
    teacher: applyNavLayout(buildManageableBase('teacher'), layout.teacher),
    student: applyNavLayout(buildManageableBase('student'), layout.student),
  };
}

interface MenuRowProps {
  item: NavItem;
  kind: NavKind;
  containerKey: string;
  containers: Array<{ key: string; label: string }>;
  value: MenuVisibility | null;
  isDirty: boolean;
  canUp: boolean;
  canDown: boolean;
  onVisibility: (next: MenuVisibility) => void;
  onMoveTo: (targetKey: string) => void;
  onMoveBy: (delta: -1 | 1) => void;
}

function MenuRow({
  item, kind, containerKey, containers, value, isDirty, canUp, canDown, onVisibility, onMoveTo, onMoveBy,
}: MenuRowProps) {
  const Icon = item.icon;
  const hint = MANAGED_MENU_BY_KEY.get(item.href)?.hint;

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 lg:flex-row lg:items-center lg:gap-3 ${
        isDirty ? 'border-blue-300 bg-blue-50/40' : 'border-border bg-card'
      }`}
    >
      {/* 이름·경로 — 긴 경로가 컨트롤을 밀지 않도록 min-w-0 + truncate */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium" title={item.name}>{item.name}</span>
          <div className="flex flex-wrap items-center gap-x-2">
            <code className="truncate text-[11px] text-muted-foreground" title={item.href}>{item.href}</code>
            {hint && <span className="text-[11px] text-muted-foreground/80">· {hint}</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {/* 위치 — 다른 범례·서랍으로 */}
        <div className="flex items-center gap-1">
          <Select value={containerKey} onValueChange={onMoveTo}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label={`${item.name} 위치`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {containers.map((c) => (
                <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canUp} onClick={() => onMoveBy(-1)} aria-label={`${item.name} 위로`}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canDown} onClick={() => onMoveBy(1)} aria-label={`${item.name} 아래로`}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 노출 대상 */}
        {value ? (
          <div className="flex items-center gap-3">
            {KIND_AUDIENCES[kind].map((audience) => {
              // 직원에게 기본으로 닫힌 메뉴 — 예전엔 코드가 따로 막아 스위치가 죽어 있었다. 지금은 이
              // 스위치가 그 닫힘이다(기본 꺼짐). 켜면 메뉴와 화면이 열리지만 **자료는 서버 권한이 판정한다.**
              const closedByDefault = audience === 'staff' && isStaffClosedByDefault(item.href);
              const opened = closedByDefault && value.staff;
              return (
                <label key={audience} className="flex cursor-pointer items-center gap-1.5"
                       title={closedByDefault
                         ? '직원에게는 기본으로 닫혀 있는 메뉴입니다. 켜면 메뉴와 화면은 열리지만, 학생 정보처럼 서버 권한(RLS)이 막는 자료는 계속 비어 보입니다.'
                         : undefined}>
                  <Switch
                    checked={value[audience]}
                    onCheckedChange={(checked) => onVisibility({ ...value, [audience]: checked })}
                    aria-label={`${item.name} ${MENU_AUDIENCE_LABELS[audience]} 노출`}
                  />
                  <span className={`text-xs ${opened ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>
                    {MENU_AUDIENCE_LABELS[audience]}{closedByDefault ? (opened ? ' · 열어 둠' : ' · 기본 닫힘') : ''}
                  </span>
                </label>
              );
            })}
            {kind === 'teacher' && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <Switch
                  checked={value.admin}
                  onCheckedChange={(checked) => onVisibility({ ...value, admin: checked })}
                  aria-label={`${item.name} 관리자 노출`}
                />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />관리자
                </span>
              </label>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground" title="끄면 돌아올 곳이 사라지는 메뉴라 늘 보입니다">항상 표시</span>
        )}
      </div>
    </div>
  );
}

interface DrawerHeaderProps {
  group: NavGroup;
  sectionKey: string;
  sections: Array<{ key: string; label: string }>;
  isDirty: boolean;
  canUp: boolean;
  canDown: boolean;
  renaming: string | null;
  onRenameStart: () => void;
  onRenameChange: (label: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onMoveTo: (targetKey: string) => void;
  onMoveBy: (delta: -1 | 1) => void;
  onDelete: () => void;
}

/** 서랍 머리 — 이름 · 자리(범례) · 위아래 · 삭제. 서랍 안에 서랍은 없으므로 자리 선택지는 범례뿐이다 */
function DrawerHeader({
  group, sectionKey, sections, isDirty, canUp, canDown, renaming,
  onRenameStart, onRenameChange, onRenameCommit, onRenameCancel, onMoveTo, onMoveBy, onDelete,
}: DrawerHeaderProps) {
  const Icon = group.icon;
  const deletable = canDeleteGroup(group);
  return (
    <div className={`flex flex-col gap-2 rounded-md px-1 py-1 lg:flex-row lg:items-center lg:justify-between ${isDirty ? 'bg-blue-50/60' : ''}`}>
      {renaming !== null ? (
        <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); onRenameCommit(); }}>
          <Input
            autoFocus
            value={renaming}
            maxLength={20}
            onChange={(e) => onRenameChange(e.target.value)}
            className="h-8 max-w-xs"
            aria-label="서랍 이름"
          />
          <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" aria-label="이름 저장"><Check className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRenameCancel} aria-label="취소"><X className="h-4 w-4" /></Button>
        </form>
      ) : (
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-600">
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate" title={group.name}>{group.name}</span>
          <span className="flex-shrink-0 font-normal text-slate-400">— 펼치는 서랍 · 메뉴 {group.children.length}개</span>
          {group.id && isCustomGroup(group.id) && <Badge variant="outline" className="text-[10px]">직접 만든 서랍</Badge>}
        </p>
      )}
      {renaming === null && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <Select value={sectionKey} onValueChange={onMoveTo}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label={`${group.name} 서랍 위치`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRenameStart} aria-label={`${group.name} 서랍 이름 바꾸기`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canUp} onClick={() => onMoveBy(-1)} aria-label={`${group.name} 서랍 위로`}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canDown} onClick={() => onMoveBy(1)} aria-label={`${group.name} 서랍 아래로`}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600 disabled:text-slate-300"
            disabled={!deletable}
            title={deletable ? '서랍 삭제' : '안의 메뉴를 먼저 다른 곳으로 옮겨야 지울 수 있습니다'}
            onClick={onDelete}
            aria-label={`${group.name} 서랍 삭제`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export const MenuManagement = () => {
  const { user } = useAuth();
  const { config: visibilityConfig, isLoading: visibilityLoading } = useMenuVisibility();
  const { config: layoutConfig, isLoading: layoutLoading } = useMenuLayout();
  const saveVisibility = useUpdateMenuVisibility();
  const saveLayout = useUpdateMenuLayout();

  const [kind, setKind] = useState<NavKind>('teacher');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<{ id: string; label: string } | null>(null);
  const [newGroup, setNewGroup] = useState<{ sectionId: string; label: string } | null>(null);

  // 저장된 설정 + 코드 기본값을 합친 기준값. 설정 객체가 실제로 바뀔 때만 새로 만들어진다.
  const visibilityBaseline = useMemo(() => buildVisibilityDraft(visibilityConfig), [visibilityConfig]);
  const treesBaseline = useMemo(() => buildTrees(layoutConfig), [layoutConfig]);
  const [visibility, setVisibility] = useState<VisibilityDraft>(visibilityBaseline);
  const [trees, setTrees] = useState<Trees>(treesBaseline);
  const bottomsBaseline = useMemo(() => buildBottoms(layoutConfig), [layoutConfig]);
  const [bottoms, setBottoms] = useState<Bottoms>(bottomsBaseline);

  // 저장 성공(→ invalidate → 재조회)이나 다른 관리자의 변경이 들어오면 기준값으로 되맞춘다.
  useEffect(() => setVisibility(visibilityBaseline), [visibilityBaseline]);
  useEffect(() => setTrees(treesBaseline), [treesBaseline]);
  useEffect(() => setBottoms(bottomsBaseline), [bottomsBaseline]);

  const dirtyVisibility = useMemo(
    () => new Set(MANAGED_MENUS.filter((m) => !isSameVisibility(visibility[m.key], visibilityBaseline[m.key])).map((m) => m.key)),
    [visibility, visibilityBaseline],
  );
  const bottomDirtyOf = (k: NavKind) => bottoms[k].join('|') !== bottomsBaseline[k].join('|');
  const layoutDirty = !sameNavShape(trees.teacher, treesBaseline.teacher) || !sameNavShape(trees.student, treesBaseline.student)
    || bottomDirtyOf('teacher') || bottomDirtyOf('student');
  const isDirty = dirtyVisibility.size > 0 || layoutDirty;
  const isSaving = saveVisibility.isPending || saveLayout.isPending;

  const tree = trees[kind];
  const editTree = (fn: (sections: NavSection[]) => NavSection[]) =>
    setTrees((prev) => ({ ...prev, [kind]: fn(prev[kind]) }));
  const containers = useMemo(() => listContainers(tree).map(({ key, label }) => ({ key, label })), [tree]);
  const manageable = tree.filter((section) => !isLockedSection(section.id));
  const sectionOptions = manageable.map((s) => ({ key: `section:${s.id}`, label: s.label || '(이름 없음)' }));
  // 서랍의 '변경됨' 판정 — 기준값에 없거나(새 서랍) 이름·범례가 달라졌다
  const baselineGroups = useMemo(
    () => new Map(listGroups(treesBaseline[kind]).map(({ group, sectionId }) => [group.id!, { name: group.name, sectionId }])),
    [treesBaseline, kind],
  );

  const resetToDefaults = () => {
    const next: VisibilityDraft = {};
    for (const menu of MANAGED_MENUS) next[menu.key] = defaultVisibilityOf(menu);
    setVisibility(next);
    setTrees({ teacher: buildManageableBase('teacher'), student: buildManageableBase('student') });
    setBottoms(buildBottoms({}));
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      if (layoutDirty) {
        const next: NavLayoutConfig = {};
        for (const k of ['teacher', 'student'] as const) {
          const layout = { ...(deriveNavLayout(buildManageableBase(k), trees[k]) ?? {}) };
          // 하단 바는 기본값과 다를 때만 적는다(코드 기본값이 바뀌면 따라가게)
          if (!isDefaultMobileBottom(bottoms[k], k)) layout.mobileBottom = bottoms[k];
          if (Object.keys(layout).length > 0) next[k] = layout;
        }
        await saveLayout.mutateAsync({ config: next, userId: user.id });
      }
      if (dirtyVisibility.size > 0) {
        await saveVisibility.mutateAsync({ config: buildMenuVisibilityPayload(visibility), userId: user.id });
      }
      toast.success('메뉴 설정을 저장했습니다. 사용자는 다음 화면 이동부터 반영됩니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '메뉴 설정을 저장하지 못했습니다.');
    }
  };

  const commitRename = () => {
    if (!renaming) return;
    const label = renaming.label.trim();
    if (label) editTree((s) => renameSection(s, renaming.id, label));
    setRenaming(null);
  };

  const commitNewSection = () => {
    const label = (newSection ?? '').trim();
    if (label) editTree((s) => addSection(s, label));
    setNewSection(null);
  };

  const commitGroupRename = () => {
    if (!renamingGroup) return;
    const label = renamingGroup.label.trim();
    if (label) editTree((s) => renameGroup(s, renamingGroup.id, label));
    setRenamingGroup(null);
  };

  const commitNewGroup = () => {
    if (!newGroup) return;
    const label = newGroup.label.trim();
    if (label) editTree((s) => addGroup(s, newGroup.sectionId, label));
    setNewGroup(null);
  };

  const resetEditing = () => { setRenaming(null); setNewSection(null); setRenamingGroup(null); setNewGroup(null); };

  if (visibilityLoading || layoutLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />메뉴 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  // `index`·`count` 는 **그 자리의 실제 배열** 기준이다(서랍도 한 칸을 차지한다) — 걸러 낸 목록의
  // 번호를 쓰면 위아래 버튼이 서랍을 건너뛴 자리로 계산돼 눌러도 엉뚱하게 움직인다.
  const renderRow = (item: NavItem, containerKey: string, index: number, count: number) => (
      <MenuRow
        key={item.href}
        item={item}
        kind={kind}
        containerKey={containerKey}
        containers={containers}
        value={MANAGED_MENU_BY_KEY.has(item.href) ? visibility[item.href] : null}
        isDirty={dirtyVisibility.has(item.href) || containerKeyOf(treesBaseline[kind], item.href) !== containerKey}
        canUp={index > 0}
        canDown={index < count - 1}
        onVisibility={(next) => setVisibility((prev) => ({ ...prev, [item.href]: next }))}
        onMoveTo={(target) => editTree((s) => moveItemTo(s, item.href, target))}
        onMoveBy={(delta) => editTree((s) => moveItemBy(s, item.href, delta))}
      />
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />메뉴 관리</CardTitle>
          <CardDescription>
            사이드바의 <strong>범례</strong>를 만들고 메뉴를 옮기며, 메뉴마다 <strong>학생 · 교사 · 직원 · 관리자</strong>에게
            보일지를 따로 정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-1 text-sm">
              <p>
                끈 메뉴는 <strong>주소로 직접 들어가도 홈으로 돌아갑니다</strong> — 메뉴만 감추면 북마크·기존 링크로
                들어와지기 때문입니다. 범례와 서랍은 <strong>비어 있어야 지울 수 있습니다</strong>(메뉴를 먼저 옮기세요).
                서랍은 이름을 바꾸거나 다른 범례로 통째로 옮길 수 있고, 범례마다 새 서랍을 만들 수 있습니다.
              </p>
              <p>
                <strong>직원 · 기본 닫힘</strong>과 <strong>관리자만 보이는 메뉴</strong>(시간표 생성·간격반복 학습)는 예전엔
                코드가 따로 막던 것입니다. 이제 이 스위치가 그 닫힘이라 여기서 열 수 있습니다 — 다만 열리는 것은
                <strong> 메뉴와 화면까지</strong>이고, 학생 정보 같은 자료는 서버 권한이 그대로 판정합니다(직원에게 켜면 빈 화면일 수 있습니다).
              </p>
              <p className="text-muted-foreground">
                홈 대시보드와 [관리]는 늘 그대로입니다(끄거나 옮기면 돌아올 곳과 되돌릴 화면이 사라집니다). 권한 자체는
                종전대로 역할·RLS 가 판정하며, 이 설정은 노출 범위와 자리만 바꿉니다. 휴대폰의 전체 메뉴는 이 순서 그대로이고,
                하단 바는 아래 «모바일 하단 메뉴»에서 따로 정합니다.
              </p>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-100 bg-slate-100/50 p-1" role="group" aria-label="편집할 메뉴">
              {(Object.keys(KIND_LABELS) as NavKind[]).map((k) => (
                <Button
                  key={k}
                  variant="ghost"
                  size="sm"
                  aria-pressed={kind === k}
                  onClick={() => { setKind(k); resetEditing(); }}
                  className={`h-7 rounded-md px-3 text-xs ${kind === k ? 'bg-white font-medium text-blue-600 shadow-sm hover:bg-white hover:text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {KIND_LABELS[k]}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isDirty && (
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  저장 전 변경{dirtyVisibility.size > 0 ? ` · 노출 ${dirtyVisibility.size}개` : ''}{layoutDirty ? ' · 배치' : ''}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setNewSection('')}>
                <FolderPlus className="mr-1.5 h-4 w-4" />범례 추가
              </Button>
              <Button variant="ghost" size="sm" onClick={resetToDefaults}>
                <RotateCcw className="mr-1.5 h-4 w-4" />기본값으로
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={!isDirty || isSaving} onClick={handleSave}>
                <Save className="mr-1.5 h-4 w-4" />{isSaving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <MobileBottomEditor
        tree={tree}
        hrefs={bottoms[kind]}
        isDirty={bottomDirtyOf(kind)}
        hiddenHrefs={new Set(MANAGED_MENUS.filter((m) => KIND_AUDIENCES[kind].every((a) => visibility[m.key] && !visibility[m.key][a])).map((m) => m.key))}
        onChange={(next) => setBottoms((prev) => ({ ...prev, [kind]: next }))}
      />

      {manageable.map((section, index) => {
        const deletable = canDeleteSection(section);
        const isRenaming = renaming?.id === section.id;
        return (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isRenaming ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); commitRename(); }}>
                    <Input
                      autoFocus
                      value={renaming.label}
                      maxLength={20}
                      onChange={(e) => setRenaming({ id: section.id, label: e.target.value })}
                      className="h-8 max-w-xs"
                      aria-label="범례 이름"
                    />
                    <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" aria-label="이름 저장"><Check className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRenaming(null)} aria-label="취소"><X className="h-4 w-4" /></Button>
                  </form>
                ) : (
                  <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                    <span className="truncate">{section.label || '(이름 없는 범례)'}</span>
                    {isCustomSection(section.id) && <Badge variant="outline" className="text-[10px]">직접 만든 범례</Badge>}
                  </CardTitle>
                )}
                {!isRenaming && (
                  <div className="flex flex-shrink-0 items-center">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setNewGroup({ sectionId: section.id, label: '' })}>
                      <PackagePlus className="mr-1 h-3.5 w-3.5" />서랍 추가
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRenaming({ id: section.id, label: section.label })} aria-label={`${section.label} 이름 바꾸기`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => editTree((s) => moveSection(s, section.id, -1))} aria-label={`${section.label} 위로`}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === manageable.length - 1} onClick={() => editTree((s) => moveSection(s, section.id, 1))} aria-label={`${section.label} 아래로`}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600 disabled:text-slate-300"
                      disabled={!deletable}
                      title={deletable ? '범례 삭제' : '메뉴를 먼저 다른 범례로 옮겨야 지울 수 있습니다'}
                      onClick={() => editTree((s) => deleteSection(s, section.id))}
                      aria-label={`${section.label} 삭제`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.items.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  비어 있는 범례입니다 — 메뉴의 위치에서 이 범례를 고르면 여기로 옵니다. 빈 범례는 사이드바에 나타나지 않습니다.
                </p>
              )}
              {section.items.map((entry, index) => {
                if (!isNavGroup(entry)) return renderRow(entry, `section:${section.id}`, index, section.items.length);
                const groupId = entry.id;
                const was = groupId ? baselineGroups.get(groupId) : undefined;
                const groupDirty = !!groupId && (!was || was.name !== entry.name || was.sectionId !== section.id);
                return (
                  <div key={groupId ?? entry.name} className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-2">
                    {groupId ? (
                      <DrawerHeader
                        group={entry}
                        sectionKey={sectionKeyOfGroup(tree, groupId) ?? `section:${section.id}`}
                        sections={sectionOptions}
                        isDirty={groupDirty}
                        canUp={index > 0}
                        canDown={index < section.items.length - 1}
                        renaming={renamingGroup?.id === groupId ? renamingGroup.label : null}
                        onRenameStart={() => setRenamingGroup({ id: groupId, label: entry.name })}
                        onRenameChange={(label) => setRenamingGroup({ id: groupId, label })}
                        onRenameCommit={commitGroupRename}
                        onRenameCancel={() => setRenamingGroup(null)}
                        onMoveTo={(target) => editTree((s) => moveGroupTo(s, groupId, target))}
                        onMoveBy={(delta) => editTree((s) => moveGroupBy(s, groupId, delta))}
                        onDelete={() => editTree((s) => deleteGroup(s, groupId))}
                      />
                    ) : (
                      <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500">
                        <entry.icon className="h-3.5 w-3.5" />{entry.name} <span className="font-normal text-slate-400">— 펼치는 서랍</span>
                      </p>
                    )}
                    {entry.children.length === 0 && (
                      <p className="rounded-md border border-dashed bg-white px-3 py-3 text-center text-[11px] text-muted-foreground">
                        비어 있는 서랍입니다 — 메뉴의 위치에서 이 서랍을 고르면 여기로 옵니다. 빈 서랍은 사이드바에 나타나지 않습니다.
                      </p>
                    )}
                    {entry.children.map((child, childIndex) =>
                      renderRow(child, `group:${entry.id}`, childIndex, entry.children.length))}
                  </div>
                );
              })}
              {newGroup?.sectionId === section.id && (
                <form
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/40 p-2"
                  onSubmit={(e) => { e.preventDefault(); commitNewGroup(); }}
                >
                  <Input
                    autoFocus
                    value={newGroup.label}
                    maxLength={20}
                    onChange={(e) => setNewGroup({ sectionId: section.id, label: e.target.value })}
                    placeholder="새 서랍 이름 (예: 행정 업무)"
                    className="h-8 max-w-xs"
                    aria-label="새 서랍 이름"
                  />
                  <Button type="submit" size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" disabled={!newGroup.label.trim()}>추가</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setNewGroup(null)}>취소</Button>
                  <span className="text-xs text-muted-foreground">이 범례의 맨 아래에 생깁니다. 메뉴의 위치에서 이 서랍을 골라 채우세요.</span>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })}

      {newSection !== null && (
        <Card className="border-blue-200">
          <CardContent className="pt-6">
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); commitNewSection(); }}>
              <Input autoFocus value={newSection} maxLength={20} onChange={(e) => setNewSection(e.target.value)} placeholder="새 범례 이름 (예: 행정)" className="h-9 max-w-xs" aria-label="새 범례 이름" />
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={!newSection.trim()}>추가</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewSection(null)}>취소</Button>
              <span className="text-xs text-muted-foreground">{KIND_LABELS[kind]}의 맨 아래에 생깁니다.</span>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
