/**
 * PC 앱 내려받기 본문 — 앱 카드(최신 판 확인 · 내려받기) · 설치 방법 · 사용 안내 영상.
 * 배포본·확인 규칙은 `src/lib/desktopApps.ts`, 영상 목록도 거기(`DESKTOP_APP_GUIDE_VIDEOS`).
 */
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Loader2, Monitor, PlayCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DESKTOP_APPS, DesktopReleaseError, downloadRelease, fetchLatestRelease, formatMegabytes,
  guideVideosFor, releaseFileName, type DesktopAppChannel, type DownloadProgress, type GuideVideo,
} from '@/lib/desktopApps';

export function DesktopAppDownloads({ channels, windows, videos: videoList, extra, mobile }: { channels: DesktopAppChannel[]; windows: boolean; videos?: GuideVideo[]; extra?: React.ReactNode; mobile?: React.ReactNode }) {
  const videos = guideVideosFor(channels, videoList);
  return (
    <>
      {!windows && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Windows PC 에서 쓰는 프로그램입니다. 지금 기기에서는 실행되지 않으니 학교·집의 Windows PC 에서 이 화면을 열어 받아 주세요.</p>
        </div>
      )}

      {/* 휴대폰 앱(2026-11-10) — Windows 가 아닌 기기(휴대폰)에서 열면 PC 앱보다 먼저 */}
      {!windows && mobile}

      {channels.map((channel) => <AppCard key={channel} channel={channel} />)}

      {windows && mobile}

      {/* 앱 말고 더 받을 것(학생 게임 3D 모델 등) — 세션이 필요한 카드라 껍데기가 넣는다 */}
      {extra}

      <InstallSteps />

      {videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">사용 안내 영상</h2>
          {/* 한 개여도 2열 격자 — 넓은 화면에서 영상 하나가 가로를 다 채우면 화면을 넘는다 */}
          <div className="grid gap-4 md:grid-cols-2">
            {videos.map((video) => <GuideVideoCard key={video.id} video={video} />)}
          </div>
        </section>
      )}
    </>
  );
}

type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: DownloadProgress }
  | { phase: 'done'; version: string }
  | { phase: 'error'; message: string };

function AppCard({ channel }: { channel: DesktopAppChannel }) {
  const app = DESKTOP_APPS[channel];
  const release = useQuery({
    queryKey: ['desktop-release', channel],
    queryFn: () => fetchLatestRelease(channel),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => count < 2 && (error as DesktopReleaseError).kind === 'network',
  });
  const [state, setState] = useState<DownloadState>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    const manifest = release.data;
    if (!manifest) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({ phase: 'downloading', progress: { received: 0, total: manifest.size, verifying: false } });
    try {
      const bytes = await downloadRelease(channel, manifest, (progress) => setState({ phase: 'downloading', progress }), controller.signal);
      saveFile(bytes, releaseFileName(channel));
      setState({ phase: 'done', version: manifest.version });
    } catch (error) {
      if ((error as DesktopReleaseError).kind === 'aborted') setState({ phase: 'idle' });
      else setState({ phase: 'error', message: (error as Error).message || '내려받지 못했습니다.' });
    } finally {
      abort.current = null;
    }
  };

  const manifest = release.data;
  const published = manifest?.published ? new Date(manifest.published) : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400" />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
          <Monitor className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{app.name}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{app.audience}</span>
            </div>
            <p className="text-xs text-slate-400">{app.englishName} · Windows</p>
          </div>
          <p className="text-sm text-slate-600">{app.summary}</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {app.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t pt-4">
            {release.isLoading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />최신 판을 확인하는 중…</p>}
            {release.error && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-rose-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{(release.error as Error).message}</span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => release.refetch()}>
                  <RefreshCw className="h-3 w-3" />다시 확인
                </Button>
              </div>
            )}
            {manifest && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{manifest.version}판</span>
                <span>· {formatMegabytes(manifest.size)}</span>
                {published && !Number.isNaN(published.getTime()) && (
                  <span>· {published.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 게시</span>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />서명 확인됨</span>
              </p>
            )}

            {state.phase === 'downloading' ? (
              <DownloadingBar progress={state.progress} onCancel={() => abort.current?.abort()} />
            ) : (
              <Button
                className="h-11 w-full gap-2 bg-blue-600 text-sm hover:bg-blue-700 sm:w-auto sm:px-6"
                disabled={!manifest}
                onClick={start}
              >
                <Download className="h-4 w-4" />
                {state.phase === 'done' ? '다시 내려받기' : `${app.name} 내려받기`}
              </Button>
            )}
            {state.phase === 'done' && (
              <p className="text-xs text-emerald-700">
                <b>{releaseFileName(channel)}</b> 를 내려받았습니다({state.version}판). 브라우저의 다운로드 목록이나 «다운로드» 폴더에서 찾을 수 있어요.
              </p>
            )}
            {state.phase === 'error' && (
              <p className="flex items-start gap-1.5 text-xs text-rose-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.message}</p>
            )}
            {channel === 'student' && (
              <p className="text-xs text-slate-400">학교에서 나눠 준 기기에는 이미 깔려 있을 수 있어요 — 시작 메뉴에서 «스페이스기전 학생»을 먼저 찾아보세요.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DownloadingBar({ progress, onCancel }: { progress: DownloadProgress; onCancel: () => void }) {
  const percent = progress.total ? Math.floor((progress.received / progress.total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress.verifying ? '받은 파일을 확인하는 중…' : `내려받는 중 · ${formatMegabytes(progress.received)} / ${formatMegabytes(progress.total)}`}
        </span>
        {!progress.verifying && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-slate-500" onClick={onCancel}>
            <X className="h-3 w-3" />멈추기
          </Button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 바로 해제하면 저장이 시작되기 전에 주소가 사라지는 브라우저가 있다
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const STEPS: { title: string; body: string }[] = [
  {
    title: '둘 자리에 옮겨 두기',
    body: '내려받은 파일을 계속 둘 폴더(예: 바탕 화면)로 먼저 옮기세요. 프로그램은 처음 실행한 그 자리에서 PC 를 켤 때 함께 켜지고 새 판으로 바뀌므로, 실행한 뒤에 옮기면 자동 실행이 끊깁니다.',
  },
  {
    title: '실행하기',
    body: '파일을 두 번 누릅니다. «Windows의 PC 보호» 창이 뜨면 [추가 정보] → [실행]을 누르세요. 학교에서 만든 프로그램이라 Windows 가 아직 모르는 파일로 보는 것입니다.',
  },
  {
    title: '그다음은 알아서',
    body: '새 판이 나오면 프로그램이 스스로 받아 바꿉니다. 이 화면에서 다시 받을 필요가 없어요.',
  },
];

function InstallSteps() {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">설치 방법</h2>
      <ol className="space-y-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{step.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 누르기 전에는 유튜브를 부르지 않는다(학교 회선 · 외부 요청) — 아카데미 프롤로그 영상과 같은 방식. */
function GuideVideoCard({ video }: { video: GuideVideo }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative aspect-video bg-slate-900">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-blue-900 text-white transition hover:from-slate-700"
            onClick={() => setPlaying(true)}
            aria-label={`${video.title} 영상 재생`}
          >
            <PlayCircle className="h-14 w-14 opacity-90" />
            <span className="px-4 text-center text-sm font-medium">{video.title}</span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-slate-500">
        <span className="min-w-0 truncate" title={video.title}>{video.title}</span>
        <a className="shrink-0 text-blue-600 hover:underline" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">
          유튜브에서 보기
        </a>
      </figcaption>
    </figure>
  );
}
