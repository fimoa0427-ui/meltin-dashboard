export const config = {
  schedule: '0 9 * * *' // 매일 오전 9시 (UTC 기준 0시 = KST 9시)
};

async function refreshToken(mallId, refreshToken, clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  return res.json();
}

async function fetchOrders(mallId, accessToken, startDate, endDate) {
  const orders = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const url = `https://${mallId}.cafe24api.com/api/v2/admin/orders?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2024-06-01'
      }
    });
    const data = await res.json();
    
    if (!data.orders || data.orders.length === 0) break;
    orders.push(...data.orders);
    if (data.orders.length < limit) break;
    offset += limit;
  }
  return orders;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const clientId = process.env.CAFE24_CLIENT_ID;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET;
  
  // 몰 ID → 브랜드 매핑
  const mallBrandMap = {
    'meltin': null,      // DB에서 brand_id 조회
    'meltinkorea': null,
    'meltinkorea2': null
  };
  
  const results = [];
  
  // 각 쇼핑몰에서 토큰 가져오기
  const tokenRes = await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens?select=*`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tokens = await tokenRes.json();
  
  for (const token of tokens) {
    try {
      let accessToken = token.access_token;
      
      // 토큰 만료 확인 & 갱신
      if (new Date(token.expires_at) < new Date()) {
        const newToken = await refreshToken(token.mall_id, token.refresh_token, clientId, clientSecret);
        if (newToken.access_token) {
          accessToken = newToken.access_token;
          // DB 업데이트
          await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens?mall_id=eq.${token.mall_id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              access_token: newToken.access_token,
              refresh_token: newToken.refresh_token || token.refresh_token,
              expires_at: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
          });
        }
      }
      
      // 어제~오늘 주문 조회
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      
      const orders = await fetchOrders(token.mall_id, accessToken, yesterday, today);
      
      // 브랜드 ID 조회
      const brandRes = await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens?mall_id=eq.${token.mall_id}&select=brand_id`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const brandData = await brandRes.json();
      const brandId = brandData[0]?.brand_id;
      
      if (!brandId) {
        results.push({ mall: token.mall_id, error: 'No brand_id linked' });
        continue;
      }
      
      // 주문 데이터 변환 & DB 저장
      const rows = orders.map(o => ({
        brand_id: brandId,
        order_no: o.order_id,
        order_date: o.order_date,
        status: o.order_status || '',
        product_name: o.items?.[0]?.product_name || '',
        qty: o.items?.[0]?.quantity || 1,
        total_payment: parseFloat(o.actual_payment?.payment_amount) || 0,
        payment_method: o.payment?.payment_method_name || '',
        buyer_name: o.buyer?.name || '',
        receiver_name: o.receiver?.name || '',
        tracking_no: o.shipments?.[0]?.tracking_no || '',
        source: 'cafe24_api',
        last_updated: new Date().toISOString()
      }));
      
      if (rows.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/orders`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(rows)
        });
      }
      
      results.push({ mall: token.mall_id, orders: orders.length, synced: rows.length });
    } catch (e) {
      results.push({ mall: token.mall_id, error: e.message });
    }
  }
  
  return res.json({ success: true, results, syncedAt: new Date().toISOString() });
}
