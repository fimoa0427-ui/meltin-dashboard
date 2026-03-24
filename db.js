// Supabase DB 연동 함수들
const DB = {
  // 사용자 관련
  async getUser(id) {
    const {data} = await supabase.from('users').select('*').eq('id', id).single();
    if (!data) return null;
    const {data: brands} = await supabase.from('brands').select('*').eq('user_id', id).order('created_at');
    data.brands = brands || [];
    return data;
  },

  async createUser(user) {
    await supabase.from('users').insert({
      id: user.id, name: user.name, pw_hash: user.pwHash,
      active_brand_id: user.activeBrandId
    });
    for (const b of user.brands) {
      await supabase.from('brands').insert({id: b.id, user_id: user.id, name: b.name});
    }
  },

  async updateActiveBrand(userId, brandId) {
    await supabase.from('users').update({active_brand_id: brandId}).eq('id', userId);
  },

  // 브랜드 관련
  async addBrand(userId, brand) {
    await supabase.from('brands').insert({id: brand.id, user_id: userId, name: brand.name});
  },

  async deleteBrand(brandId) {
    await supabase.from('orders').delete().eq('brand_id', brandId);
    await supabase.from('brands').delete().eq('id', brandId);
  },

  // 주문 관련
  async getOrders(brandId) {
    const {data} = await supabase.from('orders').select('*').eq('brand_id', brandId);
    return (data || []).map(DB.dbToOrder);
  },

  async upsertOrders(brandId, orders) {
    const rows = orders.map(o => ({
      brand_id: brandId, order_no: o.orderNo, order_date: o.orderDate,
      status: o.status, product_name: o.productName, qty: o.qty,
      total_payment: o.totalPayment, payment_method: o.paymentMethod,
      buyer_name: o.buyerName, receiver_name: o.receiverName,
      tracking_no: o.trackingNo, cancel_reason: o.cancelReason,
      refund_amount: o.refundAmount, refund_method: o.refundMethod,
      refund_detail: o.refundDetail, exchange_reason: o.exchangeReason,
      return_reason: o.returnReason, source: o.source,
      status_history: o.statusHistory || [],
      last_updated: new Date().toISOString()
    }));
    // batch upsert
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await supabase.from('orders').upsert(batch, {onConflict: 'brand_id,order_no'});
    }
  },

  async clearOrders(brandId) {
    await supabase.from('orders').delete().eq('brand_id', brandId);
  },

  // DB row → JS object 변환
  dbToOrder(row) {
    return {
      orderNo: row.order_no, orderDate: row.order_date, status: row.status,
      productName: row.product_name, qty: row.qty, totalPayment: parseFloat(row.total_payment) || 0,
      paymentMethod: row.payment_method, buyerName: row.buyer_name,
      receiverName: row.receiver_name, trackingNo: row.tracking_no,
      cancelReason: row.cancel_reason, refundAmount: parseFloat(row.refund_amount) || 0,
      refundMethod: row.refund_method, refundDetail: row.refund_detail,
      exchangeReason: row.exchange_reason, returnReason: row.return_reason,
      source: row.source, statusHistory: row.status_history || [],
      lastUpdated: row.last_updated
    };
  }
};
