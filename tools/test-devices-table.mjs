import { createClient } from '@supabase/supabase-js';

const url = 'https://yxqdquynlgfbxyultsux.supabase.co';
const anonKey = 'sb_publishable_GRjzLk5J0N15SBcUhr2zMQ_1SJ9JEqe';

async function check() {
  const supabase = createClient(url, anonKey);
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  const { data, error } = await supabase.from('user_devices').select('*').limit(1);
  if (error) {
    console.log('user_devices table query result:', error.code, error.message);
  } else {
    console.log('user_devices table EXISTS! rows:', data.length);
  }
}

check().catch(console.error);
