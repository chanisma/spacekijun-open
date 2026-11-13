# Class Assignment Feature

학급 배정 시스템 - 과목 선택 기반 특수반 배정 통합

## Overview

이 기능은 학생들을 여러 학급에 배정하는 시스템으로, 특히 **course-analyze** 기능과 통합하여 학생들의 과목 선택 데이터를 기반으로 특수반(이과반, 문과반, 예체능반 등)을 자동으로 구성할 수 있습니다.

## Features

### 1. Course-Analyze Integration
- **session storage 연동**: course-analyze 페이지에서 업로드한 과목 선택 데이터를 자동으로 불러옵니다
- **자동 매칭**: 학생 코드 기반으로 학생 정보와 과목 선택 데이터를 자동 매칭
- **과목 분석**: 과목별 선택 학생 수 통계 제공

### 2. Special Class Presets
학교 현장에서 자주 사용되는 특수반 프리셋 제공:

- **과학중점반 (이과)**: 물리학, 화학, 생명과학, 지구과학, 과학탐구실험
- **사회중점반 (문과)**: 정치와법, 경제, 사회·문화, 세계지리, 동아시아사, 세계사
- **예체능반**: 미술, 음악, 체육, 연극, 무용

### 3. Assignment Algorithms
- **무작위 배정**: 학생을 무작위로 배정
- **성별 균형 배정**: 각 반의 남녀 비율 균등
- **성적 균형 배정**: 각 반의 성적 분포 균등
- **특수반 배정**: 과목 선택 기반 특수반 구성

### 4. Constraints
- 성별 균형 유지
- 성적 균형 유지
- 친구 그룹 함께 배정
- 특정 학생 분리 배정

## Architecture

```
class-assignment/
├── types/
│   └── class-assignment.types.ts    # Type definitions
├── context/
│   └── ClassAssignmentContext.tsx   # Global state management
├── hooks/
│   ├── index.ts
│   └── useCourseIntegration.ts      # Course-analyze integration hook
├── components/
│   ├── config/
│   │   ├── ConfigPanel.tsx          # Main config panel
│   │   ├── BasicConfigSection.tsx   # Grade, class count
│   │   ├── AlgorithmSelector.tsx    # Algorithm selection
│   │   ├── ConstraintsSection.tsx   # Constraints checkboxes
│   │   ├── SpecialClassSection.tsx  # Special class config
│   │   └── index.ts
│   └── index.ts
├── pages/
│   └── ClassAssignmentPage.tsx      # Main page component
├── index.ts
└── README.md
```

## Usage

### 1. Basic Setup

```tsx
import { ClassAssignmentProvider } from '@/features/class-assignment';
import { ClassAssignmentPage } from '@/features/class-assignment/pages/ClassAssignmentPage';

function App() {
  return (
    <ClassAssignmentProvider>
      <ClassAssignmentPage />
    </ClassAssignmentProvider>
  );
}
```

### 2. Using the Hook

```tsx
import { useCourseIntegration } from '@/features/class-assignment';

function MyComponent() {
  const {
    hasCourseData,
    loadCourseData,
    enrichStudentsWithCourses,
    filterStudentsForSpecialClass,
    specialClassPresets,
  } = useCourseIntegration();

  // Load course data from session storage
  const handleLoad = async () => {
    const data = await loadCourseData();
    if (data) {
      console.log('Loaded course data:', data);
    }
  };

  // Filter students for special class
  const scienceStudents = filterStudentsForSpecialClass(students, {
    classNum: 1,
    name: '과학중점반',
    targetSubjects: ['물리학', '화학', '생명과학'],
    minSubjectCount: 2,
  });
}
```

### 3. Context Usage

```tsx
import { useClassAssignmentContext } from '@/features/class-assignment';

function ConfigComponent() {
  const {
    sourceStudents,
    setSourceStudents,
    config,
    updateConfig,
    assignmentResult,
  } = useClassAssignmentContext();

  // Update configuration
  updateConfig({ grade: 2, classCount: 10 });

  // Set source students
  setSourceStudents(studentList);
}
```

## Data Flow

### Course-Analyze Integration

1. **Upload**: User uploads course selection data in course-analyze page
2. **Storage**: Data stored in session storage with key `'course-analyze-students'`
3. **Load**: Class-assignment feature loads data via `loadCourseData()`
4. **Enrich**: Student data enriched with course selections via `enrichStudentsWithCourses()`
5. **Filter**: Students filtered for special classes via `filterStudentsForSpecialClass()`

### Student Matching

Student matching occurs by comparing:
- Student code (format: "00-00472")
- Class number + student number
- Student ID from course data

```typescript
// Matching logic
const codeParts = student.student_code.split('-');
const studentNumber = codeParts.length > 1 ? codeParts[1] : student.student_code;

const courseStudent = courses.find(cs => {
  const courseCode = `${cs.class}${String(cs.number).padStart(2, '0')}`;
  return courseCode === studentNumber ||
         String(cs.id) === student.student_code ||
         (cs.class === student.class_num && cs.number === student.number);
});
```

## Types

### StudentData
```typescript
interface StudentData {
  student_code: string;      // "00-00472"
  name: string;
  grade: number;
  class_num: number;
  number: number;
  gender?: 'M' | 'F';
  courseSelections?: {
    semester1: string[];
    semester2: string[];
  };
}
```

### SpecialClassConfig
```typescript
interface SpecialClassConfig {
  classNum: number;
  name: string;
  targetSubjects: string[];
  minSubjectCount: number;
}
```

## Integration with Course-Analyze

The feature integrates with the existing **course-analyze** feature:

1. **Session Storage Key**: `'course-analyze-students'`
2. **Data Format**: Array of `CourseAnalyzeStudent` objects
3. **Automatic Loading**: Load button in UI triggers data load
4. **Real-time Updates**: Student data enriched immediately after load

## Future Enhancements

- [ ] Algorithm implementations (currently only UI)
- [ ] Export assignment results to Excel
- [ ] Visualization of class distributions
- [ ] Manual adjustment interface
- [ ] History and undo/redo functionality
- [ ] Integration with database (Supabase)
- [ ] Bulk import from NEIS or other systems

## Dependencies

- React 18+
- TypeScript 5+
- Radix UI components
- Lucide React icons
- Tailwind CSS
- shadcn/ui components

## Notes

- This feature is designed to work independently but integrates seamlessly with course-analyze
- All data is stored in session storage for privacy and security
- No database writes occur without explicit user action
- UI follows the existing Spacekijun design system
