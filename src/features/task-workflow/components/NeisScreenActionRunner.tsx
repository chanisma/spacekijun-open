// ========================================
// NEIS 업무 화면 실행(`neis.screen`) — 안내 + 수동 완료 기록 (2026-09-23)
//
// 웹에서는 나이스를 조작할 수 없다(인증서 로그인·보안 프로그램). 그래서 이 러너는
// **어느 화면에서 무엇을 하는지**를 정확히 가리키는 데서 멈춘다:
//   · 연결을 만든 사람 = 메뉴목록에서 화면을 고르고 처리 안내를 적는다
//   · 담당자(읽기 전용)   = 경로·용도·안내를 보고 나이스를 연다
// 완료는 두 갈래다 — 담당자는 종전대로 내 할 일에서 체크하고, 연결 소유자는 여기서
// RUN 을 남길 수 있다(RUN 쓰기는 서버가 소유자에게만 연다).
//
// 판정·검색·설정값 모양은 전부 `src/lib/neisScreens.ts`. 여기는 그리기만 한다.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  HelpCircle,
  Landmark,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  NEIS_NOTE_MAX,
  NEIS_SCREENS_MAX,
  NEIS_URL,
  neisAreas,
  neisAudienceLabel,
  neisRefPath,
  neisScreenPath,
  parseNeisActionConfig,
  searchNeisScreens,
  toNeisScreenRef,
  type NeisActionConfig,
  type NeisCatalog,
  type NeisScreen,
  type NeisScreenRef,
} from '@/lib/neisScreens';
import { loadNeisKnowledgeIndex, type NeisKnowledgeIndex } from '@/lib/neisKnowledgeLoader';
import { useUpdateNeisActionConfig } from '../hooks/useTaskActions';
import { NeisScreenGuideDialog } from './neis/NeisScreenGuideDialog';
import type { TaskAction } from '../types';

/** 카탈로그는 수백 KB — 러너를 열 때만 불러오고 세션 동안 재사용한다 */
function useNeisCatalog() {
  return useQuery({
    queryKey: ['neis-catalog'],
    queryFn: async (): Promise<NeisCatalog> =>
      (await import('@/data/neisScreens.generated')).NEIS_CATALOG,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** 어느 화면에 구조·안내가 있는가 — 작은 색인(neis-kb/index.json)만 먼저 읽는다 */
function useNeisKnowledgeIndex() {
  return useQuery({
    queryKey: ['neis-knowledge-index'],
    queryFn: loadNeisKnowledgeIndex,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

function KnowledgeBadge({ entry }: { entry: NeisKnowledgeIndex[string] | undefined }) {
  if (!entry || entry.s !== 'ok') return null;
  return (
    <span className={cn(
      'rounded px-1.5 py-0.5 text-[10px] font-medium',
      entry.g ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500',
    )}>
      {entry.g ? '사용 안내' : '화면 구성만'}
    </span>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`"${text}" 을(를) 복사했습니다 — 나이스 메뉴 검색에 붙여 넣으세요.`);
  } catch {
    toast.error('복사하지 못했습니다. 화면 이름을 직접 입력해 주세요.');
  }
}

function Breadcrumb({ parts }: { parts: string[] }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-[11px] text-slate-400">
      {parts.map((part, index) => (
        <span key={`${index}-${part}`} className="flex min-w-0 items-center gap-1">
          {index > 0 && <span aria-hidden>›</span>}
          <span className="break-all">{part}</span>
        </span>
      ))}
    </p>
  );
}

function ScreenCard({
  refItem,
  screen,
  editable,
  pending,
  onRemove,
  onInnerTab,
}: {
  refItem: NeisScreenRef;
  /** 현재 카탈로그에서 찾은 화면 — 메뉴목록이 바뀌어 없으면 null */
  screen: NeisScreen | null | undefined;
  editable: boolean;
  pending: boolean;
  onRemove: () => void;
  onInnerTab: (innerTab: string | undefined) => void;
}) {
  const index = useNeisKnowledgeIndex();
  const knowledge = index.data?.[refItem.key];
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Breadcrumb parts={neisRefPath(refItem).slice(0, -1)} />
          <p className="mt-0.5 break-all text-sm font-semibold text-slate-800">{refItem.name}</p>
          {screen?.purpose && <p className="mt-1 text-xs leading-5 text-slate-600">{screen.purpose}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
            {screen && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                {neisAudienceLabel(screen.roles)}
              </span>
            )}
            <KnowledgeBadge entry={knowledge} />
            {refItem.innerTab && !editable && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                화면 안 탭 · {refItem.innerTab}
              </span>
            )}
          </div>
          {screen === null && (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-4 text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              지금 메뉴목록에는 이 화면이 없습니다. 나이스 메뉴가 바뀌었을 수 있어요 — 이름으로 찾아보세요.
            </p>
          )}
          {editable && screen && screen.inner.length > 0 && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
              화면 안 탭
              <select
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                value={refItem.innerTab ?? ''}
                disabled={pending}
                onChange={(event) => onInnerTab(event.target.value || undefined)}
              >
                <option value="">지정 안 함</option>
                {screen.inner.map((tab) => (
                  <option key={tab.name} value={tab.name}>{tab.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1 [&_button]:max-sm:h-11">
          {knowledge?.s === 'ok' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[11px] text-blue-600"
              onClick={() => setGuideOpen(true)}
              title="이 나이스 화면의 사용 방법"
            >
              <HelpCircle className="mr-1 h-3.5 w-3.5" />사용 방법
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[11px] text-slate-500"
            onClick={() => void copyText(refItem.name)}
            title="화면 이름 복사"
          >
            <Copy className="mr-1 h-3.5 w-3.5" />이름 복사
          </Button>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[11px] text-slate-400 hover:text-rose-600"
              disabled={pending}
              onClick={onRemove}
              title="이 화면 빼기"
            >
              <X className="mr-1 h-3.5 w-3.5" />빼기
            </Button>
          )}
        </div>
      </div>
      {guideOpen && (
        <NeisScreenGuideDialog
          open={guideOpen}
          onOpenChange={setGuideOpen}
          screenKey={refItem.key}
          roles={screen?.roles}
          innerTab={refItem.innerTab}
        />
      )}
    </li>
  );
}

function ScreenPicker({
  catalog,
  chosenKeys,
  full,
  pending,
  onAdd,
}: {
  catalog: NeisCatalog;
  chosenKeys: Set<string>;
  full: boolean;
  pending: boolean;
  onAdd: (screen: NeisScreen) => void;
}) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const knowledge = useNeisKnowledgeIndex().data;
  const areas = useMemo(() => neisAreas(catalog.screens), [catalog]);
  const results = useMemo(
    () => (query.trim() || area ? searchNeisScreens(catalog.screens, query, { area, limit: 60 }) : []),
    [catalog, query, area],
  );

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">화면 추가</p>
        <p className="text-[10px] text-slate-400">
          기준 {catalog.source.replace(/\.xlsx$/i, '')} · 화면 {catalog.screens.length.toLocaleString()}개
        </p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="화면 이름·하는 일로 검색 (예: 세특, 출결 마감, 방과후 수강)"
          className="h-9 pl-8 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {[null, ...areas].map((value) => (
          <button
            key={value ?? 'all'}
            type="button"
            onClick={() => setArea(value)}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              area === value
                ? 'border-blue-200 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
            )}
          >
            {value ?? '전체 영역'}
          </button>
        ))}
      </div>
      {full && (
        <p className="text-[11px] text-amber-700">화면은 {NEIS_SCREENS_MAX}개까지 지정할 수 있습니다.</p>
      )}
      {!query.trim() && !area ? (
        <p className="py-3 text-center text-[11px] text-slate-400">
          검색어를 입력하거나 업무 영역을 고르면 화면이 나옵니다.
        </p>
      ) : results.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-slate-400">맞는 화면이 없습니다. 다른 말로 찾아보세요.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {results.map((screen) => {
            const chosen = chosenKeys.has(screen.key);
            return (
              <li key={screen.key} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-xs font-semibold text-slate-700">{screen.name}</p>
                  <Breadcrumb parts={neisScreenPath(screen).slice(0, -1)} />
                  {screen.purpose && (
                    <p className="truncate text-[11px] text-slate-500" title={screen.purpose}>{screen.purpose}</p>
                  )}
                </div>
                <span className="hidden shrink-0 sm:inline"><KnowledgeBadge entry={knowledge?.[screen.key]} /></span>
                <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
                  {neisAudienceLabel(screen.roles)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2 text-[11px]"
                  disabled={chosen || full || pending}
                  onClick={() => onAdd(screen)}
                >
                  {chosen ? '추가됨' : <><Plus className="mr-0.5 h-3 w-3" />추가</>}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * 화면 목록·처리 안내 편집기 — **저장하지 않는다**(값만 바꿔 `onChange` 로 올린다).
 * 실행 창은 받는 즉시 저장하고(noteMode='commit' — 안내는 입력을 멈추고 1초 뒤·칸을 떠날 때 자동 저장, 2026-10-06),
 * 할 일 편집 창은 [저장] 때 한꺼번에 반영한다(noteMode='live').
 */
export function NeisScreensEditor({
  value: config,
  editable,
  pending = false,
  noteMode,
  onChange,
}: {
  value: NeisActionConfig;
  editable: boolean;
  pending?: boolean;
  noteMode: 'commit' | 'live';
  onChange: (next: NeisActionConfig) => void;
}) {
  const catalogQuery = useNeisCatalog();
  const [noteDraft, setNoteDraft] = useState(config.note ?? '');
  // 저장이 돌아와 config.note 가 바뀔 때 **내가 보낸 값이면** 초안을 덮지 않는다 — 덮으면 저장되는 사이
  // 더 친 글자가 사라진다(1초 자동 저장이라 실제로 겹친다)
  const sentNoteRef = useRef<string | null>(null);
  useEffect(() => {
    if (sentNoteRef.current !== null && (config.note ?? '') === sentNoteRef.current) return;
    setNoteDraft(config.note ?? '');
  }, [config.note]);
  const screenByKey = useMemo(
    () => new Map((catalogQuery.data?.screens ?? []).map((screen) => [screen.key, screen])),
    [catalogQuery.data],
  );
  const chosenKeys = useMemo(() => new Set(config.screens.map((ref) => ref.key)), [config.screens]);
  const replaceRef = (key: string, patch: (ref: NeisScreenRef) => NeisScreenRef) =>
    onChange({ ...config, screens: config.screens.map((ref) => (ref.key === key ? patch(ref) : ref)) });
  const noteDirty = noteDraft.trim() !== (config.note ?? '').trim();
  // 실행 창(commit)의 안내도 자동 저장한다 (2026-10-06) — 화면·탭은 바꾸면 바로 저장되는데 안내만
  // [안내 저장]을 눌러야 해서, 쓰고 창을 닫으면 경고 없이 사라졌다(머리글은 «바꾸면 바로 저장됩니다»라고 했다)
  const commitNote = () => {
    if (noteMode !== 'commit' || !noteDirty || pending) return;
    sentNoteRef.current = noteDraft;
    onChange({ ...config, note: noteDraft });
  };
  useEffect(() => {
    if (noteMode !== 'commit' || !noteDirty) return;
    const timer = window.setTimeout(commitNote, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDraft, noteMode, noteDirty]);

  return (
    <div className="space-y-4">
      {(editable || config.note) && (
        <section className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">처리 안내</p>
          {editable ? (
            <>
              <Textarea
                rows={3}
                maxLength={NEIS_NOTE_MAX}
                value={noteDraft}
                onChange={(event) => {
                  setNoteDraft(event.target.value);
                  if (noteMode === 'live') onChange({ ...config, note: event.target.value });
                }}
                onBlur={commitNote}
                placeholder="담당자에게 보일 안내 — 예: 과목별 세특 입력 후 학기말에 마감까지 해 주세요."
              />
            </>
          ) : (
            <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              {config.note}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">
          나이스 화면 {config.screens.length > 0 && <span className="text-slate-400">{config.screens.length}개</span>}
        </p>
        {catalogQuery.isLoading && (
          <p className="flex items-center text-xs text-slate-400">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />나이스 메뉴목록 불러오는 중
          </p>
        )}
        {config.screens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            {editable
              ? '아직 화면을 고르지 않았습니다. 아래에서 검색해 추가하세요.'
              : '연결한 사람이 아직 화면을 지정하지 않았습니다.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {config.screens.map((ref) => (
              <ScreenCard
                key={ref.key}
                refItem={ref}
                screen={catalogQuery.data ? screenByKey.get(ref.key) ?? null : undefined}
                editable={editable}
                pending={pending}
                onRemove={() => onChange({ ...config, screens: config.screens.filter((item) => item.key !== ref.key) })}
                onInnerTab={(innerTab) => replaceRef(ref.key, (item) => {
                  const { innerTab: _drop, ...rest } = item;
                  return innerTab ? { ...rest, innerTab } : rest;
                })}
              />
            ))}
          </ul>
        )}
      </section>

      {editable && catalogQuery.data && (
        <ScreenPicker
          catalog={catalogQuery.data}
          chosenKeys={chosenKeys}
          full={config.screens.length >= NEIS_SCREENS_MAX}
          pending={pending}
          onAdd={(screen) => onChange({ ...config, screens: [...config.screens, toNeisScreenRef(screen)] })}
        />
      )}
      {catalogQuery.isError && (
        <p className="text-xs text-rose-600">나이스 메뉴목록을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.</p>
      )}
    </div>
  );
}

/**
 * 담당자가 보는 화면 — 안내 모드와 설정 창의 [담당자 화면 미리보기]가 **같은 부품**을 그린다.
 * 미리보기를 따로 만들면 실제 담당자 화면과 조용히 어긋난다.
 */
function NeisGuideView({
  config,
  screenByKey,
}: {
  config: NeisActionConfig;
  screenByKey: Map<string, NeisScreen>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/40 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Landmark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">나이스에서 처리할 화면</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              이 앱은 나이스를 대신 조작하지 않습니다. 아래 경로를 따라 나이스에서 직접 처리하세요.
              {' '}
              {neisAudienceHint(config.screens, screenByKey)}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3 bg-blue-600 hover:bg-blue-700"
          onClick={() => window.open(NEIS_URL, '_blank', 'noopener,noreferrer')}
        >
          나이스 열기
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Button>
        <p className="mt-1.5 text-[11px] text-slate-400">인증서 로그인은 나이스에서 직접 합니다.</p>
      </div>
      <NeisScreensEditor value={config} editable={false} noteMode="commit" onChange={() => undefined} />
      <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-4 text-slate-500">
        처리를 마치면 내 할 일에서 완료를 체크하세요.
      </p>
    </div>
  );
}

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: Date }
  | { status: 'error'; message: string };

/** 설정이 저장됐는지 — 바꾸는 즉시 저장되므로 화면이 그 사실을 계속 말해야 한다 */
export function SaveStatus({ state }: { state: SaveState }) {
  if (state.status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />저장 중…
      </span>
    );
  }
  if (state.status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        저장됨 · {state.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600" title={state.message}>
        <AlertTriangle className="h-3.5 w-3.5" />저장 실패 — 다시 시도하세요
      </span>
    );
  }
  return <span className="text-[11px] text-slate-400">바꾸면 바로 저장됩니다</span>;
}

export function NeisScreenActionRunner({
  action,
  guideOnly = false,
}: {
  action: TaskAction;
  /** 호환용(종전 완료 기록이 RUN 에 적었다) — 설정 창에는 완료 기록이 없다 */
  workflowId?: string | null;
  /** 담당자 열람 — 편집 없이 안내만 */
  guideOnly?: boolean;
}) {
  const { user } = useAuth();
  const catalogQuery = useNeisCatalog();
  const updateConfig = useUpdateNeisActionConfig();
  // 저장 결과를 즉시 반영하는 로컬 사본 — props 의 action 은 러너를 연 순간의 스냅샷이라
  // 저장해도 갱신되지 않을 수 있다. 사본 없이 props 만 보면 ①고른 화면이 목록에 안 보이고
  // ②다음 변경이 낡은 값을 기준으로 저장돼 **앞선 변경을 지운다**(2026-09-23 보고).
  const [liveConfig, setLiveConfig] = useState<unknown>(action.config);
  useEffect(() => setLiveConfig(action.config), [action.config]);
  const config = useMemo(() => parseNeisActionConfig(liveConfig), [liveConfig]);
  // 편집 = 연결을 만든 사람만(task_action UPDATE RLS 가 created_by 로 막는다)
  const editable = !guideOnly && Boolean(user) && user?.id === action.created_by;
  const screenByKey = useMemo(
    () => new Map((catalogQuery.data?.screens ?? []).map((screen) => [screen.key, screen])),
    [catalogQuery.data],
  );
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [previewing, setPreviewing] = useState(false);

  // 성공 토스트는 두지 않는다 — 머리글의 저장 상태가 결과를 말한다
  const save = async (next: NeisActionConfig) => {
    setSaveState({ status: 'saving' });
    try {
      const saved = await updateConfig.mutateAsync({ actionId: action.id, config: next });
      setLiveConfig(saved.config);
      setSaveState({ status: 'saved', at: new Date() });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'NEIS 화면을 저장하지 못했습니다.';
      setSaveState({ status: 'error', message });
      toast.error(message);
    }
  };

  // 담당자 안내 — 편집·완료 기록 없이(완료는 내 할 일에서)
  if (guideOnly) return <NeisGuideView config={config} screenByKey={screenByKey} />;

  // 설정 — 연결을 만든 사람(편집) 또는 업무 흐름 관리자(보기만). **완료 기록을 두지 않는다**:
  // 여기는 담당자에게 보일 안내를 만드는 자리이고, 담당자의 완료는 내 할 일에서 체크한다.
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/40 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Landmark className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">NEIS 작업 설정</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              {editable
                ? '담당자에게 안내할 나이스 화면과 처리 안내를 정합니다.'
                : '연결을 만든 사람만 설정을 바꿀 수 있습니다.'}
            </p>
            {editable && <div className="mt-1"><SaveStatus state={saveState} /></div>}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={previewing ? 'default' : 'outline'}
          className={cn('h-8 text-xs', previewing && 'bg-blue-600 hover:bg-blue-700')}
          aria-pressed={previewing}
          onClick={() => setPreviewing((value) => !value)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {previewing ? '설정으로 돌아가기' : '담당자 화면 미리보기'}
        </Button>
      </div>

      {previewing ? (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">
            저장된 설정이 담당자에게 이렇게 보입니다.
          </p>
          <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-3">
            <NeisGuideView config={config} screenByKey={screenByKey} />
          </div>
        </div>
      ) : (
        <NeisScreensEditor
          value={config}
          editable={editable}
          pending={updateConfig.isPending}
          noteMode="commit"
          onChange={(next) => void save(next)}
        />
      )}
    </div>
  );
}

/**
 * 누구의 나이스에 보이는 화면인가 — 담당자가 "메뉴에 없는데요"로 막히는 가장 흔한
 * 이유가 권한이라, 경로보다 먼저 말해 둔다.
 */
function neisAudienceHint(refs: NeisScreenRef[], byKey: Map<string, NeisScreen>): string {
  const screens = refs.map((ref) => byKey.get(ref.key)).filter((s): s is NeisScreen => Boolean(s));
  if (screens.length === 0) return '';
  if (screens.some((screen) => screen.roles.length === 0)) {
    return '업무분장으로 이 메뉴를 받은 사람의 나이스에만 보입니다 — 메뉴가 없으면 업무분장 담당자에게 요청하세요.';
  }
  return '나이스 상단의 담임 탭(교과담임·학급담임·동아리담임)에 있습니다.';
}
