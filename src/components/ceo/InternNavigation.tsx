import {useDashboardText} from "@/hooks/useDashboardText";
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, ChevronDown, FileSpreadsheet, History, LayoutGrid, Users, UserPlus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const primary = [
  { id: 'overview', label: 'Overview', Icon: BarChart3 },
  { id: 'roster', label: 'Roster', Icon: LayoutGrid },
  { id: 'records', label: 'Sheet', Icon: FileSpreadsheet },
  { id: 'pending', label: 'Approvals', Icon: CheckCircle2 },
];
const secondary = [
  { id: 'manage', label: 'Manage interns', Icon: Users },
  { id: 'registrations', label: 'Registrations', Icon: UserPlus },
  { id: 'history', label: 'History', Icon: History },
];

export default function InternNavigation({ tab, onChange, pendingCount = 0 }: { tab: string; onChange: (tab: string) => void; pendingCount?: number }) {
 const dt = useDashboardText();

  const registrations = useQuery({
    queryKey: ['intern-registration-count'],
    queryFn: async () => {
      const response = await fetch('/api/registration?review=1', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load registration count');
      const body = await response.json();
      return body.registrations.filter((row: { employment_type: string }) => row.employment_type === 'intern').length as number;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const cancellations = useQuery({
    queryKey: ['cancellations', 'intern'],
    queryFn: async () => {
      const response = await fetch('/api/cancellations?view=boss&cohort=intern', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load pending cancellations');
      return (await response.json()).requests as { id: number }[];
    },
    refetchInterval: 30_000,
  });
  const approvalCount = pendingCount + (cancellations.data?.length ?? 0);
  const selected = secondary.find(item => item.id === tab);
  const count = registrations.data ?? 0;
  const badge = count > 0 ? <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] leading-none" aria-label={dt("{0} pending registrations", [count])}>{count}</span> : null;
  const buttonClass = 'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300';

  return <nav aria-label={dt("Intern dashboard views")} className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-900 p-2">
    {primary.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => onChange(id)} className={`${buttonClass} ${tab === id ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Icon aria-hidden="true" className="hidden h-4 w-4 sm:block"/>{dt(label)}{id === 'pending' && approvalCount > 0 && <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white" aria-label={dt("{0} {1} awaiting approval", [approvalCount, approvalCount === 1 ? 'request' : 'requests'])} role="status">{approvalCount > 99 ? '99+' : approvalCount}</span>}</button>)}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={selected ? dt("More views: {0}", [dt(selected.label)]) : dt("More views")} className={`${buttonClass} ml-auto ${selected ? 'bg-cyan-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          {dt(selected?.label ?? "More")}{badge}<ChevronDown aria-hidden="true" className="h-4 w-4"/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-xl border-slate-700 bg-slate-900 p-1.5 text-slate-200 shadow-xl">
        <DropdownMenuRadioGroup value={tab} onValueChange={onChange}>
          {secondary.map(({ id, label, Icon }) => <DropdownMenuRadioItem key={id} value={id} className="gap-2 rounded-lg py-3 pr-3 focus:bg-slate-800 focus:text-white data-[state=checked]:bg-cyan-500/15 data-[state=checked]:text-cyan-300">
            <Icon aria-hidden="true" className="h-4 w-4"/>{dt(label)}{id === 'registrations' && badge}
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </nav>;
}
