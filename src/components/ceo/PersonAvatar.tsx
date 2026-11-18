import {useState} from 'react';

const initialsOf=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('');

export default function PersonAvatar({name,pictureUrl,className='w-11 h-11',tone='bg-cyan-100 text-cyan-800'}:{name:string;pictureUrl?:string|null;className?:string;tone?:string}){
 const [failed,setFailed]=useState(false);
 if(pictureUrl&&!failed)return <img src={pictureUrl} alt="" aria-hidden referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailed(true)} className={`shrink-0 rounded-full object-cover bg-slate-100 ${className}`}/>;
 return <span aria-hidden className={`shrink-0 rounded-full grid place-items-center font-semibold ${tone} ${className}`}>{initialsOf(name)}</span>;
}
