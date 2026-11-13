import React, { useState, useEffect, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useResourceTags } from '@/hooks/useResourceTags';
import { useEvalogTagPermissions } from '../../hooks/useEvalogTagPermissions';
import { PERMISSION_GROUPS, PERMISSION_LABELS, EVALOG_PERMISSION_KEYS, type EvalogPermissionKey } from '../../types/permissions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { Loader2, Info, Shield, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const GRADES = [1, 2, 3] as const;

/** 학년 관련 태그인지 판별 (예: "2학년 3반", "1학년 담임", "1학년") — 매트릭스에서 제외 */
const isGradeClassTag = (name: string) => /\d+학년/.test(name);

/** "X학년 Y반" 정확히 매칭되는 태그인지 판별 — 일괄 권한 체크박스 대상 */
const isExactGradeClassTag = (name: string) => /\d+학년\s*\d+반/.test(name);

/** 태그 이름에서 학년 파싱: "2학년 3반" → 2 */
const parseGradeFromTagName = (tagName: string): number | null => {
  const match = tagName.match(/(\d+)학년/);
  return match ? parseInt(match[1], 10) : null;
};

/** compositeKey: `${permKey}@${grade}` */
const makeKey = (permKey: string, grade: number) => `${permKey}@${grade}`;

/** compositeKey → { permission_key, grade } */
const parseKey = (compositeKey: string) => {
  const lastAt = compositeKey.lastIndexOf('@');
  return {
    permission_key: compositeKey.substring(0, lastAt),
    grade: parseInt(compositeKey.substring(lastAt + 1)),
  };
};

/** Sub-tab definitions: 비교과/행동 vs 세특 */
const SUB_TABS = [
  {
    value: 'activities' as const,
    label: '비교과 활동 / 행동특성',
    groups: PERMISSION_GROUPS.filter(g => !g.keys[0]?.startsWith('seteuk:')),
  },
  {
    value: 'seteuk' as const,
    label: '세부능력 및 특기사항',
    groups: PERMISSION_GROUPS.filter(g => g.keys[0]?.startsWith('seteuk:')),
  },
];

export const PermissionSettingsTab: React.FC = () => {
  const { data: allTags, isLoading: tagsLoading } = useResourceTags();

  // 학년/반 태그 제외 (매트릭스에서는 역할 태그만 표시)
  const tags = useMemo(() => (allTags ?? []).filter(t => !isGradeClassTag(t.name)), [allTags]);

  // "X학년 Y반" 패턴 태그만 추출 (일괄 권한 체크박스 대상)
  const exactGradeClassTags = useMemo(
    () => (allTags ?? []).filter(t => isExactGradeClassTag(t.name)),
    [allTags]
  );
  const { data: tagPermissions, isLoading: permLoading } = useEvalogTagPermissions();
  const queryClient = useQueryClient();

  // 로컬 상태: Map<compositeKey, Set<tagId>>
  const [localState, setLocalState] = useState<Map<string, Set<string>>>(new Map());
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 모든 compositeKey 목록
  const allCompositeKeys = useMemo(() =>
    PERMISSION_GROUPS.flatMap(g =>
      g.keys.flatMap(k => GRADES.map(grade => makeKey(k, grade)))
    ), []);

  // DB 데이터가 로드되면 로컬 상태에 복사 (최초 1회)
  useEffect(() => {
    if (tagPermissions && !initialized) {
      const copy = new Map<string, Set<string>>();
      tagPermissions.forEach((tagIds, key) => {
        copy.set(key, new Set(tagIds));
      });
      setLocalState(copy);
      setInitialized(true);
    }
  }, [tagPermissions, initialized]);

  // === 체크 상태 헬퍼 ===
  const isChecked = (compositeKey: string, tagId: string): boolean =>
    localState.get(compositeKey)?.has(tagId) ?? false;

  const toggle = (compositeKey: string, tagId: string) => {
    setLocalState(prev => {
      const next = new Map(prev);
      if (!next.has(compositeKey)) next.set(compositeKey, new Set());
      const set = new Set(next.get(compositeKey)!);
      if (set.has(tagId)) set.delete(tagId);
      else set.add(tagId);
      next.set(compositeKey, set);
      return next;
    });
  };

  // 특정 키 집합이 모두/일부 체크되어 있는지
  const isAllChecked = (keys: string[], tagId: string) =>
    keys.length > 0 && keys.every(k => localState.get(k)?.has(tagId) ?? false);
  const isPartialChecked = (keys: string[], tagId: string) => {
    const checked = keys.filter(k => localState.get(k)?.has(tagId) ?? false);
    return checked.length > 0 && checked.length < keys.length;
  };

  // 키 집합 일괄 토글
  const toggleKeys = (keys: string[], tagId: string) => {
    const allOn = isAllChecked(keys, tagId);
    setLocalState(prev => {
      const next = new Map(prev);
      keys.forEach(k => {
        if (!next.has(k)) next.set(k, new Set());
        const set = new Set(next.get(k)!);
        if (allOn) set.delete(tagId);
        else set.add(tagId);
        next.set(k, set);
      });
      return next;
    });
  };

  // 권한키의 모든 학년 compositeKeys
  const permGradeKeys = (permKey: string) => GRADES.map(g => makeKey(permKey, g));

  // 그룹의 모든 compositeKeys
  const groupAllKeys = (keys: EvalogPermissionKey[]) =>
    keys.flatMap(k => permGradeKeys(k));

  // === "X학년 Y반" 태그 일괄 권한 (단일 체크박스) ===

  /** 모든 exactGradeClassTag가 각자의 학년에 대해 전체 권한을 가지고 있는지 */
  const isAllExactGradeClassEnabled = useMemo(() => {
    if (exactGradeClassTags.length === 0) return false;
    return exactGradeClassTags.every(tag => {
      const grade = parseGradeFromTagName(tag.name);
      if (!grade) return true; // 파싱 실패 시 무시
      return EVALOG_PERMISSION_KEYS.every(key =>
        localState.get(makeKey(key, grade))?.has(tag.id) ?? false
      );
    });
  }, [exactGradeClassTags, localState]);

  /** 일부만 활성화된 상태 (indeterminate) */
  const isPartialExactGradeClassEnabled = useMemo(() => {
    if (exactGradeClassTags.length === 0) return false;
    const hasAny = exactGradeClassTags.some(tag => {
      const grade = parseGradeFromTagName(tag.name);
      if (!grade) return false;
      return EVALOG_PERMISSION_KEYS.some(key =>
        localState.get(makeKey(key, grade))?.has(tag.id) ?? false
      );
    });
    return hasAny && !isAllExactGradeClassEnabled;
  }, [exactGradeClassTags, localState, isAllExactGradeClassEnabled]);

  /** 모든 "X학년 Y반" 태그의 권한을 일괄 토글 */
  const toggleAllExactGradeClass = () => {
    const allOn = isAllExactGradeClassEnabled;
    setLocalState(prev => {
      const next = new Map(prev);
      exactGradeClassTags.forEach(tag => {
        const grade = parseGradeFromTagName(tag.name);
        if (!grade) return;
        EVALOG_PERMISSION_KEYS.forEach(key => {
          const ck = makeKey(key, grade);
          if (!next.has(ck)) next.set(ck, new Set());
          const set = new Set(next.get(ck)!);
          if (allOn) set.delete(tag.id);
          else set.add(tag.id);
          next.set(ck, set);
        });
      });
      return next;
    });
  };

  // 행 전체 토글 헬퍼 (전 학년 × 전 태그)
  const isRowAllChecked = (permKey: string) => {
    const pgKeys = permGradeKeys(permKey);
    return tags.length > 0 && tags.every(tag => pgKeys.every(k => isChecked(k, tag.id)));
  };

  const isRowPartialChecked = (permKey: string) => {
    const pgKeys = permGradeKeys(permKey);
    const hasAny = tags.some(tag => pgKeys.some(k => isChecked(k, tag.id)));
    return hasAny && !isRowAllChecked(permKey);
  };

  const toggleRow = (permKey: string) => {
    const pgKeys = permGradeKeys(permKey);
    const allChecked = isRowAllChecked(permKey);
    setLocalState(prev => {
      const next = new Map(prev);
      pgKeys.forEach(k => {
        if (!next.has(k)) next.set(k, new Set());
        const set = new Set(next.get(k)!);
        tags.forEach(tag => {
          if (allChecked) set.delete(tag.id);
          else set.add(tag.id);
        });
        next.set(k, set);
      });
      return next;
    });
  };

  // === 변경 사항 감지 ===
  const hasChanges = useMemo(() => {
    if (!tagPermissions) return false;
    for (const ck of allCompositeKeys) {
      const dbSet = tagPermissions.get(ck) ?? new Set<string>();
      const localSet = localState.get(ck) ?? new Set<string>();
      if (dbSet.size !== localSet.size) return true;
      for (const id of dbSet) { if (!localSet.has(id)) return true; }
      for (const id of localSet) { if (!dbSet.has(id)) return true; }
    }
    return false;
  }, [localState, tagPermissions, allCompositeKeys]);

  // === 저장 ===
  const handleSave = async () => {
    if (!tagPermissions) return;
    setSaving(true);
    try {
      const toInsert: { tag_id: string; permission_key: string; grade: number }[] = [];
      const toDelete: { tag_id: string; permission_key: string; grade: number }[] = [];

      for (const ck of allCompositeKeys) {
        const dbSet = tagPermissions.get(ck) ?? new Set<string>();
        const localSet = localState.get(ck) ?? new Set<string>();
        const parsed = parseKey(ck);

        for (const tagId of localSet) {
          if (!dbSet.has(tagId)) toInsert.push({ tag_id: tagId, ...parsed });
        }
        for (const tagId of dbSet) {
          if (!localSet.has(tagId)) toDelete.push({ tag_id: tagId, ...parsed });
        }
      }

      // 배치 삭제: permission_key+grade별로 그룹화
      if (toDelete.length > 0) {
        const deleteGroups = new Map<string, string[]>();
        for (const item of toDelete) {
          const groupKey = `${item.permission_key}|${item.grade}`;
          if (!deleteGroups.has(groupKey)) deleteGroups.set(groupKey, []);
          deleteGroups.get(groupKey)!.push(item.tag_id);
        }
        for (const [groupKey, tagIds] of deleteGroups) {
          const [permKey, gradeStr] = groupKey.split('|');
          const { error } = await supabase
            .from('evalog_tag_permissions' as any)
            .delete()
            .eq('permission_key', permKey)
            .eq('grade', parseInt(gradeStr))
            .in('tag_id', tagIds);
          if (error) throw error;
        }
      }

      // 배치 삽입
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('evalog_tag_permissions' as any)
          .insert(toInsert);
        if (error) throw error;
      }

      setInitialized(false);
      await queryClient.invalidateQueries({ queryKey: ['evalog-tag-permissions'] });
      toast.success(`권한 설정이 저장되었습니다. (추가: ${toInsert.length}, 삭제: ${toDelete.length})`);
    } catch (error) {
      console.error('권한 설정 저장 오류:', error);
      toast.error('권한 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (tagsLoading || permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">로딩 중...</span>
      </div>
    );
  }

  if (tags.length === 0 && exactGradeClassTags.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        리소스 태그가 없습니다. 먼저 리소스 태그를 생성해주세요.
      </div>
    );
  }

  /** 권한 매트릭스 테이블 렌더링 (서브탭별 그룹) */
  const renderTable = (
    groups: typeof PERMISSION_GROUPS,
    tabCKeys: string[],
  ) => (
    <div className="overflow-x-auto border rounded-lg mt-3">
      <table className="w-full text-sm">
        <thead>
          {/* Row 1: 태그 이름 + 전체 토글 */}
          <tr className="bg-slate-50 border-b">
            <th
              rowSpan={2}
              className="py-3 px-4 text-left font-medium text-slate-600 min-w-[160px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                영역
              </div>
            </th>
            {tags.map(tag => (
              <th
                key={tag.id}
                colSpan={3}
                className="py-3 px-2 text-center font-medium text-slate-600 border-l border-slate-200"
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color || '#94a3b8' }}
                  />
                  <span className="text-xs">{tag.name}</span>
                  <Checkbox
                    checked={
                      isAllChecked(tabCKeys, tag.id)
                        ? true
                        : isPartialChecked(tabCKeys, tag.id)
                        ? 'indeterminate'
                        : false
                    }
                    onCheckedChange={() => toggleKeys(tabCKeys, tag.id)}
                    className="mt-0.5"
                  />
                  <span className="text-[10px] text-slate-400">전체</span>
                </div>
              </th>
            ))}
          </tr>
          {/* Row 2: 학년 서브컬럼 */}
          <tr className="bg-slate-50/80 border-b">
            {tags.flatMap(tag =>
              GRADES.map((grade, i) => (
                <th
                  key={`${tag.id}-${grade}`}
                  className={`py-1.5 px-1 text-center text-[10px] font-medium text-slate-400 min-w-[36px] ${
                    i === 0 ? 'border-l border-slate-200' : ''
                  }`}
                >
                  {grade}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map(group => {
            const gKeys = groupAllKeys(group.keys);
            return (
              <React.Fragment key={group.label}>
                {/* 그룹 헤더 */}
                <tr className="bg-slate-100/70 border-t">
                  <td className="py-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-100/70 z-10 border-r border-slate-200">
                    {group.label}
                  </td>
                  {tags.flatMap(tag =>
                    GRADES.map((grade, i) => {
                      const gradeKeys = group.keys.map(k => makeKey(k, grade));
                      return (
                        <td
                          key={`${tag.id}-${grade}`}
                          className={`py-2 px-1 text-center ${
                            i === 0 ? 'border-l border-slate-200' : ''
                          }`}
                        >
                          <Checkbox
                            checked={
                              isAllChecked(gradeKeys, tag.id)
                                ? true
                                : isPartialChecked(gradeKeys, tag.id)
                                ? 'indeterminate'
                                : false
                            }
                            onCheckedChange={() => toggleKeys(gradeKeys, tag.id)}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                      );
                    })
                  )}
                </tr>

                {/* 권한키 행: 학년별 체크박스 인라인 표시 */}
                {group.keys.map(permKey => (
                  <tr
                    key={permKey}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="py-2 px-4 sticky left-0 bg-white z-10 border-r border-slate-200">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={
                            isRowAllChecked(permKey)
                              ? true
                              : isRowPartialChecked(permKey)
                              ? 'indeterminate'
                              : false
                          }
                          onCheckedChange={() => toggleRow(permKey)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-sm text-slate-700">
                          {PERMISSION_LABELS[permKey]}
                        </span>
                      </div>
                    </td>
                    {tags.flatMap(tag =>
                      GRADES.map((grade, i) => {
                        const ck = makeKey(permKey, grade);
                        return (
                          <td
                            key={`${tag.id}-${grade}`}
                            className={`py-2 px-1 text-center ${
                              i === 0 ? 'border-l border-slate-200' : ''
                            }`}
                          >
                            <Checkbox
                              checked={isChecked(ck, tag.id)}
                              onCheckedChange={() => toggle(ck, tag.id)}
                              className="h-3.5 w-3.5"
                            />
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 안내 배너 */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-1">권한 설정 안내</p>
          <p>
            각 영역을 <strong>학년별</strong>로 설정할 수 있습니다. 체크된 태그의 교사만 해당 학년의 영역을 열람할 수 있습니다.
            <strong> 아무 태그도 체크하지 않은 영역은 태그 매칭된 모든 교사에게 공개됩니다.</strong>
          </p>
        </div>
      </div>

      {/* "X학년 Y반" 태그 일괄 권한 — 단일 체크박스 */}
      {exactGradeClassTags.length > 0 && (
        <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg cursor-pointer hover:bg-amber-100/50 transition-colors">
          <Checkbox
            checked={
              isAllExactGradeClassEnabled
                ? true
                : isPartialExactGradeClassEnabled
                ? 'indeterminate'
                : false
            }
            onCheckedChange={toggleAllExactGradeClass}
            className="mt-0.5"
          />
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">학년/반 태그 자동 권한 부여</span>
            </div>
            <p className="text-xs text-amber-600 mt-1">
              활성화 시 <strong>#학년 #반</strong> 태그를 가진 교사에게 해당 반 학생들의 모든 열람 권한이 부여됩니다.
              (예: "1학년 2반" 태그 → 1학년 2반 학생 전체 열람)
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {exactGradeClassTags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white border border-slate-200 text-slate-600"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color || '#94a3b8' }}
                  />
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </label>
      )}

      {/* 서브탭: 비교과/행동 vs 세특 (역할 태그가 있을 때만 표시) */}
      {tags.length > 0 && (
        <Tabs defaultValue="activities">
          <TabsList>
            <TabsTrigger value="activities">비교과 활동 / 행동특성</TabsTrigger>
            <TabsTrigger value="seteuk">세부능력 및 특기사항</TabsTrigger>
          </TabsList>
          {SUB_TABS.map(tab => (
            <TabsContent key={tab.value} value={tab.value}>
              {renderTable(
                tab.groups,
                tab.groups.flatMap(g => groupAllKeys(g.keys)),
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* 저장 버튼 */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              저장 중...
            </>
          ) : (
            '권한 설정 저장'
          )}
        </Button>
      </div>
    </div>
  );
};
