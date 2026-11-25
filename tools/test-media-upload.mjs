import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let url = process.env.EXPO_PUBLIC_SUPABASE_URL;
let anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url) {
  try {
    const envFile = readFileSync(resolve('.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const [k, v] = line.split('=');
      if (k?.trim() === 'EXPO_PUBLIC_SUPABASE_URL') url = v?.trim();
      if (k?.trim() === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') anonKey = v?.trim();
    }
  } catch {}
}

const adminEmail = process.env.ADMIN_EMAIL; if (!adminEmail) throw new Error('Set ADMIN_EMAIL env var');
const adminPass = process.env.ADMIN_PASSWORD; if (!adminPass) throw new Error('Set ADMIN_PASSWORD env var');

const client = createClient(url, anonKey);

async function testMediaUpload() {
  await client.auth.signInWithPassword({ email: adminEmail, password: adminPass });
  const testBuffer = Buffer.from('test apk file');
  const { data, error } = await client.storage
    .from('media')
    .upload('test.txt', testBuffer, { upsert: true });

  console.log('Upload to media bucket:', { data, error });
}

testMediaUpload().catch(console.error);
