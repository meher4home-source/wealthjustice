// /api/auth.js
// Uses Supabase Auth (auth.users) for actual login/password/OTP handling — free, built-in.
// Our own "profiles" table just stores plan/usage data linked to that Auth user.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const { action, name, email, password, token } = req.body || {};

  try {
    // ───── SIGN UP with email + password ─────
    if (action === 'signup') {
      if (!name || !email || !password) return res.status(400).json({ error: { message: 'Missing fields' } });
      if (password.length < 6) return res.status(400).json({ error: { message: 'Password must be at least 6 characters.' } });

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return res.status(400).json({ error: { message: error.message } });

      // Create the matching profile row (plan defaults to free)
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: data.user.id, email, name, plan: 'free', questions_used: 0, images_used: 0
      });
      if (profileErr && !profileErr.message.includes('duplicate')) {
        return res.status(500).json({ error: { message: profileErr.message } });
      }

      return res.status(200).json({ user: { email, name, plan: 'free', q: 0, img: 0 } });
    }

    // ───── LOGIN with email + password ─────
    if (action === 'login') {
      if (!email || !password) return res.status(400).json({ error: { message: 'Missing fields' } });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: { message: 'Incorrect email or password.' } });

      const profile = await getOrCreateProfile(data.user.id, email, email.split('@')[0]);
      return res.status(200).json({ user: profile });
    }

    // ───── REQUEST OTP CODE (passwordless login via email) ─────
    if (action === 'sendOtp') {
      if (!email) return res.status(400).json({ error: { message: 'Missing email' } });
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return res.status(400).json({ error: { message: error.message } });
      return res.status(200).json({ ok: true });
    }

    // ───── VERIFY OTP CODE ─────
    if (action === 'verifyOtp') {
      if (!email || !token) return res.status(400).json({ error: { message: 'Missing email or code' } });
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) return res.status(401).json({ error: { message: 'Invalid or expired code.' } });

      const profile = await getOrCreateProfile(data.user.id, email, email.split('@')[0]);
      return res.status(200).json({ user: profile });
    }

    // ───── FORGOT PASSWORD — send reset email ─────
    if (action === 'forgotPassword') {
      if (!email) return res.status(400).json({ error: { message: 'Missing email' } });
      const redirectTo = (req.headers.origin || '') + '/?reset=1';
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return res.status(400).json({ error: { message: error.message } });
      return res.status(200).json({ ok: true });
    }

    // ───── SET NEW PASSWORD (after clicking reset link, using the recovery access_token) ─────
    if (action === 'updatePassword') {
      if (!token || !password) return res.status(400).json({ error: { message: 'Missing token or password' } });
      if (password.length < 6) return res.status(400).json({ error: { message: 'Password must be at least 6 characters.' } });

      // Use the recovery access_token (from the reset-link URL) to act as that user,
      // then update their password. This works with the publishable key — no admin/secret key needed.
      const { data: sessionUser, error: sessionErr } = await supabase.auth.getUser(token);
      if (sessionErr || !sessionUser?.user) {
        return res.status(401).json({ error: { message: 'Reset link expired or invalid. Please request a new one.' } });
      }

      const scopedClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { error } = await scopedClient.auth.updateUser({ password });
      if (error) return res.status(400).json({ error: { message: error.message } });
      return res.status(200).json({ ok: true });
    }

    // ───── GET USER (session restore by email) ─────
    if (action === 'getUser') {
      if (!email) return res.status(400).json({ error: { message: 'Missing email' } });
      const { data, error } = await supabase.from('profiles').select('*').eq('email', email).single();
      if (error || !data) return res.status(404).json({ error: { message: 'Not found' } });
      return res.status(200).json({ user: { email: data.email, name: data.name, plan: data.plan, q: data.questions_used, img: data.images_used } });
    }

    // ───── UPDATE USAGE / PLAN ─────
    if (action === 'updateUsage') {
      const { q, img, newPlan } = req.body;
      const update = { questions_used: q, images_used: img };
      if (newPlan) update.plan = newPlan;
      const { error } = await supabase.from('profiles').update(update).eq('email', email);
      if (error) return res.status(500).json({ error: { message: error.message } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: { message: 'Unknown action' } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || 'Unexpected server error' } });
  }
}

async function getOrCreateProfile(userId, email, fallbackName) {
  const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).single();
  if (existing) {
    return { email: existing.email, name: existing.name, plan: existing.plan, q: existing.questions_used, img: existing.images_used };
  }
  const { data: created } = await supabase.from('profiles').insert({
    id: userId, email, name: fallbackName, plan: 'free', questions_used: 0, images_used: 0
  }).select().single();
  return { email: created.email, name: created.name, plan: created.plan, q: created.questions_used, img: created.images_used };
}
