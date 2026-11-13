/**
 * 에이전트(MCP) 연결 동의 화면 — `/oauth/consent` (2026-10-18 시험판).
 *
 * Supabase OAuth 2.1 서버가 에이전트의 인가 요청을 받으면 사용자를 `<사이트>/oauth/consent?authorization_id=…`
 * 로 보낸다. 여기서 승인하면 에이전트는 **이 사용자 본인 권한의 토큰**을 받는다.
 *
 * - 승인할 수 있는 사람 = 관리자가 MCP 도구를 하나라도 허용해 준 교직원(`mcp_my_tools`). 허용이 없으면
 *   [승인]을 그리지 않는다 — 승인해도 쓸 도구가 없고, «허용된 사람만 연결»이 이 화면의 일이다.
 *   (도구 하나하나의 허용은 각 RPC 가 다시 확인한다 — 이 화면은 입구일 뿐 권한이 아니다.)
 * - `authorization_id` 없이 열면 «연결된 에이전트» 목록과 [연결 해제]만 보인다(나중에 끊는 자리).
 * - 로그인 전에 오면 RequireAuth 가 이 주소(쿼리 포함)를 기억했다가 로그인 뒤 되돌린다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Link2Off, Loader2, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { MCP_TOOL_GRANTS, grantsOf } from '@/lib/mcpTools';
import {
  decideAuthorization,
  getAuthorizationDetails,
  listOAuthGrants,
  revokeOAuthGrant,
  type AuthorizationLookup,
} from '@/services/oauthConsentService';
import { toast } from '@/lib/toast';

const hostOf = (uri: string) => {
  try { return new URL(uri).host; } catch { return uri; }
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id');
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [deciding, setDeciding] = useState<'approve' | 'deny' | null>(null);
  const [leaving, setLeaving] = useState(false);

  const myTools = useQuery({
    queryKey: ['mcp-my-tools'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mcp_my_tools' as never);
      if (error) throw error;
      return grantsOf(((data as string[] | null) ?? []).map((tool) => ({ tool })));
    },
  });

  const lookup = useQuery<AuthorizationLookup>({
    queryKey: ['oauth-authorization', authorizationId],
    queryFn: () => getAuthorizationDetails(authorizationId!),
    enabled: !!authorizationId,
    retry: false,
    staleTime: Infinity,
  });

  const grants = useQuery({
    queryKey: ['oauth-grants'],
    queryFn: listOAuthGrants,
    enabled: !authorizationId,
    retry: false,
  });

  // 이미 동의한 요청 — 서버가 곧장 돌아갈 주소를 준다.
  useEffect(() => {
    if (lookup.data?.kind === 'redirect') {
      setLeaving(true);
      window.location.assign(lookup.data.redirectUrl);
    }
  }, [lookup.data]);

  const details = lookup.data?.kind === 'consent' ? lookup.data.details : null;
  const allowed = useMemo(
    () => MCP_TOOL_GRANTS.filter((g) => (myTools.data ?? []).includes(g.key)),
    [myTools.data],
  );
  const canApprove = allowed.length > 0;

  const decide = async (action: 'approve' | 'deny') => {
    if (!authorizationId) return;
    setDeciding(action);
    try {
      const redirectUrl = await decideAuthorization(authorizationId, action);
      setLeaving(true);
      window.location.assign(redirectUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리하지 못했습니다.');
      setDeciding(null);
    }
  };

  const revoke = async (clientId: string, name: string) => {
    if (!window.confirm(`«${name}» 연결을 끊을까요? 그 에이전트는 다시 동의를 받기 전까지 SPACEKIJUN 에 접근할 수 없습니다.`)) return;
    try {
      await revokeOAuthGrant(clientId);
      await queryClient.invalidateQueries({ queryKey: ['oauth-grants'] });
      toast.success(`«${name}» 연결을 끊었습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '연결을 끊지 못했습니다.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-base font-semibold text-slate-900">
              {authorizationId ? '에이전트 연결 요청' : '연결된 에이전트'}
            </h1>
            <p className="break-all text-xs text-slate-500">{profile?.name ? `${profile.name} · ` : ''}{profile?.email}</p>
          </div>
        </div>

        {authorizationId ? (
          lookup.isLoading || myTools.isLoading || leaving ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {leaving ? '에이전트로 돌아가는 중…' : '요청을 확인하는 중…'}
            </div>
          ) : lookup.isError || !details ? (
            <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
              <p className="font-medium">요청을 읽을 수 없습니다</p>
              <p className="text-xs leading-relaxed">
                {lookup.error instanceof Error ? lookup.error.message : '이미 처리됐거나 시간이 지난 요청입니다.'}{' '}
                에이전트에서 연결을 다시 시작해 주세요.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1 rounded-xl border bg-slate-50 p-3">
                <p className="truncate text-sm font-semibold text-slate-800" title={details.client.name}>
                  {details.client.name || '이름 없는 에이전트'}
                </p>
                <p className="truncate text-xs text-slate-500" title={details.redirect_uri}>
                  돌아갈 곳: {hostOf(details.redirect_uri)}
                </p>
              </div>

              {canApprove ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">승인하면 이 에이전트가 <b>선생님 본인의 권한으로</b> 다음 일을 할 수 있습니다.</p>
                  <ul className="space-y-1.5">
                    {allowed.map((g) => (
                      <li key={g.key} className="flex items-start gap-2 text-sm">
                        <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${g.writes ? 'text-amber-600' : 'text-emerald-600'}`} />
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{g.label}</span>
                          {g.writes && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700">쓰기</span>}
                          <span className="block text-xs text-slate-500">{g.description}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    웹에서 선생님이 할 수 없는 일은 에이전트도 할 수 없습니다. 그 밖의 자료(학생 정보·서류함 등)에는 닿지 않습니다.
                    연결은 언제든 이 주소(/oauth/consent)에서 끊을 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p className="leading-relaxed">
                    아직 에이전트 연결이 허용되지 않은 계정입니다. 관리자에게 «에이전트(MCP)» 도구 허용을 요청해 주세요.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => decide('deny')} disabled={deciding !== null}>
                  {deciding === 'deny' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />}
                  거절
                </Button>
                {canApprove && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => decide('approve')} disabled={deciding !== null}>
                    {deciding === 'approve' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                    승인
                  </Button>
                )}
              </div>
            </>
          )
        ) : (
          <div className="space-y-2">
            {grants.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
              </div>
            ) : grants.isError ? (
              <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
                {grants.error instanceof Error ? grants.error.message : '목록을 불러오지 못했습니다.'}
              </p>
            ) : (grants.data ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">연결된 에이전트가 없습니다.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {(grants.data ?? []).map((g) => (
                  <li key={g.client.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800" title={g.client.name}>{g.client.name || g.client.id}</p>
                      <p className="text-xs text-slate-500">{new Date(g.granted_at).toLocaleString('ko-KR')} 연결</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => revoke(g.client.id, g.client.name || g.client.id)}>
                      <Link2Off className="mr-1.5 h-4 w-4" /> 연결 해제
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">
              {myTools.data && myTools.data.length > 0
                ? `허용된 도구: ${allowed.map((g) => g.label).join(' · ')}`
                : '아직 에이전트 연결이 허용되지 않은 계정입니다.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
