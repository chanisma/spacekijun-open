import type { ReactNode } from 'react';

export const CURRENT_PRIVACY_POLICY_VERSION = '2026-07-24';
export const CURRENT_PRIVACY_POLICY_EFFECTIVE_DATE = '2026년 7월 24일';

const SCHOOL_PRIVACY_POLICY_URL =
  'https://school.jbedu.kr/kijun/M01010202';
const PIPC_GUIDE_URL =
  'https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000&nttId=12018';

interface PolicySectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

const PolicySection = ({ id, title, children }: PolicySectionProps) => (
  <section id={id} className="scroll-mt-24 space-y-4">
    <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
    <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-[15px]">
      {children}
    </div>
  </section>
);

const PolicyTable = ({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
      <thead className="bg-slate-100 text-slate-800">
        <tr>
          {headers.map((header) => (
            <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 bg-white align-top">
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="min-w-36 px-3 py-3 leading-6">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ImportantBox = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950 sm:p-5">
    {children}
  </div>
);

export const PrivacyPolicyContent = () => {
  return (
    <article className="mx-auto max-w-5xl space-y-12">
      <header className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-700">샘플고등학교 교육정보시스템</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            SPACEKIJUN 개인정보처리방침
          </h1>
          <p className="text-sm text-slate-600">
            버전 {CURRENT_PRIVACY_POLICY_VERSION} · 시행일 {CURRENT_PRIVACY_POLICY_EFFECTIVE_DATE}
          </p>
        </div>

        <p className="text-base leading-8 text-slate-700">
          샘플고등학교(이하 “학교”)는 SPACEKIJUN에서 처리하는 개인정보를
          교육 목적에 필요한 최소 범위에서만 이용하고, 학생의 생활기록부·성적·상담
          및 위기지원 기록을 특히 엄격하게 보호합니다. 이 방침은 학교의{' '}
          <a
            href={SCHOOL_PRIVACY_POLICY_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-700 underline underline-offset-4"
          >
            공식 개인정보처리방침
          </a>
          을 SPACEKIJUN의 실제 처리 흐름에 맞게 구체화한 서비스별 방침입니다.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['학생기록 특별 보호', '생활기록·성적·상담기록은 업무상 필요한 사람만 열람합니다.'],
            ['목적 외 이용 금지', '호기심 열람, 사적 평가, 무단 반출과 공유를 금지합니다.'],
            ['개인 전화번호 미수집', '학생·교사의 개인 휴대전화번호를 저장하지 않습니다.'],
            ['AI 결과 사람의 검토', 'AI 결과만으로 성적·상담·징계 결정을 내리지 않습니다.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <h2 className="text-sm font-bold text-emerald-950">{title}</h2>
              <p className="mt-2 text-xs leading-5 text-emerald-900">{description}</p>
            </div>
          ))}
        </div>

        <nav aria-label="개인정보처리방침 목차" className="rounded-2xl bg-slate-100 p-5">
          <p className="mb-3 text-sm font-bold text-slate-900">목차</p>
          <ol className="grid gap-x-6 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
            {[
              ['controller', '1. 처리자와 적용 범위'],
              ['purpose', '2. 처리 목적과 근거'],
              ['items', '3. 처리 항목과 보유기간'],
              ['student-records', '4. 학생기록 특별 보호 원칙'],
              ['third-party', '5. 제3자 제공'],
              ['processors', '6. 처리위탁·AI·국외 이전'],
              ['destruction', '7. 파기 절차와 방법'],
              ['security', '8. 안전성 확보조치'],
              ['rights', '9. 정보주체의 권리'],
              ['children', '10. 만 14세 미만 이용자'],
              ['cookies', '11. 자동 수집·브라우저 저장'],
              ['contact', '12. 보호책임자·열람청구'],
              ['remedies', '13. 권익침해 구제'],
              ['changes', '14. 방침 변경'],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-emerald-700 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <PolicySection id="controller" title="1. 개인정보처리자와 적용 범위">
        <p>
          개인정보처리자는 샘플고등학교이며, 이 방침은 SPACEKIJUN 웹사이트,
          연결된 데이터베이스·파일 저장소·서버 기능 및 학교가 승인한 연동 서비스에
          적용됩니다. 법령 또는 학교의 최신 공식 방침과 이 방침이 다를 때에는 법령과
          학교 공식 방침을 우선하며, 학생 보호 수준이 더 높은 조항은 그대로 적용합니다.
        </p>
      </PolicySection>

      <PolicySection id="purpose" title="2. 개인정보의 처리 목적과 법적 근거">
        <PolicyTable
          headers={['처리 목적', '주요 내용', '주요 처리 근거']}
          rows={[
            [
              '계정·권한 관리',
              '학교 계정 확인, 역할별 접근권한, 로그인과 보안, 동의 이력 관리',
              '정보주체 동의, 서비스 이용관계, 개인정보 보호법 제15조',
            ],
            [
              '교육과 학사 지원',
              '시간표, 일정, 출결, 과제, 수강신청, 교육활동 운영',
              '초·중등교육법 등 교육 관계 법령, 학교의 교육업무 수행',
            ],
            [
              '학생 성장·진로 지원',
              '학교생활기록, 교과 성취, 비교과 활동, 진로·진학 자료 관리와 분석',
              '초·중등교육법, 학교생활기록 작성 및 관리지침 등',
            ],
            [
              '상담·위기지원',
              '상담, 관찰, 지원계획, 위험 신호 확인과 학생 안전을 위한 후속 조치',
              '교육·학생보호 업무, 법령상 의무, 필요한 경우 별도 동의',
            ],
            [
              '서비스 개선·보안',
              '오류 확인, 접속기록, 감사, 부정접근 방지, 백업과 장애 복구',
              '개인정보 보호법 제29조 및 관련 안전성 확보 의무',
            ],
          ]}
        />
        <p>
          학교는 수집 당시 알린 목적과 합리적으로 관련된 범위를 넘어서 개인정보를
          이용하지 않습니다. 새로운 목적에 이용할 필요가 있으면 법적 근거를 확인하고,
          필요한 경우 별도 안내와 동의를 받습니다.
        </p>
      </PolicySection>

      <PolicySection id="items" title="3. 처리하는 개인정보 항목과 보유기간">
        <PolicyTable
          headers={['구분', '처리 항목', '보유·이용 기간']}
          rows={[
            [
              '계정·프로필',
              '인증 사용자 ID, 학교 이메일, 이름 또는 표시명, 역할, 서명·도장, 로그인·방문 정보',
              '계정 이용 및 재학·재직 기간. 권한 종료·계정 삭제 시 지체 없이 파기하되 법령상 보존분은 분리 보관',
            ],
            [
              '학생 기본정보',
              '학생코드, 이름, 입학연도, 학년·반·번호, 재학상태, 진로, 사진·생년월일(업무상 필요한 경우)',
              '재학 및 해당 교육업무 기간. 졸업생은 접근을 차단하고 이름을 익명화하며 불필요한 사진·생년월일을 삭제',
            ],
            [
              '생활기록·활동',
              '출결, 봉사, 독서, 수상, 창의적 체험활동, 교과·비교과 세부 활동, 행동특성, 진로활동',
              '관계 법령의 학교생활기록 보존기간 및 학교 개인정보파일 보유기간',
            ],
            [
              '성적·평가',
              '교과 성적, 원점수, 등급, 표준점수, 모의평가, 학업성취 및 분석 결과',
              '성적·학교생활기록 관련 법정 보유기간 또는 해당 교육업무 종료 시까지',
            ],
            [
              '상담·학생지원',
              '상담 내용, 관찰·지원 기록, 위험도·위기 태그, 후속 조치. 내용에 건강·심리 등 민감정보가 포함될 수 있음',
              '상담·학생지원 목적 달성 및 학교 기록관리 기준에 따른 기간까지, 이후 삭제 또는 익명화',
            ],
            [
              '문서·협업',
              '사용자가 올린 문서와 추출 텍스트, 게시물, 댓글, 일정, 과제, 서명, 요청·승인 내역',
              '해당 업무·프로젝트 및 계정 이용 기간, 또는 관계 법령·학교 기록관리 기준에 따른 기간',
            ],
            [
              '동의·보안기록',
              '방침 버전, 동의 시각, 필수 확인 항목, 접속·변경·오류·감사 기록',
              '동의 이력은 계정 삭제 시까지, 보안기록은 법령 및 학교 내부관리계획에 따른 기간',
            ],
            [
              '자동 생성 정보',
              'IP 주소, 접속시각, 브라우저·기기 정보, 인증 세션 식별자 등 서비스 운영 과정에서 생성되는 정보',
              '보안·장애 대응에 필요한 최소 기간 또는 관계 법령에서 정한 기간',
            ],
          ]}
        />
        <ImportantBox>
          <strong>개인 전화번호 미수집 원칙:</strong> SPACEKIJUN은 학생과 교사의 개인
          휴대전화번호를 수집하거나 데이터베이스에 저장하지 않습니다. 학교 대표번호,
          교무실·행정실 등 공개된 업무 연락처는 개인 전화번호와 구분하여 처리할 수 있습니다.
        </ImportantBox>
      </PolicySection>

      <PolicySection id="student-records" title="4. 생활기록부·성적·상담기록 특별 보호 원칙">
        <ImportantBox>
          생활기록부, 성적, 상담·위기지원 기록은 학생의 교육기회와 인격에 직접 영향을 줄 수
          있는 고위험 정보입니다. 특히 상담 내용에 포함된 건강·심리·가정환경 정보는
          민감정보로 취급하며 일반 게시물이나 일정정보와 동일하게 다루지 않습니다.
        </ImportantBox>
        <ul className="list-disc space-y-2 pl-5">
          <li>담당 교직원과 본인 등 업무상 필요한 최소 인원에게만 역할별 접근권한을 부여합니다.</li>
          <li>호기심 열람, 사적인 학생 평가, 차별·낙인, 교육 목적과 무관한 검색·분석을 금지합니다.</li>
          <li>화면 캡처, 개인 USB·개인 클라우드 저장, 개인 메신저 전송, 무단 인쇄·다운로드를 금지합니다.</li>
          <li>다른 학생의 정보가 섞인 자료는 그대로 학생·보호자에게 제공하지 않고 필요한 부분만 분리합니다.</li>
          <li>AI 분석에는 목적 달성에 필요한 최소 내용만 사용하고 이름·학생코드 등 직접 식별정보를 우선 제거하거나 가명화합니다.</li>
          <li>AI 분석 결과는 참고자료이며 교사가 원자료와 맥락을 확인합니다. AI 결과만으로 성적, 상담, 징계, 진학 결정을 하지 않습니다.</li>
          <li>권한 오남용이나 유출 의심을 발견하면 즉시 개인정보보호 담당자에게 알리고 추가 열람·전송을 중단합니다.</li>
        </ul>
      </PolicySection>

      <PolicySection id="third-party" title="5. 개인정보의 제3자 제공">
        <p>
          학교는 원칙적으로 SPACEKIJUN 개인정보를 제3자에게 제공하지 않습니다. 다만
          정보주체의 별도 동의가 있거나, 법률에 특별한 규정이 있거나, 학생의 생명·신체에
          급박한 위험을 막기 위해 필요한 경우 등 개인정보 보호법이 허용하는 범위에서
          최소 항목만 제공합니다.
        </p>
        <p>
          실제 제3자 제공이 발생한 경우 제공받는 자, 목적, 항목, 보유기간과 법적 근거를
          학교의 제3자 제공 공개 자료 또는 별도 안내에서 확인할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="processors" title="6. 개인정보 처리위탁, AI 처리 및 국외 이전">
        <p>
          서비스 운영을 위해 아래 사업자의 클라우드·API를 이용할 수 있습니다. 학교는
          위탁계약 또는 서비스 설정을 통해 목적 외 처리 금지, 접근 제한, 재위탁 관리,
          안전조치와 파기를 확인해야 합니다. 실제 사용하지 않는 기능에는 개인정보를
          전송하지 않습니다.
        </p>
        <PolicyTable
          headers={['수탁자·서비스', '업무와 이전 항목', '처리 지역·시점', '보유 기준']}
          rows={[
            [
              'Supabase Inc.',
              '인증, 데이터베이스, 파일 저장, 서버 기능. 계정정보와 서비스에 저장한 교육정보',
              '대한민국 서울 리전을 기본으로 하며, 계정·지원 운영 과정에서 국외 처리가 발생할 수 있음. 서비스 이용 시 암호화 전송',
              '서비스 계약 및 각 개인정보파일 보유기간까지',
            ],
          ]}
        />
        <ul className="list-disc space-y-2 pl-5">
          <li>식별 가능한 생활기록부 전체, 상담 원문, 건강·징계·위기정보를 AI에 무분별하게 입력해서는 안 됩니다.</li>
          <li>국외 이전이나 AI 처리를 거부할 수 있으며, 해당 연동·AI 기능은 제한될 수 있습니다. 법정 학교기록 열람 등 핵심 권리행사는 제한되지 않습니다.</li>
          <li>수탁자, 처리 국가, 항목 또는 보유기간이 달라지면 이 방침을 먼저 변경·고지하고 법에서 요구하는 조치를 합니다.</li>
        </ul>
      </PolicySection>

      <PolicySection id="destruction" title="7. 개인정보의 파기 절차와 방법">
        <p>
          보유기간이 끝나거나 처리 목적이 달성되면 개인정보보호 책임자의 관리 아래 지체
          없이 파기합니다. 법령에 따라 계속 보존해야 하는 정보는 다른 정보와 분리하여
          보관하고 해당 목적 외로 이용하지 않습니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>데이터베이스와 전자파일은 복구가 곤란한 방식으로 삭제하고, 백업본은 정해진 백업 주기에 따라 만료시킵니다.</li>
          <li>종이 출력물과 이동식 매체는 분쇄·소각하거나 물리적으로 복구할 수 없도록 폐기합니다.</li>
          <li>졸업생 데이터는 계정 접근 차단, 이름 익명화, 불필요한 사진·생년월일 삭제 등 재식별 위험을 줄이는 조치를 합니다.</li>
        </ul>
      </PolicySection>

      <PolicySection id="security" title="8. 개인정보의 안전성 확보조치">
        <ul className="list-disc space-y-2 pl-5">
          <li>역할과 담당업무에 따른 최소 권한, 데이터베이스 행 수준 접근통제(RLS), 관리자 기능 분리를 적용합니다.</li>
          <li>전송구간 암호화, 인증 세션 보호, 중요 변경기록과 접속기록 관리, 정기적인 권한 점검을 실시합니다.</li>
          <li>개인정보취급자 교육, 비밀유지, 퇴직·업무변경 시 권한 회수, 유출사고 대응 절차를 운영합니다.</li>
          <li>백업, 취약점 점검, 수탁자 관리·감독 등 기술적·관리적 보호조치를 시행합니다.</li>
        </ul>
        <p>
          이용자는 계정을 공유하지 말고, 화면을 열어 둔 채 자리를 비우지 않으며, 의심스러운
          접근이나 잘못 공개된 학생정보를 발견하면 즉시 담당자에게 알려야 합니다.
        </p>
      </PolicySection>

      <PolicySection id="rights" title="9. 정보주체와 법정대리인의 권리·행사방법">
        <p>
          정보주체는 자신의 개인정보에 대해 열람, 정정·삭제, 처리정지, 동의 철회 및
          설명을 요구할 수 있습니다. 본인 또는 적법한 대리인임을 확인한 뒤 원칙적으로
          10일 이내에 처리 결과를 안내합니다.
        </p>
        <p>
          다만 법령에서 수집·보존하도록 정한 학교생활기록, 진행 중인 성적 평가, 다른 사람의
          권리와 안전을 침해할 수 있는 상담 내용 등은 열람 범위가 제한되거나 삭제·처리정지
          요구가 받아들여지지 않을 수 있으며, 이 경우 이유와 이의제기 방법을 안내합니다.
        </p>
        <p>
          SPACEKIJUN 이용 동의 철회와 계정 삭제는 개인정보보호 담당자에게 요청할 수 있습니다.
          동의를 철회하면 사이트 이용은 중단되지만, 법령상 보존해야 하는 학교기록까지
          자동으로 삭제되는 것은 아닙니다.
        </p>
      </PolicySection>

      <PolicySection id="children" title="10. 만 14세 미만 이용자의 개인정보 처리">
        <p>
          SPACEKIJUN은 고등학교 구성원을 위한 서비스입니다. 만 14세 미만 이용자는 스스로
          동의하여 사이트를 이용할 수 없으며, 학교가 법정대리인의 동의를 별도 절차로
          확인한 경우에만 계정을 사용할 수 있습니다. 법정대리인 확인을 위해 필요한 정보도
          최소한으로 수집하며, 확인 목적이 끝나면 파기합니다.
        </p>
      </PolicySection>

      <PolicySection id="cookies" title="11. 자동 수집 장치와 브라우저 저장정보">
        <p>
          로그인 상태 유지와 보안을 위해 인증 토큰 등 필수 정보를 쿠키 또는 브라우저
          저장공간에 저장할 수 있습니다. 화면 설정 등 편의 정보가 함께 저장될 수 있으나,
          행동광고를 위한 추적 쿠키는 운영하지 않습니다.
        </p>
        <p>
          브라우저 설정에서 저장을 차단하거나 삭제할 수 있습니다. 다만 필수 인증정보를
          차단하면 로그인과 주요 기능을 이용할 수 없습니다. 공용 기기에서는 사용 후 반드시
          로그아웃하고 브라우저에 계정정보를 저장하지 마십시오.
        </p>
      </PolicySection>

      <PolicySection id="contact" title="12. 개인정보 보호책임자와 열람청구">
        <PolicyTable
          headers={['구분', '직위·성명', '연락처']}
          rows={[
            ['개인정보 보호책임자', '교장 장채원', '000-0000-0037'],
            ['개인정보 보호담당자·열람청구', '교사 권민결 / 교무실', '000-0000-0032'],
          ]}
        />
        <p>
          주소: 전북특별자치도 전주시 완산구 유연로 133 샘플고등학교
          <br />
          팩스: 000-0000-0040
        </p>
      </PolicySection>

      <PolicySection id="remedies" title="13. 개인정보 권익침해 구제방법">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            개인정보침해 신고센터:{' '}
            <a href="https://privacy.kisa.or.kr" target="_blank" rel="noreferrer" className="text-emerald-700 underline">
              privacy.kisa.or.kr
            </a>{' '}
            / 국번 없이 118
          </li>
          <li>
            개인정보분쟁조정위원회:{' '}
            <a href="https://www.kopico.go.kr" target="_blank" rel="noreferrer" className="text-emerald-700 underline">
              kopico.go.kr
            </a>{' '}
            / 1833-6972
          </li>
          <li>
            개인정보 포털:{' '}
            <a href="https://www.privacy.go.kr" target="_blank" rel="noreferrer" className="text-emerald-700 underline">
              privacy.go.kr
            </a>
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="changes" title="14. 개인정보처리방침의 변경">
        <p>
          이 방침은 {CURRENT_PRIVACY_POLICY_EFFECTIVE_DATE}부터 시행합니다. 처리 목적,
          학생기록 범위, 수탁자·국외 이전, 정보주체의 권리처럼 중요한 내용이 바뀌면 시행
          전에 웹사이트에 알리고 새 버전을 게시합니다. 동의가 필요한 변경은 기존 사용자와
          신규 사용자 모두 새 방침에 동의한 뒤 사이트를 이용하도록 합니다.
        </p>
        <p>
          방침 작성 기준:{' '}
          <a
            href={PIPC_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 underline underline-offset-4"
          >
            개인정보보호위원회 개인정보 처리방침 작성지침(2026.4. 개정)
          </a>
        </p>
      </PolicySection>
    </article>
  );
};
