/**
 * 작업 「외부 시스템에서 처리」(`external.screen`) 실행 화면 (2026-09-24).
 *
 * NEIS 러너와 하는 일은 같다 — **어디서 무엇을 하는지 가리키고 완료를 기록**한다. 다른 점은
 * 고를 카탈로그가 없다는 것뿐이라, 화면을 «고르는» 자리가 «적는» 자리로 바뀐다.
 * 판정·설정값 모양은 전부 `src/lib/externalScreens.ts`. 여기는 그리기만 한다.
 *
 * 편집은 **연결을 만든 사람**만 할 수 있다(`task_action` UPDATE RLS = `created_by`).
 * 담당자는 안내만 본다 — 버튼을 보여 놓고 42501 로 거절되면 고장처럼 보인다.
 *
 * 2026-10-06 정리(UI 검토):
 *  · **완료 기록 칸을 뺐다** — 담당자에게는 안 보이고 책임자에게만 보였으며, 남긴 기록은 이력 서랍이 없는
 *    종류라 어디에도 안 보였다(공동 책임자가 누르면 42501). NEIS 가 2026-09-23 에 같은 이유로 뺐다.
 *    완료는 담당자가 내 할 일에서 체크한다.
 *  · **자동 저장** — 입력을 멈추고 1초 뒤. 종전 [설정 저장]은 누르지 않고 닫으면 경고 없이 사라졌고,
 *    같은 묶음의 NEIS 는 «바꾸면 바로 저장»이라 묶음 안에서 저장 방식이 갈렸다. 상태는 NEIS 와 같은 `SaveStatus`.
 *  · 시스템 칩을 바꾸면 주소도 그 시스템 것으로 — 주소 없는 칩이면 앞 칩의 주소가 남아 엉뚱한 사이트를 열었다
 *    (사람이 직접 적은 주소는 지킨다 — `presetUrlAfterSwitch`).
 *  · 담당자 화면: 설정용 질문 대신 «시스템 / 처리할 화면 / 처리 안내», [○○ 열기]를 맨 위로(NEIS 와 같은 자리),
 *    빈 안내 칸은 그리지 않는다, 화면마다 [이름 복사].
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Globe, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  buildExternalActionPatch,
  EXTERNAL_NAME_MAX,
  EXTERNAL_NOTE_MAX,
  EXTERNAL_SCREENS_MAX,
  EXTERNAL_SYSTEM_PRESETS,
  externalActionTitle,
  isExternalActionConfigured,
  parseExternalActionConfig,
  presetUrlAfterSwitch,
  safeExternalUrl,
  type ExternalActionConfig,
  type ExternalScreenRef,
} from '@/lib/externalScreens';
import { SaveStatus, type SaveState } from './NeisScreenActionRunner';
import { mergeTaskActionConfig } from '../services/taskActionService';
import { taskActionKeys } from '../hooks/useTaskActions';
import type { TaskAction } from '../types';

async function copyName(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`«${text}» 를 복사했습니다`);
  } catch {
    toast.error('복사하지 못했습니다.');
  }
}

export function ExternalScreenActionRunner({
  action,
  workflowId: _workflowId,
  /** 남의 업무 흐름에서 열었다 — 편집 없이 안내만 */
  guideOnly = false,
}: {
  action: TaskAction;
  workflowId: string | null;
  guideOnly?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const saved = parseExternalActionConfig(action.config);
  const isOwner = Boolean(user && user.id === action.created_by);
  const canEdit = !guideOnly && isOwner;

  const [draft, setDraft] = useState<ExternalActionConfig>(saved);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  // 저장된 값이 바뀌면(다른 사람이 고쳤을 때) 초안을 맞춘다. **내가 보낸 값이 돌아온 것이면 덮지 않는다** —
  // 덮으면 저장되는 사이 더 친 글자가 사라진다(1초 자동 저장이라 실제로 겹친다)
  const sentRef = useRef<string | null>(null);
  useEffect(() => {
    const incoming = JSON.stringify(parseExternalActionConfig(action.config));
    if (sentRef.current !== null && incoming === sentRef.current) return;
    setDraft(parseExternalActionConfig(action.config));
  }, [action.config]);

  const setScreen = (index: number, patch: Partial<ExternalScreenRef>) =>
    setDraft((prev) => ({
      ...prev,
      screens: prev.screens.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const handleSave = async (next: ExternalActionConfig) => {
    setSaveState({ status: 'saving' });
    try {
      const patch = buildExternalActionPatch(next);
      const parsed = parseExternalActionConfig(patch);
      sentRef.current = JSON.stringify(parsed);
      // 제목도 함께 맞춘다 — 목록에서 «무엇을 가리키는지»가 제목만으로 읽혀야 한다(NEIS 와 같은 규칙)
      await mergeTaskActionConfig(action.id, patch, externalActionTitle(parsed));
      await queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
      setSaveState({ status: 'saved', at: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : '설정을 저장하지 못했습니다.';
      setSaveState({ status: 'error', message });
      toast.error(message);
    }
  };

  // 자동 저장 — 저장본과 다를 때, 입력을 멈추고 1초 뒤
  const draftKey = JSON.stringify(parseExternalActionConfig(buildExternalActionPatch(draft)));
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (!canEdit || draftKey === savedKey || draftKey === sentRef.current) return;
    const timer = window.setTimeout(() => void handleSave(draft), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, savedKey, canEdit]);

  const shown = canEdit ? draft : saved;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/40 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Globe className="h-4 w-4 text-indigo-500" />
          {isExternalActionConfigured(shown) ? externalActionTitle(shown) : '외부 시스템에서 처리'}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {canEdit
            ? '담당자에게 어느 시스템의 어느 화면에서 무엇을 하는지 알려 줍니다. 바꾸면 잠시 뒤 자동으로 저장됩니다.'
            : '이 앱이 대신 처리하지 않습니다. 아래 시스템에서 직접 처리하고, 마치면 내 할 일에서 완료를 체크하세요.'}
        </p>
        {canEdit && <div className="mt-1"><SaveStatus state={saveState} /></div>}
        {!canEdit && saved.systemUrl && (
          <Button asChild size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700 max-sm:h-11">
            <a href={saved.systemUrl} target="_blank" rel="noopener noreferrer">
              {saved.system || '시스템'} 열기
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      {!canEdit && !isExternalActionConfigured(saved) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          아직 어디서 처리하는지 지정되지 않았습니다. 이 작업을 만든 사람이 설정해야 합니다.
        </p>
      )}

      {/* ── 시스템 ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>{canEdit ? '어느 시스템인가요' : '시스템'}</Label>
        {canEdit ? (
          <>
            <div className="flex flex-wrap gap-1">
              {EXTERNAL_SYSTEM_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      system: preset.name,
                      systemUrl: presetUrlAfterSwitch(prev.system, prev.systemUrl, preset.url),
                    }))
                  }
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors max-sm:px-3 max-sm:py-2',
                    draft.system === preset.name
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <Input
              value={draft.system}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, system: event.target.value.slice(0, EXTERNAL_NAME_MAX) }))
              }
              placeholder="시스템 이름 (예: K-에듀파인)"
            />
            <Input
              value={draft.systemUrl ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, systemUrl: event.target.value }))}
              placeholder="대문 주소(선택) — https://"
            />
          </>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {saved.system || '미지정'}
          </p>
        )}
      </div>

      {/* ── 화면 ───────────────────────────────────────────────────────── */}
      {(canEdit || saved.screens.length > 0) && <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{canEdit ? '어느 화면에서 무엇을 하나요' : '처리할 화면'}</Label>
          {canEdit && draft.screens.length < EXTERNAL_SCREENS_MAX && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs max-sm:h-11"
              onClick={() => setDraft((prev) => ({ ...prev, screens: [...prev.screens, { name: '' }] }))}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              화면 추가
            </Button>
          )}
        </div>

        {shown.screens.length === 0 && canEdit && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            화면을 적지 않아도 됩니다 — 시스템과 안내만으로도 충분하면 그대로 두세요.
          </p>
        )}

        <ul className="space-y-2">
          {shown.screens.map((screen, index) => {
            const url = safeExternalUrl(screen.url);
            return (
              <li key={index} className="rounded-xl border border-slate-200 bg-white p-2.5">
                {canEdit ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={screen.name}
                        onChange={(event) => setScreen(index, { name: event.target.value.slice(0, EXTERNAL_NAME_MAX) })}
                        placeholder="화면·메뉴 이름 (예: 지출품의 등록)"
                        className="h-8 text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-600"
                        aria-label="이 화면 빼기"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, screens: prev.screens.filter((_, i) => i !== index) }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={screen.path ?? ''}
                      onChange={(event) => setScreen(index, { path: event.target.value.slice(0, EXTERNAL_NAME_MAX) })}
                      placeholder="메뉴 경로(선택) — 학교회계 > 지출 > 품의"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={screen.url ?? ''}
                      onChange={(event) => setScreen(index, { url: event.target.value })}
                      placeholder="바로 여는 주소(선택) — https://"
                      className="h-8 text-xs"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{screen.name}</p>
                      {screen.path && <p className="truncate text-[10px] text-slate-400">{screen.path}</p>}
                    </div>
                    {screen.name && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px] text-slate-500 max-sm:h-11"
                        onClick={() => void copyName(screen.name)}
                        title="화면 이름 복사"
                      >
                        <Copy className="mr-1 h-3 w-3" />이름 복사
                      </Button>
                    )}
                    {url && (
                      <Button asChild variant="outline" size="sm" className="h-7 shrink-0 text-xs max-sm:h-11">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          열기
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>}

      {/* ── 처리 안내 — 담당자 화면에서는 안내가 있을 때만 ─────────────── */}
      {(canEdit || saved.note) && <div className="space-y-1.5">
        <Label>처리 안내</Label>
        {canEdit ? (
          <Textarea
            value={draft.note ?? ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, note: event.target.value.slice(0, EXTERNAL_NOTE_MAX) }))
            }
            placeholder="담당자가 알아야 할 것 — 순서, 마감, 주의할 점"
            rows={3}
          />
        ) : (
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
            {saved.note}
          </p>
        )}
      </div>}

      {canEdit && (
        <p className="text-[10px] text-slate-400">
          주소는 http(s)만 저장됩니다 · 화면 최대 {EXTERNAL_SCREENS_MAX}개 · 담당자는 처리를 마치면 내 할 일에서 완료를 체크합니다
        </p>
      )}
    </div>
  );
}
