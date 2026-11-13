import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleJourney, headers, json } from './handler.ts';
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const authorization=req.headers.get('Authorization');
  if(!authorization) return json({error:'로그인이 필요합니다.'},401);
  const url=Deno.env.get('SUPABASE_URL')??'';
  const db=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:authorization}}});
  try {
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user) return json({error:'다시 로그인해 주세요.'},401);
    const body=await req.text(); if(body.length>16000) return json({error:'기록이 너무 깁니다.'},413);
    let input:unknown; try {input=JSON.parse(body);} catch {return json({error:'의뢰 요청을 확인해 주세요.'},400);}
    const writer=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
    return await handleJourney(writer,user.id,input);
  } catch {return json({error:'의뢰를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'},503);}
});
