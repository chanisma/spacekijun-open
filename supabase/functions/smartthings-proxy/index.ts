import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMARTTHINGS_BASE = 'https://api.smartthings.com/v1';

function getSmartThingsHeaders() {
  const pat = Deno.env.get('SMARTTHINGS_PAT');
  if (!pat) throw new Error('SMARTTHINGS_PAT is not configured');
  return {
    'Authorization': 'Bearer ' + pat,
    'Content-Type': 'application/json',
  };
}

async function smartThingsGet(path) {
  const res = await fetch(SMARTTHINGS_BASE + path, {
    method: 'GET',
    headers: getSmartThingsHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('SmartThings API ' + res.status + ': ' + text);
  }
  return res.json();
}

async function smartThingsPost(path, body) {
  const res = await fetch(SMARTTHINGS_BASE + path, {
    method: 'POST',
    headers: getSmartThingsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('SmartThings API ' + res.status + ': ' + text);
  }
  return res.json();
}

async function checkControlPermission(supabaseClient, userId) {
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (profile?.role === 'admin') return true;
  const { data: perm } = await supabaseClient
    .from('smart_device_permissions')
    .select('can_control')
    .eq('user_id', userId)
    .single();
  return perm?.can_control === true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = authData.user;

    // 명단에 연결된 계정만 (2026-10-15) — 읽기 동작이 학교 SmartThings 키로 돌아 «로그인만 하면» 학교 기기 목록·상태가
    // 보였다. 공모전 계정(외부 심사위원)은 사전 요청 훅이 이 호출을 거부해 여기서 막히고, 미연결 학교 계정은 'unlinked'.
    const { data: linkStatus, error: linkError } = await supabaseClient.rpc('my_account_link_status');
    if (linkError || linkStatus !== 'linked') {
      return new Response(JSON.stringify({ error: 'No permission' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const action = body.action;
    let result;

    if (action === 'listLocations') {
      result = await smartThingsGet('/locations');
    }
    else if (action === 'listDevices') {
      let url = '/devices?capability=switch';
      if (body.locationId) {
        url = url + '&locationId=' + encodeURIComponent(body.locationId);
      }
      result = await smartThingsGet(url);
    }
    else if (action === 'getDeviceStatus') {
      if (!body.deviceId) throw new Error('deviceId is required');
      result = await smartThingsGet('/devices/' + encodeURIComponent(body.deviceId) + '/status');
    }
    else if (action === 'getDeviceHealth') {
      if (!body.deviceId) throw new Error('deviceId is required');
      result = await smartThingsGet('/devices/' + encodeURIComponent(body.deviceId) + '/health');
    }
    else if (action === 'getMultipleDeviceStatuses') {
      if (!body.deviceIds || !Array.isArray(body.deviceIds)) {
        throw new Error('deviceIds array is required');
      }
      const results = await Promise.allSettled(
        body.deviceIds.map(async (id) => {
          const status = await smartThingsGet('/devices/' + encodeURIComponent(id) + '/status');
          let health = { state: 'UNKNOWN' };
          try { health = await smartThingsGet('/devices/' + encodeURIComponent(id) + '/health'); } catch(e) {}
          return { deviceId: id, status: status, health: health };
        })
      );
      result = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { deviceId: body.deviceIds[i], error: r.reason?.message || 'Unknown error' };
      });
    }
    else if (action === 'sendCommand') {
      if (!body.deviceId) throw new Error('deviceId is required');
      if (!body.command || (body.command !== 'on' && body.command !== 'off')) {
        throw new Error('command must be on or off');
      }
      const hasPermission = await checkControlPermission(supabaseClient, user.id);
      if (!hasPermission) {
        return new Response(JSON.stringify({ error: 'No permission to control devices' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      result = await smartThingsPost('/devices/' + encodeURIComponent(body.deviceId) + '/commands', [
        { component: 'main', capability: 'switch', command: body.command }
      ]);
    }
    else {
      return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ result: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in smartthings-proxy:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
