export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  const paramBrand = req.query?.brand || req.url?.match(/brand=([^&]+)/)?.[1];
  const paramDays = parseInt(req.query?.days || req.url?.match(/days=(\d+)/)?.[1]) || 30;

  if (!paramBrand) {
    return res.status(400).json({ error: 'brand parameter required (e.g. brand_piven)' });
  }

  try {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < paramDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const fromDate = dates[dates.length - 1];
    const toDate = dates[0];
    const ordersRes = await fetch(
      `${supabaseUrl}/rest/v1/orders?brand_id=eq.${paramBrand}&order_date=gte.${fromDate}&order_date=lte.${toDate}T23:59:59&select=order_date`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    let syncedDates = {};
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      orders.forEach(o => {
        const day = o.order_date ? o.order_date.split('T')[0] : null;
        if (day) {
          if (!syncedDates[day]) syncedDates[day] = { count: 0 };
          syncedDates[day].count++;
        }
      });
    }

    const result = dates.map(date => ({
      date,
      synced: !!syncedDates[date],
      orderCount: syncedDates[date]?.count || 0
    }));

    const missedDates = result.filter(r => !r.synced).map(r => r.date);
    const syncedCount = result.filter(r => r.synced).length;

    return res.json({
      brand: paramBrand,
      period: { from: fromDate, to: toDate },
      totalDays: paramDays,
      syncedDays: syncedCount,
      missedDays: missedDates.length,
      missedDates,
      daily: result
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
