// /api/chat.js
// Vercel Serverless Function. This is the ONLY place your NVIDIA API key is used.
// It reads the key from an Environment Variable (set in Vercel dashboard, not in this file).
// The browser never sees the key — it calls this function instead, at /api/chat.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Server is missing NVIDIA_API_KEY. Add it in Vercel -> Project -> Settings -> Environment Variables, then redeploy.' }
    });
  }

  try {
    const { model, messages, max_tokens, temperature } = req.body || {};

    if (!model || !messages) {
      return res.status(400).json({ error: { message: 'Missing model or messages in request body.' } });
    }

    const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: max_tokens || 2400,
        temperature: temperature ?? 0.5
      })
    });

    const rawText = await nvidiaRes.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: { message: `Upstream AI service returned an unexpected response (status ${nvidiaRes.status}).` }
      });
    }

    if (!nvidiaRes.ok) {
      return res.status(nvidiaRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || 'Unexpected server error' } });
  }
}
