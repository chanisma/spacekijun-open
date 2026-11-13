import { format } from "date-fns";

// Helper function to format dates
export const formatDate = (date?: string | null) => {
  if (!date) return "-";

  const dateObj = new Date(date);

  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return "-";
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateObj.toDateString() === now.toDateString()) {
    return "Today";
  } else if (dateObj.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return format(dateObj, "MMM d, yyyy");
  }
};

// Helper function to translate upload source
export const getUploadSourceText = (source?: string): string => {
  switch (source) {
    case 'document_upload':
    case 'manual_upload':
      return '서류함';
    case 'task_system':
    case 'task_management':
      return '업무 시스템';
    case 'event_system':
      return '이벤트 시스템';
    case 'meeting_management':
      return '스케줄';
    case 'google_drive':
    case 'google_drive_integration':
      return '서류함';
    case 'collab_note':
      return '협업 보드';
    default:
      return '서류함';
  }
};

// Helper function to get file type from MIME type
export const getFileType = (mimeType: string, fileName: string): string => {
  if (!fileName) fileName = '';
  if (!mimeType) mimeType = '';

  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('image')) return 'image';
  if (mimeType.includes('text') || fileName.endsWith('.txt')) return 'document';
  if (mimeType.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return 'document';
  if (fileName.endsWith('.hwp') || fileName.endsWith('.hwpx')) return 'document';
  if (mimeType.includes('sheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return 'document';
  if (mimeType.includes('javascript') || mimeType.includes('typescript') || fileName.endsWith('.js') || fileName.endsWith('.ts')) return 'code';
  return 'other';
};

// Helper function to format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};
