import {useLanguage} from '@/hooks/useLanguage';
import {useDashboardText} from '@/hooks/useDashboardText';
import {formatSheetDate} from './leaveSheetUtils';

export default function EmployeeStartDate({date}:{date?:string|null}) {
 const {language}=useLanguage();
 const dt=useDashboardText();
 return <span className="inline-block text-xs font-normal whitespace-nowrap">{dt('Start date')}: {date?formatSheetDate(date,language):dt('Not recorded')}</span>;
}
