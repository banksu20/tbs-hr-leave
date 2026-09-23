import {readFileSync} from 'node:fs';
import {planCalendarSync} from '../n8n/js/calendar-projection.mjs';

export const calendarId='50cpt8b361qli1poevjsqrt5vo@group.calendar.google.com';
export const calendarWorkflowId='NV1I1fI5NizJ9cWF';
const base='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events';
const credentials={googleCalendarOAuth2Api:{id:'EXLAgdOmLwN3t8n9',name:'Google Calendar account'}};
export function calendarSyncNodes(){
 const sql=readFileSync(new URL('../n8n/sql/calendar-snapshot.sql',import.meta.url),'utf8');
 return [
  {name:'Check calendar connection',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
  {name:'Sync approved leave every five minutes',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.4,position:[0,240],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
  {name:'Read Staff Leave access',type:'n8n-nodes-base.httpRequest',typeVersion:4.5,position:[250,0],credentials,parameters:{url:'https://www.googleapis.com/calendar/v3/users/me/calendarList/'+encodeURIComponent(calendarId),authentication:'predefinedCredentialType',nodeCredentialType:'googleCalendarOAuth2Api',options:{timeout:30000}}},
  {name:'Read approved leave',type:'n8n-nodes-base.postgres',typeVersion:2.7,position:[500,0],credentials:{postgres:{id:'lDRbc2zyWj5H544z',name:'Postgres account'}},parameters:{operation:'executeQuery',query:sql,options:{queryReplacement:"={{ ['2026-09-23'] }}"}}},
  {name:'Read existing calendar events',type:'n8n-nodes-base.httpRequest',typeVersion:4.5,position:[750,0],credentials,parameters:{url:base,authentication:'predefinedCredentialType',nodeCredentialType:'googleCalendarOAuth2Api',sendQuery:true,queryParameters:{parameters:[
   {name:'timeMin',value:"={{ $('Read approved leave').first().json.startDate + 'T00:00:00+07:00' }}"},
   {name:'timeMax',value:"={{ $('Read approved leave').first().json.endDate + 'T00:00:00+07:00' }}"},
   {name:'timeZone',value:'Asia/Bangkok'},{name:'maxResults',value:'1000'},{name:'singleEvents',value:'true'},{name:'showDeleted',value:'true'}
  ]},options:{timeout:30000,pagination:{pagination:{paginationMode:'updateAParameterInEachRequest',parameters:{parameters:[{type:'qs',name:'pageToken',value:'={{ $response.body.nextPageToken }}'}]},paginationCompleteWhen:'other',completeExpression:'={{ !$response.body.nextPageToken }}',limitPagesFetched:true,maxRequests:100}}}}},
  {name:'Plan approved leave sync',type:'n8n-nodes-base.code',typeVersion:2,position:[1000,0],parameters:{mode:'runOnceForAllItems',jsCode:`${planCalendarSync.toString()}\nconst access=$('Read Staff Leave access').first().json;if(!['writer','owner'].includes(access.accessRole))throw Error('Calendar edit permission required');\nreturn [{json:planCalendarSync($('Read approved leave').first().json,$input.all().map(i=>i.json),{'2':['Ruj']})}];`}},
  {name:'Apply planned changes',type:'n8n-nodes-base.code',typeVersion:2,position:[1250,0],parameters:{mode:'runOnceForAllItems',jsCode:"const plan=$input.first().json;return plan.operations.map(operation=>({json:operation}));"}},
  {name:'Write managed calendar events',type:'n8n-nodes-base.httpRequest',typeVersion:4.5,position:[1500,0],credentials,parameters:{method:'={{ $json.method }}',url:`={{ '${base}' + ($json.method==='POST'?'':'/'+encodeURIComponent($json.id)) }}`,authentication:'predefinedCredentialType',nodeCredentialType:'googleCalendarOAuth2Api',sendQuery:true,queryParameters:{parameters:[{name:'sendUpdates',value:'none'}]},sendHeaders:true,specifyHeaders:'json',jsonHeaders:"={{ JSON.stringify($json.etag ? {'If-Match':$json.etag} : {}) }}",sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.body) }}',options:{timeout:30000,batching:{batch:{batchSize:1,batchInterval:300}},response:{response:{fullResponse:true,neverError:true}}}}},
  {name:'Check calendar write results',type:'n8n-nodes-base.code',typeVersion:2,position:[1750,0],parameters:{mode:'runOnceForAllItems',jsCode:"const results=$input.all();const failures=results.filter(i=>i.json.statusCode<200||i.json.statusCode>=300||!i.json.statusCode);if(failures.length)throw Error('Calendar sync incomplete: '+failures.map(i=>String(i.json.statusCode||'network error')).join(',')+'. No source records changed; next run retries from current state.');return [{json:{saved:results.length,skipped:$('Plan approved leave sync').first().json.skipped.length,warnings:$('Plan approved leave sync').first().json.warnings}}];"}}
 ];
}
export const calendarSyncConnections=[
 ['Check calendar connection','Read Staff Leave access'],['Sync approved leave every five minutes','Read Staff Leave access'],
 ['Read Staff Leave access','Read approved leave'],['Read approved leave','Read existing calendar events'],['Read existing calendar events','Plan approved leave sync'],
 ['Plan approved leave sync','Apply planned changes'],['Apply planned changes','Write managed calendar events'],['Write managed calendar events','Check calendar write results']
];
