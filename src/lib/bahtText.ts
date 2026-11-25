const digits=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const places=['','สิบ','ร้อย','พัน','หมื่น','แสน'];

function group(n:number,higher:boolean){
 const s=String(n);let out='';
 for(let i=0;i<s.length;i++){
  const d=Number(s[i]),pos=s.length-1-i;
  if(d===0)continue;
  if(pos===0&&d===1&&(n>1||higher))out+='เอ็ด';
  else if(pos===1&&d===1)out+='สิบ';
  else if(pos===1&&d===2)out+='ยี่สิบ';
  else out+=digits[d]+places[pos];
 }
 return out;
}

function read(n:number):string{
 if(n===0)return '';
 const parts:number[]=[];let x=n;
 while(x>0){parts.unshift(x%1000000);x=Math.floor(x/1000000);}
 return parts.map((p,i)=>(p?group(p,i>0):'')+(i<parts.length-1?'ล้าน':'')).join('');
}

export function bahtText(value:number){
 if(!Number.isFinite(value))return '';
 const satang=Math.round(Math.abs(value)*100);
 const baht=Math.floor(satang/100),rest=satang%100;
 const sign=value<0&&satang>0?'ลบ':'';
 if(baht===0&&rest===0)return 'ศูนย์บาทถ้วน';
 return sign+(baht?read(baht)+'บาท':'')+(rest?read(rest)+'สตางค์':'ถ้วน');
}
