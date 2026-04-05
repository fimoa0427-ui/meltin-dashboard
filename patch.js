// Supabase DB ì°ë í¨ì¹
(function(){
  try {
    if (typeof supabaseClient === 'undefined') {
      console.warn('Supabase not loaded, using localStorage fallback');
      return;
    }

    const origDoRegister = doRegister;
    doRegister = async function() {
      const id = document.getElementById('regId').value.trim();
      const name = document.getElementById('regName').value.trim();
      const pw = document.getElementById('regPw').value;
      const pwc = document.getElementById('regPwConfirm').value;
      const brand = document.getElementById('regBrand').value.trim();
      if (!id || id.length < 4) return showError('ìì´ëë 4ì ì´ìì´ì´ì¼ í©ëë¤.');
      if (!name) return showError('ì´ë¦ì ìë ¥í´ì£¼ì¸ì.');
      if (!pw || pw.length < 4) return showError('ë¹ë°ë²í¸ë 4ì ì´ìì´ì´ì¼ í©ëë¤.');
      if (pw !== pwc) return showError('ë¹ë°ë²í¸ê° ì¼ì¹íì§ ììµëë¤.');
      if (!brand) return showError('ì²« ë²ì§¸ ë¸ëëëªì ìë ¥í´ì£¼ì¸ì.');
      const existing = await DB.getUser(id);
      if (existing) return showError('ì´ë¯¸ ì¡´ì¬íë ìì´ëìëë¤.');
      const brandId = 'brand_' + Date.now();
      const user = {id, name, pwHash: simpleHash(pw), brands: [{id: brandId, name: brand, createdAt: new Date().toISOString()}], activeBrandId: brandId};
      await DB.createUser(user);
      loginAs(user);
    };

    const origDoLogin = doLogin;
    doLogin = async function() {
      const id = document.getElementById('loginId').value.trim();
      const pw = document.getElementById('loginPw').value;
      if (!id || !pw) return showError('ìì´ëì ë¹ë°ë²í¸ë¥¼ ìë ¥í´ì£¼ì¸ì.');
      const user = await DB.getUser(id);
      if (!user) return showError('ì¡´ì¬íì§ ìë ìì´ëìëë¤.');
      if (user.pw_hash !== simpleHash(pw)) return showError('ë¹ë°ë²í¸ê° ì¼ì¹íì§ ììµëë¤.');
      user.pwHash = user.pw_hash;
      user.activeBrandId = user.active_brand_id;
      user.role = user.role || 'staff';
      loginAs(user);
    };

    const origLoadBrand = loadBrand;
    loadBrand = async function(brandId) {
      const brand = currentUser.brands.find(b => b.id === brandId);
      if (!brand) return;
      currentUser.activeBrandId = brandId;
      await DB.updateActiveBrand(currentUser.id, brandId);
      allOrders = await DB.getOrders(brandId);
      document.getElementById('brandIcon').textContent = brand.name.charAt(0);
      document.getElementById('brandName').textContent = brand.name;
      document.getElementById('brandMeta').textContent = 'ë°ì´í° ' + allOrders.length + 'ê±´';
      dateFrom = ''; dateTo = ''; currentPreset = 'all';
      if (allOrders.length > 0) {
        const dates = allOrders.map(o => o.orderDate).filter(Boolean).sort();
        if (dates.length > 0) { const last = new Date(dates[dates.length - 1]); if (!isNaN(last)) { currentMonth = last.getMonth(); currentYear = last.getFullYear(); } }
      }
      renderDashboard(); renderBrandSelector(); closeBrandDropdown();
    };

    saveCurrentBrandData = async function() {
      if (!currentUser) return;
      await DB.upsertOrders(currentUser.activeBrandId, allOrders);
    };

    const origAddBrand = addBrand;
    addBrand = async function() {
      const name = document.getElementById('newBrandName').value.trim();
      if (!name) return alert('ë¸ëëëªì ìë ¥í´ì£¼ì¸ì.');
      const brandId = 'brand_' + Date.now();
      currentUser.brands.push({id: brandId, name: name, createdAt: new Date().toISOString()});
      await DB.addBrand(currentUser.id, {id: brandId, name: name});
      document.getElementById('brandAddModal').style.display = 'none';
      loadBrand(brandId);
      alert('"' + name + '" ë¸ëëê° ì¶ê°ëììµëë¤.');
    };

    const origDeleteBrand = deleteBrand;
    deleteBrand = async function(brandId, brandName) {
      if (!confirm('"' + brandName + '" ë¸ëëì ëª¨ë  ë°ì´í°ë¥¼ ì­ì íìê² ìµëê¹?')) return;
      await DB.deleteBrand(brandId);
      currentUser.brands = currentUser.brands.filter(b => b.id !== brandId);
      document.getElementById('brandDeleteModal').style.display = 'none';
      renderBrandSelector();
      alert('"' + brandName + '" ì­ì  ìë£.');
    };

    clearBrandData = async function() {
      const brand = currentUser.brands.find(b => b.id === currentUser.activeBrandId);
      if (confirm('"' + (brand ? brand.name : '') + '" ë°ì´í°ë¥¼ ì­ì íìê² ìµëê¹?')) {
        await DB.clearOrders(currentUser.activeBrandId);
        allOrders = [];
        renderDashboard(); renderBrandSelector();
      }
    };

    renderBrandSelector = function() {
      const list = document.getElementById('brandList');
      list.innerHTML = '';
      currentUser.brands.forEach(function(b) {
        const isActive = b.id === currentUser.activeBrandId;
        const item = document.createElement('div');
        item.className = 'brand-item' + (isActive ? ' active' : '');
        item.onclick = function() { loadBrand(b.id); };
        item.innerHTML = '<div class="brand-item-icon">' + b.name.charAt(0) + '</div><div class="brand-item-info"><div class="brand-item-name">' + b.name + '</div></div>' + (isActive ? '<span class="check-icon">â</span>' : '');
        list.appendChild(item);
      });
    };

    // DB ê¸°ë° ì¸ì íì¸
    (async function() {
      const s = localStorage.getItem('meltin_session');
      if (s) {
        const user = await DB.getUser(s);
        if (user) {
          user.pwHash = user.pw_hash;
          user.activeBrandId = user.active_brand_id;
          loginAs(user);
          return;
        }
      }
      document.getElementById('loginPage').style.display = 'flex';
    })();

    console.log('Supabase DB patch loaded successfully');
  } catch(e) {
    console.error('Patch failed, using localStorage fallback:', e);
  }
})();

// ê¶í ì ì´: ë¡ê·¸ì¸ í ì­í ì ë°ë¼ UI ì¡°ì 
const _origLoginAs = loginAs;
loginAs = function(user) {
  // ë¸ëë ìì¼ë©´ ìë³¸ loginAsì loadBrand ìë¬ ë°©ì§
  if (!user.brands || user.brands.length === 0) {
    currentUser = user;
    localStorage.setItem('meltin_session', user.id);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userGreeting').textContent = user.name + 'ë';
    document.getElementById('brandIcon').textContent = '+';
    document.getElementById('brandName').textContent = 'ë¸ëëë¥¼ ì¶ê°íì¸ì';
    document.getElementById('brandMeta').textContent = 'ê´ë¦¬ì ë©ë´ìì ì¶ê°';
    document.getElementById('dataCount').textContent = 'ë°ì´í° 0ê±´';
  } else {
    if (!user.activeBrandId) user.activeBrandId = user.brands[0].id;
    _origLoginAs(user);
  }
  
  const isAdmin = (user.role === 'admin');
  
  // ë¸ëë ì¶ê°/ì­ì  ë²í¼
  document.querySelectorAll('.brand-action').forEach(function(btn) {
    if (btn.textContent.includes('ë¸ëë ì¶ê°') || btn.textContent.includes('ë¸ëë ì­ì ')) {
      btn.style.display = isAdmin ? 'flex' : 'none';
    }
  });
  
  // ì§ì ê´ë¦¬ ë²í¼
  var staffBtn = document.getElementById('staffManageBtn');
  if (staffBtn) staffBtn.style.display = isAdmin ? 'flex' : 'none';
  
  // ë°ì´í° ì´ê¸°í ë²í¼
  var clearBtns = document.querySelectorAll('.btn-sm.danger');
  clearBtns.forEach(function(btn) {
    btn.style.display = isAdmin ? 'inline-block' : 'none';
  });
};

// ì§ì ê´ë¦¬ í¨ìë¤
function showStaffModal() {
  closeBrandDropdown();
  document.getElementById('staffModal').style.display = 'flex';
  loadStaffList();
}

function closeStaffModal(e) {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
}

async function loadStaffList() {
  var list = document.getElementById('staffList');
  list.innerHTML = 'ë¡ë© ì¤...';
  var staff = await DB.getAllStaff();
  if (!staff.length) {
    list.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">ë±ë¡ë ì§ìì´ ììµëë¤.</p>';
    return;
  }
  var html = '';
  staff.forEach(function(s) {
    var roleLabel = s.role === 'admin' ? '<span style="color:#667eea;font-weight:600;">ê´ë¦¬ì</span>' : '<span style="color:#999;">ì§ì</span>';
    var deleteBtn = s.role !== 'admin' ? '<button onclick="removeStaff(\'' + s.id + '\',\'' + s.name + '\')" style="padding:4px 12px;border:1px solid #ef5350;color:#ef5350;border-radius:6px;background:white;cursor:pointer;font-size:12px;font-family:inherit;">ì­ì </button>' : '';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">';
    html += '<div><span style="font-weight:500;">' + s.name + '</span> <span style="font-size:12px;color:#aaa;">(' + s.id + ')</span> ' + roleLabel + '</div>';
    html += deleteBtn + '</div>';
  });
  list.innerHTML = html;
}

async function addStaff() {
  var id = document.getElementById('staffId').value.trim();
  var name = document.getElementById('staffName').value.trim();
  var pw = document.getElementById('staffPw').value;
  if (!id || id.length < 4) return alert('ìì´ëë 4ì ì´ìì´ì´ì¼ í©ëë¤.');
  if (!name) return alert('ì´ë¦ì ìë ¥í´ì£¼ì¸ì.');
  if (!pw || pw.length < 4) return alert('ë¹ë°ë²í¸ë 4ì ì´ìì´ì´ì¼ í©ëë¤.');
  
  var existing = await DB.getUser(id);
  if (existing) return alert('ì´ë¯¸ ì¡´ì¬íë ìì´ëìëë¤.');
  
  await DB.createStaff({id: id, name: name, pwHash: simpleHash(pw)});
  alert('"' + name + '" ì§ìì´ ì¶ê°ëììµëë¤.\n\nìì´ë: ' + id + '\në¹ë°ë²í¸: ' + pw);
  document.getElementById('staffId').value = '';
  document.getElementById('staffName').value = '';
  document.getElementById('staffPw').value = '';
  loadStaffList();
}

async function removeStaff(userId, userName) {
  if (!confirm('"' + userName + '" ì§ìì ì­ì íìê² ìµëê¹?')) return;
  await DB.deleteStaff(userId);
  alert('"' + userName + '" ì§ìì´ ì­ì ëììµëë¤.');
  loadStaffList();
}

// CSV ìë¡ë í ê¸
function toggleCsvUpload() {
  var el = document.getElementById('csvUploadArea');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ë¸ëëID â ì¹´í24 mall ID ë§¤í
var BRAND_MALL_MAP = {
  'brand_piven': 'meltin',
  'brand_medimory': 'meltinkorea',
  'brand_slimax': 'meltinkorea2'
};

// API ìë ìì§ (íì¬ ë¸ëëë§)
async function syncFromApi() {
  var btn = document.getElementById('syncApiBtn');
  var resultDiv = document.getElementById('syncResult');
  btn.disabled = true;
  btn.style.opacity = '0.7';
  resultDiv.style.display = 'block';

  // íì¬ ë¸ëëì í´ë¹íë mallë§ ìì§
  var mallId = currentUser ? BRAND_MALL_MAP[currentUser.activeBrandId] : null;
  var brandName = '';
  if (currentUser) {
    var brand = currentUser.brands.find(function(b) { return b.id === currentUser.activeBrandId; });
    brandName = brand ? brand.name : '';
  }

  btn.textContent = 'ð ' + (brandName || '') + ' ìì§ ì¤...';
  resultDiv.innerHTML = 'â³ <strong>' + (brandName || 'ì¹´í24') + '</strong>ìì ì£¼ë¬¸ ë°ì´í°ë¥¼ ìì§íê³  ììµëë¤...';

  try {
    var url = '/api/sync-orders' + (mallId ? '?mall=' + mallId : '');
    var res = await fetch(url);
    var data = await res.json();

    if (data.success) {
      var html = 'â <strong>' + (brandName || '') + ' ìì§ ìë£!</strong><br><br>';
      data.results.forEach(function(r) {
        if (r.error) {
          html += 'â ' + r.mall + ': ' + r.error + '<br>';
        } else {
          html += 'â ' + r.mall + ': ì£¼ë¬¸ ' + r.orders + 'ê±´, íëª© ' + (r.items || r.synced || 0) + 'ê±´<br>';
        }
      });
      html += '<br><span style="color:#999;font-size:12px;">ìì§ ìê°: ' + new Date(data.syncedAt).toLocaleString('ko-KR') + '</span>';
      resultDiv.innerHTML = html;

      // ëìë³´ë ìë¡ê³ ì¹¨
      if (currentUser && currentUser.activeBrandId) {
        loadBrand(currentUser.activeBrandId);
      }
    } else {
      resultDiv.innerHTML = 'â ìì§ ì¤í¨: ' + JSON.stringify(data);
    }
  } catch(e) {
    resultDiv.innerHTML = 'â ì¤ë¥: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = 'ð ì¹´í24 ì£¼ë¬¸ ìì§íê¸°';
  btn.style.opacity = '1';
}

// ë¤ì´ë²íì´ ìë¡ë í ê¸
function toggleNpayUpload() {
  var el = document.getElementById('npayUploadArea');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ë¤ì´ë²íì´ ìì ìë¡ë ì²ë¦¬

// DB row â JS object ë³íì ì íë ì¶ê°
var _origDbToOrder = DB.dbToOrder;
DB.dbToOrder = function(row) {
  var o = _origDbToOrder(row);
  o.memberType = row.member_type || 'íì';
  o.orderPrice = parseFloat(row.order_price) || 0;
  o.pointsUsed = parseFloat(row.points_used) || 0;
  o.couponUsed = parseFloat(row.coupon_used) || 0;
  o.npayFee = parseFloat(row.npay_fee) || 0;
  o.settleAmount = parseFloat(row.settle_amount) || 0;
  o.orderPlace = row.order_place || '';
  o.socialName = row.social_name || '';
  return o;
};

var DEBUG_MODE=false;
function toggleDebug(){DEBUG_MODE=!DEBUG_MODE;var el=document.getElementById("debugPanel");if(!el){el=document.createElement("div");el.id="debugPanel";el.style.cssText="position:fixed;bottom:0;left:0;right:0;max-height:200px;overflow-y:auto;background:#1e1e1e;color:#0f0;font-family:monospace;font-size:12px;padding:10px;z-index:9999;display:none;";document.body.appendChild(el)}el.style.display=DEBUAG_MODE?"block":"none";debugLog("ëë²ê·¸ ëª¨ë "+(DEBUG_MODE?"ON":"OFF"))}
function debugLog(m){console.log("[DEBUG]",m);var el=document.getElementById("debugPanel");if(el&&DEBUG_MODE){el.innerHTML+=new Date().toLocaleTimeString()+" | "+m+"<br>";el.scrollTop=el.scrollHeight}}
function handleNpayFile(){debugLog("íì¼ì íìì");var i=document.createElement("input");i.type="file";i.accept=".xlsx,.xls,.csv";i.onChange=function(e){var f=e.target.files[0];if(!f)return;debugLog("íì¼:"+f.name);processNpayFile(f)};i.click()}
async function processNpayFile(file){debugLog("ì²ë¦¬ìì");try{if(typeof XLSX==="undefined"){debugLog("SheetJSë¡ë©");await new Promise(function(r,j){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";s.onload=r;s.onerror=j;document.head.appendChild(s)})}var reader=new FileReader();reader.onload=async function(ev){try{var data=new Uint8Array(ev.target.result);var wb=XLSX.read(data,{type:"array"});var ws=wb.Sheets[wb.SheetNames[0]];var json=XLSX.utils.sheet_to_json(ws);debugLog("íì±:"+json.length+"ê±´");if(!json.length){alert("ë°ì´í°ìì");return}debugLog("í¤:"+Object.keys(json[0]).join(","));var s=json.map(function(r){return{npay_order_no:String(r["ì£¼ë¬¸ë²í¸"]||""),item_order_no:String(r["ìíì£¼ë¬¸ë²í¸"]||""),category:r["êµ¬ë¶"]||"",product_name:r["ìíëª"]||"",buyer_name:r["êµ¬ë§¤ìëª"]||"",payment_date:r["ê²°ì ì¼"]||"",settle_status:r["ì ì°ìí"]||"",base_amount:r["ì ì°ê¸°ì¤ê¸ì¡"]||0,npay_fee:r["Npay ììë£"]||0,sales_fee:r["ë§¤ì¶ ì°ë ììë£"]||0,installment_fee:r["ë¬´ì´ìí ë¶ ììë£"]||0,benefit_amount:r["ííê¸ì¡"]||0,settle_amount:r["ì ì°ìì ê¸ì¡"]||0}});debugLog("ì ì¡:"+s.length+"ê±´");if(!currentUser||!currentUser.activeBrandId){alert("ë¸ëëì ííì");return}var res=await fetch("/api/upload-npay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({settlements:s,brandId:currentUser.activeBrandId})});var result=await res.json();debugLog("ìëµ:"+JSON.stringify(result));if(result.success){alert("ìë£! "+result.total+"ê±´ ì ì¥, "+result.matched+"ê±´ ë§¤ì¹­");if(currentUser.activeBrandId)loadBrand(currentUser.activeBrandId)}else{alert("ì¤í¨:"+JSON.stringify(result))}}catch(e){debugLog("ìë¬:"+e.message);alert("ì¤ë¥:"+e.message)}};reader.readAsArrayBuffer(file)}catch(e){debugLog("ìë¬:"+e.message);alert("ì¤ë¥:"+e.message)}}

// ===== 데이터 수집 현황 확인 기능 =====
async function checkSyncStatus() {
  if (!currentUser || !currentUser.activeBrandId) return;

  var statusDiv = document.getElementById('syncStatusArea');
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '⏳ 수집 현황 확인 중...';

  try {
    var res = await fetch('/api/check-sync-status?brand=' + currentUser.activeBrandId + '&days=30');
    var data = await res.json();
    var s = data.summary;

    var html = '<div style="margin-bottom:10px;font-weight:600;">📊 최근 30일 수집 현황</div>';

    // 요약 바
    html += '<div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px;">';
    html += '<span>카페24: <strong style="color:' + (s.cafe24Missing > 0 ? '#dc2626' : '#16a34a') + '">' + s.cafe24Complete + '/' + data.totalDays + '일</strong></span>';
    html += '<span>네이버페이: <strong style="color:' + (s.npayMissing > 0 ? '#dc2626' : '#16a34a') + '">' + s.npayComplete + '/' + data.totalDays + '일</strong></span>';
    html += '<span>모두 완료: <strong>' + s.bothComplete + '/' + data.totalDays + '일</strong></span>';
    html += '</div>';

    // 날짜별 격자
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
    data.daily.forEach(function(d) {
      var day = parseInt(d.date.split('-')[2]);
      var month = parseInt(d.date.split('-')[1]);
      var bg, color, symbol;
      if (d.hasCafe24 && d.hasNpay) {
        bg = '#d1fae5'; color = '#065f46'; symbol = ''; // 둘 다 완료
      } else if (d.hasCafe24 && !d.hasNpay) {
        bg = '#fef3c7'; color = '#92400e'; symbol = 'N'; // 네이버페이만 없음
      } else if (!d.hasCafe24 && d.hasNpay) {
        bg = '#dbeafe'; color = '#1e40af'; symbol = 'C'; // 카페24만 없음
      } else {
        bg = '#fee2e2'; color = '#991b1b'; symbol = '!'; // 둘 다 없음
      }
      var title = d.date + ' | 카페24: ' + d.cafe24 + '건' + ' | 네이버페이: ' + d.npay + '건';
      html += '<div title="' + title + '" style="position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px;height:36px;border-radius:4px;font-size:11px;background:' + bg + ';color:' + color + ';cursor:pointer;" onclick="showDateDetail(\'' + d.date + '\',' + d.cafe24 + ',' + d.npay + ')">';
      html += '<span style="font-weight:600;">' + day + '</span>';
      if (symbol) html += '<span style="font-size:8px;font-weight:700;">' + symbol + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // 범례
    html += '<div style="margin-top:8px;font-size:11px;color:#666;display:flex;gap:10px;flex-wrap:wrap;">';
    html += '<span>🟢 모두 완료</span>';
    html += '<span>🟡 N=네이버페이 미업로드</span>';
    html += '<span>🔵 C=카페24 미수집</span>';
    html += '<span>🔴 !=둘 다 없음</span>';
    html += '</div>';

    statusDiv.innerHTML = html;
    statusDiv.style.background = '#fafafa';
    statusDiv.style.borderColor = '#e5e7eb';
  } catch(e) {
    statusDiv.innerHTML = '❌ 상태 확인 실패: ' + e.message;
    statusDiv.style.background = '#fef2f2';
    statusDiv.style.borderColor = '#fca5a5';
  }
}

// 날짜 클릭 시 상세 + 재수집 옵션
function showDateDetail(dateStr, cafe24Count, npayCount) {
  var msg = dateStr + ' 수집 현황\n\n';
  msg += '카페24: ' + cafe24Count + '건' + (cafe24Count === 0 ? ' ❌' : ' ✅') + '\n';
  msg += '네이버페이: ' + npayCount + '건' + (npayCount === 0 ? ' ❌' : ' ✅') + '\n\n';

  if (cafe24Count === 0) {
    if (confirm(msg + '카페24 주문을 수집할까요?')) {
      resyncDate(dateStr);
    }
  } else if (npayCount === 0) {
    alert(msg + '네이버페이 데이터는 엑셀 업로드로 추가해주세요.');
  } else {
    if (confirm(msg + '카페24 주문을 다시 수집할까요?')) {
      resyncDate(dateStr);
    }
  }
}

// 특정 날짜 카페24 재수집
async function resyncDate(dateStr) {
  if (!currentUser) return;
  var mallId = BRAND_MALL_MAP[currentUser.activeBrandId];
  if (!mallId) return alert('해당 브랜드의 카페24 몰 정보가 없습니다.');

  var statusDiv = document.getElementById('syncStatusArea');
  statusDiv.innerHTML = '⏳ ' + dateStr + ' 카페24 수집 중...';

  try {
    var res = await fetch('/api/sync-orders?mall=' + mallId + '&from=' + dateStr + '&to=' + dateStr);
    var data = await res.json();
    if (data.success) {
      alert(dateStr + ' 카페24 수집 완료!');
      checkSyncStatus();
      loadBrand(currentUser.activeBrandId);
    } else {
      alert('수집 실패: ' + JSON.stringify(data));
    }
  } catch(e) {
    alert('오류: ' + e.message);
  }
}

// 수집 현황 UI 삽입
(function addSyncStatusUI() {
  var syncBtn = document.getElementById('syncApiBtn');
  if (!syncBtn) return;
  var container = syncBtn.parentElement;

  // 수집 현황 영역
  var statusDiv = document.createElement('div');
  statusDiv.id = 'syncStatusArea';
  statusDiv.style.cssText = 'display:none;margin-top:12px;padding:12px 16px;border-radius:8px;border:1px solid #e5e7eb;font-size:13px;';
  container.appendChild(statusDiv);

  // 수집 현황 확인 버튼
  var checkBtn = document.createElement('button');
  checkBtn.textContent = '📊 수집 현황 확인 (최근 30일)';
  checkBtn.style.cssText = 'margin-top:8px;padding:8px 16px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:13px;width:100%;';
  checkBtn.onclick = checkSyncStatus;
  container.appendChild(checkBtn);
})();

var DEBUG_MODE=false;
function toggleDebug(){DEBUG_MODE=!DEBUG_MODE;var el=document.getElementById("debugPanel");if(!el){el=document.createElement("div");el.id="debugPanel";el.style.cssText="position:fixed;bottom:0;left:0;right:0;max-height:200px;overflow-y:auto;background:#1e1e1e;color:#0f0;font-family:monospace;font-size:12px;padding:10px;z-index:9999;display:none;";document.body.appendChild(el)}el.style.display=DEBUG_MODE?"block":"none";debugLog("디버그 모드 "+(DEBUG_MODE?"ON":"OFF"))}
function debugLog(m){console.log("[DEBUG]",m);var el=document.getElementById("debugPanel");if(el&&DEBUG_MODE){el.innerHTML+=new Date().toLocaleTimeString()+" | "+m+"<br>";el.scrollTop=el.scrollHeight}}
function handleNpayFile(){debugLog("파일선택시작");var i=document.createElement("input");i.type="file";i.accept=".xlsx,.xls,.csv";i.onChange=function(e){var f=e.target.files[0];if(!f)return;debugLog("파일:"+f.name);processNpayFile(f)};i.click()}
async function processNpayFile(file){debugLog("처리시작");try{if(typeof XLSX==="undefined"){debugLog("SheetJS로딩");await new Promise(function(r,j){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";s.onload=r;s.onerror=j;document.head.appendChild(s)})}var reader=new FileReader();reader.onload=async function(ev){try{var data=new Uint8Array(ev.target.result);var wb=XLSX.read(data,{type:"array"});var ws=wb.Sheets[wb.SheetNames[0]];var json=XLSX.utils.sheet_to_json(ws);debugLog("파싱:"+json.length+"건");if(!json.length){alert("데이터없음");return}debugLog("키:"+Object.keys(json[0]).join(","));var s=json.map(function(r){return{npay_order_no:String(r["주문번호"]||""),item_order_no:String(r["상품주문번호"]||""),category:r["구분"]||"",product_name:r["상품명"]||"",buyer_name:r["구매자명"]||"",payment_date:r["결제일"]||"",settle_status:r["정산상태"]||"",base_amount:r["정산기준금액"]||0,npay_fee:r["Npay 수수료"]||0,sales_fee:r["매출 연동 수수료"]||0,installment_fee:r["무이자할부 수수료"]||0,benefit_amount:r["혜택금액"]||0,settle_amount:r["정산예정금액"]||0}});debugLog("전송:"+s.length+"건");if(!currentUser||!currentUser.activeBrandId){alert("브랜드선택필요");return}var res=await fetch("/api/upload-npay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({settlements:s,brandId:currentUser.activeBrandId})});var result=await res.json();debugLog("응답:"+JSON.stringify(result));if(result.success){alert("완료! "+result.total+"건 저장, "+result.matched+"건 매칭");if(currentUser.activeBrandId)loadBrand(currentUser.activeBrandId)}else{alert("실패:"+JSON.stringify(result))}}catch(e){debugLog("에러:"+e.message);alert("오류:"+e.message)}};reader.readAsArrayBuffer(file)}catch(e){debugLog("에러:"+e.message);alert("오류:"+e.message)}}
