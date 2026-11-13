// 다른 기능 화면(일정 상세 …)에 붙이는 «이어진 업무» 칸 (2026-11-08, P1) — 읽기만.
// 연결이 없으면 아무것도 그리지 않는다(칸이 생기지 않는다). 잇기·끊기는 업무 한 장 보기에서.
// ⚠️ 가상 일정(생일 · 할 일 마감 표시)은 id 가 meeting 행이 아니다 — uuid 가 아니면 묻지도 않는다.
import { Link } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathHidden } from '@/lib/menuVisibility';
import { Link2 } from 'lucide-react';
import { useObjectLinks } from '../hooks/useObjectLinks';
import { hrefOfObject } from '../model/explicitLinks';
import { WORK_HOME_PATH, type ObjectType } from '../model/objectRef';
import { Chip } from './chips';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_BADGE: Record<ObjectType, string> = {
  work: '업무', task: '할 일', official_doc: '공문', meeting: '일정', signature_request: '서명', document: '문서', budget_project: '예산',
};

export function LinkedObjectsSection({ type, id }: { type: ObjectType; id: string | null | undefined }) {
  const { isAdmin, effectiveRole } = useAuth();
  const { config, isLoading: menuLoading } = useMenuVisibility();
  // 「오늘」 메뉴가 보이는 사람에게만(시험판 = 관리자만) — 메뉴를 열면 이 칸도 함께 열린다.
  // 설정을 읽는 중에는 감춘다(라우트 게이트와 반대로 fail-closed: 칸 하나가 늦게 뜨는 것은 해가 없다)
  const workVisible = !menuLoading && !isPathHidden(config, WORK_HOME_PATH, { isAdmin, role: effectiveRole });
  const valid = workVisible && !!id && UUID.test(id);
  const { data } = useObjectLinks(valid ? type : null, valid ? id! : null);
  if (!valid || !data || data.rows.length === 0) return null;

  const others = data.rows
    .map((r) => {
      const outgoing = r.from_type === type && r.from_id === id;
      const o = data.resolved.get(outgoing ? `${r.to_type}:${r.to_id}` : `${r.from_type}:${r.from_id}`);
      return o ? { key: r.id, o, href: hrefOfObject(o) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (others.length === 0) return null;

  return (
    <section aria-label="이어진 업무" className="space-y-1.5">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <Link2 className="h-4 w-4" aria-hidden /> 이어진 업무 · 할 일
      </h4>
      <ul className="space-y-1">
        {others.map(({ key, o, href }) => (
          <li key={key}>
            {href ? (
              <Link to={href} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1.5 text-sm text-slate-800 hover:bg-slate-50 sm:min-h-9">
                <Chip tone="plain" className="flex-none">{TYPE_BADGE[o.type]}</Chip>
                <span className="min-w-0 truncate" title={o.label}>{o.label}</span>
              </Link>
            ) : (
              <span className="flex min-h-9 min-w-0 items-center gap-2 px-1.5 text-sm text-slate-800">
                <Chip tone="plain" className="flex-none">{TYPE_BADGE[o.type]}</Chip>
                <span className="min-w-0 truncate" title={o.label}>{o.label}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
