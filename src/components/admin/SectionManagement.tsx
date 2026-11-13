import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Plus, Download, Trash2, Edit, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Section {
  id: string;
  name: string;
  subject?: string | null;
  is_combined?: boolean | null;
  meta: any;
  created_at: string;
  updated_at: string;
}

export function SectionManagement() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkImportDialog, setShowBulkImportDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    grade: '',
    is_combined: false,
    meta: ''
  });

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      const { data, error } = await supabase
        .from('section')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSections(data || []);
    } catch (error) {
      console.error('Error fetching sections:', error);
      toast({
        title: "오류",
        description: "섹션을 불러오는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let meta = {};
      if (formData.meta.trim()) {
        try {
          meta = JSON.parse(formData.meta);
        } catch {
          toast({
            title: "오류",
            description: "메타데이터는 유효한 JSON 형식이어야 합니다.",
            variant: "destructive",
          });
          return;
        }
      }

      // grade는 meta 필드 내부에 저장
      const gradeValue = formData.grade && formData.grade !== 'none' ? parseInt(formData.grade) : null;
      const sectionData = {
        name: formData.name,
        subject: formData.subject || null,
        is_combined: formData.is_combined,
        meta: {
          ...meta,
          ...(gradeValue !== null && { grade: gradeValue })
        }
      };

      if (editingSection) {
        const { error } = await supabase
          .from('section')
          .update(sectionData)
          .eq('id', editingSection.id);

        if (error) throw error;
        toast({
          title: "성공",
          description: "섹션이 수정되었습니다.",
        });
      } else {
        const { error } = await supabase
          .from('section')
          .insert([sectionData]);

        if (error) throw error;
      }

      setFormData({ name: '', subject: '', grade: '', is_combined: false, meta: '' });
      setShowCreateDialog(false);
      setEditingSection(null);
      fetchSections();
    } catch (error) {
      console.error('Error saving section:', error);
      toast({
        title: "오류",
        description: "섹션 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (section: Section) => {
    setEditingSection(section);
    setFormData({
      name: section.name,
      subject: section.subject || '',
      grade: section.meta?.grade?.toString() || '',
      is_combined: section.is_combined || false,
      meta: JSON.stringify(section.meta, null, 2)
    });
    setShowCreateDialog(true);
  };

  const handleDelete = async (sectionId: string) => {
    if (!confirm('정말로 이 섹션을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('section')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
      fetchSections();
    } catch (error) {
      console.error('Error deleting section:', error);
      toast({
        title: "오류",
        description: "섹션 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAll = async () => {
    // 1단계: 기본 확인
    if (!confirm('⚠️ 정말로 모든 섹션을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!')) return;

    // 2단계: 텍스트 입력 확인
    const confirmText = prompt('삭제를 확인하려면 "전체 삭제"를 정확히 입력하세요:');
    if (confirmText !== '전체 삭제') {
      toast({
        title: "취소됨",
        description: "입력이 일치하지 않아 삭제가 취소되었습니다.",
      });
      return;
    }

    setDeleting(true);
    try {
      // 모든 섹션 삭제 (WHERE 조건 없이 모든 행 삭제)
      const { error } = await supabase
        .from('section')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 실제로는 모든 행 삭제

      if (error) throw error;

      toast({
        title: "성공",
        description: `모든 섹션(${sections.length}개)이 삭제되었습니다.`,
      });

      fetchSections();
    } catch (error) {
      console.error('Error deleting all sections:', error);
      toast({
        title: "오류",
        description: "전체 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // 컬럼 인덱스를 weekday_time으로 변환하는 함수
  const getWeekdayTimeFromColumnIndex = (colIndex: number): number | null => {
    // C열(2) = 월1교시(11), D열(3) = 월2교시(12), ... AK열(36) = 금7교시(57)
    if (colIndex < 2 || colIndex > 36) return null;

    const adjustedIndex = colIndex - 2; // C열을 0으로 조정
    const weekday = Math.floor(adjustedIndex / 7) + 1; // 1=월, 2=화, 3=수, 4=목, 5=금
    const period = (adjustedIndex % 7) + 1; // 1-7교시

    return weekday * 10 + period;
  };

  // 수업데이터.csv 파일 처리 함수
  const processClassDataCSV = (lines: string[]): any[] => {
    const sectionMap = new Map<string, any>();

    // 헤더에서 컬럼 인덱스 동적 검출
    const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim());
    const colIdx = {
      teacher: headers.findIndex(h => h.includes('교사') || h.includes('성명') || h.includes('담당')),
      grade: headers.findIndex(h => h === '학년'),
      classNum: headers.findIndex(h => h === '반'),
      subject: headers.findIndex(h => h === '과목'),
      weekday: headers.findIndex(h => h === '요일'),
      period: headers.findIndex(h => h === '교시'),
    };

    // 필수 컬럼 확인
    if (colIdx.grade === -1 || colIdx.classNum === -1 || colIdx.subject === -1 || colIdx.weekday === -1 || colIdx.period === -1) {
      // 기존 고정 인덱스 폴백: 순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목
      colIdx.teacher = 1;
      colIdx.weekday = 4;
      colIdx.period = 5;
      colIdx.grade = 6;
      colIdx.classNum = 7;
      colIdx.subject = 8;
    }

    // 헤더 건너뛰고 데이터 행부터 처리
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSV 파싱 (콤마로 구분)
      const cells = line.split(',').map(cell => cell.trim());

      if (cells.length < Math.max(colIdx.teacher, colIdx.grade, colIdx.classNum, colIdx.subject, colIdx.weekday, colIdx.period) + 1) continue;

      const teacherName = colIdx.teacher >= 0 ? cells[colIdx.teacher] : '';
      const grade = cells[colIdx.grade];
      const classNum = cells[colIdx.classNum];
      const subject = cells[colIdx.subject];
      const weekday = cells[colIdx.weekday];
      const period = cells[colIdx.period];

      if (!teacherName || !subject || !grade || !classNum) continue;

      // 요일을 숫자로 변환
      const weekdayMap: Record<string, number> = {
        '월': 1,
        '화': 2,
        '수': 3,
        '목': 4,
        '금': 5,
        '토': 6,
        '일': 7
      };

      const weekdayNum = weekdayMap[weekday];
      if (!weekdayNum) continue;

      // weekday_time 계산 (예: 월1교시 = 11)
      const weekdayTime = weekdayNum * 10 + parseInt(period);

      // section.name 생성: "과목명 학년-반"
      const sectionName = `${subject} ${grade}-${classNum}`;

      // 시간대 정보 객체
      const timeSlot = {
        time: weekdayTime,
        name: teacherName
      };

      // 같은 섹션이 이미 존재하는지 확인
      if (sectionMap.has(sectionName)) {
        const existingSection = sectionMap.get(sectionName);

        if (Array.isArray(existingSection.meta.weekday_time)) {
          // 이미 배열인 경우 중복 체크 후 추가
          const existingTime = existingSection.meta.weekday_time.find((slot: any) =>
            (typeof slot === 'object' ? slot.time : slot) === weekdayTime
          );

          if (!existingTime) {
            existingSection.meta.weekday_time.push(timeSlot);
            existingSection.meta.weekday_time.sort((a: any, b: any) => {
              const timeA = typeof a === 'object' ? a.time : a;
              const timeB = typeof b === 'object' ? b.time : b;
              return timeA - timeB;
            });
          }
        } else {
          // 단일 값인 경우 배열로 변환
          const currentSlot = existingSection.meta.weekday_time;
          const currentTime = typeof currentSlot === 'object' ? currentSlot.time : currentSlot;

          if (currentTime !== weekdayTime) {
            const existingTimeSlot = typeof currentSlot === 'object'
              ? currentSlot
              : { time: currentSlot, name: '' };

            existingSection.meta.weekday_time = [existingTimeSlot, timeSlot].sort((a, b) => a.time - b.time);
          }
        }
      } else {
        // 새로운 섹션 생성
        const sectionData = {
          name: sectionName,
          subject: null,
          is_combined: false,
          meta: {
            grade: parseInt(grade),
            class: parseInt(classNum),
            weekday_time: timeSlot,
            subject_name: subject
          }
        };

        sectionMap.set(sectionName, sectionData);
      }
    }

    return Array.from(sectionMap.values());
  };

  // 시간표 CSV 파일 처리 함수
  const processTimetableCSV = (lines: string[]): any[] => {
    const sectionMap = new Map<string, any>();

    // 5행부터 교사 데이터 시작 (인덱스 4부터, 2행씩 처리)
    for (let i = 4; i < lines.length; i += 2) {
      if (i + 1 >= lines.length) break;

      const subjectRow = lines[i].split(',');
      const classRow = lines[i + 1].split(',');

      if (subjectRow.length < 3 || classRow.length < 3) continue;

      // 교사명은 B열(인덱스 1)에 있음
      const teacherName = subjectRow[1]?.trim();

      if (!teacherName || teacherName === '') {
        continue;
      }

      // C열부터 AK열까지 처리 (인덱스 2부터 36까지)
      // 월1~7(2-8), 화1~7(9-15), 수1~7(16-22), 목1~7(23-29), 금1~7(30-36)
      for (let colIndex = 2; colIndex <= 36; colIndex++) {
        const subject = subjectRow[colIndex]?.trim();
        const classInfo = classRow[colIndex]?.trim();

        if (!subject || !classInfo || subject === '' || classInfo === '') continue;

        const weekdayTime = getWeekdayTimeFromColumnIndex(colIndex);
        if (!weekdayTime) continue;

        // 반 정보에서 학년과 반 추출 (예: "1-4" -> grade: 1, class: 4)
        const classMatch = classInfo.match(/^(\d+)-(\d+)$/);
        if (!classMatch) continue;

        const grade = parseInt(classMatch[1]);
        const classNum = parseInt(classMatch[2]);

        // section.name 생성: "과목명 반정보" (예: "공통국어 1-4")
        const sectionName = `${subject} ${classInfo}`;

        // 시간대 정보 객체 생성
        const timeSlot = {
          time: weekdayTime,
          name: teacherName
        };

        // 같은 섹션이 이미 존재하는지 확인
        if (sectionMap.has(sectionName)) {
          // 기존 섹션에 새로운 weekday_time 추가
          const existingSection = sectionMap.get(sectionName);

          if (Array.isArray(existingSection.meta.weekday_time)) {
            // 이미 배열인 경우 중복 시간 체크 후 추가
            const existingTime = existingSection.meta.weekday_time.find((slot: any) =>
              (typeof slot === 'object' ? slot.time : slot) === weekdayTime
            );

            if (!existingTime) {
              existingSection.meta.weekday_time.push(timeSlot);
              existingSection.meta.weekday_time.sort((a: any, b: any) => {
                const timeA = typeof a === 'object' ? a.time : a;
                const timeB = typeof b === 'object' ? b.time : b;
                return timeA - timeB;
              });
            }
          } else {
            // 단일 값인 경우 배열로 변환
            const currentSlot = existingSection.meta.weekday_time;
            const currentTime = typeof currentSlot === 'object' ? currentSlot.time : currentSlot;

            if (currentTime !== weekdayTime) {
              // 기존 데이터를 객체 형태로 변환 (교사명이 없는 경우 대비)
              const existingTimeSlot = typeof currentSlot === 'object'
                ? currentSlot
                : { time: currentSlot, name: '' };

              existingSection.meta.weekday_time = [existingTimeSlot, timeSlot].sort((a, b) => a.time - b.time);
            }
          }
        } else {
          // 새로운 섹션 생성
          const sectionData = {
            name: sectionName,
            subject: null,
            is_combined: false,
            meta: {
              grade: grade,
              class: classNum,
              weekday_time: timeSlot, // 교사명과 함께 저장
              subject_name: subject
            }
          };

          sectionMap.set(sectionName, sectionData);
        }
      }
    }

    return Array.from(sectionMap.values());
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "오류",
        description: "CSV 파일만 업로드할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const rawText = await file.text();
      // BOM 제거
      const text = rawText.replace(/^\uFEFF/, '');
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('CSV 파일이 너무 짧습니다. 최소 2행이 필요합니다.');
      }

      let sectionsToCreate = [];
      let isClassDataCSV = false;

      // 수업데이터.csv 형식인지 확인 (헤더에 "교사성명" 포함 또는 콤마 구분 + 학년/반/과목/교시 열 포함)
      const headerLine = lines[0].replace(/^\uFEFF/, '').trim();
      const commaHeaders = headerLine.split(',').map(h => h.trim());
      const isClassDataFormat = headerLine.includes('교사성명') ||
        (commaHeaders.length >= 7 && ['학년', '반', '과목', '교시'].every(k => commaHeaders.some(h => h.includes(k))));

      if (isClassDataFormat) {
        // 수업데이터.csv 형식 처리
        sectionsToCreate = processClassDataCSV(lines);
        isClassDataCSV = true;

        if (sectionsToCreate.length === 0) {
          throw new Error('수업데이터 CSV에서 유효한 데이터를 찾을 수 없습니다.');
        }
      }
      // 시간표 CSV 형식인지 확인 (1행에 "전체 교사 시간표" 포함)
      else if (lines[0].includes('전체 교사 시간표')) {
        // 새로운 시간표 CSV 형식 처리
        sectionsToCreate = processTimetableCSV(lines);

        if (sectionsToCreate.length === 0) {
          throw new Error('시간표 CSV에서 유효한 수업 데이터를 찾을 수 없습니다.');
        }
      } else {
        // 기존 파이프(|) 구분자 CSV 형식 처리
        const headers = lines[0].split('|').map(h => h.trim());

        if (!headers.includes('name')) {
          throw new Error('CSV 파일에 "name" 열이 있어야 합니다.');
        }

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('|').map(v => v.trim());

          if (values.length !== headers.length) {
            throw new Error(`${i + 1}번째 행의 열 개수가 헤더와 일치하지 않습니다.`);
          }

          const sectionData: any = {
            meta: {},
            is_combined: false // 기본값 설정
          };

          headers.forEach((header, index) => {
            const value = values[index];

            if (header === 'name') {
              sectionData.name = value;
            } else if (header === 'subject') {
              sectionData.subject = value || null;
            } else if (header === 'grade') {
              // grade는 meta에 저장
              sectionData.meta.grade = value ? parseInt(value) : null;
            } else if (header === 'is_combined') {
              sectionData.is_combined = value.toLowerCase() === 'true';
            } else {
              // 메타데이터 필드
              sectionData.meta[header] = value;
            }
          });

          if (!sectionData.name) {
            throw new Error(`${i + 1}번째 행에 섹션 이름이 없습니다.`);
          }

          sectionsToCreate.push(sectionData);
        }
      }

      // 시간표 CSV 또는 수업데이터 CSV인 경우 중복 처리를 위해 기존 섹션 확인
      if (isClassDataCSV || lines[0].includes('전체 교사 시간표')) {
        // 기존 섹션들을 가져와서 중복 처리
        const { data: existingSections, error: fetchError } = await supabase
          .from('section')
          .select('id, name, meta');

        if (fetchError) {
          console.error('Error fetching existing sections:', fetchError);
          throw fetchError;
        }

        const existingSectionMap = new Map();
        existingSections?.forEach(section => {
          existingSectionMap.set(section.name, section);
        });

        const sectionsToInsert = [];
        const sectionsToUpdate = [];

        for (const newSection of sectionsToCreate) {
          const existing = existingSectionMap.get(newSection.name);
          if (existing) {
            // 기존 섹션이 있으면 meta.weekday_time을 병합
            const existingWeekdayTime = existing.meta?.weekday_time;
            const newWeekdayTime = newSection.meta.weekday_time;

            let mergedWeekdayTime;

            if (!existingWeekdayTime) {
              // 기존에 weekday_time이 없으면 새 데이터 사용
              mergedWeekdayTime = newWeekdayTime;
            } else if (Array.isArray(existingWeekdayTime)) {
              // 기존이 배열이면 새 데이터 추가
              mergedWeekdayTime = [...existingWeekdayTime];

              if (Array.isArray(newWeekdayTime)) {
                newWeekdayTime.forEach(newSlot => {
                  const existingSlot = mergedWeekdayTime.find((slot: any) =>
                    (typeof slot === 'object' ? slot.time : slot) ===
                    (typeof newSlot === 'object' ? newSlot.time : newSlot)
                  );
                  if (!existingSlot) {
                    mergedWeekdayTime.push(newSlot);
                  }
                });
              } else {
                const existingSlot = mergedWeekdayTime.find((slot: any) =>
                  (typeof slot === 'object' ? slot.time : slot) ===
                  (typeof newWeekdayTime === 'object' ? newWeekdayTime.time : newWeekdayTime)
                );
                if (!existingSlot) {
                  mergedWeekdayTime.push(newWeekdayTime);
                }
              }

              mergedWeekdayTime.sort((a: any, b: any) => {
                const timeA = typeof a === 'object' ? a.time : a;
                const timeB = typeof b === 'object' ? b.time : b;
                return timeA - timeB;
              });
            } else {
              // 기존이 단일 값이면 배열로 변환 후 병합
              const existingSlot = typeof existingWeekdayTime === 'object'
                ? existingWeekdayTime
                : { time: existingWeekdayTime, name: '' };

              mergedWeekdayTime = [existingSlot];

              if (Array.isArray(newWeekdayTime)) {
                newWeekdayTime.forEach(newSlot => {
                  const duplicateSlot = mergedWeekdayTime.find((slot: any) =>
                    slot.time === (typeof newSlot === 'object' ? newSlot.time : newSlot)
                  );
                  if (!duplicateSlot) {
                    mergedWeekdayTime.push(newSlot);
                  }
                });
              } else {
                const newTime = typeof newWeekdayTime === 'object' ? newWeekdayTime.time : newWeekdayTime;
                if (existingSlot.time !== newTime) {
                  mergedWeekdayTime.push(newWeekdayTime);
                }
              }

              mergedWeekdayTime.sort((a: any, b: any) => a.time - b.time);
            }

            // 업데이트할 섹션 추가
            const updatedSection = {
              id: existing.id,
              meta: {
                ...existing.meta,
                ...newSection.meta,
                weekday_time: mergedWeekdayTime
              }
            };


            sectionsToUpdate.push(updatedSection);
          } else {
            // 새로운 섹션
            sectionsToInsert.push(newSection);
          }
        }

        // 업데이트 실행
        let updatedCount = 0;
        for (const section of sectionsToUpdate) {
          const { error: updateError } = await supabase
            .from('section')
            .update({ meta: section.meta })
            .eq('id', section.id);

          if (updateError) {
            console.error('Error updating section:', updateError);
          } else {
            updatedCount++;
          }
        }

        // 새 섹션 삽입
        let insertedCount = 0;
        if (sectionsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('section')
            .insert(sectionsToInsert);

          if (insertError) {
            console.error('Error inserting sections:', insertError);
            throw insertError;
          }
          insertedCount = sectionsToInsert.length;
        }

        toast({
          title: "성공",
          description: `신규 ${insertedCount}개, 업데이트 ${updatedCount}개 섹션이 처리되었습니다.`,
        });
      } else {
        // 기존 일반 CSV 처리 (일괄 삽입)
        console.log('Sections to create:', sectionsToCreate.slice(0, 3));
        console.log('Total sections:', sectionsToCreate.length);

        const { error } = await supabase
          .from('section')
          .insert(sectionsToCreate);

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }

        toast({
          title: "성공",
          description: `${sectionsToCreate.length}개의 섹션이 생성되었습니다.`,
        });
      }

      setShowBulkImportDialog(false);
      fetchSections();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "CSV 파일 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      'name|subject|grade|is_combined|classroom|capacity',
      '1학년 1반|국어|1|false|101호|30',
      '2학년 합반|수학|2|true|201호|60',
      '3학년 특별반|과학|3|false|301호|25'
    ].join('\n');

    const blob = new Blob([sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'section_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingSection(null);
    setFormData({ name: '', subject: '', grade: '', is_combined: false, meta: '' });
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">섹션 관리</h2>
        <div className="flex items-center space-x-2">
          <Dialog open={showBulkImportDialog} onOpenChange={setShowBulkImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                일괄 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
                <DialogTitle>CSV 파일로 섹션 일괄 추가</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-2">지원하는 CSV 형식:</p>

                  <div className="mb-4">
                    <p className="font-medium text-purple-600">1. 수업데이터 CSV (수업데이터.csv)</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>헤더: 순번,교사성명,요일교시,학년과목(반),요일,교시,학년,반,과목</li>
                      <li>자동으로 "과목명 학년-반" 형식으로 섹션 생성</li>
                      <li>예: "통합수학Ⅰ 3-5", "미술사 3-7"</li>
                      <li>동일 섹션의 여러 시간대는 자동 통합</li>
                      <li>담당교사 정보가 weekday_time.name에 저장</li>
                      <li>기존 섹션이 있으면 시간대만 추가</li>
                    </ul>
                  </div>

                  <div className="mb-4">
                    <p className="font-medium text-blue-600">2. 시간표 CSV (수업교체용 시간표 제작.csv)</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>첫 번째 행에 "전체 교사 시간표" 포함</li>
                      <li>자동으로 과목명과 반 정보를 조합하여 섹션 생성</li>
                      <li>예: "공통국어 1-4", "수학2 2-5"</li>
                      <li>동일한 섹션의 여러 시간대는 자동으로 통합</li>
                      <li>담당교사 정보가 weekday_time.name에 함께 저장</li>
                      <li>같은 이름의 섹션이 있으면 기존 데이터에 시간대 추가</li>
                      <li>메타데이터: grade, class, weekday_time (객체 또는 배열), subject_name</li>
                      <li>weekday_time 구조: {"{"}"time": 11, "name": "김교사"{"}"} 또는 [{"{"}"time": 11, "name": "김교사"{"}"}, {"{"}"time": 23, "name": "이교사"{"}"}]</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium text-green-600">3. 기본 CSV (파이프 구분자)</p>
                    <code className="bg-muted p-2 rounded block mt-1">
                      name|subject|grade|is_combined|메타데이터1|메타데이터2|...
                    </code>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>name (필수): 섹션 이름</li>
                      <li>subject (선택): 과목</li>
                      <li>grade (선택): 학년</li>
                      <li>is_combined (선택): 합반 여부 (true/false)</li>
                      <li>추가 메타데이터: 원하는 만큼 열 추가 가능</li>
                    </ul>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  onClick={downloadSampleCSV}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  샘플 CSV 다운로드
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? '업로드 중...' : 'CSV 파일 선택'}
                </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {sections.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? '삭제 중...' : '전체 삭제'}
            </Button>
          )}

          <Dialog open={showCreateDialog} onOpenChange={closeDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                섹션 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSection ? '섹션 수정' : '새 섹션 추가'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">섹션 이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="subject">과목</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="grade">학년</Label>
                  <Select value={formData.grade} onValueChange={(value) => setFormData(prev => ({ ...prev, grade: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="학년 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      <SelectItem value="1">1학년</SelectItem>
                      <SelectItem value="2">2학년</SelectItem>
                      <SelectItem value="3">3학년</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_combined"
                    checked={formData.is_combined}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_combined: checked }))}
                  />
                  <Label htmlFor="is_combined">합반</Label>
                </div>
                
                <div>
                  <Label htmlFor="meta">메타데이터 (JSON)</Label>
                  <Textarea
                    id="meta"
                    value={formData.meta}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta: e.target.value }))}
                    placeholder='{"classroom": "101호", "capacity": 30}'
                    rows={3}
                  />
                </div>
                
                <div className="flex space-x-2">
                  <Button type="submit" className="flex-1">
                    {editingSection ? '수정' : '추가'}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    취소
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>섹션 목록 ({sections.length}개)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">이름</TableHead>
                  <TableHead className="w-16 text-center hidden sm:table-cell">학년</TableHead>
                  <TableHead className="w-16 text-center">합반</TableHead>
                  <TableHead className="min-w-[150px] hidden md:table-cell">메타데이터</TableHead>
                  <TableHead className="w-20 text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{section.name}</div>
                      {/* 모바일에서 학년과 메타데이터 표시 */}
                      <div className="sm:hidden text-xs text-muted-foreground mt-1">
                        {section.meta?.grade && `${section.meta.grade}학년`}
                      </div>
                      <div className="md:hidden text-xs text-muted-foreground mt-1">
                        {Object.keys(section.meta).length > 0 && (
                          <span className="bg-muted px-1 rounded">
                            {Object.keys(section.meta).length}개 속성
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    {section.meta?.grade ? `${section.meta.grade}학년` : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {section.is_combined ? (
                      <Badge variant="secondary" className="text-xs">합반</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">일반</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {Object.keys(section.meta).length > 0 ? (
                      <code className="text-xs bg-muted p-1 rounded max-w-xs overflow-hidden block truncate">
                        {JSON.stringify(section.meta)}
                      </code>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(section)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(section.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    등록된 섹션이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}