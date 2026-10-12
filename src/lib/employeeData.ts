import liff from '@line/liff';

// Employee identity is derived from the verified LINE token on the server.
export async function employeeData(action:string,params:Record<string,string>={},signal?:AbortSignal){
 const query=new URLSearchParams({...params,action});
 const response=await fetch(`/api/employee-data?${query}`,{headers:{Authorization:`Bearer ${liff.getAccessToken()||''}`},signal});
 if(!response.ok)throw new Error('Employee data could not be loaded. Please reopen the app in LINE and try again.');
 return response.json();
}
