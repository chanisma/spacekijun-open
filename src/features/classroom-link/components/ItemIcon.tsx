import { useState } from 'react';
import { FileText, Folder, Globe, LayoutGrid, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PresetItem } from '../presetItems';
import { driveTypeIconUrl, faviconUrl, googleIconUrl, googleLook, programIconUrl, programLook, siteIconUrl } from './iconSources';

/**
 * 세팅 항목 아이콘 — **실제 아이콘**을 쓴다(2026-10-14 사용자 요청). 교실 독(NEIS_helper app/web/classroom-dock.js)도 같다.
 *  · 구글 앱    /classroom-icons/google/<키>.png — 구글 공식 제품 아이콘(gstatic)을 받아 둔 것
 *  · 프로그램   /classroom-icons/programs/<키>.png — Windows 에 설치된 실행 파일에서 뽑은 것(없는 것은 글자 타일).
 *               교실 PC 에서는 그 PC 에 설치된 실행 파일에서 다시 뽑는다
 *  · 웹사이트   그 사이트 파비콘(구글 파비콘 서비스) · 드라이브 = 구글 드라이브 형식 아이콘
 * 그림을 못 읽으면 같은 색의 글자 타일로 그린다.
 */
const SIZES = { sm: 'h-7 w-7 rounded-lg text-[11px]', md: 'h-10 w-10 rounded-xl text-sm', lg: 'h-12 w-12 rounded-2xl text-base' };
const ICON_SIZES = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-6 w-6' };
// 흰 판 위 아이콘(파비콘·드라이브 형식·G)의 여백 — %로 주면 부모 너비 기준이라 판이 커진다(2026-10-14)
const PLATE_PADDING = { sm: 'p-1', md: 'p-1.5', lg: 'p-2' };
type Size = keyof typeof SIZES;

function Tile({ text, color, size, className }: { text: React.ReactNode; color: string; size: Size; className?: string }) {
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center font-bold text-white shadow-sm ring-1 ring-black/5', SIZES[size], className)}
      style={{ background: color }}
      aria-hidden
    >
      {text}
    </span>
  );
}

/** 실제 아이콘 — 못 읽으면 fallback(글자 타일) */
export function RealIcon({ src, fallback, size = 'md', className, plate = false }: {
  src: string | null; fallback: React.ReactNode; size?: Size; className?: string; plate?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{fallback}</>;
  return (
    <span className={cn('inline-grid shrink-0 place-items-center overflow-hidden', SIZES[size],
      plate && cn('bg-white shadow-sm ring-1 ring-black/5', PLATE_PADDING[size]), className)} aria-hidden>
      <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" onError={() => setBroken(true)} />
    </span>
  );
}

export function ItemIcon({ item, size = 'md', className }: { item: PresetItem; size?: Size; className?: string }) {
  const icon = ICON_SIZES[size];
  switch (item.kind) {
    case 'url': {
      if (item.app) {
        const [text, color] = googleLook(item.app);
        return <RealIcon src={googleIconUrl(item.app)} size={size} className={className}
          fallback={<Tile text={text} color={color} size={size} className={className} />} />;
      }
      return <RealIcon src={item.site ? siteIconUrl(item.site) : faviconUrl(item.url)} size={size} className={className} plate
        fallback={<Tile text={<Globe className={icon} />} color="#0891b2" size={size} className={className} />} />;
    }
    case 'drive': {
      const folder = item.mimeType === 'application/vnd.google-apps.folder';
      return <RealIcon src={driveTypeIconUrl(item.mimeType)} size={size} className={className} plate
        fallback={folder
          ? <Tile text={<Folder className={icon} />} color="#d97706" size={size} className={className} />
          : <Tile text={<FileText className={icon} />} color="#2563eb" size={size} className={className} />} />;
    }
    case 'program': {
      const [text, color] = programLook(item.program);
      return <RealIcon src={programIconUrl(item.program)} size={size} className={className}
        fallback={<Tile text={text} color={color} size={size} className={className} />} />;
    }
    case 'space':
      return <RealIcon src="/logo_sm.png" size={size} className={className} plate
        fallback={<Tile text={<LayoutGrid className={icon} />} color="#4f46e5" size={size} className={className} />} />;
    default:
      return <Tile text={<Monitor className={icon} />} color="#64748b" size={size} className={className} />;
  }
}

/** 독 맨 앞에 늘 있는 «구글»·«내 드라이브» */
export function FixedDockIcon({ kind, size = 'md' }: { kind: 'google' | 'drive'; size?: Size }) {
  return kind === 'google'
    ? <RealIcon src={googleIconUrl('google')} size={size} plate
        fallback={<Tile text="G" color="#ffffff" size={size} className="text-slate-700" />} />
    : <RealIcon src={googleIconUrl('drive')} size={size}
        fallback={<Tile text={<Folder className={ICON_SIZES[size]} />} color="#2563eb" size={size} />} />;
}
