import type { FinanceData, LanguageCode, Theme, User } from '../features/finance/types';

const apiBase = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
let csrfToken = '';

export const serverApiEnabled = Boolean(apiBase);
export const googleLoginEnabled = serverApiEnabled && Boolean(process.env.REACT_APP_GOOGLE_CLIENT_ID?.trim());
export const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID?.trim() || '';

async function call<T>(path:string, init:RequestInit = {}):Promise<T> {
  const response=await fetch(`${apiBase}${path}`,{
    ...init,
    credentials:'include',
    headers:{'Content-Type':'application/json',...(csrfToken?{'X-CSRF-Token':csrfToken}:{}),...(init.headers||{})},
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'Không thể kết nối máy chủ.');
  if(body.csrfToken)csrfToken=body.csrfToken;
  return body as T;
}

export async function getServerSession(){
  return call<{user:Pick<User,'name'|'email'>|null;csrfToken:string}>('/api/session');
}
export async function serverLogin(email:string,password:string){
  if(!csrfToken)await getServerSession();
  return call<{user:User;csrfToken:string}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
}
export async function serverRegister(name:string,email:string,password:string){
  if(!csrfToken)await getServerSession();
  return call<{user:User;csrfToken:string}>('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,password})});
}
export async function serverGoogleLogin(credential:string){
  if(!csrfToken)await getServerSession();
  return call<{user:User;csrfToken:string}>('/api/auth/google',{method:'POST',body:JSON.stringify({credential})});
}
export async function serverLogout(){
  if(!csrfToken)await getServerSession();
  return call<{ok:boolean}>('/api/auth/logout',{method:'POST',body:'{}'});
}
export async function readServerState(){return call<{state:Partial<FinanceData>&{theme?:Theme;language?:LanguageCode}}>('/api/state');}
export async function writeServerState(state:FinanceData&{theme:Theme;language:LanguageCode}){
  return call<{ok:boolean}>('/api/state',{method:'PUT',body:JSON.stringify({state})});
}
