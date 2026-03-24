// localStorage 함수를 DB로 오버라이드
const _origDoRegister = doRegister;
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
  const user = {
    id, name, pwHash: simpleHash(pw),
    brands: [{id: brandId, name: brand}],
    activeBrandId: brandId
  };
  await DB.createUser(user);
  user.brands = [{id: brandId, name: brand, createdAt: new Date().toISOString()}];
  loginAs(user);
};

const _origDoLogin = doLogin;
doLogin = async function() {
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPw').value;
  if (!id || !pw) return showError('아이디와 비밀번호를 입력해주세요.');
  const user = await DB.getUser(id);
  if (!user) return showError('존재하지 않는 아이디입니다.');
  if (user.pw_hash !== simpleHash(pw)) return showError('비밀번호가 일치하지 않습니다.');
  user.pwHash = user.pw_hash;
  user.activeBrandId = user.active_brand_id;
  loginAs(user);
};

const _origLoadBrand = loadBrand;
loadBrand = async function(brandId) {
  const brand = currentUser.brands.find(b => b.id === brandId);
  if (!brand) return;
  currentUser.activeBrandId = brandId;
  await DB.updateActiveBrand(currentUser.id, brandId);
  allOrders = await DB.getOrders(brandId);
  document.getElementById('brandIcon').textContent = brand.name.charAt(0);
  document.getElementById('brandName').textContent = brand.name;
  document.getElementById('brandMeta').textContent = `데이터 ${allOrders.length}건`;
  dateFrom = ''; dateTo = ''; currentPreset = 'all';
  if (allOrders.length > 0) {
    const dates = allOrders.map(o => o.orderDate).filter(Boolean).sort();
    if (dates.length > 0) {
      const last = new Date(dates[dates.length - 1]);
      if (!isNaN(last)) { currentMonth = last.getMonth(); currentYear = last.getFullYear(); }
    }
  }
  renderDashboard();
  renderBrandSelector();
  closeBrandDropdown();
};

saveCurrentBrandData = async function() {
  if (!currentUser) return;
  await DB.upsertOrders(currentUser.activeBrandId, allOrders);
};

const _origAddBrand = addBrand;
addBrand = async function() {
  const name = document.getElementById('newBrandName').value.trim();
  if (!name) return alert('브랜드명을 입력해주세요.');
  const brandId = 'brand_' + Date.now();
  const brand = {id: brandId, name, createdAt: new Date().toISOString()};
  currentUser.brands.push(brand);
  await DB.addBrand(currentUser.id, brand);
  document.getElementById('brandAddModal').style.display = 'none';
  loadBrand(brandId);
  alert(`"${name}" 브랜드가 추가되었습니다.`);
};

const _origDeleteBrand = deleteBrand;
deleteBrand = async function(brandId, brandName) {
  if (!confirm(`"${brandName}" 브랜드와 모든 데이터를 삭제하시겠습니까?`)) return;
  await DB.deleteBrand(brandId);
  currentUser.brands = currentUser.brands.filter(b => b.id !== brandId);
  document.getElementById('brandDeleteModal').style.display = 'none';
  renderBrandSelector();
  alert(`"${brandName}" 삭제 완료.`);
};

clearBrandData = async function() {
  const brand = currentUser.brands.find(b => b.id === currentUser.activeBrandId);
  if (confirm(`"${brand ? brand.name : ''}" 데이터를 삭제하시겠습니까?`)) {
    await DB.clearOrders(currentUser.activeBrandId);
    allOrders = [];
    renderDashboard();
    renderBrandSelector();
  }
};

checkSession = async function() {
  const s = localStorage.getItem('meltin_session');
  if (s) {
    const user = await DB.getUser(s);
    if (user) {
      user.pwHash = user.pw_hash;
      user.activeBrandId = user.active_brand_id;
      loginAs(user);
      return true;
    }
  }
  return false;
};

renderBrandSelector = function() {
  const list = document.getElementById('brandList');
  list.innerHTML = '';
  currentUser.brands.forEach(b => {
    const isActive = b.id === currentUser.activeBrandId;
    const item = document.createElement('div');
    item.className = 'brand-item' + (isActive ? ' active' : '');
    item.onclick = () => loadBrand(b.id);
    item.innerHTML = `<div class="brand-item-icon">${b.name.charAt(0)}</div><div class="brand-item-info"><div class="brand-item-name">${b.name}</div></div>${isActive ? '<span class="check-icon">✓</span>' : ''}`;
    list.appendChild(item);
  });
};

// 초기화: DB에서 세션 확인
(async () => {
  const ok = await checkSession();
  if (!ok) document.getElementById('loginPage').style.display = 'flex';
})();
