import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EducationalVideo } from '../hooks/useEducationalVideos';
import { VIDEO_CATEGORY_OPTIONS } from '../utils/categories';

interface EditVideoDialogProps {
  video: EducationalVideo | null;
  onEdit: (id: string, title: string, url: string, category: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CATEGORIES = VIDEO_CATEGORY_OPTIONS;
const DEFAULT_CATEGORY = CATEGORIES[0];

export function EditVideoDialog({ video, onEdit, open, onOpenChange }: EditVideoDialogProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);

  useEffect(() => {
    if (video && open) {
      setTitle(video.title);
      setUrl(video.url);
      setCategory(video.category);
    }
  }, [video, open]);

  useEffect(() => {
    if (!open) {
      setUrl('');
      setTitle('');
      setCategory(DEFAULT_CATEGORY);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (video && url.trim() && title.trim()) {
      onEdit(video.id, title.trim(), url.trim(), category);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">동영상 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-muted-foreground">
              제목
            </Label>
            <Input
              id="edit-title"
              type="text"
              placeholder="동영상 제목을 입력하세요..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category" className="text-sm font-medium text-muted-foreground">
              카테고리
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-url" className="text-sm font-medium text-muted-foreground">
              YouTube URL
            </Label>
            <Input
              id="edit-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-background"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={!url.trim() || !title.trim()}>
            수정 완료
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
