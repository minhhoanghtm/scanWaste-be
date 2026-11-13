/* Presentation and navigation only. Uses the existing session, API and business rules. */
(() => {
  const el = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('vi-VN').format(value || 0);
  const date = value => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có ngày';
  const requests = {};
  let guides = [], scanFile, previewUrl, detailId, coords, rewardOrigin;
  let scanPage = 1, activityPage = 1, stationPage = 1;
  const valid = key => { const id = requests[key] = (requests[key] || 0) + 1; const generation = authGeneration; return () => generation === authGeneration && requests[key] === id; };
  function node(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; }
  function message(id, text = '', error = false) { const target = el(id); target.textContent = text; target.hidden = !text; target.classList.toggle('success', !error); }
  function fail(id, error) { if (['UNAUTHORIZED','SESSION_REVOKED','TOKEN_EXPIRED','INVALID_REFRESH_TOKEN','REFRESH_TOKEN_REUSED'].includes(error.code)) { clearAuthentication(); showScreen('login'); showMessage('#login-message', error.message); } else message(id, error.message, true); }
  function card(title, text) { const c = node('article', undefined, 'feature-card'); c.append(node('h2', title)); if (text) c.append(node('p', text)); return c; }
  function image(url) { if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null; const img = node('img'); img.src = new URL(url, location.origin).href; img.alt = 'Ảnh phân loại rác'; img.className = 'result-image'; return img; }
  function button(label, action) { const b = node('button', label, 'secondary-button'); b.type = 'button'; b.addEventListener('click', action); return b; }
  function pagination(prefix, data, page) { el(`${prefix}-prev`).disabled = page <= 1; el(`${prefix}-next`).disabled = !data.hasNextPage && page * (data.limit || 20) >= data.totalCount; el(`${prefix}-page`).textContent = data.totalCount ? `${page} / ${data.totalPages}` : '0 kết quả'; }
  function activityRow(item) { const li = node('li'); const badge = node('span', undefined, 'activity-icon'); badge.append(icon(item.type === 'earned' ? 'recycle' : 'gift')); const copy = node('div', undefined, 'activity-copy'); copy.append(node('strong', item.title || (item.type === 'earned' ? 'Phân loại rác' : 'Đổi quà')), node('small', `${date(item.occurredAt)} · ${item.type === 'earned' ? 'Tích điểm' : 'Đổi quà'}`)); li.append(badge, copy, node('span', `${item.points > 0 ? '+' : ''}${number(item.points)} điểm`, `activity-amount${item.type === 'redeemed' ? ' spent' : ''}`)); return li; }
  function renderUser(user) {
    if (!user) return;
    for (const [id, value] of [['home-balance',user.availablePoints],['home-earned',user.totalPoints],['home-spent',user.spentPoints],['home-scans',user.totalClassifications],['home-badges',user.badges?.length]]) el(id).textContent = number(value);
    el('home-streak').textContent = `${number(user.currentStreak)} ngày`;
    const scans = user.totalClassifications || 0; const next = scans < 1 ? 1 : scans < 10 ? 10 : 50;
    el('home-progress').value = Math.min(100, scans / next * 100);
    el('home-progress-label').textContent = scans >= 50 ? 'Bạn đã đạt mốc 50 lượt phân loại. Tiếp tục sống xanh nhé!' : `Còn ${next - scans} lượt phân loại đến mốc huy hiệu tiếp theo`;
    el('open-esg').hidden = user.role !== 'admin';
  }
  async function loadHome() {
    const current = valid('home'); el('home-refresh').disabled = true; message('home-message'); message('home-activity-message','Đang cập nhật hoạt động…');
    const results = await Promise.allSettled([api('/users/me'), api('/users/me/points/history?page=1&limit=2&type=all')]);
    if (!current()) return;
    el('home-refresh').disabled = false;
    if (results[0].status === 'fulfilled') fillProfile(results[0].value); else fail('home-message', results[0].reason);
    el('home-activity').replaceChildren();
    if (results[1].status === 'fulfilled') { results[1].value.items.forEach(item => el('home-activity').append(activityRow(item))); message('home-activity-message', results[1].value.items.length ? '' : 'Chưa có hoạt động. Cùng bắt đầu phân loại rác nhé!'); }
    else fail('home-activity-message', results[1].reason);
  }
  async function loadGuides() {
    if (guides.length) return guides;
    const response = await fetch('/waste-guide.json'); if (!response.ok) throw new Error('Không tải được hướng dẫn phân loại.');
    guides = await response.json();
    for (const id of ['history-category','station-category','feedback-category']) for (const guide of guides) { const option = node('option', guide.name); option.value = guide.key; el(id).append(option); }
    return guides;
  }
  async function lookup() {
    const current = valid('lookup'); message('lookup-message','Đang tải hướng dẫn…');
    try { await loadGuides(); if (!current()) return; const q = el('waste-search').value.trim().toLocaleLowerCase('vi'); const list = el('waste-guide-list'); list.replaceChildren(); const items = guides.filter(g => `${g.name} ${g.key} ${g.tips.join(' ')}`.toLocaleLowerCase('vi').includes(q));
      for (const item of items) { const detail = node('details', undefined, 'feature-card'); detail.append(node('summary', item.name)); const tips = node('ul'); item.tips.forEach(text => tips.append(node('li', text))); detail.append(tips); list.append(detail); }
      message('lookup-message',items.length ? '' : 'Không tìm thấy loại rác phù hợp. Thử từ khóa khác.');
    } catch (error) { if (current()) fail('lookup-message',error); }
  }
  async function history() {
    const current = valid('history'); message('history-message','Đang tải lịch sử…'); el('scan-history-list').replaceChildren();
    try { await loadGuides(); const data = await api(`/history?page=${scanPage}&limit=10&category=${encodeURIComponent(el('history-category').value)}`); if (!current()) return;
      for (const item of data.items) { const row = button('', () => openDetail(item.id)); row.className = 'feature-card scan-history-row'; const img = image(item.imageUrl); if (img) row.append(img); const copy = node('div'); copy.append(node('h2',item.predictedClassVi || item.predictedClass),node('p',`${number(item.pointsEarned)} điểm · ${Math.round((item.confidence || 0)*100)}%`),node('small',date(item.classifiedAt || item.createdAt))); row.append(copy); el('scan-history-list').append(row); }
      pagination('scans',data.pagination,scanPage); message('history-message',data.items.length ? '' : 'Bạn chưa có lượt phân loại nào.');
    } catch (error) { if (current()) fail('history-message',error); }
  }
  async function activity() {
    const current = valid('activity'); message('activity-message','Đang tải lịch sử điểm…'); el('all-activity').replaceChildren();
    try { const data = await api(`/users/me/points/history?page=${activityPage}&limit=10&type=${el('activity-type').value}`); if (!current()) return; data.items.forEach(item => el('all-activity').append(activityRow(item))); pagination('activity',data.pagination,activityPage); message('activity-message',data.items.length ? '' : 'Chưa có giao dịch trong mục này.'); } catch (error) { if (current()) fail('activity-message',error); }
  }
  async function wallet() {
    const current = valid('wallet'); message('voucher-message','Đang tải ví voucher…'); el('voucher-cards').replaceChildren();
    try { const data = await api(`/vouchers/wallet?status=${el('wallet-status').value}`); if (!current()) return;
      for (const item of data.items) { const c = card(item.voucherName); c.append(node('span',({active:'Có thể dùng',used:'Đã sử dụng',expired:'Đã hết hạn'})[item.status], 'tag'),node('p',`Mã: ${item.voucherCode}`),node('p',`${number(item.pointsUsed)} điểm · Đổi lúc ${date(item.redeemedAt)}`),node('p',item.expiresAt ? `Hết hạn: ${date(item.expiresAt)}` : 'Không giới hạn ngày sử dụng')); if (item.warningMessage) c.append(node('p',item.warningMessage)); el('voucher-cards').append(c); }
      message('voucher-message',data.items.length ? '' : 'Chưa có voucher trong mục này.');
    } catch(error) { if(current()) fail('voucher-message',error); }
  }
  async function statistics() {
    const current = valid('statistics'); message('statistics-message','Đang tải thống kê…'); el('personal-statistics').replaceChildren();
    try { await loadGuides(); const data = await api('/statistics'); if (!current()) return; const summary = card('Tổng lượt phân loại'); summary.append(node('strong',number(data.total),'stat-total')); const breakdown = card('Các loại rác đã phân loại');
      guides.forEach(g => { const row = node('div',undefined,'stat-row'); const label = node('div'); label.append(node('span',g.name),node('strong',number(data[g.key]))); const track = node('div',undefined,'stat-bar'); const bar = node('span'); bar.style.width = `${data.total ? Math.min(100, (data[g.key] || 0)/data.total*100) : 0}%`; track.append(bar); row.append(label,track); breakdown.append(row); });
      el('personal-statistics').append(summary,breakdown); message('statistics-message');
    } catch(error) { if(current()) fail('statistics-message',error); }
  }
  async function openDetail(id) {
    if (!/^[a-f0-9]{24}$/i.test(String(id))) return;
    detailId = id; showScreen('detail'); const current = valid('detail'); message('detail-message','Đang tải chi tiết…'); el('classification-detail').replaceChildren(); el('feedback-form').hidden = true; el('feedback-form').reset(); message('feedback-message');
    try { await loadGuides(); const item = await api(`/history/${id}`); if (!current()) return; const c = card(item.predictedClassVi || item.predictedClass); const img = image(item.imageUrl); if(img) c.prepend(img); c.append(node('p',`Độ tin cậy: ${Math.round(item.confidence*100)}%`),node('p',`Điểm đã nhận: ${number(item.pointsEarned)}`),node('p',`Thời gian: ${date(item.classifiedAt || item.createdAt)}`)); const tips = node('ul'); (item.disposalTips || []).forEach(tip=>tips.append(node('li',tip))); c.append(tips); el('classification-detail').append(c); el('feedback-form').hidden = false; message('detail-message'); } catch(error) { if(current()) fail('detail-message',error); }
  }
  function selectFile(file) {
    if (!file) return; if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024) { message('scan-message','Chọn ảnh JPG, PNG hoặc WEBP, tối đa 5 MB.',true); return; }
    scanFile = file; if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); el('scan-preview').src = previewUrl; el('scan-preview').hidden = false; el('scan-submit').hidden = false; el('scan-result').hidden = true; message('scan-message');
  }
  async function scan() {
    if(!scanFile || el('scan-submit').disabled) return;
    const current = valid('scan'); const controls = ['scan-submit','capture-image','select-image']; controls.forEach(id=>el(id).disabled=true); el('scan-submit').setAttribute('aria-busy','true'); message('scan-message','Đang phân loại ảnh…');
    try { const body = new FormData(); body.append('image',scanFile); const item = await api('/classifications',body); if(!current()) return;
      const c = card(item.predictedClassVi || item.predictedClass,`Độ tin cậy: ${Math.round(item.confidence*100)}% · Điểm đã nhận: ${number(item.pointsEarned)}`); if(item.reviewStatus === 'pending') c.append(node('p','Kết quả đang chờ duyệt; điểm sẽ được cộng theo kết quả duyệt.')); const tips = node('ul'); (item.disposalTips || []).forEach(tip=>tips.append(node('li',tip))); c.append(tips,button('Xem chi tiết / Phản hồi',()=>openDetail(item.classificationId || item.id)),button('Xem lịch sử quét',()=>showScreen('history'))); el('scan-result').replaceChildren(c); el('scan-result').hidden = false; message('scan-message','Đã lưu kết quả phân loại.'); const user = await api('/users/me'); if(current()) fillProfile(user);
    } catch(error) { if(current()) fail('scan-message',error); }
    finally { controls.forEach(id=>el(id).disabled=false); el('scan-submit').setAttribute('aria-busy','false'); }
  }
  async function stations(locate = false) {
    const current = valid('stations'); message('stations-message', locate || !coords ? 'Đang lấy vị trí của bạn…' : 'Đang tìm điểm thu gom…'); el('locate-stations').disabled=true;
    try { await loadGuides(); if(locate || !coords) { if(!navigator.geolocation) throw new Error('Trình duyệt chưa hỗ trợ vị trí.'); coords = await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve(p.coords),()=>reject(new Error('Chưa lấy được vị trí. Hãy cho phép truy cập vị trí rồi thử lại.')),{timeout:10000,maximumAge:60000})); }
      const params = new URLSearchParams({lat:String(coords.latitude),lng:String(coords.longitude),radiusKm:'5',page:String(stationPage),limit:'20',q:el('station-search').value,category:el('station-category').value}); const data = await api(`/stations/nearby?${params}`); if(!current()) return; el('station-cards').replaceChildren();
      for(const item of data.items) { const c = card(item.name,item.address); c.append(node('p',`Cách bạn ${item.distanceKm} km · ${item.status === 'ACTIVE' ? 'Đang hoạt động' : item.status === 'FULL' ? 'Đã đầy' : 'Tạm ngừng tiếp nhận'}`)); (item.acceptedCategories || []).forEach(key=>c.append(node('span',guides.find(g=>g.key===key)?.name || key,'tag'))); if(item.location) { const a = node('a','Xem đường đi','map-link'); a.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.location.latitude},${item.location.longitude}`)}`; a.target='_blank'; a.rel='noopener noreferrer'; c.append(a); } el('station-cards').append(c); }
      pagination('stations',data.pagination,stationPage); message('stations-message',data.items.length ? (data.radiusExpanded ? `Đã mở rộng tìm kiếm trong ${data.radiusKm} km.` : '') : 'Không có điểm thu gom phù hợp quanh vị trí này.');
    } catch(error) { if(current()) fail('stations-message',error); } finally { if(current()) el('locate-stations').disabled=false; }
  }
  async function rewards(path = '/') {
    const current = valid('rewards');
    try {
      if (!rewardOrigin) {
        const response = await fetch('/runtime-config.json');
        if (!response.ok) throw new Error('Chưa lấy được cấu hình màn đổi quà.');
        rewardOrigin = (await response.json()).rewardsUrl;
      }
      if (!current()) return;
      if (!rewardOrigin) { message('rewards-message', 'Màn đổi quà chưa được kết nối. Bạn vẫn có thể xem điểm và ví voucher trong Hồ sơ.'); return; }
      const url = new URL(path, rewardOrigin).href;
      el('rewards-frame').src = url; el('rewards-fullscreen').href = url;
    } catch (error) { if (current()) fail('rewards-message', error); }
  }
  window.addEventListener('ecosort-profile',event=>renderUser(event.detail));
  window.addEventListener('ecosort-screen',event=> { const name = event.detail; if(name==='home') loadHome(); else if(name==='lookup') lookup(); else if(name==='history') history(); else if(name==='activity') activity(); else if(name==='wallet') wallet(); else if(name==='statistics') statistics(); else if(name==='stations') { loadGuides().catch(error=>fail('stations-message',error)); if(!coords) message('stations-message','Bấm Dùng vị trí hiện tại để tìm trạm gần bạn.'); else stations(); } else if(name==='rewards' && !el('rewards-frame').src) rewards(); });
  window.addEventListener('ecosort-logout',()=> { for(const key in requests) requests[key]++; scanFile=null; detailId=null; if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=null; el('scan-preview').removeAttribute('src'); el('scan-preview').hidden=true; el('scan-submit').hidden=true; el('scan-result').replaceChildren(); el('scan-result').hidden=true; el('rewards-frame').removeAttribute('src'); ['home-activity','all-activity','scan-history-list','classification-detail','voucher-cards','personal-statistics','station-cards'].forEach(id=>el(id).replaceChildren()); el('feedback-form').reset(); });
  el('home-refresh').addEventListener('click',loadHome); el('waste-search').addEventListener('input',lookup);
  document.querySelectorAll('[data-open-scan]').forEach(b=>b.addEventListener('click',()=>{showScreen('scan'); el(b.dataset.openScan==='camera'?'scan-camera-input':'scan-library-input').click();}));
  el('capture-image').addEventListener('click',()=>el('scan-camera-input').click()); el('select-image').addEventListener('click',()=>el('scan-library-input').click()); ['scan-camera-input','scan-library-input'].forEach(id=>el(id).addEventListener('change',()=>{selectFile(el(id).files[0]);el(id).value='';})); el('scan-submit').addEventListener('click',scan);
  el('history-category').addEventListener('change',()=>{scanPage=1;history();}); el('scans-prev').addEventListener('click',()=>{if(scanPage>1){scanPage--;history();}}); el('scans-next').addEventListener('click',()=>{scanPage++;history();});
  el('activity-type').addEventListener('change',()=>{activityPage=1;activity();}); el('activity-prev').addEventListener('click',()=>{if(activityPage>1){activityPage--;activity();}}); el('activity-next').addEventListener('click',()=>{activityPage++;activity();}); el('wallet-status').addEventListener('change',wallet);
  el('locate-stations').addEventListener('click',()=>{stationPage=1;stations(true);}); el('filter-stations').addEventListener('click',()=>{stationPage=1;stations();}); el('stations-prev').addEventListener('click',()=>{if(stationPage>1){stationPage--;stations();}}); el('stations-next').addEventListener('click',()=>{stationPage++;stations();});
  el('open-esg').addEventListener('click',()=>{showScreen('rewards');rewards('/esg-budget');});
  el('feedback-form').addEventListener('submit',async event=>{event.preventDefault();if(el('send-feedback').disabled || !detailId)return;const current=valid('feedback');el('send-feedback').disabled=true;try{await api('/ai/feedback',{classificationId:detailId,correctClass:el('feedback-category').value,comment:el('feedback-comment').value,isCorrect:false,consentGiven:el('feedback-consent').checked});if(current())message('feedback-message','Đã gửi phản hồi để nhóm kiểm tra.');}catch(error){if(current())fail('feedback-message',error);}finally{el('send-feedback').disabled=false;}});
})();
