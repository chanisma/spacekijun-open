# Google Drive Picker Component

범용적으로 사용 가능한 Google Drive 파일 선택 및 업로드 컴포넌트입니다.

## 특징

- ✅ **두 가지 모드**: Auto (자동 등록) / Manual (수동 처리)
- ✅ **세 가지 기능**: 새 파일 생성 / 파일 업로드 / 기존 파일 선택
- ✅ **장기간 인증**: 한 번 로그인하면 자동으로 토큰 갱신
- ✅ **타입 안전**: TypeScript 완전 지원
- ✅ **재사용 가능**: 문서, 업무, 일정, 이벤트 등 어디서나 사용 가능

## 기본 사용법

### Auto 모드 (자동 등록)

파일을 선택하면 자동으로 데이터베이스에 등록됩니다.

```tsx
import { GoogleDrivePicker } from '@/components/ui/google-drive';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        Google Drive
      </Button>

      <GoogleDrivePicker
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        targetType="document"  // 'document' | 'task' | 'task_event' | 'meeting'
        targetId=""             // Optional: specific target ID
        department="기획팀"      // Optional: department
        onFileAdded={() => {
          // 파일이 등록되면 호출됨
          console.log('File registered!');
          refreshDocumentList();
        }}
      />
    </>
  );
}
```

### Manual 모드 (수동 처리)

파일 정보만 받아서 직접 처리합니다.

```tsx
import { GoogleDrivePicker, GoogleDriveFileInfo } from '@/components/ui/google-drive';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  const handleFileSelected = async (file: GoogleDriveFileInfo) => {
    console.log('Selected file:', file);

    // 파일 정보로 원하는 작업 수행
    await myCustomLogic({
      name: file.name,
      url: file.webViewLink,
      mimeType: file.mimeType,
      size: file.size
    });
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        Google Drive
      </Button>

      <GoogleDrivePicker
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        mode="manual"
        onFileSelected={handleFileSelected}
      />
    </>
  );
}
```

## 사용 예제

### 1. Documents 페이지 (Auto 모드)

```tsx
// src/pages/Documents.tsx
import { GoogleDrivePicker } from '@/components/ui/google-drive';

<GoogleDrivePicker
  isOpen={showGoogleDriveDialog}
  onOpenChange={setShowGoogleDriveDialog}
  targetType="document"
  onFileAdded={handleRefresh}
/>
```

### 2. Task 파일 첨부 (Manual 모드)

```tsx
// src/components/tasks/TaskEditDialog.tsx
import { GoogleDrivePicker, GoogleDriveFileInfo } from '@/components/ui/google-drive';

const handleGoogleDriveFile = async (file: GoogleDriveFileInfo) => {
  // Task 파일로 등록
  await TaskFileService.attachGoogleDriveFile(taskId, {
    name: file.name,
    url: file.webViewLink,
    type: file.mimeType
  });

  toast({
    title: '성공',
    description: `${file.name} 파일이 추가되었습니다.`
  });
};

<GoogleDrivePicker
  isOpen={showGoogleDrive}
  onOpenChange={setShowGoogleDrive}
  mode="manual"
  onFileSelected={handleGoogleDriveFile}
  title="업무에 파일 첨부"
  description="Google Drive에서 파일을 선택하여 업무에 첨부합니다."
/>
```

### 3. Meeting 자료 첨부 (Auto 모드)

```tsx
// src/components/schedule/ScheduleEditDialog.tsx
import { GoogleDrivePicker } from '@/components/ui/google-drive';

<GoogleDrivePicker
  isOpen={showGoogleDrive}
  onOpenChange={setShowGoogleDrive}
  targetType="meeting"
  targetId={meeting.id}
  department={meeting.department}
  onFileAdded={() => {
    loadMeetingFiles();
    toast({ title: '파일이 첨부되었습니다.' });
  }}
/>
```

## Props

### GoogleDrivePickerProps

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isOpen` | `boolean` | ✅ | - | 다이얼로그 열림 상태 |
| `onOpenChange` | `(open: boolean) => void` | ✅ | - | 다이얼로그 상태 변경 콜백 |
| `mode` | `'auto' \| 'manual'` | ❌ | `'auto'` | 동작 모드 |
| `targetType` | `'document' \| 'task' \| 'task_event' \| 'meeting'` | ❌ | `'document'` | 대상 타입 (auto 모드) |
| `targetId` | `string` | ❌ | `''` | 대상 ID (auto 모드) |
| `department` | `string` | ❌ | - | 부서 정보 (auto 모드) |
| `onFileAdded` | `() => void` | ❌ | - | 파일 등록 완료 콜백 (auto 모드) |
| `onFileSelected` | `(file: GoogleDriveFileInfo) => void \| Promise<void>` | ❌ | - | 파일 선택 콜백 (manual 모드) |
| `title` | `string` | ❌ | `'Google Drive 연동'` | 다이얼로그 제목 |
| `description` | `string` | ❌ | - | 다이얼로그 설명 |

### GoogleDriveFileInfo

```typescript
interface GoogleDriveFileInfo {
  id: string;              // Google Drive file ID
  name: string;            // 파일명
  mimeType: string;        // MIME 타입
  webViewLink: string;     // 파일 링크
  webContentLink?: string; // 다운로드 링크
  size?: number;           // 파일 크기 (bytes)
  modifiedTime: string;    // 수정 시간
  url?: string;            // 접근 URL
  type?: string;           // 타입 식별자
}
```

## 모드 비교

| 기능 | Auto 모드 | Manual 모드 |
|-----|----------|------------|
| 파일 생성 | ✅ 자동 등록 | ✅ 정보만 반환 |
| 파일 업로드 | ✅ 자동 등록 | ✅ 정보만 반환 |
| 파일 선택 | ✅ 자동 등록 | ✅ 정보만 반환 |
| 데이터베이스 저장 | ✅ 자동 | ❌ 수동 구현 필요 |
| 유연성 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 인증

- 한 번 로그인하면 브라우저에 암호화되어 저장
- 토큰 자동 갱신 (만료 10분 전)
- 페이지 새로고침해도 로그인 유지
- 연결 해제 버튼으로 로그아웃 가능

## 파일 저장 위치

모든 파일은 Google Drive의 **"Spacekijun"** 폴더에 자동으로 저장됩니다.

## 지원 파일 타입

### 생성 가능한 파일
- Google 문서 (Docs)
- Google 스프레드시트 (Sheets)
- Google 프레젠테이션 (Slides)

### 업로드 가능한 파일
- PDF (.pdf)
- 문서 (.doc, .docx)
- 스프레드시트 (.xls, .xlsx)
- 프레젠테이션 (.ppt, .pptx)
- 텍스트 (.txt)
- 이미지 (.png, .jpg, .jpeg)

## 마이그레이션 가이드

기존 `GoogleDriveUpload` 사용자를 위한 마이그레이션:

```tsx
// Before (기존 코드)
import { GoogleDriveUpload } from '@/components/documents/GoogleDriveUpload';

<GoogleDriveUpload
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  targetType="document"
  onFileAdded={handleRefresh}
/>

// After (권장)
import { GoogleDrivePicker } from '@/components/ui/google-drive';

<GoogleDrivePicker
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  mode="auto"
  targetType="document"
  onFileAdded={handleRefresh}
/>
```

기존 `GoogleDriveUpload` 컴포넌트는 하위 호환성을 위해 유지되지만, 새로운 코드에서는 `GoogleDrivePicker`를 직접 사용하는 것을 권장합니다.
