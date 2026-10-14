// Structural types for Vercel's Node request/response objects. These imports are
// type-only; deploying the handlers does not require the Vercel CLI build toolchain.
import type {IncomingMessage,ServerResponse} from 'node:http';
export type VercelRequest=IncomingMessage & {
 query:Record<string,string|string[]>;
 cookies:Record<string,string>;
 body:any;
};
export type VercelResponse=ServerResponse & {
 send:(body:any)=>VercelResponse;
 json:(body:any)=>VercelResponse;
 status:(statusCode:number)=>VercelResponse;
 redirect:(statusOrUrl:string|number,url?:string)=>VercelResponse;
};
