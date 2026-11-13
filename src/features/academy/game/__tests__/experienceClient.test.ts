import assert from 'node:assert/strict';
import { test } from 'node:test';
import { experienceClient, requireExperience } from '../../../../../supabase/functions/_shared/academyExperience';
import { gameStudentScope } from '../studentScope';
test('staff experiences and explicit admin student previews have different ownership scopes', () => {
 assert.deepEqual(gameStudentScope('teacher','teacher@test',null,'teacher-id'),{studentId:'experience:teacher-id',readOnly:false});
 assert.deepEqual(gameStudentScope('admin','admin@test',null,'admin-id'),{studentId:'experience:admin-id',readOnly:false});
 assert.deepEqual(gameStudentScope('admin','admin@test','00-00001','admin-id'),{studentId:'00-00001',readOnly:true});
});
test('AI storage redirects only to caller-owned records and blocks template mutations', async () => {
 const calls:string[]=[]; const records:Record<string,any>[]=[];
 const base={rpc:async(name:string,args:any)=>{calls.push(name);if(name==='academy_experience_read')return {data:records.filter(r=>r.kind===args.p_kind),error:null};if(name==='academy_experience_write'){const row={...args.p_data,id:args.p_id??'own-record',kind:args.p_kind,created_at:new Date().toISOString()};records.push(row);return {data:row,error:null};}throw Error('Unexpected original storage RPC');},from:()=>{const query={select:()=>query,eq:()=>query,update:()=>{throw Error('Original mutation reached');},maybeSingle:async()=>({data:{role:'teacher'},error:null})};return query;}};
 await requireExperience(base as never,'teacher-id');
 const db=experienceClient(base as never);
 assert.throws(()=>db.from('student_kg_entities').update({label:'bad'}),/read-only/);
 assert.ok((await db.rpc('set_kg_entity_embedding',{})).error);
 await db.rpc('upsert_inquiry_analysis_cache',{p_student_id:'00-00001',p_cache_key:'key',p_result:{title:'new'}});
 const cache=await db.rpc('get_inquiry_analysis_cache',{p_student_id:'00-00001',p_cache_key:'key'});
 assert.equal(cache.data[0].result.title,'new');
 const prepared=await db.rpc('upsert_inquiry_recommendation_prepare',{p_student_id:'00-00001',p_kg_version_id:'template-kg',p_weaknesses:[]});
 assert.equal(prepared.data,'own-record');
 assert.ok((await db.from('student_inquiry_recommendations').select('*').eq('id','foreign-record').single()).error);
 assert.ok(calls.every(name=>name.startsWith('academy_experience_')));
});
