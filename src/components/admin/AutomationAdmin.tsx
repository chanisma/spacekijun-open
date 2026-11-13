/**
 * 관리자 «자동화 업무» 탭 (2026-10-23) — 전체 정지 · 상한 · 허용(사람) · 실행기(서버 PC 키).
 *
 * 허용 = `automation_grant`(사람 × 종류, 쓰기 = 관리자 RLS). 실행기 키는 발급할 때 **한 번만** 보인다 —
 * 서버는 sha256 만 갖고 있어 다시 보여 줄 방법이 없다(잃어버리면 새로 발급하고 옛 키를 거둔다).
 * 설계 = docs/plans/2026-10-23-automation-scheduler.md
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarClock, Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { COOLMSG_SENDER_NAME } from '@/lib/automationConfig';
import { toast } from '@/lib/toast';
import { AUTOMATION_CONFIG_KEY, fetchAutomationConfig } from '@/features/automations/automationService';
import { supabaseProject } from '@/services/oauthConsentService';

const table = (name: string) => supabase.from(name as never);
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

interface GrantRow { resource_id: string; granted_at: string; resource: { name: string; type: string } | null }
interface RunnerRow { id: string; name: string; revoked_at: string | null; last_seen_at: string | null; last_version: string | null; created_at: string }

const RUNNER_URL = `${String(supabaseProject.supabaseUrl).replace(/\/$/, '')}/functions/v1/automation-runner`;
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko }) : '한 번도 없음');

export function AutomationAdmin() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const config = useQuery({ queryKey: AUTOMATION_CONFIG_KEY, queryFn: fetchAutomationConfig });
  const [maxRecipients, setMaxRecipients] = useState(80);
  const [maxRuns, setMaxRuns] = useState(3);
  useEffect(() => {
    if (config.data) {
      setMaxRecipients(config.data.max_recipients_per_run);
      setMaxRuns(config.data.max_runs_per_day);
    }
  }, [config.data]);

  const grants = useQuery({
    queryKey: ['automation-grants'],
    queryFn: async () => {
      const { data, error } = await table('automation_grant')
        .select('resource_id, granted_at, resource:resource_id(name, type)')
        .eq('kind', 'coolmsg.send');
      if (error) throw error;
      return ((data ?? []) as unknown as GrantRow[]).sort((a, b) => (a.resource?.name ?? '').localeCompare(b.resource?.name ?? '', 'ko'));
    },
  });
  const [adding, setAdding] = useState<string[]>([]);

  const runners = useQuery({
    queryKey: ['automation-runners'],
    queryFn: async () => {
      const { data, error } = await rpc('automation_admin_runners', {});
      if (error) throw new Error(error.message);
      return (data ?? []) as RunnerRow[];
    },
    refetchInterval: 60_000,
  });
  const [runnerName, setRunnerName] = useState('학교 서버 PC');
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  async function saveConfig(patch: Partial<{ paused_all: boolean; max_recipients_per_run: number; max_runs_per_day: number }>) {
    setBusy('config');
    try {
      const { data, error } = await table('automation_config').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', true).select('id');
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== 1) throw new Error('저장하지 못했습니다(권한 확인).');
      await queryClient.invalidateQueries({ queryKey: AUTOMATION_CONFIG_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function addGrants() {
    const have = new Set((grants.data ?? []).map((g) => g.resource_id));
    const targets = adding.filter((id) => !have.has(id));
    if (targets.length === 0) return;
    setBusy('grant');
    try {
      const { error } = await table('automation_grant').insert(targets.map((resource_id) => ({ resource_id, kind: 'coolmsg.send' })) as never);
      if (error) throw new Error(error.message);
      setAdding([]);
      await queryClient.invalidateQueries({ queryKey: ['automation-grants'] });
      toast.success(`${targets.length}명에게 허용했습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function removeGrant(g: GrantRow) {
    if (!window.confirm(`${g.resource?.name ?? ''} 선생님의 자동화 허용을 거둘까요? 이미 켜 둔 자동화는 다음 회차부터 «권한 없음»으로 건너뜁니다.`)) return;
    setBusy(g.resource_id);
    try {
      const { data, error } = await table('automation_grant').delete().eq('resource_id', g.resource_id).eq('kind', 'coolmsg.send').select('resource_id');
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== 1) throw new Error('지우지 못했습니다(권한 확인).');
      await queryClient.invalidateQueries({ queryKey: ['automation-grants'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '지우지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function issueRunner() {
    setBusy('runner');
    try {
      const { data, error } = await rpc('automation_admin_issue_runner', { p_name: runnerName.trim() || '학교 서버 PC' });
      if (error) throw new Error(error.message);
      setIssuedKey((data as { key: string }).key);
      await queryClient.invalidateQueries({ queryKey: ['automation-runners'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발급하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeRunner(r: RunnerRow) {
    if (!window.confirm(`«${r.name}» 실행기의 키를 거둘까요? 그 서버는 바로 회차를 가져가지 못합니다.`)) return;
    setBusy(r.id);
    try {
      const { error } = await rpc('automation_admin_revoke_runner', { p_id: r.id });
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ['automation-runners'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '거두지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('복사했습니다.');
    } catch {
      toast.error('복사하지 못했습니다. 직접 선택해 복사해 주세요.');
    }
  };

  const cfg = config.data;
  const activeRunners = (runners.data ?? []).filter((r) => !r.revoked_at);

  return (
    <section aria-label="자동화 업무 관리" className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-slate-700">
              허용한 교직원이 정해 둔 때에, 학교 서버 PC 가 쿨메신저 <b>«{COOLMSG_SENDER_NAME}»</b> 계정으로 쪽지를 보냅니다.
              회차는 DB 가 매분 만들고, 서버는 아래 실행기 키로 가져가 보낸 뒤 결과를 알립니다.
            </p>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-600" />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800">전체 정지</span>
                  <span className="block text-xs text-slate-500">켜면 어떤 자동화도 회차를 만들지 않고, 서버도 대기 회차를 가져가지 않습니다.</span>
                </span>
              </span>
              <Switch checked={cfg?.paused_all ?? false} disabled={!cfg || busy !== null}
                onCheckedChange={(v) => saveConfig({ paused_all: v })} />
            </label>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="space-y-1">
                <span className="block text-xs text-slate-500">회차당 받는 사람 상한</span>
                <Input type="number" min={1} max={500} className="h-8 w-24" value={maxRecipients} onChange={(e) => setMaxRecipients(Number(e.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-slate-500">자동화당 하루 회차 상한</span>
                <Input type="number" min={1} max={48} className="h-8 w-24" value={maxRuns} onChange={(e) => setMaxRuns(Number(e.target.value))} />
              </label>
              <Button size="sm" variant="outline" className="h-8 text-xs"
                disabled={!cfg || busy !== null || (maxRecipients === cfg.max_recipients_per_run && maxRuns === cfg.max_runs_per_day)
                  || maxRecipients < 1 || maxRecipients > 500 || maxRuns < 1 || maxRuns > 48}
                onClick={() => saveConfig({ max_recipients_per_run: maxRecipients, max_runs_per_day: maxRuns })}>
                상한 저장
              </Button>
              <span className="text-xs text-slate-500">넘으면 그 회차를 보내지 않고 만든 사람·관리자에게 알립니다.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">실행기 (서버 PC)</p>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs" title={RUNNER_URL}>{RUNNER_URL}</code>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(RUNNER_URL)}>
            <Copy className="mr-1 h-3.5 w-3.5" />주소 복사
          </Button>
        </div>
        {issuedKey && (
          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">새 키입니다. <b>지금 한 번만</b> 보입니다 — 서버 PC 의 비밀 파일에만 두고 다른 곳에 옮기지 마세요.</p>
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs">{issuedKey}</code>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copy(issuedKey)}><Copy className="mr-1 h-3.5 w-3.5" />복사</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIssuedKey(null)}>숨기기</Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-48" value={runnerName} maxLength={40} onChange={(e) => setRunnerName(e.target.value)} aria-label="실행기 이름" />
          <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy !== null} onClick={issueRunner}>
            {busy === 'runner' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1 h-4 w-4" />}
            키 발급
          </Button>
          {activeRunners.length === 0 && <span className="text-xs text-rose-600">켜진 실행기가 없어 회차가 나가지 않습니다(유효 시간이 지나면 건너뜀).</span>}
        </div>
        <ul className="divide-y rounded-lg border">
          {(runners.data ?? []).length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-slate-500">발급한 키가 없습니다.</li>
          ) : (runners.data ?? []).map((r) => (
            <li key={r.id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800" title={r.name}>{r.name}</span>
              <span className="flex-shrink-0 text-xs text-slate-500">
                {r.revoked_at ? `거둠 ${new Date(r.revoked_at).toLocaleDateString('ko-KR')}` : `마지막 응답 ${ago(r.last_seen_at)}`}
                {r.last_version && ` · ${r.last_version}`}
              </span>
              {!r.revoked_at && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:bg-rose-50" disabled={busy !== null} onClick={() => revokeRunner(r)}>
                  {busy === r.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                  거두기
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">만들 수 있는 사람</p>
        <SearchableMultiSelect filterByTeacher selectedValues={adding} onSelectionChange={setAdding}
          placeholder="교직원 선택…" searchPlaceholder="이름으로 검색" emptyText="검색 결과가 없습니다." />
        <div className="flex justify-end">
          <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy !== null || adding.length === 0} onClick={addGrants}>
            {busy === 'grant' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            허용
          </Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {grants.isLoading ? (
            <li className="py-4 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></li>
          ) : (grants.data ?? []).length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-slate-500">아직 허용한 사람이 없습니다. 관리자는 허용 없이도 만들 수 있습니다.</li>
          ) : (grants.data ?? []).map((g) => (
            <li key={g.resource_id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-800">{g.resource?.name ?? '(알 수 없음)'}
                {g.resource?.type === 'staff' && <span className="ml-1 text-xs text-slate-400">직원</span>}
              </span>
              <span className="flex-shrink-0 text-xs text-slate-500">{new Date(g.granted_at).toLocaleDateString('ko-KR')}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:bg-rose-50" disabled={busy !== null} onClick={() => removeGrant(g)}>
                {busy === g.resource_id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                해제
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
