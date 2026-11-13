#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2022.xlsx에서 교육과정 데이터를 추출하여 TypeScript 파일로 변환
"""

import openpyxl

def extract_curriculum_from_xlsx(xlsx_path):
    """xlsx 파일에서 교육과정 추출"""
    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb.active

    subjects = []

    # 행 3: 헤더 1 (과목 영역, 과목, 1학년, 2학년, 3학년 등)
    # 행 4: 헤더 2 (1학기, 2학기)
    # 행 5부터: 데이터

    # 학기별 컬럼 인덱스 (0-based)
    # 행 4를 보면: 1학기(8), 2학기(9), 1학기(10), 2학기(11), 1학기(12), 2학기(13)
    semester_cols = {
        '1-1': 8,   # 1학년 1학기
        '1-2': 9,   # 1학년 2학기
        '2-1': 10,  # 2학년 1학기
        '2-2': 11,  # 2학년 2학기
        '3-1': 12,  # 3학년 1학기
        '3-2': 13   # 3학년 2학기
    }

    # 데이터 행 추출 (행 5부터)
    for row in ws.iter_rows(min_row=5, values_only=True):
        # 컬럼 0: 과목 영역
        # 컬럼 1: 과목 유형
        # 컬럼 2: 과목명

        if not row[2] or str(row[2]).strip() == '':
            continue

        subject_name = str(row[2]).strip()

        # 빈 행이나 합계 행 스킵
        if not subject_name or subject_name in ['합계', '계', '소계', '']:
            continue

        # 학기별 학점 추출
        semesters = {}
        for sem, col_idx in semester_cols.items():
            if col_idx < len(row):
                value = row[col_idx]
                if value and str(value).strip():
                    try:
                        credits = int(value)
                        if credits > 0:
                            semesters[sem] = credits
                    except (ValueError, TypeError):
                        pass

        if semesters:
            # 컬럼 0: 교과 영역, 컬럼 1: 교과(군) - 교과(군)을 사용
            category = str(row[1]).strip() if row[1] else '기타'
            subject_type = str(row[3]).strip() if row[3] and len(row) > 3 else '일반 선택'

            subjects.append({
                'category': category,
                'subject': subject_name,
                'subject_type': subject_type,
                'semesters': semesters
            })

    return subjects

def generate_typescript_file(subjects, output_path):
    """TypeScript 파일 생성"""

    ts_content = """import { SchoolCurriculum } from '../../types';

// 샘플고등학교 2022학년도 입학생 3개년 교육과정
export const jeonjuGijeonGirls2022: SchoolCurriculum = {
  schoolName: '샘플고등학교',
  academicYear: 2022,
  subjects: [
"""

    # 카테고리별로 그룹화
    categorized = {}
    for subj in subjects:
        category = subj['category']
        if category not in categorized:
            categorized[category] = []
        categorized[category].append(subj)

    # 카테고리 순서 (원본 데이터 순서 유지)
    for category in categorized.keys():
        ts_content += f"    // {category}\n"

        for subj in categorized[category]:
            subject_name = subj['subject']
            semesters = subj['semesters']
            total_credits = sum(semesters.values())
            subject_type = subj['subject_type']

            # semesters 객체 생성
            semesters_str = '{ '
            for sem in ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']:
                if sem in semesters:
                    semesters_str += f"'{sem}': {semesters[sem]}, "
            semesters_str = semesters_str.rstrip(', ') + ' }'

            ts_content += f"""    {{
      category: '{category}',
      subject: '{subject_name}',
      subjectType: '{subject_type}',
      selectionGroup: '지정',
      credits: {total_credits},
      semesters: {semesters_str},
      totalCredits: {total_credits},
      minCredits: {total_credits}
    }},
"""

    ts_content += """  ]
};
"""

    # 파일 저장
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f"TypeScript 파일 생성 완료: {output_path}")
    print(f"총 {len(subjects)}개 과목 추출됨")

if __name__ == '__main__':
    xlsx_path = '2022.xlsx'
    output_path = 'src/data/curriculum/jeonju_gijeon_girls_2022.ts'

    print("2022.xlsx 파일 읽는 중...")
    subjects = extract_curriculum_from_xlsx(xlsx_path)

    if subjects:
        print(f"\n추출된 과목 수: {len(subjects)}")
        print("\n처음 10개 과목:")
        for subj in subjects[:10]:
            print(f"  - [{subj['category']}] {subj['subject']}: {subj['semesters']}")

        print("\nTypeScript 파일 생성 중...")
        generate_typescript_file(subjects, output_path)
    else:
        print("과목을 추출하지 못했습니다.")
