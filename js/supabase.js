import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ⚠️ Replace these with your Supabase project credentials
// Dashboard → Settings → API
const SUPABASE_URL = 'https://qzttaeeywdepjytyagro.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6dHRhZWV5d2RlcGp5dHlhZ3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxOTE2ODMsImV4cCI6MjA5MDc2NzY4M30.aijbdeeB6SfY9cExnd6MBVUH0Y_v4_70HUagMfTYEEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);