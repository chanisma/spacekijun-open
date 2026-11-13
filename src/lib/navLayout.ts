/**
 * 메뉴 배치(범례·메뉴 위치)의 순수 로직 (2026-09-21) — React 비의존, Node 회귀가 그대로 import 한다.
 *
 * 관리자가 Admin ▸ 메뉴 관리에서 **범례(섹션)를 추가·이름 변경·삭제하고 메뉴를 옮긴다.**
 * 저장 위치 = `system_settings` 의 `menu_layout` 키 하나(JSONB). 노출 설정(`menu_visibility`)과
 * 같은 이유로 새 테이블을 만들지 않았다(public read + admin write 가 이미 맞는 권한 모양이다).
 *
 * 코드(`config/navigation.ts`)가 **기본 배치**이고 저장값은 그 위에 얹는 **차이**다:
 * ```json
 * { "teacher": {
 *     "sections":   [{ "id": "today", "label": "오늘" }, { "id": "custom:k3x9", "label": "행정" }],
 *     "placements": { "/documents": "section:custom:k3x9" },
 *     "order":      { "section:tools": ["/toolbox", "/collab"] },
 *     "groups":     { "tasks-hub": "업무", "custom:p2m8": "행정 서랍" },
 *     "deletedGroups": ["analytics-hub"] } }
 * ```
 *
 * **서랍(NavGroup)도 관리한다 (2026-10-11)** — 이름 변경 · 다른 범례로 이동(`placements` 의 키가
 * `group:<id>`, 값은 `section:<id>` 만) · 범례 안 순서(`order` 가 원래 `group:<id>` 를 담는다) ·
 * 새 서랍(`groups` 에 `custom:` id 로 이름이 있으면 생성) · 삭제(`deletedGroups` — 비었을 때만 실제로 사라진다).
 *
 * ── 불변식: **배치 설정 때문에 메뉴가 사라지면 안 된다** ─────────────────────────
 *   · 대상 범례·서랍이 없는 이동은 무시한다(메뉴는 원래 자리에 남는다).
 *   · 삭제한 범례에 항목이 남아 있으면(권한으로 나중에 주입되는 메뉴 등) 그 범례는 되살아난다.
 *   · 코드에 새로 생긴 범례·메뉴는 저장값에 없어도 코드의 자리에 나타난다.
 *   · 순서 목록에 없는 메뉴는 그 범례의 끝에 붙는다.
 *   · 지운 서랍에 메뉴가 남아 있으면 그 서랍은 되살아난다(범례와 같은 규칙).
 *   · 서랍 안에 서랍은 없다 — 서랍의 이동 대상은 범례뿐이다.
 * 노출을 끄는 것은 이 파일의 일이 아니다 — 그것은 `menuVisibility.ts` 가 한다.
 */
import { Folder } from 'lucide-react';
import { isNavGroup, type NavEntry, type NavGroup, type NavItem, type NavSection } from '@/config/navigation';
import { normalizeMobileBottom } from '@/lib/navMobileLayout';

export const MENU_LAYOUT_SETTING_KEY = 'menu_layout';

/** 네비는 두 벌이다 — 교사·직원·관리자가 보는 것과 학생이 보는 것 */
export type NavKind = 'teacher' | 'student';
export const NAV_KINDS: NavKind[] = ['teacher', 'student'];

export interface NavLayoutSection {
  id: string;
  label: string;
}

export interface NavLayout {
  /** 범례의 순서·이름. 없으면 코드 순서 그대로 */
  sections?: NavLayoutSection[];
  /** 옮긴 것만 — 메뉴 href → `section:<id>` | `group:<id>`, 서랍 `group:<id>` → `section:<id>` */
  placements?: Record<string, string>;
  /** 순서를 바꾼 곳만 — 컨테이너 키 → 항목 키 목록(메뉴 = href, 서랍 = `group:<id>`) */
  order?: Record<string, string[]>;
  /** 서랍 이름 — 코드 서랍은 바꾼 것만, 관리자가 만든 서랍(`custom:`)은 늘(= 생성 기록) */
  groups?: Record<string, string>;
  /** 관리자가 지운 코드 서랍 id — 비었을 때만 실제로 사라진다 */
  deletedGroups?: string[];
  /**
   * 모바일 하단 바의 메뉴 href(최대 5, 순서 = 칸 순서) — 기본값과 다를 때만 (2026-10-25).
   * 사이드바 배치와 **따로 논다** — 판정은 `navMobileLayout.ts`
   */
  mobileBottom?: string[];
}

export type NavLayoutConfig = Partial<Record<NavKind, NavLayout>>;

export const EMPTY_NAV_LAYOUT_CONFIG: NavLayoutConfig = {};

/** 관리자가 만든 범례의 id 접두 — 코드의 범례 id 와 부딪히지 않게 한다 */
export const CUSTOM_SECTION_PREFIX = 'custom:';

/**
 * 관리 대상이 아닌 범례 — 항상 맨 끝에, 코드가 정한 순서로 남는다.
 * `admin`(관리)은 설정을 되돌릴 유일한 화면의 진입점이고, `external`·`student-extra` 는
 * 외부 메뉴·미리보기 항목이 그때그때 주입되는 자리라 편집 대상이 될 수 없다.
 */
export const LOCKED_SECTION_IDS: readonly string[] = ['admin', 'external', 'student-extra'];

export const isLockedSection = (id: string) => LOCKED_SECTION_IDS.includes(id);
export const isCustomSection = (id: string) => id.startsWith(CUSTOM_SECTION_PREFIX);
/** 관리자가 만든 서랍도 같은 접두를 쓴다(키가 `group:` 으로 갈리므로 범례 id 와 부딪히지 않는다) */
export const isCustomGroup = (id: string) => id.startsWith(CUSTOM_SECTION_PREFIX);

export const sectionKey = (id: string) => `section:${id}`;
export const groupKey = (id: string) => `group:${id}`;

// ── 파싱 ────────────────────────────────────────────────────────────────────

function parseLayout(raw: unknown): NavLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: NavLayout = {};

  if (Array.isArray(src.sections)) {
    const seen = new Set<string>();
    const sections: NavLayoutSection[] = [];
    for (const s of src.sections) {
      if (!s || typeof s !== 'object') continue;
      const { id, label } = s as Record<string, unknown>;
      if (typeof id !== 'string' || !id || typeof label !== 'string' || seen.has(id)) continue;
      if (isLockedSection(id)) continue;
      seen.add(id);
      sections.push({ id, label: label.trim() });
    }
    if (sections.length > 0) out.sections = sections;
  }

  if (src.placements && typeof src.placements === 'object' && !Array.isArray(src.placements)) {
    const placements: Record<string, string> = {};
    for (const [href, target] of Object.entries(src.placements as Record<string, unknown>)) {
      if (typeof target !== 'string') continue;
      if (href.startsWith('/')) {
        if (!target.startsWith('section:') && !target.startsWith('group:')) continue;
      } else if (href.startsWith('group:')) {
        if (!target.startsWith('section:')) continue; // 서랍 안에 서랍은 없다
      } else continue;
      placements[href] = target;
    }
    if (Object.keys(placements).length > 0) out.placements = placements;
  }

  if (src.order && typeof src.order === 'object' && !Array.isArray(src.order)) {
    const order: Record<string, string[]> = {};
    for (const [key, list] of Object.entries(src.order as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const hrefs = list.filter((h): h is string => typeof h === 'string');
      if (hrefs.length > 0) order[key] = hrefs;
    }
    if (Object.keys(order).length > 0) out.order = order;
  }

  if (src.groups && typeof src.groups === 'object' && !Array.isArray(src.groups)) {
    const groups: Record<string, string> = {};
    for (const [id, name] of Object.entries(src.groups as Record<string, unknown>)) {
      if (!id || typeof name !== 'string' || !name.trim()) continue;
      groups[id] = name.trim();
    }
    if (Object.keys(groups).length > 0) out.groups = groups;
  }

  const mobileBottom = normalizeMobileBottom(src.mobileBottom);
  if (mobileBottom) out.mobileBottom = mobileBottom;

  if (Array.isArray(src.deletedGroups)) {
    const deleted = [...new Set(src.deletedGroups.filter((id): id is string => typeof id === 'string' && !!id))];
    if (deleted.length > 0) out.deletedGroups = deleted;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** 저장된 JSONB 를 안전하게 읽는다. 모양이 어긋난 부분은 버리고 나머지를 쓴다 */
export function parseNavLayoutConfig(value: unknown): NavLayoutConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: NavLayoutConfig = {};
  for (const kind of NAV_KINDS) {
    const layout = parseLayout((value as Record<string, unknown>)[kind]);
    if (layout) out[kind] = layout;
  }
  return out;
}

// ── 트리 도구 ────────────────────────────────────────────────────────────────

/** 깊은 복사 — 섹션·서랍의 배열을 새로 만든다(항목 객체는 공유해도 된다, 고치지 않는다) */
export function cloneNavSections(sections: readonly NavSection[]): NavSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((entry) => (isNavGroup(entry) ? { ...entry, children: [...entry.children] } : entry)),
  }));
}

interface Container {
  key: string;
  label: string;
  items: NavEntry[] | NavItem[];
}

/** 메뉴를 담을 수 있는 자리 전부 — 범례와 그 안의 서랍. 잠긴 범례는 뺀다 */
export function listContainers(sections: NavSection[]): Container[] {
  const out: Container[] = [];
  for (const section of sections) {
    if (isLockedSection(section.id)) continue;
    out.push({ key: sectionKey(section.id), label: section.label || '(이름 없음)', items: section.items });
    for (const entry of section.items) {
      if (isNavGroup(entry) && entry.id) {
        out.push({ key: groupKey(entry.id), label: `${section.label || '(이름 없음)'} › ${entry.name}`, items: entry.children });
      }
    }
  }
  return out;
}

/** 이 메뉴가 지금 어느 자리에 있는가 */
export function containerKeyOf(sections: NavSection[], href: string): string | null {
  for (const c of listContainers(sections)) {
    if (c.items.some((e) => !isNavGroup(e) && e.href === href)) return c.key;
  }
  return null;
}

function takeItem(sections: NavSection[], href: string): NavItem | null {
  for (const c of listContainers(sections)) {
    const idx = c.items.findIndex((e) => !isNavGroup(e) && e.href === href);
    if (idx >= 0) return c.items.splice(idx, 1)[0] as NavItem;
  }
  return null;
}

/** 컨테이너 안 메뉴(서랍 제외)의 href 순서 */
export function hrefsOf(sections: NavSection[], key: string): string[] {
  const c = listContainers(sections).find((x) => x.key === key);
  if (!c) return [];
  return (c.items as NavEntry[]).flatMap((e) => (isNavGroup(e) ? [] : [e.href]));
}

/** 관리 가능한 서랍 전부(잠긴 범례 안의 것은 뺀다) — 그 서랍이 든 범례 id 와 함께 */
export function listGroups(sections: NavSection[]): Array<{ group: NavGroup; sectionId: string }> {
  const out: Array<{ group: NavGroup; sectionId: string }> = [];
  for (const section of sections) {
    if (isLockedSection(section.id)) continue;
    for (const entry of section.items) {
      if (isNavGroup(entry) && entry.id) out.push({ group: entry, sectionId: section.id });
    }
  }
  return out;
}

/** 이 서랍이 지금 어느 범례에 있는가 (`section:<id>`) */
export function sectionKeyOfGroup(sections: NavSection[], groupId: string): string | null {
  const found = listGroups(sections).find((g) => g.group.id === groupId);
  return found ? sectionKey(found.sectionId) : null;
}

function takeGroup(sections: NavSection[], groupId: string): NavGroup | null {
  for (const section of sections) {
    if (isLockedSection(section.id)) continue;
    const idx = section.items.findIndex((e) => isNavGroup(e) && e.id === groupId);
    if (idx >= 0) return section.items.splice(idx, 1)[0] as NavGroup;
  }
  return null;
}

function replaceGroup(sections: NavSection[], groupId: string, next: NavGroup) {
  for (const section of sections) {
    const idx = section.items.findIndex((e) => isNavGroup(e) && e.id === groupId);
    if (idx >= 0) { section.items[idx] = next; return; }
  }
}

/** `section:<id>` 키로 관리 가능한 범례를 찾는다(잠긴 범례는 대상이 아니다) */
function findSection(sections: NavSection[], key: string): NavSection | undefined {
  if (!key.startsWith('section:')) return undefined;
  const id = key.slice('section:'.length);
  return isLockedSection(id) ? undefined : sections.find((s) => s.id === id);
}

/** 관리자가 만든 서랍의 모양 — 아이콘은 하나로 고정한다 */
function makeCustomGroup(id: string, name: string): NavGroup {
  return { kind: 'group', id, name, icon: Folder, color: 'text-slate-600', children: [] };
}

// ── 적용 ────────────────────────────────────────────────────────────────────

/**
 * 기본 배치(코드 + 동적 주입이 끝난 섹션들)에 저장된 배치를 얹는다.
 * 입력은 **이미 깊은 복사된** 배열이어야 한다(원본 상수 오염 방지). 새 배열을 돌려준다.
 */
export function applyNavLayout(base: NavSection[], layout: NavLayout | null | undefined): NavSection[] {
  if (!layout) return base;

  // ① 범례의 순서·이름 + 관리자가 만든 범례
  let sections = base;
  if (layout.sections) {
    const byId = new Map(base.map((s) => [s.id, s]));
    const used = new Set<string>();
    const ordered: NavSection[] = [];
    for (const cfg of layout.sections) {
      const found = byId.get(cfg.id);
      if (found) {
        ordered.push({ ...found, label: cfg.label });
        used.add(cfg.id);
      } else if (isCustomSection(cfg.id)) {
        ordered.push({ id: cfg.id, label: cfg.label, items: [] });
        used.add(cfg.id);
      }
      // 코드에서 사라진 범례 id 는 조용히 건너뛴다
    }
    // 저장값에 없는 범례 = 코드에 새로 생겼거나 관리자가 지운 것. 일단 살려 두고 ④에서 빈 것만 치운다
    const rest = base.filter((s) => !used.has(s.id) && !isLockedSection(s.id));
    const locked = base.filter((s) => isLockedSection(s.id));
    sections = [...ordered, ...rest, ...locked];
  }

  // ①-② 서랍 — 이름 변경 + 관리자가 만든 서랍(자리는 placements, 없으면 첫 범례의 끝)
  if (layout.groups) {
    const existing = new Map(listGroups(sections).map(({ group }) => [group.id!, group]));
    for (const [id, name] of Object.entries(layout.groups)) {
      const found = existing.get(id);
      if (found) {
        replaceGroup(sections, id, { ...found, name });
        continue;
      }
      if (!isCustomGroup(id)) continue; // 코드에서 사라진 서랍
      const target = findSection(sections, layout.placements?.[groupKey(id)] ?? '')
        ?? sections.find((s) => !isLockedSection(s.id));
      target?.items.push(makeCustomGroup(id, name));
    }
  }

  // ②-① 서랍 이동 — 대상 범례가 없으면 그 자리에 둔다. 메뉴 이동보다 먼저(서랍째 옮긴 뒤 메뉴가 들어간다)
  if (layout.placements) {
    for (const [key, target] of Object.entries(layout.placements)) {
      if (!key.startsWith('group:')) continue;
      const id = key.slice('group:'.length);
      const dest = findSection(sections, target);
      if (!dest || sectionKeyOfGroup(sections, id) === target) continue;
      const group = takeGroup(sections, id);
      if (group) dest.items.push(group);
    }
  }

  // ② 메뉴 이동 — 대상이 없으면 그 자리에 둔다
  if (layout.placements) {
    const keys = new Set(listContainers(sections).map((c) => c.key));
    for (const [href, target] of Object.entries(layout.placements)) {
      if (!href.startsWith('/')) continue;
      if (!keys.has(target) || containerKeyOf(sections, href) === target) continue;
      const item = takeItem(sections, href);
      if (!item) continue; // 이 사용자에게는 없는 메뉴(권한으로 주입되지 않음)
      listContainers(sections).find((c) => c.key === target)!.items.push(item);
    }
  }

  // ③ 순서 — 목록에 없는 메뉴·서랍은 뒤에, 서로의 순서는 유지(안정 정렬)
  if (layout.order) {
    for (const [key, hrefs] of Object.entries(layout.order)) {
      const c = listContainers(sections).find((x) => x.key === key);
      if (!c) continue;
      const rank = new Map(hrefs.map((h, i) => [h, i]));
      const rankOf = (e: NavEntry) => rank.get(entryKey(e));
      const sorted = [...c.items].sort((a, b) => {
        const ra = rankOf(a);
        const rb = rankOf(b);
        if (ra === undefined && rb === undefined) return 0;
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });
      c.items.splice(0, c.items.length, ...(sorted as NavItem[]));
    }
  }

  // ④-① 관리자가 지운 코드 서랍 — 비었을 때만 실제로 사라진다(범례 정리보다 먼저: 서랍이 빠져야 범례가 빈다)
  if (layout.deletedGroups) {
    const deleted = new Set(layout.deletedGroups);
    for (const section of sections) {
      if (isLockedSection(section.id)) continue;
      section.items = section.items.filter((e) => !(isNavGroup(e) && e.id && deleted.has(e.id) && e.children.length === 0));
    }
  }

  // ④ 관리자가 지운 코드 범례 — 비었을 때만 실제로 사라진다(남은 항목이 있으면 되살아난다)
  if (layout.sections) {
    const kept = new Set(layout.sections.map((s) => s.id));
    sections = sections.filter((s) => kept.has(s.id) || isLockedSection(s.id) || s.items.length > 0);
  }

  return sections;
}

// ── 편집 연산 (관리 화면용 — 전부 새 배열을 돌려준다) ─────────────────────────

export function newCustomSectionId(existing: readonly NavSection[]): string {
  const taken = new Set(existing.map((s) => s.id));
  for (;;) {
    const id = `${CUSTOM_SECTION_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** 새 범례를 잠긴 범례 **앞**에 넣는다(관리 섹션이 늘 맨 끝이어야 한다) */
export function addSection(sections: NavSection[], label: string, id = newCustomSectionId(sections)): NavSection[] {
  const next = cloneNavSections(sections);
  const at = next.findIndex((s) => isLockedSection(s.id));
  next.splice(at < 0 ? next.length : at, 0, { id, label: label.trim(), items: [] });
  return next;
}

export function renameSection(sections: NavSection[], id: string, label: string): NavSection[] {
  return cloneNavSections(sections).map((s) => (s.id === id ? { ...s, label: label.trim() } : s));
}

/** 비어 있는 범례만 지울 수 있다 — 메뉴를 먼저 다른 곳으로 옮겨야 한다 */
export function canDeleteSection(section: NavSection): boolean {
  return !isLockedSection(section.id) && section.items.length === 0;
}

export function deleteSection(sections: NavSection[], id: string): NavSection[] {
  const target = sections.find((s) => s.id === id);
  if (!target || !canDeleteSection(target)) return sections;
  return cloneNavSections(sections).filter((s) => s.id !== id);
}

export function moveSection(sections: NavSection[], id: string, delta: -1 | 1): NavSection[] {
  const next = cloneNavSections(sections);
  const from = next.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return sections;
  if (isLockedSection(next[from].id) || isLockedSection(next[to].id)) return sections;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** 메뉴를 다른 범례·서랍의 끝으로 옮긴다 */
export function moveItemTo(sections: NavSection[], href: string, targetKey: string): NavSection[] {
  const next = cloneNavSections(sections);
  const target = listContainers(next).find((c) => c.key === targetKey);
  if (!target || containerKeyOf(next, href) === targetKey) return sections;
  const item = takeItem(next, href);
  if (!item) return sections;
  listContainers(next).find((c) => c.key === targetKey)!.items.push(item);
  return next;
}

/** 같은 자리 안에서 한 칸 위·아래로 (서랍은 건너뛰지 않고 자리만 바꾼다) */
export function moveItemBy(sections: NavSection[], href: string, delta: -1 | 1): NavSection[] {
  const next = cloneNavSections(sections);
  const key = containerKeyOf(next, href);
  const c = key && listContainers(next).find((x) => x.key === key);
  if (!c) return sections;
  const from = c.items.findIndex((e) => !isNavGroup(e) && e.href === href);
  const to = from + delta;
  if (to < 0 || to >= c.items.length) return sections;
  const items = c.items as NavEntry[];
  [items[from], items[to]] = [items[to], items[from]];
  return next;
}

// ── 서랍 편집 (관리 화면용 — 전부 새 배열을 돌려준다) ───────────────────────

export function newCustomGroupId(existing: NavSection[]): string {
  const taken = new Set(listGroups(existing).map(({ group }) => group.id));
  for (;;) {
    const id = `${CUSTOM_SECTION_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** 새 서랍을 그 범례의 끝에 만든다 */
export function addGroup(sections: NavSection[], sectionId: string, name: string, id = newCustomGroupId(sections)): NavSection[] {
  const label = name.trim();
  if (!label) return sections;
  const next = cloneNavSections(sections);
  const target = findSection(next, sectionKey(sectionId));
  if (!target) return sections;
  target.items.push(makeCustomGroup(id, label));
  return next;
}

export function renameGroup(sections: NavSection[], groupId: string, name: string): NavSection[] {
  const label = name.trim();
  const found = listGroups(sections).find(({ group }) => group.id === groupId);
  if (!label || !found) return sections;
  const next = cloneNavSections(sections);
  replaceGroup(next, groupId, { ...found.group, children: [...found.group.children], name: label });
  return next;
}

/** 비어 있는 서랍만 지울 수 있다 — 메뉴를 먼저 다른 곳으로 옮겨야 한다 */
export function canDeleteGroup(group: NavGroup): boolean {
  return group.children.length === 0;
}

export function deleteGroup(sections: NavSection[], groupId: string): NavSection[] {
  const found = listGroups(sections).find(({ group }) => group.id === groupId);
  if (!found || !canDeleteGroup(found.group)) return sections;
  const next = cloneNavSections(sections);
  takeGroup(next, groupId);
  return next;
}

/** 서랍을 다른 범례의 끝으로 옮긴다(안의 메뉴는 함께 간다) */
export function moveGroupTo(sections: NavSection[], groupId: string, targetKey: string): NavSection[] {
  const next = cloneNavSections(sections);
  const dest = findSection(next, targetKey);
  if (!dest || sectionKeyOfGroup(next, groupId) === targetKey) return sections;
  const group = takeGroup(next, groupId);
  if (!group) return sections;
  dest.items.push(group);
  return next;
}

/** 서랍을 같은 범례 안에서 한 칸 위·아래로 (메뉴와 자리를 바꾼다) */
export function moveGroupBy(sections: NavSection[], groupId: string, delta: -1 | 1): NavSection[] {
  const next = cloneNavSections(sections);
  const section = next.find((s) => !isLockedSection(s.id) && s.items.some((e) => isNavGroup(e) && e.id === groupId));
  if (!section) return sections;
  const from = section.items.findIndex((e) => isNavGroup(e) && e.id === groupId);
  const to = from + delta;
  if (to < 0 || to >= section.items.length) return sections;
  [section.items[from], section.items[to]] = [section.items[to], section.items[from]];
  return next;
}

// ── 저장값 도출 ─────────────────────────────────────────────────────────────

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 편집한 트리에서 저장값(코드 기본 배치와의 **차이**)을 뽑는다. 차이가 없으면 `null`.
 *
 * 차이만 적는 이유 — 기본 배치를 통째로 저장하면 나중에 코드에서 메뉴 자리를 옮겨도
 * "설정을 건드린 적도 없는데 옛 자리에 고정"되는 유령 설정이 남는다(노출 설정과 같은 규약).
 */
export function deriveNavLayout(base: NavSection[], edited: NavSection[]): NavLayout | null {
  const manageable = (list: NavSection[]) => list.filter((s) => !isLockedSection(s.id));
  const layout: NavLayout = {};

  const baseSections = manageable(base).map((s) => ({ id: s.id, label: s.label }));
  const editedSections = manageable(edited).map((s) => ({ id: s.id, label: s.label }));
  const sectionsChanged =
    baseSections.length !== editedSections.length ||
    baseSections.some((s, i) => s.id !== editedSections[i].id || s.label !== editedSections[i].label);
  if (sectionsChanged) layout.sections = editedSections;

  // 서랍 — 이름(코드 서랍은 바뀐 것만, 만든 서랍은 늘) · 지운 코드 서랍
  const baseGroups = new Map(listGroups(base).map(({ group, sectionId }) => [group.id!, { name: group.name, sectionId }]));
  const editedGroups = listGroups(edited);
  const groups: Record<string, string> = {};
  for (const { group } of editedGroups) {
    const was = baseGroups.get(group.id!);
    if (!was || was.name !== group.name) groups[group.id!] = group.name;
  }
  if (Object.keys(groups).length > 0) layout.groups = groups;
  const editedIds = new Set(editedGroups.map(({ group }) => group.id));
  const deletedGroups = [...baseGroups.keys()].filter((id) => !editedIds.has(id));
  if (deletedGroups.length > 0) layout.deletedGroups = deletedGroups;

  const placements: Record<string, string> = {};
  for (const { group, sectionId } of editedGroups) {
    const was = baseGroups.get(group.id!);
    // 만든 서랍은 자리를 늘 적는다 — 없으면 적용 때 첫 범례로 간다
    if (!was || was.sectionId !== sectionId) placements[groupKey(group.id!)] = sectionKey(sectionId);
  }
  for (const c of listContainers(edited)) {
    for (const e of c.items) {
      if (isNavGroup(e)) continue;
      if (containerKeyOf(base, e.href) !== c.key) placements[e.href] = c.key;
    }
  }
  if (Object.keys(placements).length > 0) layout.placements = placements;

  // 순서 — 범례·서랍·이동만 적용한 결과와 다른 곳만 적는다
  const withoutOrder = applyNavLayout(cloneNavSections(base), {
    sections: layout.sections, placements: layout.placements, groups: layout.groups, deletedGroups: layout.deletedGroups,
  });
  const order: Record<string, string[]> = {};
  for (const c of listContainers(edited)) {
    const want = entryKeys(c.items);
    const got = entryKeys(listContainers(withoutOrder).find((x) => x.key === c.key)?.items ?? []);
    if (!sameList(want, got)) order[c.key] = want;
  }
  if (Object.keys(order).length > 0) layout.order = order;

  return Object.keys(layout).length > 0 ? layout : null;
}

/** 순서 목록의 항목 키 — 메뉴는 href, 서랍은 `group:<id>`(서랍도 범례 안에서 자리를 갖는다) */
function entryKey(e: NavEntry): string {
  return isNavGroup(e) ? `group:${(e as NavGroup).id ?? e.name}` : e.href;
}
function entryKeys(items: ReadonlyArray<NavEntry>): string[] {
  return items.map(entryKey);
}

/** 두 트리의 모양(범례 순서·이름·항목 순서)이 같은가 — 관리 화면의 '변경됨' 판정 */
export function sameNavShape(a: NavSection[], b: NavSection[]): boolean {
  const shape = (list: NavSection[]) =>
    JSON.stringify(
      list.map((s) => [s.id, s.label, s.items.map((e) => (isNavGroup(e) ? [e.id ?? e.name, e.name, e.children.map((c) => c.href)] : e.href))]),
    );
  return shape(a) === shape(b);
}
