/**
 * 전자서명 목록 — 독립 메뉴(`/signatures`).
 *
 * 두 종류의 사람이 온다:
 *   **받는 사람** 문서를 올려 서명을 요청하고, 다 되면 Drive 로 옮긴다
 *   **하는 사람** 자기 차례인 문서에 서명한다
 *
 * ── 헤더 한 줄에 모은다 ────────────────────────────────────────────────────
 * 제목·탭·검색·주 행동이 각각 다른 줄에 있으면 세로를 네 줄 먹고 정작 목록이 밀린다.
 * 헤더 카드 하나에 **[제목+요청 버튼] / [탭+검색]** 두 층으로 모아 그 아래를 전부
 * 목록에 준다(입시 정보 `IpsiHubHeader` 의 글래스 카드와 같은 결).
 *
 * 첫 탭은 **요청 받은 서명** — 눌러야 할 이유가 있는 것이 먼저다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { FileSignature, HelpCircle, Inbox, Loader2, Plus, Search, Send } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { SignatureRequestWizard } from './components/SignatureRequestWizard';
import { SignatureSignDialog } from './components/SignatureSignDialog';
import { SignatureCard } from './components/SignatureCard';
import { SignatureGuideDialog } from './components/guide/SignatureGuideDialog';
import { myTurn } from './lib/signatureFlow';
import { useSignatureRequest, useSignatureRequests } from './hooks/useSignatureRequests';
import type { SignatureRequest } from './types';

type Tab = 'inbox' | 'sent' | 'all';

const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: '요청 받은 서명', icon: Inbox },
  { id: 'sent', label: '요청 한 서명', icon: Send },
  { id: 'all', label: '전체', icon: FileSignature },
];

export const SignatureRequestsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { data: requests = [], isLoading } = useSignatureRequests();

  const [tab, setTab] = useState<Tab>('inbox');
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [selected, setSelected] = useState<SignatureRequest | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('request');
  const { data: requestedSignature, isError: requestError, isSuccess: requestLoaded } = useSignatureRequest(requestedId);

  useEffect(() => {
    if (!requestedId || (!requestLoaded && !requestError)) return;
    if (requestedSignature) {
      setSelected(requestedSignature);
    } else {
      toast.error('서명 요청을 찾을 수 없거나 접근 권한이 없습니다.');
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('request');
    setSearchParams(nextParams, { replace: true });
  }, [requestedId, requestedSignature, requestError, requestLoaded, searchParams, setSearchParams]);

  // 객체를 매 렌더 새로 만들면 아래 useMemo 가 매번 다시 돈다(요청 200건 × 서명자)
  const me = useMemo(
    () => ({ userId: user?.id ?? null, name: profile?.name ?? null }),
    [user?.id, profile?.name],
  );

  const isMyTurn = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of requests) {
      map.set(r.id, myTurn(
        r.signers.map((s) => ({
          id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
          signerUserId: s.signerUserId, signerName: s.signerName,
          status: s.status, fields: s.fields,
        })),
        r.status, me,
      ).isMyTurn);
    }
    return map;
  }, [requests, me]);

  /** 내가 서명자로 들어간 건(차례가 아니어도 '요청 받은 서명'이다) */
  const isAssignedToMe = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of requests) {
      map.set(r.id, r.signers.some((s) =>
        (me.userId != null && s.signerUserId === me.userId) ||
        (s.signerUserId == null && me.name != null && s.signerName === me.name)));
    }
    return map;
  }, [requests, me]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = requests.filter((r) => {
      // '요청 받은 서명' = 내가 서명자인 것 전부. 차례가 아닌 것도 여기 속한다
      if (tab === 'inbox' && !isAssignedToMe.get(r.id)) return false;
      if (tab === 'sent' && r.requesterUserId !== user?.id) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.sourceName.toLowerCase().includes(q) ||
        r.requesterName.toLowerCase().includes(q) ||
        r.signers.some((s) => s.signerName.toLowerCase().includes(q))
      );
    });

    // 내 차례인 것을 맨 위로 — 목록의 목적은 "할 일 찾기"다
    return rows.sort((a, b) => {
      const at = isMyTurn.get(a.id) ? 0 : 1;
      const bt = isMyTurn.get(b.id) ? 0 : 1;
      if (at !== bt) return at - bt;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [requests, tab, search, isAssignedToMe, isMyTurn, user?.id]);

  const counts = useMemo(() => ({
    inbox: requests.filter((r) => isMyTurn.get(r.id)).length,
    sent: requests.filter((r) => r.requesterUserId === user?.id && r.status === 'pending').length,
    all: 0,
  }), [requests, isMyTurn, user?.id]);

  // 선택된 요청은 목록이 갱신되면 함께 갱신돼야 한다(서명 후 상태가 바로 반영)
  const selectedLive = selected
    ? requests.find((r) => r.id === selected.id) ?? selected
    : null;

  return (
    <Layout>
      <PageContainer>
        {/*
          ── 헤더 ──
          기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
          액션은 오른쪽. 탭은 주 행동(서명 요청) **바로 왼쪽**에 둬 한 줄로 읽히게 한다.
          건수는 탭 배지(내 차례·요청함)가 이미 말한다.
        */}
        <div className="rounded-xl border border-white/20 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:px-4">
          <div className="flex items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* 사용 방법 — 액션 묶음의 **맨 왼쪽**이 늘 이 자리다(사용자 규약:
                  이 버튼 왼쪽에는 아무 버튼도 두지 않는다). 처음 온 사람만 필요하므로
                  버튼 무게를 낮추되(ghost) 늘 같은 자리에 둔다 */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">사용 방법</span>
              </Button>

              {/* 탭 — 주 행동 바로 왼쪽 */}
              <div className="inline-flex gap-0.5 rounded-lg bg-slate-100/70 p-0.5">
                {TABS.map((t) => {
                  const active = tab === t.id;
                  const badge = t.id === 'inbox' ? counts.inbox : t.id === 'sent' ? counts.sent : 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:px-2.5',
                        active ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                      )}
                      title={t.label}
                    >
                      <t.icon className="h-3.5 w-3.5 shrink-0" />
                      {/* 좁은 화면에서는 아이콘만 — 탭 3개가 액션을 밀어내지 않게 */}
                      <span className="hidden md:inline">{t.label}</span>
                      {/* 배지 = 눌러야 할 이유. 0이면 달지 않는다 */}
                      {badge > 0 && (
                        <span className={cn('rounded-full px-1.5 text-[10px] font-semibold',
                          t.id === 'inbox' ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700')}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <Button
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 px-3 text-xs text-white shadow-sm transition-all hover:from-violet-600 hover:to-indigo-700"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">서명 요청</span>
              </Button>
            </div>
          </div>

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·파일명·이름으로 검색"
              className="h-8 bg-white/70 pl-8 text-xs"
            />
          </div>
        </div>

        {/* ── 카드 그리드 ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
            <FileSignature className="h-9 w-9 text-slate-300" />
            <p className="text-sm">
              {search.trim() ? '검색 결과가 없습니다.'
                : tab === 'inbox' ? '나에게 요청된 서명이 없습니다.'
                : tab === 'sent' ? '요청한 서명이 없습니다.'
                : '문서가 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <SignatureCard
                key={r.id}
                request={r}
                isMyTurn={!!isMyTurn.get(r.id)}
                meId={me.userId}
                meName={me.name}
                onClick={() => setSelected(r)}
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* 마법사가 자기 Dialog 를 소유한다 — 문서를 붙일 때 모달 폭을 스스로 늘려야 하므로 */}
      <SignatureRequestWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <SignatureSignDialog
        request={selectedLive}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />

      <SignatureGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </Layout>
  );
};

export default SignatureRequestsPage;
