import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'th' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: keyof typeof translations['th']) => string; // ฟังก์ชันสำหรับแปลคำ
}

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
    'personal_leave': 'ลากิจ',

    // Reject Form
    'reject_action': 'รายการปฏิเสธ',
    'reject_title': 'ปฏิเสธการลางาน',
    'reject_desc': 'กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อแจ้งให้พนักงานทราบ',
    'emp_name': 'พนักงาน:',
    'leave_date': 'วันที่:',
    'leave_duration': 'จำนวนวัน:',
    'leave_reason': 'เหตุผลการลา:',
    'reason_label': 'เหตุผลที่ปฏิเสธ',

    'reject_reason_placeholder': 'กรุณาใส่เหตุผลที่ไม่อนุมัติที่นี่...',
    'cancel_btn': 'ยกเลิก',
    'confirm_reject_btn': 'ยืนยันการปฏิเสธ',
    'enter_reason_alert': 'กรุณาระบุเหตุผล',
    'success_alert': 'ส่งข้อมูลสำเร็จ กรุณาปิดหน้าต่างนี้',


    // Team Calendar
    'team_calendar': 'ปฏิทินลางานของทีม',
    'team_calendar_desc': 'ปฏิทินทีม:',
    'view_list': 'ดูรายชื่อ',
    'no_leave_today': 'ไม่มีใครลาในวันนี้ แผนกอยู่ครบ!',
    'date_label': 'วันที่',
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
    'personal_leave': 'Personal Leave',

    // Reject Form
    'reject_action': 'Reject Action',
    'reject_title': 'Reject Leave Request',
    'reject_desc': 'Please specify the reason for not approving this request.',
    'emp_name': 'Employee:',
    'leave_date': 'Date:',
    'leave_duration': 'Duration:',
    'leave_reason': 'Reason:',
    'reason_label': 'Reason for rejection',

    'reject_reason_placeholder': 'Enter the reason for rejection here...',
    'cancel_btn': 'Cancel',
    'confirm_reject_btn': 'Confirm Reject',
    'enter_reason_alert': 'Please enter a reason',
    'success_alert': 'Success! You can close this window.',

    'team_calendar': 'Team Leave Calendar',
    'team_calendar_desc': 'Team Calendar:',
    'view_list': 'View List',
    'no_leave_today': 'No one is on leave today. The whole team is here!',
    'date_label': 'Date',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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