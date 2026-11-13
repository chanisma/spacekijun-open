
export const norm = (s: any) => String(s || '').replace(/[\s\u00A0\u200B\uFEFF]+/g, '');

export const findHeaderRow = (data: any[], keywords: string[]): number => {
    for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i] as any[];
        if (!row || !Array.isArray(row)) continue;
        const rowNorm = row.map(norm);
        if (keywords.every(k => rowNorm.some(r => r.includes(k)))) {
            return i;
        }
    }
    return -1;
};

export const constructStudentId = (grade: any, classNum: any, studentNo: any) => {
    // Default prefix year (temporary, will be harmonized later)
    const prefix = new Date().getFullYear().toString().slice(2);
    const g = String(grade || '0').replace(/[^0-9]/g, '');
    const c = String(classNum || '0').replace(/[^0-9]/g, '').padStart(2, '0');
    const n = String(studentNo || '0').replace(/[^0-9]/g, '').padStart(2, '0');
    return `${prefix}-${g}${c}${n}`;
};

export const readFile = (file: File): Promise<string | ArrayBuffer | null> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result || null);
        reader.readAsArrayBuffer(file);
    });
};
