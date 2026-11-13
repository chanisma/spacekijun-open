export const SUBJECT_PREREQUISITES: Record<string, string[]> = {
  '미적분Ⅰ': ['수학Ⅱ'],
  '미적분Ⅱ': ['미적분Ⅰ'],
  '기하': ['수학Ⅰ'],
  '물리학Ⅱ': ['물리학'],
  '전자기와 양자': ['물리학'],
  '역학과 에너지': ['물리학'],
  '화학Ⅱ': ['화학'],
  '화학 반응의 세계': ['화학'],
  '물질과 에너지': ['화학'],
  '생명과학Ⅱ': ['생명과학'],
  '생물의 유전': ['생명과학'],
  '고급 생명과학': ['생명과학Ⅱ'],
  '세포와 물질대사': ['생명과학'],
  '지구과학Ⅱ': ['지구과학'],
  '행성우주과학': ['지구과학'],
  '지구시스템과학': ['지구과학'],
};

export interface PrerequisiteCheck {
  subject: string;
  missing: string[];
  satisfied: boolean;
}

export function checkPrerequisites(
  subject: string,
  takenSubjects: Set<string>
): PrerequisiteCheck {
  const required = SUBJECT_PREREQUISITES[subject] ?? [];
  const missing = required.filter((p) => !takenSubjects.has(p));
  return { subject, missing, satisfied: missing.length === 0 };
}

export function checkAllPrerequisites(
  selectedSubjects: string[]
): PrerequisiteCheck[] {
  const taken = new Set(selectedSubjects);
  return selectedSubjects
    .map((s) => checkPrerequisites(s, taken))
    .filter((c) => !c.satisfied);
}
