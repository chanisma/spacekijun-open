import { useState } from "react";
import {
    Users,
    Server,
    GraduationCap,
    Calendar,
    Shield,
    BookOpen,
    ExternalLink,
    Info,
    Puzzle,
    Building2,
    Tags,
    Settings,
    KeyRound,
    LayoutDashboard,
    Database,
    BookMarked,
    BookCopy,
    UsersRound,
    CalendarClock,
    CalendarRange,
    ListTree,
    Vote,
    Bell,
    ListChecks,
    Briefcase,
    Shapes,
    Bot,
    Coins,
    ChevronRight,
    ScrollText,
    Hammer,
    Egg,
    Telescope,
    Gamepad2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type AdminTab =
    | "dashboard"
    | "users"
    | "teachers"
    | "resources"
    | "accounts"
    | "tags"
    | "sections"
    | "meetings"
    | "permissions"
    | "students"
    | "student-data"
    | "curriculum"
    | "offerings"
    | "enrollments"
    | "timetables"
    | "teacher-timetables"
    | "selectable-subjects"
    | "selection-history"
    | "menus"
    | "iframes"
    | "dashboard-info"
    | "notifications"
    | "academy-workshop"
    | "tamagotchi"
    | "star-tower"
    | "isekai3d"
    | "coins"
    | "ai-logs"
    | "mcp-agents"
    | "plugins"
    | "departments"
    | "duty-seats"
    | "subject-groups"
    | "automations"
    | "settings";

interface AdminSidebarProps {
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    className?: string;
}

type SidebarItem = { value: AdminTab; label: string; icon: typeof Users; step?: number };
type SidebarGroup = { id: string; label: string; items: SidebarItem[] };

/**
 * 관리 탭 묶음 (2026-10-25 — 탭이 서른 개를 넘어 목적별로 묶고 접을 수 있게 했다, 사용자 요청).
 * 묶음 머리를 누르면 접힌다(펼침 상태는 이 브라우저에 기억). 지금 열린 탭이 든 묶음은 늘 펼쳐 보인다.
 * ⚠️ 탭을 더하면 `AdminTab` · `Admin.tsx` 의 case · 여기 묶음 셋 — 회귀들이 `value: "탭"` 문자열로 찾는다.
 */
const groups: SidebarGroup[] = [
    { id: "home", label: "", items: [
        { value: "dashboard", label: "대시보드", icon: LayoutDashboard },
    ] },
    { id: "people", label: "사람·계정", items: [
        { value: "users", label: "프로필 관리", icon: Users },
        { value: "resources", label: "교직원 관리", icon: Server },
        { value: "teachers", label: "교사 리소스", icon: BookOpen },
        { value: "accounts", label: "계정 관리", icon: KeyRound },
        { value: "students", label: "학생 관리", icon: GraduationCap },
        { value: "student-data", label: "학생 데이터", icon: Database },
    ] },
    { id: "org", label: "조직·분류", items: [
        { value: "departments", label: "부서 관리", icon: Building2 },
        { value: "duty-seats", label: "업무분장", icon: Briefcase },
        { value: "tags", label: "태그 관리", icon: Tags },
        { value: "subject-groups", label: "교과 분류", icon: Shapes },
        { value: "sections", label: "섹션 관리", icon: GraduationCap },
    ] },
    { id: "curriculum", label: "교육과정 운영", items: [
        { value: "curriculum", label: "교육과정 관리", icon: BookMarked, step: 1 },
        { value: "offerings", label: "과목 개설 관리", icon: BookCopy, step: 2 },
        { value: "enrollments", label: "학생 편성 관리", icon: UsersRound, step: 3 },
        { value: "timetables", label: "학생 시간표 관리", icon: CalendarClock, step: 4 },
        { value: "teacher-timetables", label: "교사 시간표 관리", icon: CalendarRange, step: 5 },
    ] },
    { id: "course-selection", label: "선택과목 신청", items: [
        { value: "selectable-subjects", label: "선택과목 카탈로그", icon: ListTree },
        { value: "selection-history", label: "신청 이력", icon: Vote },
    ] },
    { id: "ops", label: "일정·알림", items: [
        { value: "meetings", label: "미팅 관리", icon: Calendar },
        { value: "notifications", label: "알림 관리", icon: Bell },
        { value: "automations", label: "자동화 업무", icon: CalendarClock },
    ] },
    { id: "access-ai", label: "권한·AI", items: [
        { value: "permissions", label: "권한 관리", icon: Shield },
        { value: "mcp-agents", label: "에이전트(MCP)", icon: Bot },
        { value: "ai-logs", label: "AI 기록", icon: ScrollText },
    ] },
    { id: "screens", label: "화면·메뉴", items: [
        { value: "menus", label: "메뉴 관리", icon: ListChecks },
        { value: "iframes", label: "외부 메뉴", icon: ExternalLink },
        { value: "plugins", label: "플러그인", icon: Puzzle },
        { value: "dashboard-info", label: "안내 문구", icon: Info },
    ] },
    { id: "student-games", label: "학생 게임·코인", items: [
        { value: "academy-workshop", label: "아카데미 공방 주문", icon: Hammer },
        { value: "tamagotchi", label: "다마고찌", icon: Egg },
        { value: "star-tower", label: "별까지 쌓기", icon: Telescope },
        { value: "isekai3d", label: "이세계 사회인", icon: Gamepad2 },
        { value: "coins", label: "코인 경제", icon: Coins },
    ] },
    { id: "system", label: "시스템", items: [
        { value: "settings", label: "시스템 설정", icon: Settings },
    ] },
];

const COLLAPSED_KEY = "admin-sidebar-collapsed";

function readCollapsed(): Set<string> {
    try {
        const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
        return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    } catch {
        return new Set();
    }
}

export function AdminSidebar({ activeTab, onTabChange, className }: AdminSidebarProps) {
    const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
    const toggle = (id: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* 저장 못 해도 화면은 동작 */ }
            return next;
        });
    };
    return (
        <div className={cn("w-64 border-r bg-card h-full flex flex-col", className)}>
            <div className="p-6 border-b">
                <h2 className="text-xl font-bold tracking-tight">Admin Connect</h2>
                <p className="text-sm text-muted-foreground">System Administration</p>
            </div>
            <ScrollArea className="flex-1 py-3">
                <nav className="px-4 space-y-1">
                    {groups.map((group) => {
                        const hasActive = group.items.some((item) => item.value === activeTab);
                        const open = !group.label || hasActive || !collapsed.has(group.id);
                        return (
                            <div key={group.id}>
                                {group.label && (
                                    <button
                                        type="button"
                                        onClick={() => toggle(group.id)}
                                        aria-expanded={open}
                                        className="mt-2 flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-semibold tracking-wider text-muted-foreground hover:bg-secondary/60"
                                    >
                                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                                        <span className="flex-1">{group.label}</span>
                                        {!open && <span className="text-[10px] font-normal tabular-nums">{group.items.length}</span>}
                                    </button>
                                )}
                                {open && group.items.map((entry) => {
                                    const isActive = activeTab === entry.value;
                                    return (
                                        <Button
                                            key={entry.value}
                                            variant={isActive ? "secondary" : "ghost"}
                                            className={cn(
                                                "justify-start h-11 md:h-10 mb-0.5 w-full",
                                                group.label && "pl-6",
                                                isActive && "bg-secondary font-medium"
                                            )}
                                            onClick={() => onTabChange(entry.value)}
                                        >
                                            <entry.icon className="mr-2 h-4 w-4" />
                                            {entry.step != null && (
                                                <span className="mr-1.5 text-[10px] font-bold text-muted-foreground tabular-nums">
                                                    {entry.step}.
                                                </span>
                                            )}
                                            {entry.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </nav>
            </ScrollArea>
        </div>
    );
}

/** 탭 이름·아이콘 — 휴대폰 머리 막대가 사이드바와 같은 이름을 쓰게 */
export function adminTabEntry(tab: AdminTab): { label: string; icon: typeof Users } {
    const found = groups.flatMap((g) => g.items).find((e) => e.value === tab);
    return found ?? { label: "대시보드", icon: LayoutDashboard };
}
