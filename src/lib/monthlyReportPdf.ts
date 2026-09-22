import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { MonthlyReport } from './monthlyReport';

export function monthlyReportDocument(report: MonthlyReport): TDocumentDefinitions {
  const numericTotals=report.types.map(type=>Math.round(report.rows.reduce((sum,row)=>sum+row[type],0)*100)/100);
  const heading=['Employee code','Employee name','Department',...report.types.map(t=>`${t[0].toUpperCase()}${t.slice(1)} days`),'Total days'];
  return {
    pageSize:'A4',pageMargins:[32,32,32,44],
    info:{title:`Monthly leave report - ${report.period}`,author:'TBS HR',subject:'Approved leave totals for selected employees'},
    defaultStyle:{font:'Sarabun',fontSize:9,color:'#334155',lineHeight:1.15},
    content:[
      {text:'TBS HR',fontSize:12,bold:true,color:'#0099c4',margin:[0,0,0,6]},
      {text:`Monthly leave report - ${report.period}`,fontSize:20,bold:true,color:'#0f172a',margin:[0,0,0,8]},
      {text:report.scope,margin:[0,0,0,4]},
      {text:`${report.rows.length} selected employees | ${report.total} approved days`,bold:true,margin:[0,0,0,4]},
      {text:'Approved leave only. Pending and cancelled leave are excluded. Leave reasons are not included.',fontSize:8,color:'#64748b',margin:[0,0,0,14]},
      {table:{headerRows:1,widths:[56,'*',74,...report.types.map(()=>42),44],body:[
        heading.map(text=>({text,bold:true,color:'#ffffff',fillColor:'#0f172a',margin:[0,4,0,4]})),
        ...report.rows.map(row=>[row.employeeCode,row.name,row.department,...report.types.map(type=>({text:String(row[type]),alignment:'right' as const})),{text:String(row.total),alignment:'right' as const,bold:true}]),
        [{text:'Total',bold:true,colSpan:3,fillColor:'#e0f2fe'},{},{},...numericTotals.map(n=>({text:String(n),bold:true,alignment:'right' as const,fillColor:'#e0f2fe'})),{text:String(report.total),bold:true,alignment:'right' as const,fillColor:'#e0f2fe'}],
      ]},layout:{hLineWidth:()=>0.5,vLineWidth:()=>0,hLineColor:()=>'#e2e8f0',paddingTop:()=>5,paddingBottom:()=>5,fillColor:(row:number)=>row>0&&row%2===0?'#f8fafc':null}},
    ],
    footer:(page,count)=>({columns:[{text:`TBS HR | ${report.period}`,alignment:'left'},{text:`Page ${page} of ${count}`,alignment:'right'}],margin:[32,14,32,0],fontSize:8,color:'#64748b'}),
  };
}
