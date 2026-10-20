import {useCallback} from "react";
import {useLanguage} from "@/hooks/useLanguage";
import {dashboardText} from "@/lib/dashboardTranslations";
export function useDashboardText() {
 const {language}=useLanguage();
 return useCallback((text: string, values: readonly (string | number)[] = []) => dashboardText(language, text, values), [language]);
}
