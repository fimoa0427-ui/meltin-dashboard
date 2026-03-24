export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  try {
    const { settlements, brandId } = req.body;
    
    if (!settlements || !Array.isArray(settlements) || !brandId) {
      return res.status(400).json({ error: 'settlements array and brandId required' });
    }
    
    const rows = settlements.map(s => ({
      npay_order_no: s.npay_order_no || '',
      item_order_no: s.item_order_no || '',
      category: s.category || '',
      product_name: s.product_name || '',
      buyer_name: s.buyer_name || '',
      payment_date: s.payment_date || '',
      settle_status: s.settle_status || '',
      base_amount: parseFloat(s.base_amount) || 0,
      npay_fee: parseFloat(s.npay_fee) || 0,
      sales_fee: parseFloat(s.sales_fee) || 0,
      installment_fee: parseFloat(s.installment_fee) || 0,
      benefit_amount: parseFloat(s.benefit_amount) || 0,
      settle_amount: parseFloat(s.settle_amount) || 0,
      brand_id: brandId
    }));
    
    // batch upsert
    const batchSize = 100;
    let saved = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const saveRes = await fetch(`${supabaseUrl}/rest/v1/npay_settlements`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
      });
      if (saveRes.ok) saved += batch.length;
    }
    
    // 주문 테이블에 수수료/정산금액 업데이트 (주문번호 매칭)
    // 상품주문 건만 (배송비 제외)
    const productRows = settlements.filter(s => s.category === '상품주문');
    let matched = 0;
    for (const s of productRows) {
      // 네이버페이 주문번호로 카페24 주문 매칭 시도
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/orders?brand_id=eq.${brandId}&buyer_name=eq.${encodeURIComponent(s.buyer_name)}&payment_method=like.*선불금*`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          npay_fee: Math.abs(parseFloat(s.npay_fee) || 0),
          settle_amount: parseFloat(s.settle_amount) || 0
        })
      });
      if (updateRes.ok) matched++;
    }
    
    return res.json({ success: true, total: rows.length, saved, matched });
  } catch (e) {
    return res.json({ error: e.message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };
