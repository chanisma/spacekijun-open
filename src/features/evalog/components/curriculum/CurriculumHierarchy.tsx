import React from 'react';
import { Student } from '../../types';
import { Network, Layers, ArrowRight, Check, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSchoolCurriculum } from '../../utils/curriculumUtils';

interface CurriculumHierarchyProps {
  student: Student | null;
}

interface SubjectBoxProps {
  name: string;
  credits?: number;
  isTaken: boolean;
  id: string;
  variant?: 'teal' | 'orange' | 'purple' | 'yellow' | 'red' | 'blue';
}

const SubjectBox: React.FC<SubjectBoxProps> = ({ name, credits, isTaken, id, variant = 'blue' }) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'teal': return isTaken ? 'bg-teal-500 text-white shadow-teal-200' : 'text-teal-700 bg-teal-50/50 border-teal-200';
      case 'orange': return isTaken ? 'bg-orange-500 text-white shadow-orange-200' : 'text-orange-700 bg-orange-50/50 border-orange-200';
      case 'purple': return isTaken ? 'bg-purple-500 text-white shadow-purple-200' : 'text-purple-700 bg-purple-50/50 border-purple-200';
      case 'yellow': return isTaken ? 'bg-amber-400 text-white shadow-amber-200' : 'text-amber-700 bg-amber-50/50 border-amber-200';
      case 'red': return isTaken ? 'bg-rose-500 text-white shadow-rose-200' : 'text-rose-700 bg-rose-50/50 border-rose-200';
      default: return isTaken ? 'bg-brand-500 text-white shadow-brand-200' : 'text-brand-700 bg-brand-50/50 border-brand-200';
    }
  };

  return (
    <div
      id={id}
      className={cn(
        "px-3 py-2.5 rounded-xl text-xs font-medium min-w-[110px] text-center relative transition-all duration-300",
        isTaken ? "shadow-md transform hover:-translate-y-0.5" : "border hover:bg-white hover:shadow-sm",
        getVariantStyles()
      )}
    >
      <div className="flex items-center justify-center gap-1.5">
        {isTaken && <Check size={10} strokeWidth={4} />}
        <span className={cn("tracking-tight", isTaken ? "font-bold" : "font-medium")}>{name}</span>
        {credits && <span className={cn("text-[10px] opacity-80", isTaken ? "font-medium" : "font-normal")}>({credits})</span>}
      </div>
    </div>
  );
};

const HierarchyStep = ({
  title,
  color,
  children,
  isLast = false
}: {
  title: string;
  color: 'teal' | 'orange' | 'purple' | 'yellow' | 'red';
  children: React.ReactNode;
  isLast?: boolean;
}) => {
  const colorStyles = {
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    yellow: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
  };

  const badgeStyles = {
    teal: 'bg-teal-100/80 text-teal-700',
    orange: 'bg-orange-100/80 text-orange-700',
    purple: 'bg-purple-100/80 text-purple-700',
    yellow: 'bg-amber-100/80 text-amber-700',
    red: 'bg-rose-100/80 text-rose-700',
  };

  return (
    <div className="flex items-start">
      <div className="flex flex-col items-center gap-4">
        <span className={cn(
          "px-3 py-1 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-sm",
          badgeStyles[color]
        )}>
          {title}
        </span>
        <div className={cn(
          "flex flex-col gap-3 border rounded-2xl p-3 shadow-inner min-w-[130px]",
          colorStyles[color]
        )}>
          {children}
        </div>
      </div>
      {!isLast && (
        <div className="h-full pt-16 mx-4 text-slate-300">
          <ArrowRight size={20} className="stroke-2 opacity-50" />
        </div>
      )}
    </div>
  );
};

const CurriculumHierarchy: React.FC<CurriculumHierarchyProps> = ({ student }) => {

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
          <Network size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">학생을 선택해주세요</p>
      </div>
    );
  }

  // 교육과정 정보 가져오기
  const admissionYear = student.section1_personal_info?.admissionYear;
  const curriculum = getSchoolCurriculum('샘플고등학교', admissionYear ? parseInt(admissionYear) : undefined);

  // 학생이 수강한 과목 목록 (띄어쓰기 제거하여 저장)
  const takenSubjects = new Set(
    student?.section6_academic_development?.map((g) => g.subject.replace(/\s+/g, '')) || []
  );

  // 띄어쓰기를 무시하고 과목 수강 여부 확인하는 헬퍼 함수
  const hasSubject = (subjectName: string): boolean => {
    const normalized = subjectName.replace(/\s+/g, '');
    return takenSubjects.has(normalized);
  };

  // 교육과정 유형 판별 (2025년 이후 vs 이전)
  const isCurriculum2025Plus = (): boolean => {
    if (curriculum?.academicYear) {
      return curriculum.academicYear >= 2025;
    }
    const subjects = Array.from(takenSubjects);
    const has2025Subjects = subjects.some(s =>
      s.includes('공통수학1') || s.includes('공통수학2') ||
      s.includes('공통국어1') || s.includes('공통영어1')
    );
    if (has2025Subjects) return true;
    const hasPreCurriculumSubjects = subjects.some(s =>
      s === '수학' || s === '수학Ⅰ' || s === '수학Ⅱ' ||
      s === '물리학Ⅰ' || s === '화학Ⅰ' || s === '생명과학Ⅰ'
    );
    if (hasPreCurriculumSubjects) return false;
    return true;
  };

  const is2025Plus = isCurriculum2025Plus();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 bg-indigo-50/30 border-indigo-100/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-100/50 text-indigo-600 rounded-lg shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm mb-1">
              과목 위계도 가이드 {is2025Plus ? <span className="text-indigo-600">(2025 개정 교육과정 기준)</span> : <span className="text-slate-500">(2015 개정 교육과정 기준)</span>}
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              위계도는 <span className="font-semibold text-slate-700">공통 → 일반 → 진로 → 융합/전문</span> 순서로 이수하는 것이 권장됩니다.
              학생이 이수한 과목은 색상으로 표시되며, 미이수 과목은 흐리게 표시됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 수학 과목 위계 */}
      <div className="glass-panel p-8 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 mb-8 pb-4 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <Network size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">수학 교과 위계</h3>
        </div>

        <div className="min-w-max pb-4">
          <div className="flex items-stretch">
            {is2025Plus ? (
              // 2025+ 교육과정
              <>
                <HierarchyStep title="공통과목" color="teal">
                  <SubjectBox id="math-common" name="공통수학1" credits={4} isTaken={hasSubject('공통수학1')} variant="teal" />
                  <SubjectBox id="math-common2" name="공통수학2" credits={4} isTaken={hasSubject('공통수학2')} variant="teal" />
                  <SubjectBox id="math-basic1" name="기본수학1" credits={4} isTaken={hasSubject('기본수학1')} variant="teal" />
                  <SubjectBox id="math-basic2" name="기본수학2" credits={4} isTaken={hasSubject('기본수학2')} variant="teal" />
                </HierarchyStep>
                <HierarchyStep title="일반선택" color="orange">
                  <SubjectBox id="math-algebra" name="대수" credits={4} isTaken={hasSubject('대수')} variant="orange" />
                  <SubjectBox id="math-calculus1" name="미적분Ⅰ" credits={4} isTaken={hasSubject('미적분Ⅰ')} variant="orange" />
                  <SubjectBox id="math-prob" name="확률과 통계" credits={4} isTaken={hasSubject('확률과 통계')} variant="orange" />
                </HierarchyStep>
                <HierarchyStep title="진로선택" color="purple">
                  <SubjectBox id="math-econ" name="경제 수학" credits={3} isTaken={hasSubject('경제 수학')} variant="purple" />
                  <SubjectBox id="math-calculus2" name="미적분Ⅱ" credits={3} isTaken={hasSubject('미적분Ⅱ')} variant="purple" />
                  <SubjectBox id="math-geometry" name="기하" credits={3} isTaken={hasSubject('기하')} variant="purple" />
                  <SubjectBox id="math-ai" name="인공지능 수학" credits={3} isTaken={hasSubject('인공지능 수학')} variant="purple" />
                  <SubjectBox id="math-vocational" name="직무 수학" credits={3} isTaken={hasSubject('직무 수학')} variant="purple" />
                </HierarchyStep>
                <HierarchyStep title="융합선택" color="yellow">
                  <SubjectBox id="math-culture" name="수학과 문화" credits={3} isTaken={hasSubject('수학과 문화')} variant="yellow" />
                  <SubjectBox id="math-practical-stats" name="실용 통계" credits={3} isTaken={hasSubject('실용 통계')} variant="yellow" />
                  <SubjectBox id="math-project" name="수학과제 탐구" credits={3} isTaken={hasSubject('수학과제 탐구')} variant="yellow" />
                </HierarchyStep>
                <HierarchyStep title="전문교과" color="red" isLast>
                  <SubjectBox id="math-advanced" name="전문수학" credits={5} isTaken={hasSubject('전문수학')} variant="red" />
                  <SubjectBox id="math-adv-geo" name="고급 기하" credits={5} isTaken={hasSubject('고급 기하')} variant="red" />
                  <SubjectBox id="math-adv-alg" name="고급 대수" credits={5} isTaken={hasSubject('고급 대수')} variant="red" />
                  <SubjectBox id="math-adv-calc" name="고급 미적분" credits={5} isTaken={hasSubject('고급 미적분')} variant="red" />
                </HierarchyStep>
              </>
            ) : (
              // 2015 개정 교육과정
              <>
                <HierarchyStep title="공통과목" color="teal">
                  <SubjectBox id="math-common-old" name="수학" credits={8} isTaken={hasSubject('수학')} variant="teal" />
                </HierarchyStep>
                <HierarchyStep title="일반선택" color="orange">
                  <SubjectBox id="math-1-old" name="수학Ⅰ" credits={5} isTaken={hasSubject('수학Ⅰ')} variant="orange" />
                  <SubjectBox id="math-2-old" name="수학Ⅱ" credits={5} isTaken={hasSubject('수학Ⅱ')} variant="orange" />
                  <SubjectBox id="math-calculus-old" name="미적분" credits={5} isTaken={hasSubject('미적분')} variant="orange" />
                  <SubjectBox id="math-prob-old" name="확률과 통계" credits={5} isTaken={hasSubject('확률과 통계')} variant="orange" />
                </HierarchyStep>
                <HierarchyStep title="진로선택" color="purple">
                  <SubjectBox id="math-geometry-old" name="기하" credits={5} isTaken={hasSubject('기하')} variant="purple" />
                  <SubjectBox id="math-practical-old" name="실용 수학" credits={5} isTaken={hasSubject('실용 수학')} variant="purple" />
                  <SubjectBox id="math-econ-old" name="경제 수학" credits={5} isTaken={hasSubject('경제 수학')} variant="purple" />
                  <SubjectBox id="math-project-old" name="수학과제 탐구" credits={5} isTaken={hasSubject('수학과제 탐구')} variant="purple" />
                  <SubjectBox id="math-basic-old" name="기본 수학" credits={5} isTaken={hasSubject('기본 수학')} variant="purple" />
                  <SubjectBox id="math-ai-old" name="인공지능 수학" credits={5} isTaken={hasSubject('인공지능 수학')} variant="purple" />
                </HierarchyStep>
                <HierarchyStep title="전문교과" color="red" isLast>
                  <SubjectBox id="math-deep1-old" name="심화 수학Ⅰ" credits={5} isTaken={hasSubject('심화 수학Ⅰ')} variant="red" />
                  <SubjectBox id="math-deep2-old" name="심화 수학Ⅱ" credits={5} isTaken={hasSubject('심화 수학Ⅱ')} variant="red" />
                  <SubjectBox id="math-adv1-old" name="고급 수학Ⅰ" credits={5} isTaken={hasSubject('고급 수학Ⅰ')} variant="red" />
                  <SubjectBox id="math-adv2-old" name="고급 수학Ⅱ" credits={5} isTaken={hasSubject('고급 수학Ⅱ')} variant="red" />
                </HierarchyStep>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 과학 과목 위계 */}
      <div className="glass-panel p-8 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 mb-8 pb-4 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <Layers size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">과학 교과 위계</h3>
        </div>

        <div className="min-w-max pb-4">
          <div className="flex items-stretch">
            {is2025Plus ? (
              // 2025+ 교육과정
              <>
                <HierarchyStep title="공통과목" color="teal">
                  <SubjectBox id="sci-integrated1" name="통합과학1" credits={4} isTaken={hasSubject('통합과학1')} variant="teal" />
                  <SubjectBox id="sci-integrated2" name="통합과학2" credits={4} isTaken={hasSubject('통합과학2')} variant="teal" />
                  <SubjectBox id="sci-exp1" name="과학탐구실험1" credits={1} isTaken={hasSubject('과학탐구실험1')} variant="teal" />
                  <SubjectBox id="sci-exp2" name="과학탐구실험2" credits={1} isTaken={hasSubject('과학탐구실험2')} variant="teal" />
                </HierarchyStep>
                <HierarchyStep title="일반선택" color="orange">
                  <SubjectBox id="sci-physics" name="물리학" credits={4} isTaken={hasSubject('물리학') || hasSubject('물리학 I')} variant="orange" />
                  <SubjectBox id="sci-chemistry" name="화학" credits={4} isTaken={hasSubject('화학') || hasSubject('화학 I')} variant="orange" />
                  <SubjectBox id="sci-biology" name="생명과학" credits={4} isTaken={hasSubject('생명과학') || hasSubject('생명과학 I')} variant="orange" />
                  <SubjectBox id="sci-earth" name="지구과학" credits={3} isTaken={hasSubject('지구과학') || hasSubject('지구과학 I')} variant="orange" />
                </HierarchyStep>
                <HierarchyStep title="진로선택" color="purple">
                  <SubjectBox id="sci-mechanics" name="역학과 에너지" credits={3} isTaken={hasSubject('역학과 에너지')} variant="purple" />
                  <SubjectBox id="sci-electro" name="전자기와 양자" credits={3} isTaken={hasSubject('전자기와 양자')} variant="purple" />
                  <SubjectBox id="sci-matter-energy" name="물질과 에너지" credits={3} isTaken={hasSubject('물질과 에너지')} variant="purple" />
                  <SubjectBox id="sci-chem-world" name="화학 반응의 세계" credits={3} isTaken={hasSubject('화학 반응의 세계')} variant="purple" />
                  <SubjectBox id="sci-cell-metabolism" name="세포와 물질대사" credits={3} isTaken={hasSubject('세포와 물질대사')} variant="purple" />
                  <SubjectBox id="sci-genetics" name="생물의 유전" credits={3} isTaken={hasSubject('생물의 유전')} variant="purple" />
                  <SubjectBox id="sci-earth-system" name="지구시스템과학" credits={3} isTaken={hasSubject('지구시스템과학')} variant="purple" />
                  <SubjectBox id="sci-planetary" name="행성우주과학" credits={3} isTaken={hasSubject('행성우주과학')} variant="purple" />
                </HierarchyStep>
                <HierarchyStep title="융합선택" color="yellow">
                  <SubjectBox id="sci-history-culture" name="과학의 역사와 문화" credits={3} isTaken={hasSubject('과학의 역사와 문화')} variant="yellow" />
                  <SubjectBox id="sci-climate-env" name="기후변화와 환경생태" credits={3} isTaken={hasSubject('기후변화와 환경생태')} variant="yellow" />
                  <SubjectBox id="sci-fusion-inquiry" name="융합과학 탐구" credits={3} isTaken={hasSubject('융합과학 탐구')} variant="yellow" />
                </HierarchyStep>
                <HierarchyStep title="전문교과" color="red" isLast>
                  <SubjectBox id="sci-adv-physics" name="고급 물리학" credits={5} isTaken={hasSubject('고급 물리학')} variant="red" />
                  <SubjectBox id="sci-adv-chemistry" name="고급 화학" credits={5} isTaken={hasSubject('고급 화학')} variant="red" />
                  <SubjectBox id="sci-adv-biology" name="고급 생명과학" credits={5} isTaken={hasSubject('고급 생명과학')} variant="red" />
                  <SubjectBox id="sci-adv-earth" name="고급 지구과학" credits={5} isTaken={hasSubject('고급 지구과학')} variant="red" />
                </HierarchyStep>
              </>
            ) : (
              // 2015 개정 교육과정
              <>
                <HierarchyStep title="공통과목" color="teal">
                  <SubjectBox id="sci-integrated-old" name="통합과학" credits={8} isTaken={hasSubject('통합과학')} variant="teal" />
                  <SubjectBox id="sci-exp-old" name="과학탐구실험" credits={2} isTaken={hasSubject('과학탐구실험')} variant="teal" />
                </HierarchyStep>
                <HierarchyStep title="일반선택" color="orange">
                  <SubjectBox id="sci-physics1-old" name="물리학Ⅰ" credits={5} isTaken={hasSubject('물리학Ⅰ')} variant="orange" />
                  <SubjectBox id="sci-chemistry1-old" name="화학Ⅰ" credits={5} isTaken={hasSubject('화학Ⅰ')} variant="orange" />
                  <SubjectBox id="sci-biology1-old" name="생명과학Ⅰ" credits={5} isTaken={hasSubject('생명과학Ⅰ')} variant="orange" />
                  <SubjectBox id="sci-earth1-old" name="지구과학Ⅰ" credits={5} isTaken={hasSubject('지구과학Ⅰ')} variant="orange" />
                </HierarchyStep>
                <HierarchyStep title="진로선택" color="purple">
                  <SubjectBox id="sci-physics2-old" name="물리학Ⅱ" credits={5} isTaken={hasSubject('물리학Ⅱ')} variant="purple" />
                  <SubjectBox id="sci-chemistry2-old" name="화학Ⅱ" credits={5} isTaken={hasSubject('화학Ⅱ')} variant="purple" />
                  <SubjectBox id="sci-biology2-old" name="생명과학Ⅱ" credits={5} isTaken={hasSubject('생명과학Ⅱ')} variant="purple" />
                  <SubjectBox id="sci-earth2-old" name="지구과학Ⅱ" credits={5} isTaken={hasSubject('지구과학Ⅱ')} variant="purple" />
                  <SubjectBox id="sci-life-old" name="생활과 과학" credits={5} isTaken={hasSubject('생활과 과학')} variant="purple" />
                  <SubjectBox id="sci-fusion-old" name="융합과학" credits={5} isTaken={hasSubject('융합과학')} variant="purple" />
                  <SubjectBox id="sci-history-old" name="과학사" credits={5} isTaken={hasSubject('과학사')} variant="purple" />
                </HierarchyStep>
                <HierarchyStep title="전문교과" color="red" isLast>
                  <SubjectBox id="sci-adv-physics-old" name="고급 물리학" credits={5} isTaken={hasSubject('고급 물리학')} variant="red" />
                  <SubjectBox id="sci-adv-chemistry-old" name="고급 화학" credits={5} isTaken={hasSubject('고급 화학')} variant="red" />
                  <SubjectBox id="sci-adv-biology-old" name="고급 생명과학" credits={5} isTaken={hasSubject('고급 생명과학')} variant="red" />
                  <SubjectBox id="sci-adv-earth-old" name="고급 지구과학" credits={5} isTaken={hasSubject('고급 지구과학')} variant="red" />
                </HierarchyStep>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurriculumHierarchy;
