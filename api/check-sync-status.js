export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  const paramBrand = req.query?.brand || req.url?.match(/brand=([^&]+)/)?.[1];
  const paramDays = parseInt(req.query?.days || req.url?.match(/days=(\d+)/)?.[1]) || 30;

  if (!paramBrand) {
    return res.status(400).json({ error: 'brand parameter required (e.g. brand_piven)' });
  }

  try {
    // 최근 N일간 날짜 목록 생성
    const dates = [];
    const today = new Date();
    for (let i = 0; i < paramDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const fromDate = dates[dates.length - 1];
    const toDate = dates[0];

    // DB에서 해당 브랜드의 주문 데이터 조회 (source 포함)
    const ordersRes = await fetch(
      `${supabaseUrl}/rest/v1/orders?brand_id=eq.${paramBrand}&order_date=gte.${fromDate}&order_date=lte.${toDate}T23:59:59&select=order_date,source`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    // 날짜별 + 소스별 집계
    const dateMap = {};
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      orders.forEach(o => {
        const day = o.order_date ? o.order_date.split('T')[0] : null;
        if (!day) return;
        if (!dateMap[day]) dateMap[day] = { cafe24: 0, npay: 0, other: 0 };

        const src = (o.source || '').toLowerCase();
        if (src.includes('cafe24') || src === 'cafe24_api') {
          dateMap[day].cafe24++;
        } else if (src.includes('npay') || src.includes('naver')) {
          dateMap[day].npay++;
        } else {
          dateMap[day].other++;
        }
      });
    }

    // 네이버페이 정산 데이터도 확인
    const npayRes = await fetch(
      `${supabaseUrl}/rest/v1/npay_settlements?brand_id=eq.${paramBrand}&payment_date=gte.${fromDate}&payment_date=lte.${toDate}&select=payment_date`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    const npayDates = {};
    if (npayRes.ok) {
      const npayRows = await npayRes.json();
      npayRows.forEach(r => {
        const day = r.payment_date ? r.payment_date.split('T')[0] : null;
        if (day) {
          npayDates[day] = (npayDates[day] || 0) + 1;
        }
      });
    }

    // 날짜별 현황생성
    const daily = dates.map(date => {
      const cafe24Count = dateMap[date]?.cafe24 || 0;
      const npayOrderCount = dateMap[date]?.npay || 0;
      const npaySettleCount = npayDates[date] || 0;
      const npayCount = npayOrderCount + npaySettleCount;

      return {
        date,
        cafe24: cafe24Count,
        npay: npayCount,
        total: cafe24Count + npayCount + (dateMap[date]?.other || 0),
        hasCafe24: cafe24Count > 0,
        hasNpay: npayCount > 0
      };
    });

    // 요약 통계
    const cafe24Missing = daily.filter(d => !d.hasCafe24).map(d => d.date);
    const npayMissing = daily.filter(d => !d.hasNpay).map(d => d.date);
    const bothComplete = daily.filter(d => d.hasCafe24 && d.hasNpay).length;
    const totalWithData = daily.filter(d => d.total > 0).length;

    return res.json({
      brand: paramBrand,
      period: { from: fromDate, to: toDate },
      totalDays: paramDays,
      summary: {
        bothComplete,
        totalWithData,
        cafe24Complete: daily.filter(d => d.hasCafe24).length,
        npayComplete: daily.filter(d => d.hasNpay).length,
        cafe24Missing: cafe24Missing.length,
        npayMissing: npayMissing.length
      },
      cafe24MissingDates: cafe24Missing,
      npayMissingDates: npayMissing,
      daily
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
