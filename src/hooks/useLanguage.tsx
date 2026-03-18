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

// ดิกชันนารีเก็บคำแปล
const translations = {
  th: {
    // Dashboard
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
    
    // Leave Request Form
    'leave_request': 'ยื่นคำขอลางาน',
    'submit_leave': 'กรอกรายละเอียดการลางานของคุณ',
    'user_name': 'ชื่อ - นามสกุล',
    'department': 'แผนก',
    'leave_type': 'ประเภทการลา',
    'select_date': 'เลือกวันที่ต้องการลา',
    'click_to_select_date': 'กดเพื่อเลือกวันที่',
    'selected': 'เลือกแล้ว',
    'duration': 'ระยะเวลา',
    'full_day': 'เต็มวัน',
    'half_day': 'ครึ่งวัน',
    'total_duration': 'สรุปการขอลา:',
    'reason': 'เหตุผลการลา',
    'reason_placeholder': 'ระบุเหตุผลการลา...',
    'remaining_quota': 'วันลาคงเหลือ:',
    'quota_exceeded': 'จำนวนวันที่ขอลาเกินโควต้าที่เหลือ',
    'submit_btn': 'ส่งคำขอลางาน',
    'submitting': 'กำลังส่งข้อมูล...',
  },
  en: {
    // Dashboard
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
    
    // Leave Request Form
    'leave_request': 'Leave Request',
    'submit_leave': 'Submit your leave application',
    'user_name': 'Name',
    'department': 'Department',
    'leave_type': 'Leave Type',
    'select_date': 'Select Leave Date',
    'click_to_select_date': 'Click to select date',
    'selected': 'Selected',
    'duration': 'Duration',
    'full_day': 'Full Day',
    'half_day': 'Half Day',
    'total_duration': 'Total duration:',
    'reason': 'Reason',
    'reason_placeholder': 'Describe your reason...',
    'remaining_quota': 'Remaining Quota:',
    'quota_exceeded': 'Requested days exceed remaining quota',
    'submit_btn': 'Submit Request',
    'submitting': 'Submitting...',
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