# 공유/횡단 관심사 (RPC · 패턴 · RLS)

데이터베이스 함수(RPC), 핵심 아키텍처 패턴, 행 수준 보안(RLS) 정책 공통 참조.

> 📍 전체 스키마 인덱스: [DATABASE_TABLES.md](../../DATABASE_TABLES.md)

---

## Database Functions (RPC)

### Task Management Functions:
- `get_my_tasks_jsonb()`: Retrieve user's tasks with role-based filtering — 목록 규칙(완료된 업무의 할 일 보존 · 보이는 날 `visibleFrom`, 2026-10-05) = `core.md` §7
- `set_task_assignee_status(task_id, assignee_resource_id, status)`: Atomically update `task.meta.assignees`; callers may update themselves, while parent event managers may update any assignee
- `set_task_deadline_status(task_id, assignee_resource_id, deadline, status)`: 다중 마감(반복) 업무의 **회차별** 완료 기록(`task.meta.deadlineProgress`) 갱신 — 같은 본인/매니저 권한 규칙, 담당자 전체 상태는 "모든 회차 완료 시 completed"로 파생 후 task.status 재계산·`task_status_history` 기록 (SECURITY DEFINER, 2026-07-26)
- `update_assignee_status_jsonb(task_id, user_resource_id, new_status)`: Update individual assignee status
- `add_assignees_jsonb(task_id, resource_ids[])`: Add assignees to task
- `remove_assignees_jsonb(task_id, resource_ids[])`: Remove assignees from task
- `get_task_event_detail(event_id)`: Get event with enriched task data

### Validation Functions:
- `validate_assignees_jsonb(jsonb)`: Validate assignee JSONB structure

## Key Architectural Patterns

### JSONB Usage Guidelines:
1. **Meta Fields**: Used for flexible, feature-specific data storage
2. **Structure Validation**: Some JSONB fields have validation constraints
3. **Feature Isolation**: Different components may use different JSONB properties
4. **Migration Compatibility**: JSONB allows smooth schema evolution

### Resource ID Resolution Pattern:
```sql
-- Standard pattern for getting user's resource ID
SELECT r.id
FROM resource r
JOIN profiles p ON r.name = p.name
WHERE p.id = auth.uid()
```

### Multi-Assignee Task Pattern:
- **Storage**: Use the `task.meta.assignees` JSONB array with status tracking
- **Counting**: `jsonb_array_length(task.meta->'assignees')` for assignee count
- **Status Updates**: Use RPC functions for atomic updates
- **Permission Checks**: Resolve the caller through `auth.uid()` and `user_resource` (or the roster-import student identity fallback), then compare against `event.meta.managers` and the retained `event.manager_id`

## Row Level Security (RLS) Configuration

### RLS-Enabled Tables:
**User and Content Tables** (RLS: Yes):
- `profiles`: Users can only access their own profile data
- `resource`: Access based on user-resource associations
- `section`: Access controlled by teaching assignments
- `meeting`: Access based on section membership and creator permissions
- `event`: Access controlled by manager permissions and participant roles
- `task`: Access based on assignee status and event management roles
- `documents`: Document owners and shared users only
- `notification_events`: Users can only see their own notifications
- `user_stats`, `tasks`, `user_goals`: User-specific data access
- `problems`, `problem_solutions`: Content visibility based on ownership and sharing
- `user_*` tables: All user-specific preference and activity tables
- `projects`, `project_*`: Project-based access control
- `continents`, `hex_goals`: User-specific goal management
- `achievements`, `user_achievements`: Achievement system access control
- `training_signatures`: Signature access based on meeting participation
- `attendance_records`: Access based on teacher-student relationships
- `timetable_activities`: Access controlled by creator and section permissions
- `message_*` tables: Message thread participation-based access
- `document_shares`: Sharing permission management
- `system_settings`: Admin-only access for system configuration

### RLS-Disabled Tables:
**System and Audit Tables** (RLS: No):
- `task_status_history`: Audit trail - no user restrictions needed
- `schema_migration_tracking`: System maintenance table
- `backup_*` tables: Backup data storage - system level access
- `user_roles`: Role management handled at application level

### RLS Policy Patterns:

#### User Data Access Pattern:
```sql
-- Users can only access their own data
CREATE POLICY "Users can view own data" ON profiles
FOR SELECT USING (auth.uid() = id);
```

#### Resource-Based Access Pattern:
```sql
-- Access based on user-resource associations
CREATE POLICY "Resource access via user_resource" ON resource
FOR SELECT USING (
  id IN (
    SELECT resource_id
    FROM user_resource
    WHERE user_id = auth.uid()
  )
);
```

#### Role-Based Access Pattern:
```sql
-- Admin users have full access
CREATE POLICY "Admin full access" ON system_settings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);
```

#### Manager/Participant Access Pattern:
```sql
-- Event managers and participants can access tasks
CREATE POLICY "Task access for assignees and managers" ON task
FOR SELECT USING (
  -- User is event manager
  event_id IN (
    SELECT e.id FROM event e
    JOIN user_resource ur ON e.manager_id = ur.resource_id
    WHERE ur.user_id = auth.uid()
  )
  OR
  -- User is assigned to task
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(assignees_jsonb) AS assignee
    WHERE (assignee->>'id')::uuid IN (
      SELECT resource_id FROM user_resource WHERE user_id = auth.uid()
    )
  )
);
```

### Security Implementation Notes:
- **Authentication Required**: All RLS policies assume authenticated users (auth.uid())
- **Resource ID Resolution**: Many policies use the user_resource junction table
- **Hierarchical Access**: Teachers can access student data in their sections
- **Audit Trail Protection**: Status history tables maintain integrity without user restrictions
- **System Table Security**: Backup and migration tables rely on database-level permissions
- **Performance Considerations**: Complex RLS policies may impact query performance

This documentation reflects the current database schema and should be updated when structural changes occur. Always verify current table structures using database introspection tools when implementing new features.
