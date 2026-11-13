import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VIDEO_CATEGORY_OPTIONS } from '../utils/categories';

interface AddVideoDialogProps {
  onAdd: (title: string, url: string, category: string) => void;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CATEGORIES = VIDEO_CATEGORY_OPTIONS;
const DEFAULT_CATEGORY = CATEGORIES[0];

export function AddVideoDialog({
  onAdd,
  children,
  open: externalOpen,
  onOpenChange,
}: AddVideoDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);

  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    if (!open) {
      setUrl('');
      setTitle('');
      setCategory(DEFAULT_CATEGORY);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && title.trim()) {
      onAdd(title.trim(), url.trim(), category);
      setUrl('');
      setTitle('');
      setCategory(DEFAULT_CATEGORY);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-light">새 동영상 추가</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-muted-foreground">
              제목
            </Label>
            <Input
              id="title"
              type="text"
              placeholder="동영상 제목을 입력하세요..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="text-sm font-medium text-muted-foreground">
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
            <Label htmlFor="url" className="text-sm font-medium text-muted-foreground">
              YouTube URL
            </Label>
            <Input
              id="url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-background"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={!url.trim() || !title.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            동영상 추가
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
