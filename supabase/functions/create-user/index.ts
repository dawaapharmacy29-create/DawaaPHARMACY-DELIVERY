import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify caller is authenticated and has admin role
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'جلسة غير صالحة' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller profile role
    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['مدير عام', 'مدير فرع'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'ليس لديك صلاحية إنشاء مستخدمين' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { username, password, role, branch_id, display_name } = await req.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'اسم المستخدم وكلمة المرور مطلوبان' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check username uniqueness
    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: 'اسم المستخدم مستخدم بالفعل' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build system email from username
    const systemEmail = `${username.toLowerCase().replace(/\s+/g, '_')}@dawaa.sys`;

    // Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: systemEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: display_name || username,
        role: role || 'مشاهد',
      },
    });

    if (createErr) {
      console.error('Create user error:', createErr);
      return new Response(JSON.stringify({ error: `فشل إنشاء المستخدم: ${createErr.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert profile
    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: newUser.user.id,
        email: systemEmail,
        username,
        display_name: display_name || username,
        role: role || 'مشاهد',
        branch_id: branch_id || null,
        status: 'نشط',
      }, { onConflict: 'id' });

    if (profileErr) {
      console.error('Profile upsert error:', profileErr);
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: `فشل حفظ بيانات المستخدم: ${profileErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      user_id: caller.id,
      user_name: callerProfile ? (display_name || caller.email) : caller.email,
      role: callerProfile?.role,
      department: 'المستخدمين',
      operation: 'إنشاء مستخدم جديد',
      details: `username: ${username}, role: ${role || 'مشاهد'}`,
    });

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: err.message || 'خطأ غير متوقع' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
