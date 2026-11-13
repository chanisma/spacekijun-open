import { PhoneCall } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { CallsDirectory } from '@/components/calls/CallsDirectory';
import { quickDialContacts } from '@/data/extensionDirectory';
import { toTelHref } from '@/lib/callsDirectory';

const Calls = () => {
  return (
    <Layout>
      <PageContainer width="narrow">
        {/* 머리글 = 자주 쓰는 번호 바로 걸기. 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1) */}
        <header
          aria-label="자주 쓰는 번호 바로 걸기"
          className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-700 p-3 shadow-lg shadow-indigo-500/20 sm:p-4"
        >
          <div className="flex flex-wrap gap-2">
              {quickDialContacts.map((contact) => (
                <a
                  key={contact.label}
                  href={toTelHref(contact.phone)}
                  className="group flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm ring-1 ring-white/20 transition-all hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <PhoneCall className="h-3.5 w-3.5 shrink-0 text-indigo-100" />
                  <span className="text-left">
                    <span className="block text-xs font-semibold leading-tight text-white">
                      {contact.label}
                    </span>
                    <span className="block font-mono text-[11px] leading-tight text-indigo-200">
                      {contact.phone}
                    </span>
                  </span>
                </a>
              ))}
          </div>
        </header>

        <CallsDirectory />
      </PageContainer>
    </Layout>
  );
};

export default Calls;
