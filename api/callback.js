export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: 'No authorization code', query: req.query });
  
  const mallId = state || '';
  
  const creds = {
    meltin: { id: process.env.CAFE24_MELTIN_CLIENT_ID, secret: process.env.CAFE24_MELTIN_CLIENT_SECRET },
    meltinkorea: { id: process.env.CAFE24_MELTINKOREA_CLIENT_ID, secret: process.env.CAFE24_MELTINKOREA_CLIENT_SECRET },
    meltinkorea2: { id: process.env.CAFE24_MELTINKOREA2_CLIENT_ID, secret: process.env.CAFE24_MELTINKOREA2_CLIENT_SECRET }
  };
  
  const cred = creds[mallId];
  if (!cred || !cred.id || !cred.secret) {
    return res.json({ error: 'Missing credentials', mallId, hasId: !!cred?.id, hasSecret: !!cred?.secret });
  }
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: 'https://meltin-dashboard.vercel.app/api/callback',
    client_id: cred.id,
    client_secret: cred.secret
  });
  
  try {
    const tokenUrl = `https://${mallId}.cafe24api.com/api/v2/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    
    const tokenData = await tokenRes.json();
    
    // 디버그: 토큰 응답 그대로 표시
    if (!tokenData.access_token) {
      return res.json({ 
        step: 'token_exchange_failed',
        tokenUrl,
        requestBody: body.toString(),
        response: tokenData
      });
    }
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const brandMap = { meltin: 'brand_piven', meltinkorea: 'brand_medimory', meltinkorea2: 'brand_slimax' };
    
    const saveRes = await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        mall_id: mallId,
        brand_id: brandMap[mallId] || null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
    });
    
    const saveData = await saveRes.text();
    
    return res.redirect(`/?auth=success&mall=${mallId}`);
  } catch (e) {
    return res.json({ step: 'exception', error: e.message, stack: e.stack?.substring(0, 300) });
  }
}
