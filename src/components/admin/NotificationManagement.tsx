import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  Info,
  Pencil,
  Search,
  Send,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  notificationEventCatalog,
  NotificationDeliveryLayer,
  NotificationEventCatalogItem,
  NotificationEventStatus,
} from './notificationEventCatalog';
import { NotificationTemplateEditDialog } from './NotificationTemplateEditDialog';
import { useNotificationTemplate, type NotificationTemplate } from '@/hooks/useNotificationTemplate';

type StatusFilter = NotificationEventStatus | 'all';

const statusMeta: Record<
  NotificationEventStatus,
  { label: string; className: string; description: string }
> = {
  active: {
    label: '현재 작동',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    description: '현재 사용자 알림함으로 발송되는 경로',
  },
  dormant: {
    label: '미연결',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    description: '구현은 있지만 현재 호출되지 않는 경로',
  },
  legacy: {
    label: '레거시',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
    description: '배포 DB에는 남아 있지만 현재 알림함과 분리된 경로',
  },
};

const layerMeta: Record<NotificationDeliveryLayer, { label: string; icon: typeof Bell }> = {
  'database-trigger': { label: 'DB 트리거', icon: Database },
  'client-service': { label: '클라이언트 서비스', icon: Code2 },
  rpc: { label: 'RPC', icon: Send },
};

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof Bell;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function EventCard({
  item,
  savedTemplate,
}: {
  item: NotificationEventCatalogItem;
  /** DB 에 저장된 문구 (편집 가능한 이벤트에만 전달, 미저장이면 null) */
  savedTemplate: NotificationTemplate | null;
}) {
  const status = statusMeta[item.status];
  const layer = layerMeta[item.deliveryLayer];
  const LayerIcon = layer.icon;
  const [editOpen, setEditOpen] = useState(false);

  // 저장된 값이 없으면 코드의 기본 문구가 발송되므로 카탈로그 템플릿을 그대로 쓴다.
  const fallbackTemplate = {
    title: item.titleTemplate,
    message: item.messageTemplate,
  };
  const effectiveTemplate = savedTemplate ?? fallbackTemplate;
  const isCustomized = !!savedTemplate;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{item.category}</p>
            <CardTitle className="text-lg">{item.name}</CardTitle>
          </div>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {item.deliveryMode === 'automatic' ? '자동 발송' : '사용자 확정 발송'}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <LayerIcon className="h-3 w-3" />
            {layer.label}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            {item.notificationType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 text-sm">
        <dl className="grid gap-3">
          <div>
            <dt className="mb-1 text-xs font-semibold text-muted-foreground">발생 조건</dt>
            <dd className="leading-relaxed">{item.trigger}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold text-muted-foreground">수신 대상</dt>
            <dd className="leading-relaxed">{item.recipients}</dd>
          </div>
        </dl>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">전송 메시지</p>
            {item.settingKey && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    isCustomized
                      ? 'border-sky-200 bg-sky-50 px-1.5 py-0 text-[10px] text-sky-700'
                      : 'px-1.5 py-0 text-[10px] text-muted-foreground'
                  }
                >
                  {isCustomized ? '직접 설정됨' : '기본 문구'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3 w-3" />
                  편집
                </Button>
              </div>
            )}
          </div>
          <p className="font-medium">{effectiveTemplate.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {effectiveTemplate.message}
          </p>
        </div>

        {item.note && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{item.note}</p>
          </div>
        )}

        {item.settingKey && (
          <NotificationTemplateEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            settingKey={item.settingKey}
            eventName={item.name}
            current={savedTemplate ?? null}
            fallback={fallbackTemplate}
          />
        )}

        <div className="mt-auto border-t pt-3">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">구현 위치</p>
          <ul className="space-y-1">
            {item.source.map((source) => (
              <li
                key={source}
                className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground"
              >
                {source}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function NotificationManagement() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // 편집 가능한 템플릿은 여기서 한 번 읽어 카드 표시와 검색 양쪽에 쓴다.
  // (카드마다 읽으면 검색이 코드 기본 문구만 훑어 커스터마이즈된 문구를 못 찾는다.)
  const { data: welcomeTemplate } = useNotificationTemplate('welcome_notification');
  const savedTemplateFor = (item: NotificationEventCatalogItem): NotificationTemplate | null =>
    item.settingKey === 'welcome_notification' ? welcomeTemplate ?? null : null;

  const activeItems = notificationEventCatalog.filter((item) => item.status === 'active');
  const categories = Array.from(new Set(notificationEventCatalog.map((item) => item.category)));
  const automaticCount = activeItems.filter((item) => item.deliveryMode === 'automatic').length;
  const manualCount = activeItems.filter((item) => item.deliveryMode === 'manual').length;
  const auditCount = notificationEventCatalog.length - activeItems.length;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');

    return notificationEventCatalog.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!normalizedQuery) return true;

      const saved =
        item.settingKey === 'welcome_notification' ? welcomeTemplate ?? null : null;

      return [
        item.name,
        item.category,
        item.trigger,
        item.recipients,
        item.notificationType,
        item.titleTemplate,
        item.messageTemplate,
        // 관리자가 직접 설정한 문구도 검색 대상에 포함
        saved?.title,
        saved?.message,
        item.note,
        ...item.source,
      ]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('ko-KR').includes(normalizedQuery));
    });
  }, [categoryFilter, query, statusFilter, welcomeTemplate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-7 w-7 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">알림 관리</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            사용자에게 알림 메시지가 생성되는 전체 이벤트와 구현 상태를 확인합니다.
            문구를 바꿀 수 있는 이벤트는 카드에서 바로 편집할 수 있습니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/notifications">
            실제 알림 화면
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>조사 범위</AlertTitle>
        <AlertDescription>
          현재 알림함의 <code className="font-mono">notification_events</code>, 프런트엔드 발송
          서비스, DB 트리거·RPC, 레거시 <code className="font-mono">notifications</code>를
          교차 확인했습니다. 화면 안에서만 보이는 성공·오류 토스트는 제외했습니다.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="현재 작동"
          value={activeItems.length}
          description="현재 알림함으로 연결된 이벤트"
          icon={CheckCircle2}
        />
        <SummaryCard
          title="자동 발송"
          value={automaticCount}
          description="사용자 동작 뒤 자동 생성되는 이벤트"
          icon={Bell}
        />
        <SummaryCard
          title="사용자 확정 발송"
          value={manualCount}
          description="직접 또는 AI 도우미 발송"
          icon={Bot}
        />
        <SummaryCard
          title="점검 대상"
          value={auditCount}
          description="미연결 코드와 레거시 경로"
          icon={AlertCircle}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>알림 이벤트 목록</CardTitle>
          <CardDescription>
            현재 작동 여부, 발생 조건, 수신 대상, 메시지 템플릿과 구현 위치를 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이벤트, 알림 유형, 수신 대상 검색"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger aria-label="구현 상태 필터">
                <SelectValue placeholder="구현 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 상태</SelectItem>
                <SelectItem value="active">현재 작동</SelectItem>
                <SelectItem value="dormant">미연결</SelectItem>
                <SelectItem value="legacy">레거시</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger aria-label="기능 분류 필터">
                <SelectValue placeholder="기능 분류" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 기능</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {Object.entries(statusMeta).map(([status, meta]) => (
              <div key={status} className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`${meta.className} px-1.5 py-0 text-[10px]`}
                >
                  {meta.label}
                </Badge>
                <span>{meta.description}</span>
              </div>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              조건에 맞는 알림 이벤트가 없습니다.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => (
                <EventCard key={item.id} item={item} savedTemplate={savedTemplateFor(item)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
