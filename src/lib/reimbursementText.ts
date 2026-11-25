import type {FormRow} from '@/lib/hrAdmin';

export const F={
 company:'The Business SEO Co., Ltd. (Trading as TBS Marketing)',
 address:'No. 1023 TPS Building, Floor 4, Pattanakarn Road, Suanluang Sub District, Suanluang District, Bangkok, 10250 Thailand',
 titleTh:'ใบขอเบิกค่าใช้จ่าย',titleEn:'Reimbursement Form',
 dateTh:'วันที่',dateEn:'Date',meTh:'ข้าพเจ้า',meEn:'I',idTh:'บัตรประชาชนเลขที่',idEn:'Tax ID/Passport No.',posTh:'ตำแหน่ง',posEn:'Position',deptTh:'แผนก',deptEn:'Department',
 certTh:'ขอเบิกค่าใช้จ่ายดังรายละเอียดในตาราง ซึ่งข้าพเจ้ารับรองว่ารายจ่ายที่ขอเบิกข้าพเจ้าได้จ่ายไปในงานของบริษัท เดอะ บิสซิเนส เอสอีโอ จำกัด โดยแท้จริง ซึ่งบางรายการไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้ขายได้',
 certEn:'Request for reimbursement as detailed in the table. I certify that the expenditures requested by me have actually been paid for the work of The Business SEO Co., Ltd., which some items may not collect receipts from the seller.',
 paidTh:['ทั้งนี้ ข้าพเจ้าได้จ่ายเงินไปตั้งแต่วันที่','ถึงวันที่'],paidEn:['In this regard, I have paid the money from the date of','to the date of'],
 colDate:['วัน/เดือน/ปี','Date'],colDetail:['รายละเอียดรายจ่าย/ชื่อร้านค้า','Expense details/Seller name'],colAmount:['จำนวนเงิน(บาท)','Amount (baht)'],colRemark:['หมายเหตุ','Remark'],
 total:'รวมทั้งสิ้น',bankTh:'โดยให้โอนเงินเข้าบัญชี ธนาคาร',noTh:'เลขที่',bankEn:'by transferring money to the account',noEn:'No.',
 signTh:'ลงชื่อ',signEn:'Sign',approveTh:'อนุมัติโดย',approveEn:'Approved by',
 evidence:'หลักฐานการจ่ายเงิน / Payment evidence',pdf:'ไฟล์ PDF · พิมพ์แยกแล้วแนบ / PDF file · print separately and attach',
 kinds:{toll:'ค่าทางด่วน / Toll',parking:'ค่าจอดรถ / Parking',grab:'Grab',taxi:'แท็กซี่ / Taxi',other:'อื่นๆ / Other'} as Record<string,string>,
};
export const thDate=(d:string|null)=>d?new Date(d+'T00:00:00+07:00').toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}):'..........';
export const enDate=(d:string|null)=>d?new Date(d+'T00:00:00+07:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}):'..........';
export const dmy=(d:string|null)=>d?d.split('-').reverse().join('/'):'';
export const num=(v:FormRow['amount'])=>{const n=typeof v==='number'?v:parseFloat(String(v??''));return Number.isFinite(n)?n:0;};
export const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
