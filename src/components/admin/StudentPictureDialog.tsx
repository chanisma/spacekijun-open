import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface StudentPictureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pictureUrl: string;
  studentName: string;
}

export const StudentPictureDialog = ({ open, onOpenChange, pictureUrl, studentName }: StudentPictureDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{studentName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center">
          <div className="w-full flex justify-center">
            <img
              src={pictureUrl}
              alt={`${studentName} 사진`}
              className="max-w-full h-auto rounded-lg shadow-lg"
              onError={(e) => {
                e.currentTarget.src = '/placeholder-avatar.png';
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
