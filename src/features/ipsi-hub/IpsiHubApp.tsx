import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  useEducationalVideos,
  type EducationalVideo,
} from './hooks/useEducationalVideos';
import { IpsiHubFeed } from './components/IpsiHubFeed';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { AddVideoDialog } from './components/AddVideoDialog';
import { EditVideoDialog } from './components/EditVideoDialog';
import { AiAnalysisPanel } from './components/ai/AiAnalysisPanel';
import type { VideoFeedItem } from './types/feed';
import type { AnalysisAudience } from './types/aiAnalysis';

export function IpsiHubApp() {
  // `effectiveRole`은 admin의 역할 미리보기를 반영한다 — `profile.role`을 직접 비교하면
  // 학생 시점으로 보는 중에도 교사 화면이 그대로 비친다(CLAUDE.md "Role-based UI").
  const { effectiveRole } = useAuth();
  const isFaculty = effectiveRole === 'teacher' || effectiveRole === 'admin';

  /** 동영상 추가는 교직원만 — 피드는 큐레이션된 자료이고 RLS도 교사·admin만 INSERT를 허용한다. */
  const canAdd = isFaculty;
  /**
   * AI 분석은 **학생도 쓴다** (2026-09-11 사용자 결정).
   *
   * 이 화면에 도달할 수 있는 역할이 곧 분석할 수 있는 역할이다
   * (`/ipsi` = `['student','teacher','admin']`, 직원은 `STAFF_BLOCKED_PREFIXES`가 막는다).
   * 자료 자체가 전원 열람이므로 분석만 교사 전용일 이유가 없었다.
   */
  const canAnalyze = isFaculty || effectiveRole === 'student';
  const analysisAudience: AnalysisAudience = isFaculty ? 'teacher' : 'student';

  const { getVideoById, addVideo, updateVideo, deleteVideo, toggleLike } =
    useEducationalVideos();

  const [playingVideo, setPlayingVideo] = useState<EducationalVideo | null>(null);
  const [editingVideo, setEditingVideo] = useState<EducationalVideo | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);

  // 서버 페이지네이션 도입으로 전체 videos 배열을 더 이상 메모리에 두지 않는다.
  // 재생/수정 모달은 DB raw 형태(EducationalVideo)가 필요하므로 단건 조회로 가져온다.
  const handlePlayVideo = async (item: VideoFeedItem) => {
    setPlayingVideo(await getVideoById(item.id));
  };

  const handleEditVideo = async (item: VideoFeedItem) => {
    setEditingVideo(await getVideoById(item.id));
  };

  const handleAddVideo = async (title: string, url: string, category: string) => {
    await addVideo(title, url, category);
    setShowAddDialog(false);
  };

  const handleUpdateVideo = async (
    id: string,
    title: string,
    url: string,
    category: string
  ) => {
    await updateVideo(id, title, url, category);
    setEditingVideo(null);
  };

  const handleDeleteVideo = async (id: string) => {
    if (window.confirm('이 동영상을 삭제하시겠습니까?')) {
      const ok = await deleteVideo(id);
      if (ok && playingVideo?.id === id) setPlayingVideo(null);
    }
  };

  return (
    <>
      <IpsiHubFeed
        canAdd={canAdd}
        canAnalyze={canAnalyze}
        onAddVideo={() => setShowAddDialog(true)}
        onOpenAnalysis={() => setShowAnalysisPanel(true)}
        onPlayVideo={handlePlayVideo}
        onEditVideo={handleEditVideo}
        onDeleteVideo={handleDeleteVideo}
        onToggleLike={toggleLike}
      />

      <VideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />

      <AddVideoDialog
        onAdd={handleAddVideo}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      <EditVideoDialog
        video={editingVideo}
        onEdit={handleUpdateVideo}
        open={!!editingVideo}
        onOpenChange={(open) => !open && setEditingVideo(null)}
      />

      <AiAnalysisPanel
        open={showAnalysisPanel}
        onClose={() => setShowAnalysisPanel(false)}
        audience={analysisAudience}
      />
    </>
  );
}
