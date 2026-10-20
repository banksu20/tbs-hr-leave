import React,{useState,useEffect} from "react";
import {LanguageContext,translations,type Language} from "./language-context";
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLang = localStorage.getItem('app_language');
    return (savedLang === 'en' || savedLang === 'th') ? savedLang : 'th';
  });

  useEffect(() => {
    const syncLanguage = (event: StorageEvent) => {
      if (event.key === 'app_language' && (event.newValue === 'en' || event.newValue === 'th')) setLanguageState(event.newValue);
    };
    window.addEventListener('storage', syncLanguage);
    return () => window.removeEventListener('storage', syncLanguage);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'th' ? 'en' : 'th');
  };

  const t = (key: keyof typeof translations['th']) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

