# EnhancedFileList Component

재사용 가능한 파일 리스트 UI 컴포넌트입니다. 다양한 옵션을 통해 기능을 자유롭게 커스터마이징할 수 있습니다.

## 설치

```typescript
import { EnhancedFileList } from '@/components/ui/file-list';
```

## Props

### 필수 Props

- `documents: Document[]` - 표시할 문서 배열
- `onDownload: (doc: Document) => void | Promise<void>` - 다운로드 핸들러
- `onDelete: (id: string) => void | Promise<void>` - 삭제 핸들러
- `onUpdate: (id: string, data: Partial<Document>) => void | Promise<void>` - 업데이트 핸들러

### 선택적 Props

#### 데이터
- `sharedDocuments?: Document[]` - 공유 문서 배열
- `loading?: boolean` - 로딩 상태

#### 액션 핸들러
- `onPreview?: (doc: Document) => void` - 커스텀 프리뷰 핸들러

#### UI 옵션
- `showSharedDocuments?: boolean` (기본값: `true`) - 공유 문서 표시 여부
- `enableBulkActions?: boolean` (기본값: `true`) - 대량 작업 활성화
- `enableSearch?: boolean` (기본값: `true`) - 검색 기능 활성화
- `enableViewModeToggle?: boolean` (기본값: `true`) - 뷰 모드 토글 활성화
- `defaultViewMode?: "list" | "grid"` (기본값: `"list"`) - 기본 뷰 모드
- `currentPath?: string[]` (기본값: `["Home"]`) - 브레드크럼 경로

#### 세밀한 기능 제어
- `enableRename?: boolean` (기본값: `true`) - 이름 변경 활성화
- `enableDelete?: boolean` (기본값: `true`) - 삭제 활성화
- `enableDownload?: boolean` (기본값: `true`) - 다운로드 활성화
- `enablePreview?: boolean` (기본값: `true`) - 프리뷰 활성화
- `showBreadcrumb?: boolean` (기본값: `true`) - 경로 표시 활성화
- `showBadges?: boolean` (기본값: `true`) - 배지 표시 활성화
- `compactMode?: boolean` (기본값: `false`) - 컴팩트 모드
- `maxHeight?: string` - 최대 높이 제한 (예: `"500px"`, `"80vh"`)
- `emptyStateMessage?: string` - 빈 상태 메시지 커스터마이징

## 사용 예시

### 1. 전체 기능 (기본)

```typescript
<EnhancedFileList
  documents={documents}
  sharedDocuments={sharedDocuments}
  loading={loading}
  onDownload={handleDownload}
  onDelete={handleDelete}
  onUpdate={handleUpdate}
  onPreview={handlePreview}
/>
```

### 2. 읽기 전용 파일 뷰어

다운로드만 가능하고 수정/삭제는 불가능한 뷰어:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={handleDownload}
  onDelete={async () => {}} // 빈 함수
  onUpdate={async () => {}} // 빈 함수
  enableRename={false}
  enableDelete={false}
  enableBulkActions={false}
/>
```

### 3. 심플 파일 선택기

검색과 프리뷰만 가능:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={async () => {}}
  onDelete={async () => {}}
  onUpdate={async () => {}}
  onPreview={handleSelect}
  enableDownload={false}
  enableRename={false}
  enableDelete={false}
  enableBulkActions={false}
  enableSearch={true}
  enableViewModeToggle={false}
  defaultViewMode="grid"
  showBadges={false}
  emptyStateMessage="선택할 파일이 없습니다."
/>
```

### 4. 컴팩트 파일 리스트

제한된 공간에 표시:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={handleDownload}
  onDelete={handleDelete}
  onUpdate={handleUpdate}
  compactMode={true}
  maxHeight="400px"
  showBreadcrumb={false}
  enableViewModeToggle={false}
  defaultViewMode="list"
/>
```

### 5. 모바일 친화적 그리드

모바일에 최적화된 그리드 뷰:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={handleDownload}
  onDelete={handleDelete}
  onUpdate={handleUpdate}
  defaultViewMode="grid"
  enableViewModeToggle={false}
  showBreadcrumb={false}
  compactMode={true}
/>
```

### 6. 프리뷰 전용

프리뷰와 검색만:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={async () => {}}
  onDelete={async () => {}}
  onUpdate={async () => {}}
  onPreview={handlePreview}
  enableDownload={false}
  enableRename={false}
  enableDelete={false}
  enableBulkActions={false}
  showBadges={false}
/>
```

### 7. 다운로드 센터

다운로드와 검색만:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={handleDownload}
  onDelete={async () => {}}
  onUpdate={async () => {}}
  enableRename={false}
  enableDelete={false}
  enablePreview={false}
  enableBulkActions={true}
  showBadges={true}
  emptyStateMessage="다운로드할 파일이 없습니다."
/>
```

### 8. 미니멀 리스트

최소한의 UI:

```typescript
<EnhancedFileList
  documents={documents}
  loading={loading}
  onDownload={handleDownload}
  onDelete={async () => {}}
  onUpdate={async () => {}}
  onPreview={handlePreview}
  enableBulkActions={false}
  enableSearch={false}
  enableViewModeToggle={false}
  showBreadcrumb={false}
  showBadges={false}
  compactMode={true}
  maxHeight="300px"
  defaultViewMode="list"
/>
```

## 주요 기능

### 뷰 모드
- **리스트 뷰**: 테이블 형식으로 상세 정보 표시
- **그리드 뷰**: 카드 형식으로 시각적 표시

### 파일 작업
- 프리뷰 (이미지, PDF 지원)
- 다운로드
- 이름 변경
- 삭제
- 대량 작업 (여러 파일 선택)

### 검색 및 필터링
- 실시간 검색
- 파일명, 제목, 부서, 카테고리로 검색

### 배지 시스템
- 부서 표시
- 카테고리 표시
- 업로드 소스 표시
- 공유 상태 표시
- 연결된 작업/이벤트 표시

### 컴팩트 모드
- 작은 아이콘 및 패딩
- 제한된 공간에 최적화
- 모바일 친화적

## 커스터마이징

### 빈 상태 메시지

```typescript
<EnhancedFileList
  // ... other props
  emptyStateMessage="아직 업로드된 파일이 없습니다. 파일을 업로드하세요."
/>
```

### 높이 제한

```typescript
<EnhancedFileList
  // ... other props
  maxHeight="600px" // 또는 "80vh"
/>
```

### 커스텀 프리뷰

기본 프리뷰 대신 커스텀 핸들러 사용:

```typescript
const handleCustomPreview = (doc: Document) => {
  // 커스텀 프리뷰 로직
  openInExternalViewer(doc);
};

<EnhancedFileList
  // ... other props
  onPreview={handleCustomPreview}
/>
```

## 접근성

- 키보드 네비게이션 지원
- 스크린 리더 레이블
- ARIA 속성 적용

## 반응형 디자인

- 모바일: 세로 정렬, 간소화된 UI
- 태블릿: 적응형 레이아웃
- 데스크톱: 전체 기능 지원
