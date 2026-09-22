import type { MonthlyReport } from './monthlyReport';
import { monthlyReportDocument } from './monthlyReportPdf';

let fontData: Promise<Record<string,string>> | undefined;
async function fonts() {
  if(!fontData) fontData=Promise.all(['Sarabun-Regular.ttf','Sarabun-Bold.ttf'].map(async name=>{
    const response=await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
    if(!response.ok)throw Error('Could not load the PDF font. Retry the download.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return [name,btoa(binary)] as const;
  })).then(entries=>Object.fromEntries(entries)).catch(error=>{fontData=undefined;throw error;});
  return fontData;
}
export async function downloadReportPdf(report: MonthlyReport) {
  // Load the PDF engine on demand; HR data stays in this browser.
  const [{default:pdfMake},vfs]=await Promise.all([import('pdfmake/build/pdfmake'),fonts()]);
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({Sarabun:{normal:'Sarabun-Regular.ttf',bold:'Sarabun-Bold.ttf',italics:'Sarabun-Regular.ttf',bolditalics:'Sarabun-Bold.ttf'}});
  await pdfMake.createPdf(monthlyReportDocument(report)).download(report.filename.replace(/\.csv$/,'.pdf'));
}
