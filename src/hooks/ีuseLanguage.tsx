import React, { createContext, useContext, useState, useEffect } from 'react';

// กำหนดประเภทภาษาที่มี
type Language = 'th' | 'en';

// สร้างโครงสร้าง Context
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: keyof typeof translations['th']) => string; // ฟังก์ชันสำหรับแปลคำ
}

// ดิกชันนารีเก็บคำแปล (เพิ่มคำที่ต้องการแปลไว้ที่นี่)
const translations = {
  th: {
    // คำใน Dashboard
    'leave_history': 'ประวัติการลาล่าสุด',
    'sick_leave': 'ลาป่วย',
    'annual_leave': 'พักร้อน',
    'days': 'วัน',
    'company_holidays': 'ปฏิทินวันหยุดบริษัท',
    'view_calendar': 'ดูปฏิทิน',
    'approved': 'อนุมัติ',
    'rejected': 'ปฏิเสธ',
    'pending': 'รอตรวจ',
    'load_more': 'ดูประวัติเพิ่มเติม',
    'show_less': 'แสดงน้อยลง',
    'no_history': 'ยังไม่มีประวัติการลางาน',
    // คำในหน้ายื่นลา
    'submit_leave': 'ยื่นลางาน',
    'select_date': 'เลือกวันที่ต้องการลา',
    'duration': 'ระยะเวลา',
    'reason': 'เหตุผล',
    'remaining_quota': 'วันลาคงเหลือ',
    'submit_btn': 'ส่งคำขอลางาน',
    'full_day': 'เต็มวัน',
    'half_day': 'ครึ่งวัน',
  },
  en: {
    'leave_history': 'Recent Leave History',
    'sick_leave': 'Sick Leave',
    'annual_leave': 'Annual Leave',
    'days': 'Days',
    'company_holidays': 'Company Holidays',
    'view_calendar': 'View Calendar',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'pending': 'Pending',
    'load_more': 'Load More',
    'show_less': 'Show Less',
    'no_history': 'No leave history yet',
    'submit_leave': 'Submit Leave',
    'select_date': 'Select Leave Date',
    'duration': 'Duration',
    'reason': 'Reason',
    'remaining_quota': 'Remaining Quota',
    'submit_btn': 'Submit Request',
    'full_day': 'Full Day',
    'half_day': 'Half Day',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ดึงค่าภาษาเดิมที่เคยเลือกไว้ ถ้าไม่มีให้เริ่มที่ 'th'
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLang = localStorage.getItem('app_language');
    return (savedLang === 'en' || savedLang === 'th') ? savedLang : 'th';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'th' ? 'en' : 'th');
  };

  // ฟังก์ชันแปลภาษา (ถ้าหาคำไม่เจอ ให้โชว์คีย์นั้นๆ ไปเลย)
  const t = (key: keyof typeof translations['th']) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};