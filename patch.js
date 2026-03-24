// Supabase DB 연동 패치
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
      if (!id || id.length < 4) return showError('아이디는 4자 이상이어야 합니다.');
      if (!name) return showError('이름을 입력해주세요.');
      if (!pw || pw.length < 4) return showError('비밀번호는 4자 이상이어야 합니다.');
      if (pw !== pwc) return showError('비밀번호가 일치하지 않습니다.');
      if (!brand) return showError('첫 번째 브랜드명을 입력해주세요.');
      const existing = await DB.getUser(id);
      if (existing) return showError('이미 존재하는 아이디입니다.');
      const brandId = 'brand_' + Date.now();
      const user = {id, name, pwHash: simpleHash(pw), brands: [{id: brandId, name: brand, createdAt: new Date().toISOString()}], activeBrandId: brandId};
      await DB.createUser(user);
      loginAs(user);
    };

    const origDoLogin = doLogin;
    doLogin = async function() {
      const id = document.getElementById('loginId').value.trim();
      const pw = document.getElementById('loginPw').value;
      if (!id || !pw) return showError('아이디와 비밀번호를 입력해주세요.');
      const user = await DB.getUser(id);
      if (!user) return showError('존재하지 않는 아이디입니다.');
      if (user.pw_hash !== simpleHash(pw)) return showError('비밀번호가 일치하지 않습니다.');
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
      document.getElementById('brandMeta').textContent = '데이터 ' + allOrders.length + '건';
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
      if (!name) return alert('브랜드명을 입력해주세요.');
      const brandId = 'brand_' + Date.now();
      currentUser.brands.push({id: brandId, name: name, createdAt: new Date().toISOString()});
      await DB.addBrand(currentUser.id, {id: brandId, name: name});
      document.getElementById('brandAddModal').style.display = 'none';
      loadBrand(brandId);
      alert('"' + name + '" 브랜드가 추가되었습니다.');
    };

    const origDeleteBrand = deleteBrand;
    deleteBrand = async function(brandId, brandName) {
      if (!confirm('"' + brandName + '" 브랜드와 모든 데이터를 삭제하시겠습니까?')) return;
      await DB.deleteBrand(brandId);
      currentUser.brands = currentUser.brands.filter(b => b.id !== brandId);
      document.getElementById('brandDeleteModal').style.display = 'none';
      renderBrandSelector();
      alert('"' + brandName + '" 삭제 완료.');
    };

    clearBrandData = async function() {
      const brand = currentUser.brands.find(b => b.id === currentUser.activeBrandId);
      if (confirm('"' + (brand ? brand.name : '') + '" 데이터를 삭제하시겠습니까?')) {
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
        item.innerHTML = '<div class="brand-item-icon">' + b.name.charAt(0) + '</div><div class="brand-item-info"><div class="brand-item-name">' + b.name + '</div></div>' + (isActive ? '<span class="check-icon">✓</span>' : '');
        list.appendChild(item);
      });
    };

    // DB 기반 세션 확인
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

// 권한 제어: 로그인 후 역할에 따라 UI 조정
const _origLoginAs = loginAs;
loginAs = function(user) {
  // 브랜드 없으면 원본 loginAs의 loadBrand 에러 방지
  if (!user.brands || user.brands.length === 0) {
    currentUser = user;
    localStorage.setItem('meltin_session', user.id);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userGreeting').textContent = user.name + '님';
    document.getElementById('brandIcon').textContent = '+';
    document.getElementById('brandName').textContent = '브랜드를 추가하세요';
    document.getElementById('brandMeta').textContent = '관리자 메뉴에서 추가';
    document.getElementById('dataCount').textContent = '데이터 0건';
  } else {
    if (!user.activeBrandId) user.activeBrandId = user.brands[0].id;
    _origLoginAs(user);
  }
  
  const isAdmin = (user.role === 'admin');
  
  // 브랜드 추가/삭제 버튼
  document.querySelectorAll('.brand-action').forEach(function(btn) {
    if (btn.textContent.includes('브랜드 추가') || btn.textContent.includes('브랜드 삭제')) {
      btn.style.display = isAdmin ? 'flex' : 'none';
    }
  });
  
  // 직원 관리 버튼
  var staffBtn = document.getElementById('staffManageBtn');
  if (staffBtn) staffBtn.style.display = isAdmin ? 'flex' : 'none';
  
  // 데이터 초기화 버튼
  var clearBtns = document.querySelectorAll('.btn-sm.danger');
  clearBtns.forEach(function(btn) {
    btn.style.display = isAdmin ? 'inline-block' : 'none';
  });
};

// 직원 관리 함수들
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
  list.innerHTML = '로딩 중...';
  var staff = await DB.getAllStaff();
  if (!staff.length) {
    list.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">등록된 직원이 없습니다.</p>';
    return;
  }
  var html = '';
  staff.forEach(function(s) {
    var roleLabel = s.role === 'admin' ? '<span style="color:#667eea;font-weight:600;">관리자</span>' : '<span style="color:#999;">직원</span>';
    var deleteBtn = s.role !== 'admin' ? '<button onclick="removeStaff(\'' + s.id + '\',\'' + s.name + '\')" style="padding:4px 12px;border:1px solid #ef5350;color:#ef5350;border-radius:6px;background:white;cursor:pointer;font-size:12px;font-family:inherit;">삭제</button>' : '';
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
  if (!id || id.length < 4) return alert('아이디는 4자 이상이어야 합니다.');
  if (!name) return alert('이름을 입력해주세요.');
  if (!pw || pw.length < 4) return alert('비밀번호는 4자 이상이어야 합니다.');
  
  var existing = await DB.getUser(id);
  if (existing) return alert('이미 존재하는 아이디입니다.');
  
  await DB.createStaff({id: id, name: name, pwHash: simpleHash(pw)});
  alert('"' + name + '" 직원이 추가되었습니다.\n\n아이디: ' + id + '\n비밀번호: ' + pw);
  document.getElementById('staffId').value = '';
  document.getElementById('staffName').value = '';
  document.getElementById('staffPw').value = '';
  loadStaffList();
}

async function removeStaff(userId, userName) {
  if (!confirm('"' + userName + '" 직원을 삭제하시겠습니까?')) return;
  await DB.deleteStaff(userId);
  alert('"' + userName + '" 직원이 삭제되었습니다.');
  loadStaffList();
}

// CSV 업로드 토글
function toggleCsvUpload() {
  var el = document.getElementById('csvUploadArea');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// API 수동 수집
async function syncFromApi() {
  var btn = document.getElementById('syncApiBtn');
  var resultDiv = document.getElementById('syncResult');
  btn.disabled = true;
  btn.textContent = '🔄 수집 중...';
  btn.style.opacity = '0.7';
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '⏳ 카페24에서 주문 데이터를 수집하고 있습니다...';
  
  try {
    var res = await fetch('/api/sync-orders');
    var data = await res.json();
    
    if (data.success) {
      var html = '✅ <strong>수집 완료!</strong><br><br>';
      data.results.forEach(function(r) {
        if (r.error) {
          html += '❌ ' + r.mall + ': ' + r.error + '<br>';
        } else {
          html += '✅ ' + r.mall + ': 주문 ' + r.orders + '건, 품목 ' + (r.items || r.synced || 0) + '건<br>';
        }
      });
      html += '<br><span style="color:#999;font-size:12px;">수집 시각: ' + new Date(data.syncedAt).toLocaleString('ko-KR') + '</span>';
      resultDiv.innerHTML = html;
      
      // 대시보드 새로고침
      if (currentUser && currentUser.activeBrandId) {
        loadBrand(currentUser.activeBrandId);
      }
    } else {
      resultDiv.innerHTML = '❌ 수집 실패: ' + JSON.stringify(data);
    }
  } catch(e) {
    resultDiv.innerHTML = '❌ 오류: ' + e.message;
  }
  
  btn.disabled = false;
  btn.textContent = '🔄 카페24 주문 수집하기';
  btn.style.opacity = '1';
}

// 네이버페이 업로드 토글
function toggleNpayUpload() {
  var el = document.getElementById('npayUploadArea');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// 네이버페이 엑셀 업로드 처리
// 네이버페이 엑셀 업로드 이벤트
(function() {
  var npayInput = document.getElementById('npayFileInput');
  if (!npayInput) { setTimeout(arguments.callee, 500); return; }
    npayInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      
      var reader = new FileReader();
      reader.onload = async function(ev) {
        try {
          // XLSX 파싱 (SheetJS 사용)
          if (typeof XLSX === 'undefined') {
            // SheetJS 동적 로드
            await new Promise(function(resolve) {
              var script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
              script.onload = resolve;
              document.head.appendChild(script);
            });
          }
          
          var data = new Uint8Array(ev.target.result);
          var workbook = XLSX.read(data, {type: 'array'});
          var sheet = workbook.Sheets[workbook.SheetNames[0]];
          var json = XLSX.utils.sheet_to_json(sheet);
          
          var settlements = json.map(function(row) {
            return {
              npay_order_no: String(row['주문번호'] || ''),
              item_order_no: String(row['상품주문번호'] || ''),
              category: row['구분'] || '',
              product_name: row['상품명'] || '',
              buyer_name: row['구매자명'] || '',
              payment_date: row['결제일'] || '',
              settle_status: row['정산상태'] || '',
              base_amount: row['정산기준금액'] || 0,
              npay_fee: row['Npay 수수료'] || 0,
              sales_fee: row['매출 연동 수수료'] || 0,
              installment_fee: row['무이자할부 수수료'] || 0,
              benefit_amount: row['혜택금액'] || 0,
              settle_amount: row['정산예정금액'] || 0
            };
          });
          
          if (!currentUser || !currentUser.activeBrandId) {
            alert('브랜드를 먼저 선택해주세요.');
            return;
          }
          
          var res = await fetch('/api/upload-npay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settlements: settlements, brandId: currentUser.activeBrandId })
          });
          var result = await res.json();
          
          if (result.success) {
            alert('네이버페이 정산 업로드 완료!\n\n총 ' + result.total + '건 저장\n주문 매칭 ' + result.matched + '건');
            if (currentUser.activeBrandId) loadBrand(currentUser.activeBrandId);
          } else {
            alert('업로드 실패: ' + JSON.stringify(result));
          }
        } catch(err) {
          alert('파일 처리 오류: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
})();

// DB row → JS object 변환에 새 필드 추가
var _origDbToOrder = DB.dbToOrder;
DB.dbToOrder = function(row) {
  var o = _origDbToOrder(row);
  o.memberType = row.member_type || '회원';
  o.orderPrice = parseFloat(row.order_price) || 0;
  o.pointsUsed = parseFloat(row.points_used) || 0;
  o.couponUsed = parseFloat(row.coupon_used) || 0;
  o.npayFee = parseFloat(row.npay_fee) || 0;
  o.settleAmount = parseFloat(row.settle_amount) || 0;
  o.orderPlace = row.order_place || '';
  o.socialName = row.social_name || '';
  return o;
};
