import { ParserMeta, StudentActivity } from '../types/excelTypes';

function formatTimestamp(): string {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d}_${h}${mi}${s}`;
}

function escapeCsvField(value: string | number | null | undefined): string {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function generateSummaryCsv(parserMeta: ParserMeta[], uploadTime: string): string {
    const header = 'upload_time,file_name,parser_type,records_count,students_count';
    const rows = parserMeta.map(meta =>
        [
            escapeCsvField(uploadTime),
            escapeCsvField(meta.fileName),
            escapeCsvField(meta.parserType),
            meta.recordCount,
            meta.studentCount,
        ].join(',')
    );
    return [header, ...rows].join('\n');
}

export function generateDetailCsv(activities: StudentActivity[]): string {
    const header = 'file_name,parser_type,student_id,name,grade,class_num,student_no,category,subject_name,semester,year,content_length,source';
    const rows = activities.map(a =>
        [
            escapeCsvField(a.source),
            escapeCsvField(a.category),
            escapeCsvField(a.studentId || a.id),
            escapeCsvField(a.name),
            a.grade ?? '',
            a.classNum ?? '',
            escapeCsvField(a.studentNo),
            escapeCsvField(a.category),
            escapeCsvField(a.subject_name),
            a.semester ?? '',
            a.year ?? '',
            a.content ? new Blob([a.content]).size : 0,
            escapeCsvField(a.source),
        ].join(',')
    );
    return [header, ...rows].join('\n');
}

function downloadCsv(csvContent: string, fileName: string): void {
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadUploadLogs(parserMeta: ParserMeta[], activities: StudentActivity[]): void {
    const timestamp = formatTimestamp();
    const uploadTime = new Date().toLocaleString('ko-KR');

    const summaryCsv = generateSummaryCsv(parserMeta, uploadTime);
    downloadCsv(summaryCsv, `upload_summary_${timestamp}.csv`);

    const detailCsv = generateDetailCsv(activities);
    downloadCsv(detailCsv, `upload_detail_${timestamp}.csv`);
}
