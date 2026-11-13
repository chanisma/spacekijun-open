import { Button } from '@/components/ui/button';
import { Layers, Play, Newspaper } from 'lucide-react';

export type FeedType = 'all' | 'video' | 'news';

type Props = {
  active: FeedType;
  onChange: (type: FeedType) => void;
  videoCount: number;
  newsCount: number;
  iconOnly?: boolean;
};

type Option = { value: FeedType; label: string; Icon: typeof Layers };

const OPTIONS: Option[] = [
  { value: 'all', label: '전체', Icon: Layers },
  { value: 'video', label: '동영상', Icon: Play },
  { value: 'news', label: '뉴스', Icon: Newspaper },
];

export function TypeFilterChips({ active, onChange, videoCount, newsCount, iconOnly }: Props) {
  const countFor = (type: FeedType) => {
    if (type === 'video') return videoCount;
    if (type === 'news') return newsCount;
    return videoCount + newsCount;
  };

  if (iconOnly) {
    return (
      <div className="flex items-center gap-1">
        {OPTIONS.map(opt => {
          const isActive = active === opt.value;
          return (
            <Button
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              size="icon"
              onClick={() => onChange(opt.value)}
              className="h-8 w-8 rounded-full"
              title={opt.label}
              aria-label={opt.label}
            >
              <opt.Icon className="h-3.5 w-3.5" />
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(opt => (
        <Button
          key={opt.value}
          variant={active === opt.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(opt.value)}
          className="h-7 rounded-full px-3 text-xs"
        >
          {opt.label} ({countFor(opt.value)})
        </Button>
      ))}
    </div>
  );
}
