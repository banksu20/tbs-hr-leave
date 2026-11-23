export interface Place {lat:number;lng:number;label:string}
export class MapsError extends Error {constructor(public status:number,message:string){super(message);}}
const KEY=()=>process.env.GOOGLE_MAPS_API_KEY||'';
const TIMEOUT=8000;
const LINK_HOSTS=/^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;
const valid=(lat:number,lng:number)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);

async function timed(url:string,init:RequestInit={}){
 const c=new AbortController();const t=setTimeout(()=>c.abort(),TIMEOUT);
 try{return await fetch(url,{...init,signal:c.signal});}finally{clearTimeout(t);}
}

export function coordsFromText(text:string):{lat:number;lng:number}|null{
 const s=decodeURIComponent(text);
 const pats=[/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,/[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/];
 for(const p of pats){const m=s.match(p);if(m){const lat=Number(m[1]),lng=Number(m[2]);if(valid(lat,lng))return {lat,lng};}}
 return null;
}

function placeName(url:URL){
 const m=url.pathname.match(/\/maps\/place\/([^/]+)/);
 if(m)return decodeURIComponent(m[1].replace(/\+/g,' '));
 return url.searchParams.get('q')||url.searchParams.get('query')||'';
}

async function expandLink(raw:string){
 let url=new URL(raw);
 for(let i=0;i<5;i++){
  if(url.protocol!=='https:'||!LINK_HOSTS.test(url.hostname))throw new MapsError(422,'Paste a Google Maps link, an address or a place name.');
  if(!/^(maps\.app\.goo\.gl|goo\.gl)$/i.test(url.hostname))return url;
  const r=await timed(url.toString(),{redirect:'manual'});
  const next=r.headers.get('location');if(!next)throw new MapsError(422,'This Google Maps link could not be opened.');
  url=new URL(next,url);
 }
 throw new MapsError(422,'This Google Maps link could not be opened.');
}

async function geocode(params:Record<string,string>):Promise<Place[]>{
 if(!KEY())throw new MapsError(503,'Maps are not set up yet. Please tell HR.');
 const q=new URLSearchParams({...params,key:KEY(),region:'th',language:'th'});
 const r=await timed(`https://maps.googleapis.com/maps/api/geocode/json?${q}`);
 const b=await r.json().catch(()=>({})) as {status?:string;results?:{formatted_address:string;geometry:{location:{lat:number;lng:number}}}[]};
 if(b.status==='ZERO_RESULTS')return [];
 if(!r.ok||b.status!=='OK')throw new MapsError(503,'Maps are not available right now. Please try again.');
 return (b.results??[]).slice(0,5).map(x=>({lat:x.geometry.location.lat,lng:x.geometry.location.lng,label:x.formatted_address.slice(0,300)}));
}

export async function findPlaces(query:string):Promise<Place[]>{
 const text=query.trim();
 const direct=coordsFromText(text);
 if(direct)return [{...direct,label:`${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`}];
 if(/^https?:\/\//i.test(text)){
  const url=await expandLink(text);
  const c=coordsFromText(url.toString());const name=placeName(url);
  if(c){
   const near=await geocode({latlng:`${c.lat},${c.lng}`}).catch(()=>[]);
   return [{...c,label:(name||near[0]?.label||`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`).slice(0,300)}];
  }
  if(name)return geocode({address:name});
  throw new MapsError(422,'This Google Maps link has no location. Try the address instead.');
 }
 return geocode({address:text});
}

export async function routeKm(from:{lat:number;lng:number},to:{lat:number;lng:number}):Promise<number>{
 if(!KEY())throw new MapsError(503,'Maps are not set up yet. Please tell HR.');
 const point=(p:{lat:number;lng:number})=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
 const r=await timed('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY(),'X-Goog-FieldMask':'routes.distanceMeters'},
  body:JSON.stringify({origin:point(from),destination:point(to),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',units:'METRIC'})});
 const b=await r.json().catch(()=>({})) as {routes?:{distanceMeters?:number}[]};
 if(!r.ok)throw new MapsError(503,'Could not measure the distance right now. Please try again.');
 const m=b.routes?.[0]?.distanceMeters;
 if(m===undefined)return 0;
 return Math.round(m/10)/100;
}
