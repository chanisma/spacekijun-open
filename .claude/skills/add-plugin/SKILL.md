---
name: add-plugin
description: >
  Spacekijun 프로젝트에 새 플러그인을 추가할 때 사용합니다. "플러그인 추가", "새 플러그인",
  "플러그인 만들어줘", "plugin 만들기" 등의 요청에 반드시 이 스킬을 사용하세요.
  체크리스트, 표, 투표, 랜덤뽑기 같은 플러그인 시스템에 새 기능을 추가하는 모든 작업에 적용됩니다.
---

# Spacekijun 플러그인 추가 가이드

플러그인은 회의(meeting), 노트(collab note) 등 엔티티에 붙는 모듈형 기능입니다.
새 플러그인을 추가하려면 아래 **4단계**를 순서대로 완료해야 합니다.

---

## 1단계: 타입 정의 (`src/types/plugin.ts`)

파일 끝에 플러그인 전용 타입을 추가합니다.

```typescript
// [플러그인명] Plugin specific types
export interface [Name]Data {
  title: string;
  // ... 데이터 필드
  settings?: {
    somePermission?: 'creator_only' | 'all';
  };
}
```

**권한 설정 패턴** (선택사항, 필요 시 포함):
- `'creator_only'` | `'all'` 두 가지 값만 사용
- settings 키 이름은 `[action]Permission` 형식 (예: `addPermission`, `editPermission`)

---

## 2단계: 컴포넌트 작성 (`src/components/plugins/[Name]Plugin.tsx`)

### 필수 구조

```typescript
import React, { useState, useEffect } from 'react';
import { PluginComponentProps, [Name]Data } from '@/types/plugin';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

export const [Name]Plugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const { user } = useAuth();
  const [[name]Data, set[Name]Data] = useState<[Name]Data>({ title: '', /* ... */ });

  // instance.data → 로컬 상태 동기화 (반드시 필요)
  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const d = instance.data as Partial<[Name]Data>;
      set[Name]Data({
        title: d.title || '',
        // ... 필드 초기화
        settings: d.settings || {},
      });
    }
  }, [instance.data]);

  // 권한 계산
  const isCreator = instance.created_by === user?.id;
  const canEdit = !readonly && ([name]Data.settings?.editPermission === 'creator_only' ? isCreator : true);
  // 편집 버튼(구조 변경)은 항상 isCreator 만 — canXxx 권한과 구분

  // 데이터 업데이트 → onUpdate 호출로 DB 저장
  const updateData = (next: [Name]Data) => {
    set[Name]Data(next);
    if (onUpdate) onUpdate(next);
  };

  // ... 렌더링 로직
};
```

### 주요 패턴 (기존 플러그인 참고)

| 패턴 | 파일 |
|---|---|
| 권한 설정 + 인라인 추가 | `ChecklistPlugin.tsx` |
| 크게 보기 Dialog + 키보드 셀 네비게이션 | `TablePlugin.tsx` |
| 투표/집계 | `PollPlugin.tsx` |
| 랜덤 선택 + 애니메이션 | `RandomPickerPlugin.tsx` |

### 3가지 화면 상태

1. **편집 모드** (`isEditMode && !readonly`): 구조/설정 변경 — 생성자(`isCreator`)만
2. **초기 상태** (데이터 없음): "만들기" 버튼 표시
3. **뷰 모드**: 실제 플러그인 UI

### 권한 버튼 규칙

- **편집(구조) 버튼**: `{isCreator && !readonly && <Button onClick={openEdit}>편집</Button>}`
- **행동 버튼** (추가·수정 등): `{canAdd && <Button>...</Button>}` — `canAdd`는 settings 기반
- **전체 초기화**: `{isCreator && !readonly && ...}` — 항상 생성자만

---

## 3단계: PluginRenderer에 등록 (`src/components/plugins/PluginRenderer.tsx`)

```typescript
import { [Name]Plugin } from './[Name]Plugin';

const pluginComponents: Record<string, React.FC<PluginComponentProps>> = {
  // 기존 항목들...
  [type_string]: [Name]Plugin,  // type_string은 DB의 type 컬럼과 일치해야 함
};
```

---

## 4단계: Supabase DB 등록

Supabase MCP로 `plugins` 테이블에 레코드를 삽입합니다.

```sql
INSERT INTO plugins (name, type, description, icon, config, permissions, is_active)
VALUES (
  '플러그인 표시명',          -- 예: '타이머'
  'type_string',             -- 예: 'timer' (3단계와 일치)
  '플러그인 설명',
  '',                        -- 아이콘 (현재 미사용, 빈 문자열)
  '{}',                      -- 기본 config JSONB
  '{"roles": []}',           -- 권한 (빈 배열 = 모두 사용 가능)
  true
);
```

**기존 type 값**: `poll`, `student_display`, `random_picker`, `checklist`, `table`

---

## RLS 정책 참고

`plugin_instances` 테이블의 UPDATE 정책은 **모든 인증 사용자**가 업데이트 가능합니다.
(플러그인 내부 권한 시스템이 React 레이어에서 처리)

INSERT/DELETE는 생성자만 가능합니다.

---

## 체크리스트

- [ ] `src/types/plugin.ts`에 타입 추가
- [ ] `src/components/plugins/[Name]Plugin.tsx` 컴포넌트 생성
- [ ] `src/components/plugins/PluginRenderer.tsx`에 import + 매핑 추가
- [ ] Supabase `plugins` 테이블에 레코드 삽입 (MCP 사용)
- [ ] `npm run build` 빌드 성공 확인
