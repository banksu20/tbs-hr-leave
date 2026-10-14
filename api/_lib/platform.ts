// Structural types for Vercel's Node request/response objects. These imports are
// type-only; deploying the handlers does not require the Vercel CLI build toolchain.
import type {IncomingMessage,ServerResponse} from 'node:http';
export type VercelRequest=IncomingMessage & {
 query:Record<string,string|string[]>;
 cookies:Record<string,string>;
 // Match the platform's parsed body; each handler validates its own payload.
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 body:any;
};
export type VercelResponse=ServerResponse & {
 send:(body:unknown)=>VercelResponse;
 json:(body:unknown)=>VercelResponse;
 status:(statusCode:number)=>VercelResponse;
 redirect:(statusOrUrl:string|number,url?:string)=>VercelResponse;
};
