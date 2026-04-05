export const config = { schedule: '0 0 * * *' };

const MALL_CREDS = {
  meltin: { idKey: 'CAFE24_MELTIN_CLIENT_ID', secretKey: 'CAFE24_MELTIN_CLIENT_SECRET' },
  meltinkorea: { idKey: 'CAFE24_MELTINKOREA_CLIENT_ID', secretKey: 'CAFE24_MELTINKOREA_CLIENT_SECRET' },
  meltinkorea2: { idKey: 'CAFE24_MELTINKOREA2_CLIENT_ID', secretKey: 'CAFE24_MELTINKOREA2_CLIENT_SECRET' }
};

async function doRefreshToken(mallId, rToken) {
  const cred = MALL_CREDS[mallId];
  if (!cred) return null;
  const auth = Buffer.from(`${process.env[cred.idKey]}:${process.env[cred.secretKey]}`).toString('base64');
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rToken })
  });
  return res.json();
}

async function apiFetch(mallId, accessToken, path) {
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  });
  return res.json();
}

async function fetchAllOrders(mallId, accessToken, startDate, endDate) {
  const orders = [];
  let offset = 0;
  while (true) {
    const data = await apiFetch(mallId, accessToken, `orders?start_date=${startDate}&end_date=${endDate}&limit=100&offset=${offset}`);
    if (!data.orders || data.orders.length === 0) break;
    orders.push(...data.orders);
    if (data.orders.length < 100) break;
    offset += 100;
  }
  return orders;
}

async function fetchOrderDetails(mallId, accessToken, orderId) {
  const [itemsData, receiversData] = await Promise.all([
    apiFetch(mallId, accessToken, `orders/${orderId}/items`),
    apiFetch(mallId, accessToken, `orders/${orderId}/receivers`)
  ]);
  return {
    items: itemsData.items || [],
    receivers: receiversData.receivers || []
  };
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const results = [];

  // mall 파라미터로 특정 쇼핑몰만 수집 가능
  const paramMall = req.query?.mall || req.url?.match(/mall=([^&]+)/)?.[1];
  const tokenUrl = paramMall 
    ? `${supabaseUrl}/rest/v1/cafe24_tokens?select=*&mall_id=eq.${paramMall}`
    : `${supabaseUrl}/rest/v1/cafe24_tokens?select=*`;
  const tokenRes = await fetch(tokenUrl, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const tokens = await tokenRes.json();

  for (const token of tokens) {
    try {
      let accessToken = token.access_token;

      // 토큰 갱숨
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

      // 어제~오늘 주문 목록
      // URL 파라미터로 날짜 지정 가능 (?from=2026-03-01&to=2026-03-24)
      const paramFrom = req.query?.from || req.url?.split('from=')[1]?.split('&')[0];
      const paramTo = req.query?.to || req.url?.split('to=')[1]?.split('&')[0];
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const startDate = paramFrom || yesterday;
      const endDate = paramTo || today;
      const orders = await fetchAllOrders(token.mall_id, accessToken, startDate, endDate);

      const rows = [];
      
      // fast 모드: 상세 조회 생략 (빠른 수집)
      const paramFast = req.query?.fast || req.url?.includes('fast=1');
      for (const o of orders) {
        let detail;
        if (paramFast) {
          detail = { items: [], receivers: [] };
        } else {
          detail = await fetchOrderDetails(token.mall_id, accessToken, o.order_id);
        }
        const receiver = detail.receivers[0] || {};
        
        // 품목별로 row 생성 (CSV와 동일하게)
        if (detail.items.length > 0) {
          const isNpay = (o.order_place_id === 'naver' || (Array.isArray(o.payment_method) && o.payment_method.includes('prepaid')) || o.social_name === 'kakao' || o.social_name === 'naver' || !o.member_id || (o.member_id && o.member_id.includes('@')));
          for (const item of detail.items) {
            // 품목별 금액 계산 (주문 전체금액이 아닌 개별 품목 금액)
            const itemQty = parseInt(item.quantity) || 1;
            const itemPrice = parseFloat(item.product_price) || parseFloat(item.option_price) || 0;
            const itemTotal = parseFloat(item.payment_amount) || (itemPrice * itemQty);
            rows.push({
              brand_id: token.brand_id,
              order_no: o.order_id,
              order_item_code: item.order_item_code || '',
              order_date: o.order_date,
              status: item.status_text || '',
              status_text: item.order_status_additional_info || '',
              product_name: item.product_name || '',
              product_option: item.option_value_default || '',
              qty: itemQty,
              price: parseFloat(item.product_price) || 0,
              purchase_amount: parseFloat(item.option_price) || 0,
              order_price: itemTotal,
              total_payment: itemTotal,
              points_used: parseFloat(item.points_spent_amount) || 0,
              coupon_used: parseFloat(item.coupon_discount_price) || 0,
              payment_method: Array.isArray(o.payment_method_name) ? o.payment_method_name.join(', ') : '',
              member_type: isNpay ? '비회원' : '회원',
              order_place: o.order_place_name || '',
              social_name: o.social_name || '',
              buyer_name: o.billing_name || '',
              receiver_name: receiver.name || '',
              receiver_phone: receiver.cellphone || receiver.phone || '',
              receiver_address: receiver.address_full || '',
              shipping_message: receiver.shipping_message || '',
              tracking_no: item.tracking_no || '',
              shipping_start: item.shipped_date || '',
              shipping_complete: item.delivered_date || '',
              cancel_type: item.claim_reason_type || '',
              cancel_reason: item.claim_reason || '',
              cancel_date: item.cancel_request_date || item.cancel_date || '',
              refund_amount: 0,
              refund_status: '',
              refund_method: item.refund_bank_name || '',
              refund_date: item.refund_date || '',
              exchange_status: '',
              exchange_date: item.exchange_request_date || item.exchange_date || '',
              exchange_reason: '',
              return_date: item.return_request_date || '',
              return_reason: '',
              coupon_discount: parseFloat(item.coupon_discount_price) || 0,
              source: 'cafe24_api',
              last_updated: new Date().toISOString()
            });
          }
        } else {
          // 품목 없는 경우 주문 기본 정보만
          const isNpay2 = (o.order_place_id === 'naver' || (Array.isArray(o.payment_method) && o.payment_method.includes('prepaid')) || o.social_name === 'kakao' || o.social_name === 'naver' || !o.member_id || (o.member_id && o.member_id.includes('@')));
          const orderPrice2 = parseFloat(o.actual_order_amount?.order_price_amount) || parseFloat(o.initial_order_amount?.order_price_amount) || 0;
          rows.push({
            brand_id: token.brand_id,
            order_no: o.order_id,
            order_item_code: '',
            order_date: o.order_date,
            status: o.canceled === 'T' ? '취소' : (o.paid === 'T' ? '결제완료' : '미결제'),
            status_text: '',
            product_name: '(상품 정보 없음)',
            product_option: '',
            qty: 1,
            price: 0,
            purchase_amount: 0,
            order_price: orderPrice2,
            points_used: parseFloat(o.actual_order_amount?.points_spent_amount) || 0,
            coupon_used: parseFloat(o.actual_order_amount?.coupon_discount_price) || 0,
            total_payment: parseFloat(o.payment_amount) || orderPrice2,
            payment_method: Array.isArray(o.payment_method_name) ? o.payment_method_name.join(', ') : '',
            member_type: isNpay2 ? '비회원' : '회원',
            order_place: o.order_place_name || '',
            social_name: o.social_name || '',
            buyer_name: o.billing_name || '',
            receiver_name: receiver.name || '',
            receiver_phone: '',
            receiver_address: '',
            shipping_message: '',
            tracking_no: '',
            shipping_start: '',
            shipping_complete: '',
            cancel_type: '',
            cancel_reason: '',
            cancel_date: '',
            refund_amount: 0,
            refund_status: '',
            refund_method: '',
            refund_date: '',
            exchange_status: '',
            exchange_date: '',
            exchange_reason: '',
            return_date: '',
            return_reason: '',
            coupon_discount: 0,
            source: 'cafe24_api',
            last_updated: new Date().toISOString()
          });
        }
      }

      // DB 저장
      if (rows.length > 0) {
        // 모든 row에 동일한 키 보장
        const allKeys = new Set();
        rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
        const keyList = [...allKeys];
        const normalizedRows = rows.map(r => {
          const nr = {};
          keyList.forEach(k => { nr[k] = r[k] !== undefined ? r[k] : null; });
          return nr;
        });
        
        const batchSize = 50;
        let saveErrors = [];
        for (let i = 0; i < normalizedRows.length; i += batchSize) {
          const batch = normalizedRows.slice(i, i + batchSize);
          const saveRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(batch)
          });
          if (!saveRes.ok) {
            const errText = await saveRes.text();
            saveErrors.push({ batch: i, status: saveRes.status, error: errText.substring(0, 200) });
          }
        }
        if (saveErrors.length > 0) {
          results.push({ mall: token.mall_id, orders: orders.length, items: rows.length, saveErrors });
        } else {
          results.push({ mall: token.mall_id, orders: orders.length, items: rows.length, saved: true });
        }
      } else {
        results.push({ mall: token.mall_id, orders: orders.length, items: 0 });
      }
    } catch (e) {
      results.push({ mall: token.mall_id, error: e.message });
    }
  }

  return res.json({ success: true, results, syncedAt: new Date().toISOString() });
}
