import { AlertTriangle, ExternalLink, Building2, Phone, FileText, Layers } from 'lucide-react';
import { useAdmissionUnivInfo } from '../hooks/useWishlist';
import {
  MULTI_APPLY_LABELS, resolveUnivInfo, urlHost,
  type MultiApplyStatus,
} from '../utils/admissionUnivInfo';

interface Props {
  /** 이 항목의 대학명 */
  university: string;
}

/** 판정 배지 색 — 앱 전역 규약(에메랄드=가능 · 로즈=불가 · 슬레이트=해당없음/보류) */
const STATUS_TONE: Record<MultiApplyStatus, string> = {
  allowed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  blocked: 'text-rose-700 bg-rose-50 border-rose-200',
  'not-applicable': 'text-slate-600 bg-slate-100 border-slate-200',
  unknown: 'text-amber-700 bg-amber-50 border-amber-200',
};

/**
 * 대학 기본 정보 — 입학처 사이트·연락처·복수지원 가능 여부.
 *
 * 비교표 셀은 좁아 요약만 담으므로 **복수지원 원문은 여기(상세 모달)에 있다**.
 * 요약은 규칙으로 읽은 값이라 틀릴 수 있어 원문을 항상 함께 둔다.
 *
 * 캠퍼스를 특정하지 못하면 **값을 고르지 않고 후보를 밝힌다** — 캠퍼스마다
 * 입학처 주소도 복수지원 규정도 다르기 때문이다(강원대 3캠퍼스가 서로 다르다).
 */
export function UnivInfoSection({ university }: Props) {
  const q = useAdmissionUnivInfo(university ? [university] : []);
  const match = resolveUnivInfo(university, q.data);

  if (q.isLoading) return <p className="text-[11px] text-slate-400">대학 정보 불러오는 중...</p>;
  if (q.isError) return <p className="text-[11px] text-rose-400">대학 정보를 불러올 수 없습니다.</p>;

  if (match.ambiguous) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-px" />
        <div className="min-w-0">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            <b>어느 캠퍼스인지 특정할 수 없습니다.</b> 캠퍼스마다 입학처 주소와 복수지원 규정이
            달라 임의로 고르지 않았습니다.
          </p>
          <ul className="mt-1 space-y-0.5">
            {match.candidates.map((c) => (
              <li key={c.university} className="text-[11px] text-slate-500 flex items-center gap-1.5 min-w-0">
                <span className="truncate">{c.university}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{c.multiApplySummary}</span>
                {c.homeUrl && (
                  <a
                    href={c.homeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:underline shrink-0"
                  >
                    {urlHost(c.homeUrl)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const info = match.info;
  if (!info) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-px" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          이 대학의 <b>자료가 없습니다</b>. 수록 범위가 대교협 4년제 수시모집 자료 202개 대학이라,
          전문대·과학기술원은 포함되지 않습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 캠퍼스를 버리고 찾았으면 무엇과 붙었는지 밝힌다 — 캠퍼스가 다르면 값도 다르다 */}
      {match.viaBase && (
        <p className="text-[10px] text-amber-600">
          목록의 &lsquo;{university}&rsquo; 를 자료의 &lsquo;{info.university}&rsquo; 로 보고 있습니다.
        </p>
      )}

      <ul className="space-y-1">
        <InfoRow icon={Building2} label="입학처">
          {info.homeUrl ? (
            <a
              href={info.homeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1 break-all"
            >
              {urlHost(info.homeUrl)}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            // 원본이 주소가 아닌 안내 문구를 담고 있을 수 있다 — 링크로 만들지 않는다
            <span className="text-slate-500">{info.homeRaw ?? '자료 없음'}</span>
          )}
        </InfoRow>

        {(info.applyUrl || info.applyRaw) && (
          <InfoRow icon={FileText} label="원서접수">
            {info.applyUrl ? (
              <a
                href={info.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 hover:underline break-all"
              >
                {urlHost(info.applyUrl)}
              </a>
            ) : (
              <span className="text-slate-500">{info.applyRaw}</span>
            )}
          </InfoRow>
        )}

        {info.phone && <InfoRow icon={Phone} label="전화"><span className="text-slate-600">{info.phone}</span></InfoRow>}
      </ul>

      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <Layers className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-600">복수지원</span>
          <span className={`text-[9.5px] font-bold px-1.5 py-px rounded border ${STATUS_TONE[info.multiApplyStatus]}`}>
            {MULTI_APPLY_LABELS[info.multiApplyStatus]}
          </span>
          {/* 6 이상은 전국 공통 제한과 같아 이 대학만의 추가 제약이 아니다 */}
          {info.multiApplyLimit != null && info.multiApplyLimit < 6 && (
            <span className="text-[10px] text-slate-500">본교 내 최대 {info.multiApplyLimit}회</span>
          )}
        </div>
        {info.multiApplyText ? (
          <p className="text-[11px] text-slate-600 whitespace-pre-wrap break-words leading-relaxed">
            {info.multiApplyText}
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">자료에 복수지원 안내가 없습니다.</p>
        )}
      </div>

      <p className="text-[9.5px] text-slate-400 leading-relaxed">
        출처: 한국대학교육협의회 대학별 2027학년도 수시모집 자료
        {info.baseDate ? ` · 대학 기준일 ${info.baseDate}` : ''}. 위 판정은 원문을 규칙으로 요약한
        값이라 <b>최종 확인은 대학 모집요강 원문</b>으로 하세요.
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-1.5 text-[11.5px] min-w-0">
      <Icon className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
      <span className="text-slate-500 shrink-0 w-14">{label}</span>
      <span className="min-w-0 break-all">{children}</span>
    </li>
  );
}
