export default async function handler(req, res) {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code' });
  }
  
  // state에 mall_id가 들어있음
  const mallId = state || '';
  
  // 인증 코드로 Access Token 교환
  const clientId = process.env.CAFE24_CLIENT_ID;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const tokenRes = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://meltin-dashboard.vercel.app/api/callback'
      })
    });
    
    const tokenData = await tokenRes.json();
    
    if (tokenData.access_token) {
      // Supabase에 토큰 저장
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      
      await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          mall_id: mallId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      
      return res.redirect(`/?auth=success&mall=${mallId}`);
    } else {
      return res.redirect(`/?auth=error&msg=${encodeURIComponent(JSON.stringify(tokenData))}`);
    }
  } catch (e) {
    return res.redirect(`/?auth=error&msg=${encodeURIComponent(e.message)}`);
  }
}
