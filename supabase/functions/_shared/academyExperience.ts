import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const experienceStudent = '00-00001';
export async function requireExperience(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error || !['teacher', 'admin'].includes(data?.role)) throw new Error('Staff experience required');
}
/** Uses the caller JWT throughout. Template tables cannot be mutated through this client. */
export function experienceClient(db: SupabaseClient): SupabaseClient {
  async function rows(kind: string) {
    const r = await db.rpc('academy_experience_read', { p_kind: kind });
    if (r.error) throw r.error;
    return r.data as Record<string, any>[];
  }
  async function write(kind: string, data: Record<string, unknown>, id?: string) {
    const r = await db.rpc('academy_experience_write', { p_kind: kind, p_data: data, p_id: id ?? null });
    if (r.error) throw r.error;
    return r.data;
  }
  function readOnly(builder: any): any {
    return new Proxy(builder, { get(target, property) {
      if (['insert','update','upsert','delete'].includes(String(property))) return () => { throw Error('Experience template is read-only'); };
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (property === 'then') return value.bind(target);
      return (...args: unknown[]) => readOnly(value.apply(target, args));
    } });
  }
  return new Proxy(db, { get(target, property) {
    if (property === 'from') return (table: string) => {
      if (table !== 'student_inquiry_recommendations') return readOnly(db.from(table));
      let id: string | null = null;
      const query = { select: () => query, eq: (key: string, value: string) => { if (key !== 'id') throw Error('Unsupported experience query'); id=value; return query; }, single: async () => {
        try { const data=(await rows('recommendation')).find(r=>r.id===id); return {data:data??null,error:data?null:new Error('Experience recommendation not found')}; } catch(error) {return {data:null,error};}
      } };
      return query;
    };
    if (property === 'rpc') return async (name: string, args: Record<string, any> = {}) => {
      try {
        let data: unknown;
        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
        const sameDay=(at: string)=>at && new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(at))===today;
        if(name==='get_inquiry_analysis_cache') data=(await rows('cache')).filter(r=>r.cache_key===args.p_cache_key && Date.now()-Date.parse(r.created_at)<24*60*60*1000);
        else if(name==='count_inquiry_analysis_calls') data=(await rows('cache')).filter(r=>sameDay(r.created_at)).length;
        else if(name==='upsert_inquiry_analysis_cache') data=await write('cache',{cache_key:args.p_cache_key,result:args.p_result,model:args.p_model,prompt_tokens:args.p_prompt_tokens,completion_tokens:args.p_completion_tokens});
        else if(name==='count_comprehensive_analysis_calls') data=(await rows('recommendation')).filter(r=>sameDay(r.generated_at)).length;
        else if(name==='upsert_inquiry_recommendation_prepare') {
          const row=await write('recommendation',{kg_version_id:args.p_kg_version_id,metrics:args.p_metrics,weaknesses:args.p_weaknesses,enrolled_subjects:args.p_enrolled_subjects,current_grade:args.p_current_grade,formula_version:args.p_formula_version,hygiene_findings:args.p_hygiene_findings,prepared_at:new Date().toISOString(),recommendations:[]});data=row.id;
        } else if(name==='set_inquiry_recommendation_generated') data=await write('recommendation',{selected_weakness_ids:args.p_selected_weakness_ids,selected_anchor_subjects:args.p_selected_anchor_subjects,user_notes:args.p_user_notes,recommendations:args.p_recommendations,ai_provider:args.p_ai_provider,ai_model:args.p_ai_model,token_usage:args.p_token_usage,generated_at:new Date().toISOString()},args.p_id);
        else throw Error('Unsupported experience RPC: '+name);
        return {data,error:null};
      } catch(error) { return {data:null,error}; }
    };
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  } }) as SupabaseClient;
}
