import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * 교사 외부 서비스 계정 저장소 = 표 `resource_accounts` (2026-10-13 — 종전 `resource.meta.accounts`).
 *
 * `resource` 는 로그인한 누구나 읽을 수 있어 meta 에 든 비밀번호가 학생에게도 보였다. 이 표는
 * **본인(연결된 계정)·관리자만** 읽고 관리자만 쓴다. `resource.meta` 에 `accounts` 를 다시 쓰면
 * 트리거가 거부한다.
 *
 * 값의 모양은 종전과 같다(`accounts` 칼럼 = 옛 `meta.accounts`). 그래서 기존 유틸
 * (`parseAccounts`·`mergeAccountsIntoMeta`·`mergeAccountPatchIntoMeta`)에는
 * `accountsAsMeta(...)` 로 `{ accounts }` 모양을 만들어 넘기면 된다.
 */

const table = () => supabase.from('resource_accounts' as never);

/** `{ accounts }` — `parseAccounts`·merge 유틸이 받는 meta 모양. */
export const accountsAsMeta = (accounts: unknown): { accounts?: unknown } =>
  accounts == null ? {} : { accounts };

/** resource id → 저장된 accounts 원본. 권한이 없는 행은 RLS 가 빼므로 지도에 없다. */
export const fetchResourceAccounts = async (
  resourceIds?: string[],
): Promise<Map<string, unknown>> => {
  if (resourceIds && resourceIds.length === 0) return new Map();
  let query = table().select('resource_id, accounts');
  if (resourceIds) query = query.in('resource_id', resourceIds);
  const { data, error } = await query;
  if (error) throw error;
  const map = new Map<string, unknown>();
  for (const row of (data ?? []) as Array<{ resource_id: string; accounts: unknown }>) {
    map.set(row.resource_id, row.accounts);
  }
  return map;
};

/**
 * 한 교사의 계정을 **통째로** 저장한다. 비었으면(`null`·`{}`) 행을 지운다.
 * RLS 차단은 오류가 아니라 0행이므로 돌아온 행으로 실제 반영을 확인한다.
 */
export const saveResourceAccounts = async (
  resourceId: string,
  accounts: unknown,
): Promise<void> => {
  const isEmpty =
    accounts == null ||
    (typeof accounts === 'object' && Object.keys(accounts as object).length === 0);

  if (isEmpty) {
    const { error } = await table().delete().eq('resource_id', resourceId);
    if (error) throw error;
    return;
  }

  const { data, error } = await table()
    .upsert({ resource_id: resourceId, accounts: accounts as Json } as never, {
      onConflict: 'resource_id',
    })
    .select('resource_id');
  if (error) throw error;
  if (!(data as unknown[] | null)?.length) throw new Error('권한이 없어 저장되지 않았습니다.');
};
