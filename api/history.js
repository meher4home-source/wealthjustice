// /api/history.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: { message: 'Missing email' } });
    const { data, error } = await supabase.from('chat_history').select('*').eq('user_email', email).order('updated_at', { ascending: false }).limit(80);
    if (error) return res.status(500).json({ error: { message: error.message } });
    return res.status(200).json({ history: data });
  }

  if (req.method === 'POST') {
    const { id, email, advisor, title, messages } = req.body || {};
    if (id) {
      const { error } = await supabase.from('chat_history').update({ messages, advisor, updated_at: new Date() }).eq('id', id);
      if (error) return res.status(500).json({ error: { message: error.message } });
      return res.status(200).json({ id });
    } else {
      const { data, error } = await supabase.from('chat_history').insert({ user_email: email, advisor, title, messages }).select().single();
      if (error) return res.status(500).json({ error: { message: error.message } });
      return res.status(200).json({ id: data.id });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const { error } = await supabase.from('chat_history').delete().eq('id', id);
    if (error) return res.status(500).json({ error: { message: error.message } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: { message: 'Method not allowed' } });
}
