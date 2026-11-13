# 지식 그래프 테이블

학생별 지식그래프 버전 관리, 엔티티, 관계 테이블.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## Knowledge Graph Tables

### student_kg_versions
**Purpose**: 학생별 지식그래프 JSON 버전 관리
**Primary Key**: id (UUID)
**Records**: 17

#### Columns:
- `id` (UUID): Primary key
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `version` (INT): 버전 번호 (NOT NULL, default: 1)
- `kg_json` (JSONB): 지식그래프 전체 JSON (NOT NULL)
- `source_categories` (TEXT[]): 소스 카테고리 목록 (default: '{}')
- `created_by` (UUID): 생성자
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `kg_json` 저장 시 트리거로 `student_kg_entities`, `student_kg_relations` 자동 생성
- `/text-knowledge-graph extract`로 생성된 JSON을 `/kg-save`로 저장

### student_kg_entities
**Purpose**: 지식그래프 엔티티 (트리거로 kg_json에서 자동 추출)
**Primary Key**: id (UUID)
**Records**: 1,300

#### Columns:
- `id` (UUID): Primary key
- `kg_version_id` (UUID): FK → student_kg_versions.id (NOT NULL)
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `entity_id` (TEXT): 엔티티 식별자 (NOT NULL)
- `label` (TEXT): 엔티티 라벨 (NOT NULL)
- `type` (TEXT): 엔티티 유형 (역량, 활동, 관심분야, 태도 등)
- `properties` (JSONB): 추가 속성 (default: '{}')
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `student_kg_versions` INSERT 트리거로 자동 생성됨. 직접 INSERT 불필요
- `/cohort-knowledge-graph` 스킬에서 코호트 간 공유 엔티티 분석에 사용

### student_kg_relations
**Purpose**: 지식그래프 관계 (트리거로 kg_json에서 자동 추출)
**Primary Key**: id (UUID)
**Records**: 2,190

#### Columns:
- `id` (UUID): Primary key
- `kg_version_id` (UUID): FK → student_kg_versions.id (NOT NULL)
- `student_id` (TEXT): 학생 코드 (NOT NULL)
- `source_entity_id` (TEXT): 출발 엔티티 ID (NOT NULL)
- `target_entity_id` (TEXT): 도착 엔티티 ID (NOT NULL)
- `relation_type` (TEXT): 관계 유형 (NOT NULL)
- `properties` (JSONB): 추가 속성 (default: '{}')
- `created_at` (TIMESTAMPTZ): 생성 일시

#### Usage Notes:
- `student_kg_versions` INSERT 트리거로 자동 생성됨. 직접 INSERT 불필요
- `source_entity_id`, `target_entity_id`는 `student_kg_entities.entity_id`와 매핑
