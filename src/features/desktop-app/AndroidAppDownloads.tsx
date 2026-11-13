/**
 * 휴대폰 앱(안드로이드 APK) 받기 카드 (2026-11-10) — «PC 앱» 페이지에 PC 앱과 함께. 배포 목록·규칙은 `src/lib/androidApps.ts`.
 * 받기 단추는 Storage 의 판 번호 붙은 APK 로 바로 간다(데스크처럼 조각 이어 붙이기 없음 — 0.5~5MB).
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMegabytes } from '@/lib/desktopApps';
import { ANDROID_APPS, fetchAndroidRelease, type AndroidAppChannel } from '@/lib/androidApps';

export function AndroidAppDownloads({ channels, android }: { channels: AndroidAppChannel[]; android: boolean }) {
  if (!channels.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-semibold text-slate-800">휴대폰 · 태블릿 앱 (안드로이드)</h2>
        <span className="text-xs text-slate-400">아이폰은 Safari 에서 사이트를 열고 «홈 화면에 추가»</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((channel) => <AndroidAppCard key={channel} channel={channel} android={android} />)}
      </div>
      <div className="rounded-2xl border bg-card p-4 text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-800">설치 방법</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>안드로이드 기기에서 이 화면을 열고 [내려받기]를 누릅니다(PC 에서 받았다면 파일을 기기로 옮깁니다).</li>
          <li>받은 파일을 엽니다. «출처를 알 수 없는 앱» 설치를 묻으면 이 브라우저(또는 파일 앱)에 [허용]을 켭니다.</li>
          <li>Play 프로텍트 경고가 뜨면 [세부정보] → [무시하고 설치]. 학교에서 만든 앱이라 Play 스토어에 없어서 그렇습니다.</li>
        </ol>
      </div>
    </section>
  );
}

function AndroidAppCard({ channel, android }: { channel: AndroidAppChannel; android: boolean }) {
  const app = ANDROID_APPS[channel];
  const release = useQuery({ queryKey: ['android-release', channel], queryFn: () => fetchAndroidRelease(channel), staleTime: 5 * 60 * 1000, retry: 1 });
  const manifest = release.data;
  const published = manifest?.published ? new Date(manifest.published) : null;
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-lime-400" />
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{app.name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{app.audience}</span>
          </div>
          <p className="text-xs text-slate-400">Android APK</p>
        </div>
      </div>
      <p className="text-sm text-slate-600">{app.summary}</p>
      <ul className="space-y-1 text-sm text-slate-600">
        {app.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-2 border-t pt-3">
        {release.isLoading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />최신 판을 확인하는 중…</p>}
        {release.error && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" /><span>{(release.error as Error).message}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => release.refetch()}>
              <RefreshCw className="h-3 w-3" />다시 확인
            </Button>
          </div>
        )}
        {manifest && (
          <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{manifest.version}판</span>
            <span>· {formatMegabytes(manifest.size)}</span>
            {published && !Number.isNaN(published.getTime()) && (
              <span>· {published.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 게시</span>
            )}
          </p>
        )}
        {manifest ? (
          <Button asChild className="h-10 w-full gap-2 bg-emerald-600 text-sm hover:bg-emerald-700">
            <a href={manifest.url} download={manifest.file} rel="noreferrer"><Download className="h-4 w-4" />{app.name} 내려받기</a>
          </Button>
        ) : (
          <Button disabled className="h-10 w-full gap-2 text-sm"><Download className="h-4 w-4" />{app.name} 내려받기</Button>
        )}
        {!android && <p className="text-[11px] text-slate-400">안드로이드 기기에서 받으면 바로 깔 수 있어요.</p>}
      </div>
    </div>
  );
}
