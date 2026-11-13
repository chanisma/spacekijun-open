import type { FeedItem, VideoFeedItem } from '../types/feed';
import { VideoCard } from './VideoCard';
import { NewsCard } from './NewsCard';

type Props = {
  item: FeedItem;
  canAdd: boolean;
  onPlay: (item: VideoFeedItem) => void;
  onEdit: (item: VideoFeedItem) => void;
  onDelete: (id: string) => void;
  onToggleLike: (id: string, isLikedByUser: boolean) => void;
};

export function FeedCard({ item, canAdd, onPlay, onEdit, onDelete, onToggleLike }: Props) {
  if (item.kind === 'video') {
    return (
      <VideoCard
        item={item}
        canAdd={canAdd}
        onPlay={onPlay}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleLike={onToggleLike}
      />
    );
  }
  return <NewsCard item={item} />;
}
