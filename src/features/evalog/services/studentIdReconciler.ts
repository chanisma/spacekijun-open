/**
 * 학생 ID ↔ resource 교차 검증 (전입생 ID 채번 오류 재발 방지)
 *
 * 배경: excelParser는 학적사항(입학년도)·학년반이력(1학년 반/번호)만으로 학생 ID를
 * 자체 채번한다. 전입생은 "전입학" 날짜가 입학년도로 오파싱되고, 이전 학교의 1학년
 * 반/번호가 ID 몸통(1CCNN)으로 쓰여 다른 재학생의 정당한 코드와 충돌할 수 있다.
 * (실사례 2025-12: 전입생 한선우 → "00-00484" 채번 = 송다인의 코드를 점유,
 *  송다인 생기부 데이터 유실 + course-analyze에서 타인 성적 노출)
 *
 * 이 모듈은 파싱 직후 resource(신원 anchor, meta.id = 학적 코드)와 대조해:
 *  1) (현재 학년 학번 snum{N}, 이름)으로 resource 학생을 찾으면 meta.id로 ID 교체
 *     — 전입생 포함 모든 학생이 resource의 정본 코드로 수렴한다.
 *  2) resource에 없는 학생은 파생 ID를 유지하되, 그 ID가 resource에서 "다른 이름"의
 *     소유면 충돌로 판정 → 업로드 대상에서 제외해 덮어쓰기 오염을 차단한다.
 */
import { supabase } from '@/integrations/supabase/client';
import { ParsedData } from '../types/excelTypes';

export interface ReconcileChange {
    name: string;
    fileId: string;      // excelParser가 채번한 ID
    resourceId: string;  // resource.meta.id (정본)
}

export interface ReconcileConflict {
    name: string;
    fileId: string;
    ownerName: string;   // 파생 ID를 실제로 소유한 resource 학생 이름
}

export interface ReconcileReport {
    total: number;
    matched: number;               // resource 정합 (ID 동일 포함)
    changed: ReconcileChange[];    // resource 기준으로 ID가 교체된 학생
    unmatched: string[];           // resource 미등록 — 파생 ID 유지 (이름 목록)
    conflicts: ReconcileConflict[]; // 파생 ID가 타인 소유 — 업로드 제외
}

interface ResourceRow {
    name: string;
    status: string | null;
    meta: {
        id?: string;
        snum1?: string;
        snum2?: string;
        snum3?: string;
    } | null;
}

const pad2 = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '').padStart(2, '0');

/** 현재 파일 기준 학번 (예: 3학년 1반 8번 → "30108") */
const currentSnum = (grade: number, classNum: number, studentNo: string) =>
    `${grade}${pad2(classNum)}${pad2(studentNo)}`;

const ID_CHUNK = 80;

export const reconcileStudentIdsWithResource = async (
    parsed: ParsedData
): Promise<{ data: ParsedData; report: ReconcileReport }> => {
    const report: ReconcileReport = {
        total: parsed.basicInfo.length,
        matched: 0,
        changed: [],
        unmatched: [],
        conflicts: [],
    };
    if (parsed.basicInfo.length === 0) return { data: parsed, report };

    // 1. 학생별 현재 학번 → 조회할 snum 필드 결정 (databaseGradeService와 동일 컨벤션)
    const queries = parsed.basicInfo
        .filter(s => s.grade >= 1 && s.grade <= 3)
        .map(s => ({
            student: s,
            snum: currentSnum(s.grade, s.classNum, s.student_no),
            snumField: `snum${s.grade}` as 'snum1' | 'snum2' | 'snum3',
        }));

    // 2. resource 후보 행 조회 (서버측 JSONB 필터, 청크)
    const allRows: ResourceRow[] = [];
    for (let i = 0; i < queries.length; i += ID_CHUNK) {
        const chunk = queries.slice(i, i + ID_CHUNK);
        const orFilter = chunk.map(q => `meta->>${q.snumField}.eq.${q.snum}`).join(',');
        const { data, error } = await supabase
            .from('resource')
            .select('name, status, meta')
            .eq('type', 'student')
            .or(orFilter);
        if (error) {
            console.error('[Reconcile] resource 조회 실패:', error);
            throw new Error(`resource 교차 검증 실패: ${error.message}`);
        }
        if (data) allRows.push(...(data as unknown as ResourceRow[]));
    }

    // 3. (snum, 이름) → meta.id 인덱스. 같은 키가 여러 cohort에 있으면 active 우선.
    const idx = new Map<string, { metaId: string; active: boolean }>();
    for (const row of allRows) {
        if (!row.meta?.id) continue;
        const active = row.status === 'active';
        for (const field of ['snum1', 'snum2', 'snum3'] as const) {
            const snum = row.meta[field];
            if (!snum) continue;
            const key = `${snum}|${row.name}`;
            const prev = idx.get(key);
            if (!prev || (active && !prev.active)) {
                idx.set(key, { metaId: row.meta.id, active });
            }
        }
    }

    // 4. 매칭 → ID 교체 결정
    const idRemap = new Map<string, string>();       // fileId → resourceId
    const unmatchedStudents: { name: string; fileId: string }[] = [];
    for (const q of queries) {
        const hit = idx.get(`${q.snum}|${q.student.name}`);
        if (hit) {
            report.matched++;
            if (hit.metaId !== q.student.id) {
                idRemap.set(q.student.id, hit.metaId);
                report.changed.push({ name: q.student.name, fileId: q.student.id, resourceId: hit.metaId });
            }
        } else {
            unmatchedStudents.push({ name: q.student.name, fileId: q.student.id });
        }
    }

    // 5. 미매칭 학생의 파생 ID 충돌 검사: 그 ID가 resource에서 다른 이름 소유인가?
    const conflictIds = new Set<string>();
    if (unmatchedStudents.length > 0) {
        const ownerByCode = new Map<string, string>(); // meta.id → name
        for (let i = 0; i < unmatchedStudents.length; i += ID_CHUNK) {
            const chunk = unmatchedStudents.slice(i, i + ID_CHUNK);
            const orFilter = chunk.map(u => `meta->>id.eq.${u.fileId}`).join(',');
            const { data, error } = await supabase
                .from('resource')
                .select('name, meta')
                .eq('type', 'student')
                .or(orFilter);
            if (error) {
                console.error('[Reconcile] 충돌 검사 실패:', error);
                throw new Error(`resource 충돌 검사 실패: ${error.message}`);
            }
            (data as unknown as ResourceRow[] | null)?.forEach(row => {
                if (row.meta?.id) ownerByCode.set(row.meta.id, row.name);
            });
        }
        for (const u of unmatchedStudents) {
            const owner = ownerByCode.get(u.fileId);
            if (owner && owner !== u.name) {
                // 파생 ID가 타인의 정본 코드 → 업로드하면 그 학생 데이터를 오염시킴
                conflictIds.add(u.fileId);
                report.conflicts.push({ name: u.name, fileId: u.fileId, ownerName: owner });
            } else if (owner) {
                // 소유자 이름 일치 (snum 미기재 등으로 4단계 매칭만 실패한 경우) → 정합
                report.matched++;
            } else {
                report.unmatched.push(u.name);
            }
        }
    }

    // 6. 적용: basicInfo/detailedActivities re-key + 충돌 학생 제외
    const basicInfo = parsed.basicInfo
        .filter(s => !conflictIds.has(s.id))
        .map(s => {
            const newId = idRemap.get(s.id);
            return newId ? { ...s, id: newId, studentId: newId } : s;
        });
    const detailedActivities = parsed.detailedActivities
        .filter(a => !conflictIds.has(a.id))
        .map(a => {
            const newId = idRemap.get(a.id);
            return newId ? { ...a, id: newId, studentId: newId } : a;
        });

    return { data: { ...parsed, basicInfo, detailedActivities }, report };
};
