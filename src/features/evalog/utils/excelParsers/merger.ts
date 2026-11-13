import { StudentBasicInfo } from '../../types/excelTypes';

export const mergeToStudents = (map: Map<string, StudentBasicInfo>, data: any[], field: keyof StudentBasicInfo) => {
    data.forEach(item => {
        if (!map.has(item.id)) {
            map.set(item.id, {
                id: item.id,
                name: item.name,
                student_no: item.studentNo,
                grade: parseInt(item.grade),
                classNum: parseInt(item.classNum),
                source: item.source,
                [field]: item.data
            });
        } else {
            const student = map.get(item.id)!;
            if (item.name) student.name = item.name;
            if (field === 'section1_personal_info') {
                const createCleanData = (obj: any) => {
                    const clean: any = {};
                    Object.keys(obj).forEach(key => {
                        if (obj[key] !== null && obj[key] !== undefined) clean[key] = obj[key];
                    });
                    return clean;
                };
                const existing = (student as any)[field] || {};
                (student as any)[field] = { ...existing, ...createCleanData(item.data) };
            } else if (Array.isArray((student as any)[field]) || (Array.isArray(item.data) && (field === 'attendance' || field === 'volunteer' || field === 'gradeInfo'))) {
                const existing = (student as any)[field] || [];
                let newData: any[] = [];

                if (Array.isArray(item.data)) {
                    newData = item.data;
                } else {
                    newData = [item.data];
                }

                if (field === 'attendance') {
                    // Deduplicate attendance by grade: Keep existing ones, only add new grades
                    // Or overwrite? Usually better to overwrite if the new file is "better", but honestly we just want uniqueness by grade.
                    // Let's use a Map to merge them, preferring the one from the file with higher grade context if we knew it.
                    // Simple approach: Map by grade code.
                    const merged = new Map();
                    [...existing, ...newData].forEach(rec => {
                        if (rec.grade) merged.set(rec.grade, rec);
                    });
                    (student as any)[field] = Array.from(merged.values()).sort((a: any, b: any) => a.grade - b.grade);
                } else if (field === 'gradeInfo') {
                    // Deduplicate GradeInfo by grade
                    const merged = new Map();
                    [...existing, ...newData].forEach(rec => {
                        if (rec.grade) merged.set(rec.grade, rec);
                    });
                    (student as any)[field] = Array.from(merged.values()).sort((a: any, b: any) => parseInt(String(a.grade)) - parseInt(String(b.grade)));
                } else if (String(field) === 'academic_development') {
                    // Standard merge (AcademicSheet) - append new records
                    const isSeTeuk = newData.length > 0 && newData[0].category === '세부능력및특기사항';

                    if (!isSeTeuk) {
                        (student as any)[field] = existing.concat(newData);
                    }
                } else {
                    // Volunteer or others: just concat for now, hard to dedupe without unique key
                    (student as any)[field] = existing.concat(newData);
                }
            } else {
                (student as any)[field] = item.data;
            }

            if (!student.source.includes(item.source)) {
                student.source += `, ${item.source}`;
            }
        }
    });
};
