export const config = { schedule: '0 0 * * *' };

const MALL_CREDS = {
  meltin: { idKey: 'CAFE24_MELTIN_CLIENT_ID', secretKey: 'CAFE24_MELTIN_CLIENT_SECRET' },
  meltinkorea: { idKey: 'CAFE24_MELTINKOREA_CLIENT_ID', secretKey: 'CAFE24_MELTINKOREA_CLIENT_SECRET' },
  meltinkorea2: { idKey: 'CAFE24_MELTINKOREA2_CLIENT_ID', secretKey: 'CAFE24_MELTINKOREA2_CLIENT_SECRET' }
};

async function doRefreshToken(mallId, rToken) {
  const cred = MALL_CREDS[mallId];
  if (!cred) return null;
  const clientId = process.env[cred.idKey];
  const clientSecret = process.env[cred.secretKey];
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rToken })
  });
  return res.json();
}

async function fetchOrders(mallId, accessToken, startDate, endDate) {
  const orders = [];
  let offset = 0;
  while (true) {
    const url = `https://${mallId}.cafe24api.com/api/v2/admin/orders?start_date=${startDate}&end_date=${endDate}&limit=100&offset=${offset}&embed=items`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!data.orders || data.orders.length === 0) break;
    orders.push(...data.orders);
    if (data.orders.length < 100) break;
    offset += 100;
  }
  return orders;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const results = [];

  const tokenRes = await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens?select=*`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tokens = await tokenRes.json();

  for (const token of tokens) {
    try {
      let accessToken = token.access_token;

      if (new Date(token.expires_at) < new Date()) {
        const newToken = await doRefreshToken(token.mall_id, token.refresh_token);
        if (newToken?.access_token) {
          accessToken = newToken.access_token;
          await fetch(`${supabaseUrl}/rest/v1/cafe24_tokens?mall_id=eq.${token.mall_id}`, {
            method: 'PATCH',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: newToken.access_token,
              refresh_token: newToken.refresh_token || token.refresh_token,
              expires_at: new Date(Date.now() + (newToken.expires_in || 21600) * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
          });
        } else { results.push({ mall: token.mall_id, error: 'Token refresh failed' }); continue; }
      }

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const orders = await fetchOrders(token.mall_id, accessToken, yesterday, today);

      const rows = orders.map(o => {
        const itemNames = o.items ? o.items.map(i => i.product_name).filter(Boolean).join(', ') : '';
        const totalQty = o.items ? o.items.reduce((sum, i) => sum + (parseInt(i.quantity) || 1), 0) : 1;
        const status = o.canceled === 'T' ? '취소' : (o.shipping_status === 'T' ? '배송완료' : (o.paid === 'T' ? '결제완료' : '미결제'));
        
        return {
          brand_id: token.brand_id,
          order_no: o.order_id,
          order_date: o.order_date,
          status: status,
          product_name: itemNames || '(상품명 없음)',
          qty: totalQty,
          total_payment: parseFloat(o.payment_amount) || parseFloat(o.actual_order_amount?.payment_amount) || 0,
          payment_method: Array.isArray(o.payment_method_name) ? o.payment_method_name.join(', ') : (o.payment_method_name || ''),
          buyer_name: o.billing_name || '',
          receiver_name: '',
          tracking_no: '',
          source: 'cafe24_api',
          last_updated: new Date().toISOString()
        };
      });

      if (rows.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/orders`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
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
