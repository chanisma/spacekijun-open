import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    ArrowUpRight,
    Bell,
    CalendarRange,
    ChevronDown,
    Database,
    ExternalLink,
    HardDrive,
    Link2Off,
    RefreshCw,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    Users,
    GraduationCap,
    Briefcase,
    Sparkles,
    Egg,
    Inbox,
    BellRing,
    RotateCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
    useAdminDashboardStats,
    useRecountAdminDatasets,
    ADMIN_DASHBOARD_STATS_KEY,
    type AdminDashboardStats,
} from '@/hooks/useAdminDashboardStats';
import {
    DATASET_GROUPS,
    SKIP_REASON_LABEL,
    describeDatasetFreshness,
    formatDatasetTotal,
    groupDatasets,
    summarizeDatasets,
    type DatasetCount,
    type DatasetGroupId,
    type DatasetRow,
} from '@/components/admin/adminDashboardCatalog';
import {
    buildAcademyFunnel,
    buildAcademyPlayers,
    type AcademyFunnelRow,
    type AcademyPlayerRow,
    type AcademyStats,
} from '@/components/admin/adminDashboardAcademy';
import {
    buildTamaStageRows,
    tamaFocusRate,
    tamaOldestWaitDays,
    tamaOpenOrders,
    tamaOwnersLine,
    type TamaStats,
} from '@/components/admin/adminDashboardTamagotchi';
import type { AdminTab } from './AdminSidebar';

/**
 * Admin ▸ 대시보드.
 *
 * 종전엔 `--` 자리표시자 카드뿐이라 아무 정보도 주지 않았다. 지금은 서버 RPC
 * (`get_admin_dashboard_stats`) 한 번으로 **기능별 자료 건수 · 사용자 현황 ·
 * 운영 점검**을 받아 그린다.
 *
 * 화면 원칙 두 가지:
 *  ① **숫자에는 항상 "최근 30일" 변화를 같이 둔다.** 총계만 있으면 "많다/적다"는 알아도
 *     이 기능이 지금 쓰이고 있는지는 알 수 없다.
 *  ② **조치가 필요한 것은 위로 올린다.** 미연결 계정·숨긴 메뉴처럼 관리자가 손대야 하는
 *     항목은 목록 안에 묻지 말고 '운영 점검'에 배지로 세운다.
 */

interface AdminDashboardOverviewProps {
    /** 카드에서 관련 관리 탭으로 바로 이동 (Admin 페이지가 주입) */
    onNavigateTab?: (tab: AdminTab) => void;
}

const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('ko-KR');

/**
 * 최근 30일 증감.
 *
 * **"0건"과 "못 셌음"을 구분한다.** 같은 회색 글씨로 뭉개면 관리자는 그 기능이
 * 안 쓰이는 건지 지표가 없는 건지 알 수 없다.
 */
function RecentDelta({ count }: { count: DatasetCount }) {
    if (count.recent === null) {
        const reason = count.skipped ? SKIP_REASON_LABEL[count.skipped] : '집계 안 됨';
        return <span className="text-xs text-muted-foreground/70">{reason}</span>;
    }
    if (count.recent === 0) {
        return <span className="text-xs text-muted-foreground">30일간 변화 없음</span>;
    }
    return (
        <span className="text-xs font-medium text-emerald-600 inline-flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" />+{nf(count.recent)}
        </span>
    );
}

/* ------------------------------------------------------------------ KPI */

interface KpiProps {
    label: string;
    value: string;
    hint: React.ReactNode;
    icon: typeof Users;
    tone: string;
}

function KpiCard({ label, value, hint, icon: Icon, tone }: KpiProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={cn('h-4 w-4', tone)} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{hint}</div>
            </CardContent>
        </Card>
    );
}

/* --------------------------------------------------------- 운영 점검 행 */

interface CheckRowProps {
    icon: typeof Users;
    label: string;
    value: React.ReactNode;
    status: 'ok' | 'warn' | 'info';
    action?: { label: string; onClick: () => void };
}

function CheckRow({ icon: Icon, label, value, status, action }: CheckRowProps) {
    return (
        <div className="flex items-center gap-3 py-2.5 min-w-0">
            <Icon
                className={cn(
                    'h-4 w-4 flex-shrink-0',
                    status === 'warn' ? 'text-amber-600' : status === 'ok' ? 'text-emerald-600' : 'text-slate-400',
                )}
            />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{label}</div>
                <div className="text-xs text-muted-foreground truncate">{value}</div>
            </div>
            {action && (
                <Button variant="ghost" size="sm" className="flex-shrink-0 h-7 text-xs" onClick={action.onClick}>
                    {action.label}
                    <ArrowUpRight className="h-3 w-3 ml-0.5" />
                </Button>
            )}
        </div>
    );
}

/* ------------------------------------------------------ 기능별 자료 그룹 */

function DatasetGroupCard({
    groupId,
    rows,
    onOpen,
}: {
    groupId: DatasetGroupId;
    rows: DatasetRow[];
    onOpen: (route: string) => void;
}) {
    const group = DATASET_GROUPS.find((g) => g.id === groupId)!;
    const Icon = group.icon;
    const max = Math.max(...rows.map((r) => r.count.total), 1);
    const groupTotal = rows.reduce((sum, r) => sum + r.count.total, 0);
    // 하나라도 추정치가 섞이면 합계도 정확한 값이 아니다
    const groupApprox = rows.some((r) => !r.count.exact);

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={cn('h-4 w-4', group.tone)} />
                    {group.label}
                    <Badge variant="outline" className="ml-auto font-normal tabular-nums">
                        {groupApprox ? '약 ' : ''}{nf(groupTotal)}건
                    </Badge>
                </CardTitle>
                <CardDescription className="text-xs">{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="divide-y">
                    {rows.map((row) => (
                        <div key={row.key} className="py-2 min-w-0">
                            <div className="flex items-baseline gap-2 min-w-0">
                                <button
                                    type="button"
                                    disabled={!row.route}
                                    onClick={() => row.route && onOpen(row.route)}
                                    title={row.hint ?? row.label}
                                    className={cn(
                                        'text-sm truncate text-left min-w-0 flex-1',
                                        row.route
                                            ? 'hover:text-blue-600 hover:underline cursor-pointer'
                                            : 'cursor-default',
                                    )}
                                >
                                    {row.label}
                                </button>
                                <span
                                    className={cn(
                                        'text-sm font-semibold tabular-nums flex-shrink-0',
                                        !row.count.exact && 'text-muted-foreground',
                                    )}
                                    title={
                                        row.count.exact
                                            ? undefined
                                            : `통계 추정치 (기준 ${row.count.as_of ? new Date(row.count.as_of).toLocaleString('ko-KR') : '알 수 없음'}). 표가 커서 매번 세지 않습니다.`
                                    }
                                >
                                    {formatDatasetTotal(row.count)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                {/* 같은 그룹 안에서의 상대 규모 — 절대량 비교가 아니라 "무엇이 이 영역의 덩어리인지" */}
                                <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-blue-500/60"
                                        style={{ width: `${Math.max((row.count.total / max) * 100, row.count.total > 0 ? 2 : 0)}%` }}
                                    />
                                </div>
                                <RecentDelta count={row.count} />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

/* --------------------------------------- 별빛 탐구 아카데미 장별 진행 */

/**
 * 한 단계의 깔때기 막대.
 *
 * **막대 길이 = 이 단계에 도달한 학생 비율**(첫 단계 대비)이고, 그 안을 끝까지(초록) ·
 * 건너뜀(회색) · 진행 중(파랑)으로 나눈다. 둘을 겹쳐 놓는 이유는 관리자가 한 줄에서
 * 두 가지를 함께 읽어야 하기 때문이다 — "여기까지 몇 명이 왔나"와 "그중 몇 명이 끝냈나".
 * 도달 인원을 늘 100%로 그리면 1명짜리 장과 200명짜리 장이 똑같이 꽉 찬 막대가 된다.
 *
 * **건너뜀을 초록에 넣지 않는다**: 프롤로그는 첫 화면에서 건너뛰어도 `completed_at` 이
 * 찍히므로, 그대로 칠하면 아무도 안 읽은 이야기가 '전원 완료'로 보인다.
 */
function FunnelBar({ row }: { row: AcademyFunnelRow }) {
    const total = row.stat.student_total;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    return (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="flex h-full" style={{ width: `${Math.max(row.reachRatio * 100, total > 0 ? 3 : 0)}%` }}>
                <div className="h-full bg-emerald-500" style={{ width: `${pct(row.studentCompleted)}%` }} />
                <div className="h-full bg-slate-300" style={{ width: `${pct(row.skipped ?? 0)}%` }} />
                <div className="h-full bg-blue-500/60" style={{ width: `${pct(row.studentInProgress)}%` }} />
            </div>
        </div>
    );
}

function AcademyFunnelRowView({ row }: { row: AcademyFunnelRow }) {
    const { student_total, faculty_total, faculty_done } = row.stat;

    const meta: string[] = [];
    if (row.inProgressRatio !== null) meta.push(`진행 중 평균 ${Math.round(row.inProgressRatio * 100)}%`);
    if (row.skipped) meta.push(`건너뜀 ${nf(row.skipped)}명`);
    if (faculty_total > 0) meta.push(`교직원 ${nf(faculty_total)}명(완료 ${nf(faculty_done)})`);

    return (
        <div
            className={cn(
                'grid gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,17rem)_1fr_auto] sm:items-center',
                // 막간은 장이 아니라 장 사이의 관문 — 들여쓰고 작게 그려 번호와 섞이지 않게 한다
                row.interlude && 'pl-3 sm:pl-5',
            )}
        >
            <div className="min-w-0">
                <div
                    className={cn('truncate', row.interlude ? 'text-xs text-muted-foreground' : 'text-sm font-medium')}
                    title={row.label}
                >
                    {row.label}
                </div>
                {row.hint && (
                    <div className="text-[11px] text-muted-foreground/80 truncate" title={row.hint}>
                        {row.hint}
                    </div>
                )}
            </div>

            <FunnelBar row={row} />

            <div className="min-w-0 sm:text-right">
                {student_total === 0 ? (
                    <div className="text-xs text-muted-foreground">아직 도달한 학생 없음</div>
                ) : (
                    <div className="text-sm tabular-nums whitespace-nowrap">
                        <span className="text-emerald-600 font-semibold">{nf(row.studentCompleted)}</span>
                        <span className="text-muted-foreground text-xs">
                            {row.skipped !== null ? ' 끝까지' : ' 완료'}
                        </span>
                        {row.studentInProgress > 0 && (
                            <>
                                <span className="text-muted-foreground/50 mx-1">·</span>
                                <span className="text-blue-600 font-semibold">{nf(row.studentInProgress)}</span>
                                <span className="text-muted-foreground text-xs"> 진행 중</span>
                            </>
                        )}
                    </div>
                )}
                {meta.length > 0 && (
                    <div className="text-[11px] text-muted-foreground/80 truncate">{meta.join(' · ')}</div>
                )}
                {/* 서버가 선언한 단계 수보다 더 진행된 기록이 있다 = 선언이 낡았다(막대가 조용히 거짓말한다) */}
                {row.stepDrift && (
                    <div className="text-[11px] text-amber-600">
                        단계 수 선언({row.stat.final_step})보다 진행된 기록({row.stat.step_max})이 있습니다
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * 마지막 활동 시각 `9/14 21:30`.
 *
 * "3일 전" 같은 상대 표기가 읽기는 쉽지만, 이 명단에서 실제로 하는 일은 **두 사람을
 * 견주는 것**이라("누가 더 최근인가") 같은 날 안의 순서까지 보이는 절대 표기를 쓴다.
 */
function fmtSeen(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AcademyPlayerRowView({ row }: { row: AcademyPlayerRow }) {
    return (
        <li className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(0,13rem)_1fr_auto] sm:items-center">
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium" title={row.name}>
                    {row.name}
                </span>
                {/* 학반은 이메일 prefix ↔ resource.meta 로만 풀린다 — 못 풀면 이름만 둔다 */}
                {row.classLabel && (
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
                        {row.classLabel}
                    </span>
                )}
                {/* 교직원 시험 플레이를 학생 참여로 오해하지 않게 줄마다 표시한다 */}
                {!row.isStudent && (
                    <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] font-normal">
                        교직원
                    </Badge>
                )}
            </div>

            <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="truncate text-muted-foreground" title={row.stage.label}>
                        {row.stage.label}
                    </span>
                    {row.stageDone ? (
                        <span className="whitespace-nowrap font-medium text-emerald-600">완료</span>
                    ) : row.stageStep !== null && row.stageFinalStep !== null ? (
                        <span className="whitespace-nowrap font-medium tabular-nums text-blue-600">
                            {row.stageStep}/{row.stageFinalStep}
                        </span>
                    ) : (
                        <span className="whitespace-nowrap font-medium text-blue-600">진행 중</span>
                    )}
                    {/* 건너뛰기도 completed_at 을 찍으므로 '완료'와 갈라 적는다 */}
                    {row.skippedPrologue && (
                        <span className="whitespace-nowrap text-muted-foreground/70">프롤로그 건너뜀</span>
                    )}
                </div>
                {row.progressRatio !== null && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full bg-blue-500/60"
                            style={{ width: `${Math.max(row.progressRatio * 100, 2)}%` }}
                        />
                    </div>
                )}
            </div>

            <div className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground sm:text-right">
                {fmtSeen(row.lastSeen)}
            </div>
        </li>
    );
}

/**
 * 참여자 명단 — 깔때기가 답하지 못하는 **"그게 누구냐"**.
 *
 * **기본은 접힘**이다: 본문은 어디까지나 깔때기이고 명단은 부록이다(전교생이 들어오면
 * 630줄이 된다). 지금처럼 몇 명일 때는 사람별 현재 장이 가장 쓸모 있는 정보라
 * 한 번 누르면 바로 펴진다.
 */
function AcademyPlayers({ academy }: { academy: AcademyStats }) {
    const { rows, hidden } = useMemo(() => buildAcademyPlayers(academy), [academy]);
    const [open, setOpen] = useState(false);

    // 서버가 명단을 주기 전(구버전)이거나 참여자가 없으면 빈 서랍을 만들지 않는다
    if (rows.length === 0) return null;

    return (
        <div className="mt-3 border-t pt-1">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                aria-expanded={open}
            >
                <span>
                    참여자 {nf(rows.length)}명 {open ? '접기' : '보기'}
                    {/* 총계는 상한과 무관하게 정확하다 — 가려진 인원을 숫자로 말해 준다 */}
                    {hidden > 0 && (
                        <span className="text-muted-foreground/70"> · 최근 활동순, 외 {nf(hidden)}명 생략</span>
                    )}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <ul className="divide-y">
                    {rows.map((row) => (
                        <AcademyPlayerRowView key={row.key} row={row} />
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * 별빛 탐구 아카데미 진행 현황.
 *
 * 표 건수로는 "쓰이고 있는가"를 알 수 없어 따로 둔다 — 이야기는 순서대로 열리는
 * 다섯 장이고, 관리자가 볼 것은 **어느 장에서 멈췄는가**다. 판정·집계는 전부
 * `adminDashboardAcademy.ts` 의 순수 함수에 있다(회귀 대상).
 */
function AcademySection({ academy, onOpen }: { academy: AcademyStats; onOpen: (route: string) => void }) {
    const rows = useMemo(() => buildAcademyFunnel(academy), [academy]);
    const { players } = academy;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    별빛 탐구 아카데미
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs ml-auto"
                        onClick={() => onOpen('/academy')}
                    >
                        게임 열기
                        <ArrowUpRight className="h-3 w-3 ml-0.5" />
                    </Button>
                </CardTitle>
                <CardDescription className="text-xs">
                    참여 학생 <strong className="text-foreground">{nf(players.student)}명</strong>
                    {players.student_active_7d > 0 && <> · 최근 7일 {nf(players.student_active_7d)}명</>}
                    {players.faculty > 0 && (
                        <span className="text-muted-foreground/70"> · 교직원 {nf(players.faculty)}명(시험 플레이)</span>
                    )}
                    <br />
                    이야기는 <strong>순서대로</strong> 열립니다(제2장은 제1장을 마쳐야 열림). 아래로 갈수록 인원이 주는 것이 정상입니다.
                    막대 길이는 프롤로그 인원 대비 도달 비율이고, <span className="text-emerald-600">초록</span>이 완료
                    · <span className="text-blue-600">파랑</span>이 진행 중입니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                {players.total === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        아직 아카데미를 시작한 사람이 없습니다.
                    </p>
                ) : (
                    <>
                        <div className="divide-y">
                            {rows.map((row) => (
                                <AcademyFunnelRowView key={row.key} row={row} />
                            ))}
                        </div>
                        <AcademyPlayers academy={academy} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------ 다마고찌 */

/** 최근 14일 하루 돌본 사람 — 접속 분포와 같은 모양(같은 14일 축) */
function TamaDailyBars({ data }: { data: TamaStats['daily'] }) {
    const max = Math.max(...data.map((d) => d.count), 1);
    return (
        <div
            className="flex items-end gap-1 h-20"
            role="img"
            aria-label={`최근 14일 하루 돌본 사람 수, 최대 ${max}명`}
        >
            {data.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                        className="w-full rounded-t bg-violet-500/70"
                        style={{ height: `${Math.max((d.count / max) * 60, d.count > 0 ? 3 : 1)}px` }}
                        title={`${d.date} · ${d.count}명`}
                    />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                        {d.date.slice(8)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function TamaStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground truncate">{label}</div>
            <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
            {hint && (
                <div className="text-[11px] text-muted-foreground/80 truncate" title={hint}>
                    {hint}
                </div>
            )}
        </div>
    );
}

/**
 * 다마고찌 현황 — «지금 쓰이고 있는가»만 답한다.
 *
 * 펫 전후 습관 비교 같은 효과 측정은 Admin «다마고찌» 탭의 [측정]이 표본 수·한계와 함께
 * 말한다. 여기서 같은 숫자를 맥락 없이 꺼내면 «효과 증명»처럼 읽힌다.
 */
function TamagotchiSection({
    tama,
    onOpen,
    onNavigateTab,
}: {
    tama: TamaStats;
    onOpen: (route: string) => void;
    onNavigateTab?: (tab: AdminTab) => void;
}) {
    const stages = useMemo(() => buildTamaStageRows(tama.pets.by_stage), [tama]);
    const focusRate = tamaFocusRate(tama.activity_30d);
    const facultyLine = tamaOwnersLine(tama.owners);
    const a = tama.activity_30d;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Egg className="h-4 w-4 text-violet-600" />
                    다마고찌
                    <div className="ml-auto flex items-center gap-1">
                        {onNavigateTab && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => onNavigateTab('tamagotchi')}
                            >
                                관리 · 측정
                                <ArrowUpRight className="h-3 w-3 ml-0.5" />
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpen('/tamagotchi')}>
                            열기
                            <ArrowUpRight className="h-3 w-3 ml-0.5" />
                        </Button>
                    </div>
                </CardTitle>
                <CardDescription className="text-xs">
                    키우는 학생 <strong className="text-foreground">{nf(tama.owners.student)}명</strong>
                    {facultyLine && (
                        <span className="text-muted-foreground/70"> · {facultyLine}(시험 플레이 포함)</span>
                    )}
                    {' · '}펫 {nf(tama.pets.total)}마리
                    {tama.pets.resting > 0 && <> (쉬는 펫 {nf(tama.pets.resting)})</>}
                    {tama.event && (
                        <>
                            <br />
                            진행 중 이벤트 <strong className="text-foreground">{tama.event.title}</strong>
                            <span className="text-muted-foreground/70">
                                {' '}
                                · {new Date(tama.event.ends_at).toLocaleDateString('ko-KR')}까지
                            </span>
                        </>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                {tama.pets.total === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">아직 펫을 키우는 사람이 없습니다.</p>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-3">
                        {/* 돌봄 — «돌본 날» = 펫을 저장한 한국 날짜 */}
                        <div className="min-w-0 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                                <TamaStat label="오늘 돌봄" value={nf(tama.care.today)} />
                                <TamaStat label="최근 7일" value={nf(tama.care.active_7d)} />
                                <TamaStat label="사흘 이상 학생" value={nf(tama.care.students_3days)} />
                            </div>
                            <TamaDailyBars data={tama.daily} />
                            <p className="text-[11px] text-muted-foreground">
                                하루 돌본 사람(최근 14일) · 펫을 저장한 날을 셉니다
                            </p>
                        </div>

                        {/* 성장 단계 — 0마리 단계도 남긴다(빠지면 '그 단계가 없다'로 읽힌다) */}
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-muted-foreground mb-1.5">
                                성장 단계
                                {tama.pets.sick > 0 && (
                                    <span className="ml-1.5 text-amber-600">· 아픈 펫 {nf(tama.pets.sick)}</span>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                {stages.map((row) => (
                                    <div key={row.key} className="flex items-center gap-2 min-w-0">
                                        <span className="w-16 flex-shrink-0 text-sm truncate" title={row.label}>
                                            {row.label}
                                        </span>
                                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-violet-500/70"
                                                style={{ width: `${row.count > 0 ? Math.max(row.ratio * 100, 3) : 0}%` }}
                                            />
                                        </div>
                                        <span className="w-8 flex-shrink-0 text-right text-xs font-medium tabular-nums">
                                            {nf(row.count)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 지난 30일 */}
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-muted-foreground mb-1.5">지난 30일</div>
                            <div className="grid grid-cols-2 gap-2">
                                <TamaStat label="가챠" value={nf(a.gacha)} />
                                <TamaStat label="펫 일기" value={nf(a.diary)} hint="건수만 — 본문은 본인만" />
                                <TamaStat
                                    label="함께 집중 완주"
                                    value={`${nf(a.focus_completed)}/${nf(a.focus_started)}`}
                                    hint={focusRate === null ? '아직 없음' : `완주 ${Math.round(focusRate * 100)}%`}
                                />
                                <TamaStat
                                    label="코인 지급"
                                    value={nf(a.coins)}
                                    hint={`교환 ${nf(a.trades)} · 친구 방문 ${nf(a.visits)}`}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------- 마지막 접속일 분포 */

function LoginRecencyChart({ data }: { data: AdminDashboardStats['login_recency'] }) {
    const max = Math.max(...data.map((d) => d.count), 1);
    return (
        <div className="flex items-end gap-1 h-28">
            {data.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                        className="w-full rounded-t bg-blue-500/70 hover:bg-blue-500 transition-colors"
                        style={{ height: `${Math.max((d.count / max) * 88, d.count > 0 ? 3 : 1)}px` }}
                        title={`${d.date} · ${d.count}명`}
                    />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                        {d.date.slice(5).replace('-', '/')}
                    </span>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------ 메인 */

export function AdminDashboardOverview({ onNavigateTab }: AdminDashboardOverviewProps) {
    const { data, isLoading, isFetching, error, refetch } = useAdminDashboardStats();
    const recount = useRecountAdminDatasets();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // 집계는 카탈로그 모듈의 순수 함수 — 회귀 `scripts/admin-dashboard-test/run.mts`
    const grouped = useMemo(
        () => (data ? groupDatasets(data.datasets) : ([] as Array<{ id: DatasetGroupId; rows: DatasetRow[] }>)),
        [data],
    );
    const totals = useMemo(
        () =>
            data
                ? summarizeDatasets(data.datasets)
                : { all: 0, recent: 0, top: [] as DatasetRow[], allApproximate: false },
        [data],
    );

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_STATS_KEY });
        refetch();
    };

    if (error) {
        return (
            <div className="space-y-6">
                <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between gap-4">
                        <span className="min-w-0 break-words">
                            통계를 불러오지 못했습니다. {error instanceof Error ? error.message : ''}
                        </span>
                        <Button size="sm" variant="outline" onClick={handleRefresh}>
                            다시 시도
                        </Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div className="space-y-6">
                <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-28" />
                    ))}
                </div>
                <Skeleton className="h-40" />
                <div className="grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-72" />
                    ))}
                </div>
            </div>
        );
    }

    const { users, resources, system } = data;
    const term = system.academic_term;
    const hiddenMenus = Object.values(system.menu_visibility ?? {}).filter(
        // 대상(학생·교사·직원) 중 하나라도 꺼 둔 메뉴 — `users` 는 세 대상의 구 형식 기본값이다
        (v) => v && Object.values(v).some((flag) => flag === false),
    ).length;
    const tama = data.tamagotchi ?? null;
    const tamaOpen = tama ? tamaOpenOrders(tama) : 0;
    const tamaWait = tama ? tamaOldestWaitDays(tama) : null;
    const freshness = describeDatasetFreshness(data.counting);
    const consentRate =
        users.privacy_consented !== null && users.total > 0
            ? Math.round((users.privacy_consented / users.total) * 100)
            : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
                    <p className="text-sm text-muted-foreground">
                        기준 {new Date(data.generated_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
                    <RefreshCw className={cn('h-4 w-4 mr-1.5', isFetching && 'animate-spin')} />
                    새로고침
                </Button>
            </div>

            {/* KPI */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    label="전체 사용자"
                    value={nf(users.total)}
                    hint={`최근 7일 접속 ${nf(users.active_7d)}명 · 30일 ${nf(users.active_30d)}명`}
                    icon={Users}
                    tone="text-blue-600"
                />
                <KpiCard
                    label="재학생"
                    value={nf(resources.student_active)}
                    hint={`졸업 ${nf(resources.student_graduated)} · 전출·자퇴 ${nf(resources.student_left)}`}
                    icon={GraduationCap}
                    tone="text-violet-600"
                />
                <KpiCard
                    label="교직원"
                    value={nf(resources.teacher + resources.staff)}
                    hint={`교사 ${nf(resources.teacher)} · 직원 ${nf(resources.staff)}`}
                    icon={Briefcase}
                    tone="text-emerald-600"
                />
                <KpiCard
                    label="누적 자료"
                    value={`${totals.allApproximate ? '약 ' : ''}${nf(totals.all)}`}
                    hint={
                        <span className="inline-flex items-center gap-1">
                            최근 30일
                            <span className="font-medium text-emerald-600">+{nf(totals.recent)}</span>
                        </span>
                    }
                    icon={Database}
                    tone="text-amber-600"
                />
            </div>

            {/* 운영 점검 + 접속 분포.
                grid 의 직계 자식은 min-width:auto 라 행의 truncate 글이 통째로 최소 폭이 된다 →
                휴대폰에서 카드가 화면 밖으로 밀린다. 자식에 min-w-0 을 걸어야 truncate 가 일한다. */}
            <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            운영 점검
                        </CardTitle>
                        <CardDescription className="text-xs">관리자가 손봐야 할 것이 있는지</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 divide-y">
                        <CheckRow
                            icon={CalendarRange}
                            label="학사력"
                            status={term?.year ? 'ok' : 'warn'}
                            value={
                                term?.year
                                    ? `${term.year}학년도 ${term.semester}학기` +
                                      (term.start_date && term.end_date ? ` (${term.start_date} ~ ${term.end_date})` : ' · 학기 기간 미설정')
                                    : '설정되지 않음 — 학기 기준 기능이 동작하지 않습니다'
                            }
                            action={onNavigateTab ? { label: '시스템 설정', onClick: () => onNavigateTab('settings') } : undefined}
                        />
                        <CheckRow
                            icon={Link2Off}
                            label="리소스 미연결 교직원 계정"
                            status={users.unlinked_faculty > 0 ? 'warn' : 'ok'}
                            value={
                                users.unlinked_faculty > 0
                                    ? `${nf(users.unlinked_faculty)}명 — 이름 등록(온보딩)이 끝나지 않았습니다`
                                    : '모든 교직원 계정이 리소스에 연결됨'
                            }
                            action={onNavigateTab ? { label: '프로필 관리', onClick: () => onNavigateTab('users') } : undefined}
                        />
                        <CheckRow
                            icon={UserCheck}
                            label="개인정보 방침 동의"
                            status="info"
                            value={
                                users.privacy_policy_version
                                    ? `${users.privacy_policy_version} 버전 · ${nf(users.privacy_consented)}명 동의${consentRate !== null ? ` (${consentRate}%)` : ''}`
                                    : '활성 방침 버전이 없습니다'
                            }
                        />
                        <CheckRow
                            icon={ExternalLink}
                            label="숨긴 메뉴"
                            status="info"
                            value={hiddenMenus > 0 ? `${hiddenMenus}개 메뉴가 비노출 상태` : '모든 메뉴가 공개됨'}
                            action={onNavigateTab ? { label: '메뉴 관리', onClick: () => onNavigateTab('menus') } : undefined}
                        />
                        <CheckRow
                            icon={Bell}
                            label="알림"
                            status="info"
                            value={`최근 30일 ${nf(system.notifications_30d)}건 발송 · 미확인 ${nf(system.notifications_unread)}건`}
                            action={onNavigateTab ? { label: '알림 관리', onClick: () => onNavigateTab('notifications') } : undefined}
                        />
                        {/* 다마고찌 의뢰는 관리자가 손으로 만들어 배송한다 — 열린 것이 곧 할 일이다 */}
                        {tama && (
                            <CheckRow
                                icon={Inbox}
                                label="다마고찌 의뢰"
                                status={tamaOpen > 0 ? 'warn' : 'ok'}
                                value={
                                    tamaOpen > 0
                                        ? `캐릭터 ${nf(tama.orders.character_open)} · 꾸미기 ${nf(tama.orders.decor_open)}건 대기` +
                                          (tamaWait !== null
                                              ? ` — 가장 오래된 것 ${tamaWait === 0 ? '오늘 접수' : `${tamaWait}일째`}`
                                              : '')
                                        : '기다리는 의뢰 없음'
                                }
                                action={
                                    onNavigateTab ? { label: '다마고찌', onClick: () => onNavigateTab('tamagotchi') } : undefined
                                }
                            />
                        )}
                        {tama?.push && (
                            <CheckRow
                                icon={BellRing}
                                label="휴대폰 푸시 알림"
                                status={tama.push.failing > 0 ? 'warn' : 'info'}
                                value={
                                    `${nf(tama.push.users)}명 · 기기 ${nf(tama.push.subscriptions)}대 구독` +
                                    (tama.push.failing > 0 ? ` · 전송 실패 중 ${nf(tama.push.failing)}대` : '')
                                }
                            />
                        )}
                        <CheckRow
                            icon={HardDrive}
                            label="데이터베이스"
                            status="info"
                            value={`${system.database_size} · 외부 메뉴 ${nf(resources.external_menu)}개 · 리소스 ${nf(resources.total)}건`}
                        />
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">마지막 접속일 분포</CardTitle>
                            <CardDescription className="text-xs">
                                최근 14일. 각 사용자의 <strong>마지막</strong> 접속일만 세므로 일별 방문자 수(DAU)가 아닙니다.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <LoginRecencyChart data={data.login_recency} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                                최근 30일 많이 쌓인 자료
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            {totals.top.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">
                                    최근 30일 동안 새로 쌓인 자료가 없습니다.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {totals.top.map((row) => {
                                        const top = totals.top[0].count.recent ?? 1;
                                        const pct = ((row.count.recent ?? 0) / top) * 100;
                                        return (
                                            <div key={row.key} className="flex items-center gap-2 min-w-0">
                                                <span className="text-sm truncate w-40 flex-shrink-0" title={row.label}>
                                                    {row.label}
                                                </span>
                                                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-500/70"
                                                        style={{ width: `${Math.max(pct, 2)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-medium tabular-nums w-16 text-right flex-shrink-0">
                                                    +{nf(row.count.recent)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 별빛 탐구 아카데미 — 서버가 이 블록을 아직 안 주는 배포본이면 그냥 숨는다 */}
            {data.academy && <AcademySection academy={data.academy} onOpen={(route) => navigate(route)} />}

            {/* 다마고찌 — 표가 없는 배포본(null)·구버전 서버(키 없음)이면 숨는다 */}
            {tama && (
                <TamagotchiSection tama={tama} onOpen={(route) => navigate(route)} onNavigateTab={onNavigateTab} />
            )}

            {/* 기능별 자료 현황 */}
            <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
                    <h3 className="text-lg font-semibold">기능별 자료 현황</h3>
                    {/* 숫자의 출처를 숨기지 않는다 — 언제 셌는지, 몇 개가 실측이고 몇 개가 추정인지 밝힌다 */}
                    <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                        {/* 자료 건수는 매번 세지 않는다(야간 스냅샷) — 기준 시각을 늘 말한다 */}
                        <span
                            className={cn(freshness.stale && 'text-amber-600 font-medium')}
                            title={
                                freshness.stale
                                    ? '야간 집계(매일 04:30)가 하루 넘게 돌지 않았습니다. [지금 다시 세기]로 갱신할 수 있습니다.'
                                    : '표가 많아 매번 세지 않고 매일 04:30 에 한 번 셉니다.'
                            }
                        >
                            {freshness.label}
                            {freshness.stale && ' (오래됨)'}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-xs"
                            disabled={recount.isPending}
                            onClick={() => recount.mutate()}
                            title="표 60여 개를 지금 다시 셉니다(몇 초 걸립니다). 큰 표는 추정치가 되고, 정확한 값은 다음 야간 집계에서 채워집니다."
                        >
                            <RotateCw className={cn('h-3 w-3 mr-1', recount.isPending && 'animate-spin')} />
                            {recount.isPending ? '세는 중…' : '지금 다시 세기'}
                        </Button>
                        {recount.isError && <span className="text-rose-600">다시 세지 못했습니다</span>}
                        {' · '}
                        실측 {nf(data.counting.counted)}개
                        {data.counting.estimated > 0 && (
                            <>
                                {' · '}
                                <span className="text-amber-600" title="큰 표는 매번 세면 응답이 8초 제한을 넘어 실패합니다. 통계 추정치를 씁니다.">
                                    추정 {nf(data.counting.estimated)}개(‘약’ 표기)
                                </span>
                            </>
                        )}
                        {' · '}증감은 최근 30일 신규
                    </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                    {grouped.map((g) => (
                        <DatasetGroupCard
                            key={g.id}
                            groupId={g.id}
                            rows={g.rows}
                            onOpen={(route) => navigate(route)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
