import { supabase } from './supabase.js';

let currentUser = null;   // auth user
let currentMember = null;  // team_members row
let authListenerSet = false;

export function getUser() { return currentUser; }
export function getMember() { return currentMember; }
export function isAdmin() { return currentMember?.is_admin === true; }

export async function initAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    currentUser = null;
    currentMember = null;
    return null;
  }

  currentUser = session.user;
  await loadMember();

  if (!authListenerSet) {
    authListenerSet = true;
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        currentUser = null;
        currentMember = null;
        return;
      }
      currentUser = session?.user || null;
      if (currentUser) await loadMember();
      else currentMember = null;
    });
  }

  return currentUser;
}

async function loadMember() {
  if (!currentUser) return;
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('auth_id', currentUser.id)
    .maybeSingle();

  if (data) {
    currentMember = data;
  } else {
    // Check if invited by email (auth_id not yet linked)
    if (!currentUser?.email) return;
    const { data: byEmail } = await supabase
      .from('team_members')
      .select('*')
      .eq('email', currentUser.email)
      .is('auth_id', null)
      .maybeSingle();

    if (byEmail) {
      // Link auth_id via server function (bypasses RLS)
      await supabase.rpc('link_auth_id', {
        p_email: currentUser.email,
        p_auth_id: currentUser.id
      });
      const { data: linked } = await supabase
        .from('team_members')
        .select('*')
        .eq('auth_id', currentUser.id)
        .maybeSingle();
      currentMember = linked || byEmail;
    } else {
      // Check if first user ever → auto-admin
      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true });

      if (count === 0) {
        const { data: newMember } = await supabase
          .from('team_members')
          .insert({
            auth_id: currentUser.id,
            email: currentUser.email,
            name: currentUser.user_metadata?.name || currentUser.email.split('@')[0],
            is_admin: true
          })
          .select()
          .single();
        currentMember = newMember;
      }
    }
  }
}

export function phoneToEmail(phone) {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@shoottracker.app`;
}

export async function login(phone, password) {
  const email = phoneToEmail(phone);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signup(phone, password, name) {
  const email = phoneToEmail(phone);
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) throw error;
}

export async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  currentMember = null;
}