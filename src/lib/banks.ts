export const banks:[string,string][]=[
 ['กสิกรไทย','Kasikorn Bank'],
 ['กรุงเทพ','Bangkok Bank'],
 ['ไทยพาณิชย์','Siam Commercial Bank'],
 ['กรุงไทย','Krungthai Bank'],
 ['กรุงศรีอยุธยา','Krungsri (Bank of Ayudhya)'],
 ['ทหารไทยธนชาต','TMBThanachart Bank'],
 ['ออมสิน','Government Savings Bank'],
 ['ยูโอบี','UOB'],
 ['ซีไอเอ็มบี ไทย','CIMB Thai'],
 ['เกียรตินาคินภัทร','Kiatnakin Phatra Bank'],
 ['แลนด์ แอนด์ เฮ้าส์','LH Bank'],
 ['ธ.ก.ส.','BAAC'],
];
export const bankEn=(th:string)=>banks.find(b=>b[0]===th)?.[1]??th;
export const accountText=(v:string)=>{const d=v.replace(/\D/g,'');return d.length===10?`${d.slice(0,3)}-${d.slice(3,4)}-${d.slice(4,9)}-${d.slice(9)}`:v;};
