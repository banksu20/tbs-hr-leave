import type { ReactNode } from 'react';
import tbsLogo from '@/image/TBS-Logo.png';

export default function DashboardHeader({navigation, account, year, actions}: {
  navigation?: ReactNode; account?: ReactNode; year?: ReactNode; actions?: ReactNode;
}) {
  return <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white shadow-sm">
    <div className="h-1 bg-gradient-to-r from-[#00B5E2] via-[#F5A623] to-[#68BD24]"/>
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-white p-1.5"><img src={tbsLogo} alt="TBS Logo" className="h-7 w-auto"/></div>
          <div><h1 className="text-base font-extrabold tracking-tight">TBS HR</h1><p className="hidden text-[11px] text-slate-400 sm:block">Leave management</p></div>
          {year && <div className="ml-1 border-l border-slate-700 pl-3">{year}</div>}
        </div>
        {navigation && <div className="order-3 shrink-0 xl:order-none">{navigation}</div>}
        {actions && <div className="order-4 xl:order-none xl:ml-auto">{actions}</div>}
        {account && <div className={`ml-auto shrink-0 ${actions ? 'xl:ml-0' : ''}`}>{account}</div>}
    </div>
  </header>;
}
