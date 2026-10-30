// ===========================================
// Minyak Tracker v6 — dalam Portal LPP
// Login dikongsi (../login.html). Hanya admin & kerani; RLS dalam Supabase
// menyekat data untuk peranan lain.
// ===========================================

import { supabase as sb, requireApp, logout } from '../shared/auth.js';

const MONTH_NAMES = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
const RECEIPT_BUCKET = 'minyak-receipts';  // private: buka guna signed URL
const BG_BUCKET = 'app-assets';            // bucket awam Penyu, folder minyak/

let state = {
  viewDate: new Date(),
  view: 'month',       // 'month' | 'year'
  entries: [],
  selectedFuel: 'diesel',
  pendingFile: null,
  currentUser: null,
  isAdmin: false,
  pendingBgFile: null,
};

// ── Helpers ──────────────────────────────────────
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtRM(n) {
  return 'RM'+Number(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtKm(n) { return Number(n||0).toLocaleString('en-MY',{maximumFractionDigits:1}); }
function fmtDateShort(s) { return new Date(s+'T00:00:00').toLocaleDateString('ms-MY',{day:'numeric',month:'short'}); }
function fmtDateLong(s)  { return new Date(s+'T00:00:00').toLocaleDateString('ms-MY',{day:'numeric',month:'long',year:'numeric'}); }
function monthRange(d) {
  const s=new Date(d.getFullYear(),d.getMonth(),1);
  const e=new Date(d.getFullYear(),d.getMonth()+1,0);
  return {start:toLocalDateStr(s),end:toLocalDateStr(e)};
}
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.hidden=false;
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>{t.hidden=true;},2200);
}

// ── Background Video ──────────────────────────────
async function loadBackgroundVideo() {
  try {
    const {data} = await sb.from('minyak_settings').select('value').eq('key','bg_video_url').maybeSingle();
    if(data?.value) applyBgVideo(data.value);
  } catch(_) {}
}

function applyBgVideo(url) {
  const vid = document.getElementById('bgVideo');
  const fallback = document.getElementById('bgFallback');

  if(!url) {
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
    vid.classList.remove('loaded');
    if(fallback) fallback.style.opacity='1';
    return;
  }

  // Clear old handlers
  vid.oncanplay = null;
  vid.onerror = null;
  vid.classList.remove('loaded');

  vid.muted = true;
  vid.loop = true;
  vid.autoplay = true;
  vid.setAttribute('src', url);

  vid.oncanplay = () => {
    vid.classList.add('loaded');
    if(fallback) fallback.style.opacity='0';
    vid.play().catch(() => {
      // Autoplay blocked by browser policy but video is loaded
      vid.classList.add('loaded');
    });
  };

  vid.onerror = () => {
    console.error('BG video load error for:', url);
    vid.classList.remove('loaded');
    if(fallback) fallback.style.opacity='1';
    showToast('Video gagal load. Cuba refresh.');
  };

  vid.load();

  // Update admin panel label
  const wrap = document.getElementById('bgCurrentUrl');
  const txt  = document.getElementById('bgUrlText');
  if(wrap && txt) { txt.textContent = url.split('/').pop(); wrap.hidden = false; }
}

// ── Auth (login bersama) ──────────────────────────
async function initAuth() {
  // Belum log masuk => ../login.html; bukan admin/kerani => portal.
  const {user, profile} = await requireApp('minyak');
  state.currentUser = user;
  state.isAdmin = profile.role === 'admin';
  document.getElementById('userEmailDisplay').textContent = profile.full_name || user.email;
  document.getElementById('adminBadge').hidden = !state.isAdmin;
  document.getElementById('adminBtn').hidden = !state.isAdmin;
  document.getElementById('app').hidden = false;
  loadBackgroundVideo();
  loadEntries();
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('adminBtn').addEventListener('click', openAdminDialog);

const adminDialog = document.getElementById('adminDialog');
document.getElementById('adminDialogClose').addEventListener('click',()=>adminDialog.close());
adminDialog.addEventListener('click',e=>{if(e.target===adminDialog)adminDialog.close();});

function openAdminDialog() {
  if(!state.isAdmin)return;
  if(addDialog.open)addDialog.close();
  if(detailDialog.open)detailDialog.close();
  adminDialog.showModal();
  refreshLegacyStatus();
}

// ── Admin: Background Video Upload ───────────────
const videoDrop = document.getElementById('videoDrop');
const bgVideoFile = document.getElementById('bgVideoFile');

videoDrop.addEventListener('click',e=>{if(e.target.id!=='bgVideoFile')bgVideoFile.click();});
bgVideoFile.addEventListener('change',()=>{
  const file=bgVideoFile.files[0]; if(!file)return;
  if(file.size>52428800){showToast('Video terlalu besar (max 50MB)');return;}
  state.pendingBgFile=file;
  document.getElementById('videoDropEmpty').hidden=true;
  document.getElementById('videoDropPreview').hidden=false;
  document.getElementById('videoFileName').textContent=file.name;
  document.getElementById('bgUploadBtn').disabled=false;
});

document.getElementById('bgUploadBtn').addEventListener('click', async()=>{
  if(!state.pendingBgFile)return;
  const btn=document.getElementById('bgUploadBtn');
  const msg=document.getElementById('bgMsg');
  const prog=document.getElementById('bgUploadProgress');
  const bar=document.getElementById('bgUploadBar');
  const label=document.getElementById('bgUploadLabel');
  btn.disabled=true; btn.textContent='Uploading...';
  msg.hidden=true; prog.hidden=false; bar.style.width='0%'; label.textContent='0%';

  try {
    const file=state.pendingBgFile;
    const ext=file.name.split('.').pop();
    const path=`minyak/bg_${Date.now()}.${ext}`;
    // Upload with progress simulation (Supabase JS v2 doesn't have upload progress natively)
    bar.style.width='30%'; label.textContent='30%';
    const {error:upErr} = await sb.storage.from(BG_BUCKET).upload(path,file,{upsert:true});
    if(upErr) throw new Error(upErr.message);
    bar.style.width='80%'; label.textContent='80%';
    const {data:urlData} = sb.storage.from(BG_BUCKET).getPublicUrl(path);
    const url=urlData.publicUrl;
    // Save to settings
    const {error:setErr} = await sb.from('minyak_settings')
      .upsert({key:'bg_video_url',value:url,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(setErr) {
      // Log but don't block — video is already uploaded, just settings save failed
      console.warn('Settings save warning:', setErr.message);
    }
    bar.style.width='100%'; label.textContent='100%';
    applyBgVideo(url);
    showToast('Background video dikemaskini ✓');
    state.pendingBgFile=null;
    bgVideoFile.value='';
    document.getElementById('videoDropEmpty').hidden=false;
    document.getElementById('videoDropPreview').hidden=true;
    btn.textContent='Upload Video'; btn.disabled=true;
  } catch(err){
    msg.textContent=err.message||'Upload gagal.'; msg.hidden=false;
    btn.textContent='Upload Video'; btn.disabled=false;
  } finally {
    setTimeout(()=>prog.hidden=true,1500);
  }
});

document.getElementById('bgRefreshBtn').addEventListener('click', async()=>{
  showToast('Loading video...');
  await loadBackgroundVideo();
  showToast('Video di-refresh ✓');
});

document.getElementById('bgRemoveBtn').addEventListener('click', async()=>{
  if(!confirm('Buang background video?'))return;
  const {error} = await sb.from('minyak_settings')
    .upsert({key:'bg_video_url',value:'',updated_at:new Date().toISOString()},{onConflict:'key'});
  if(!error){
    applyBgVideo('');
    document.getElementById('bgCurrentUrl').hidden=true;
    showToast('Background dibuang');
  }
});

// ── Admin: Pindah resit lama ──────────────────────
// Entri yang diimport dari projek lama masih ada receipt_url (pautan awam
// projek lama). Salin fail ke bucket baharu pada receipt_path yang sama, kemudian
// kosongkan receipt_url. Entri baharu tidak pernah ada receipt_url.
async function legacyEntries(){
  const {data,error}=await sb.from('minyak_entries').select('id,receipt_url,receipt_path').not('receipt_url','is',null);
  if(error)throw new Error(error.message);
  return (data||[]).filter(e=>e.receipt_path);
}

async function refreshLegacyStatus(){
  const st=document.getElementById('legacyStatus');
  const btn=document.getElementById('legacyBtn');
  st.textContent='Menyemak...';
  try{
    const list=await legacyEntries();
    st.textContent=list.length?`${list.length} resit belum dipindah.`:'Semua resit sudah dipindah ✓';
    btn.disabled=!list.length;
    document.getElementById('legacyFolderBtn').disabled=!list.length;
  }catch(err){st.textContent='Gagal semak: '+err.message;}
}

// Upload satu fail resit ke receipt_path entri, kemudian tanda entri sudah dipindah.
async function migrateReceipt(entry,blob){
  const {error:upE}=await sb.storage.from(RECEIPT_BUCKET).upload(entry.receipt_path,blob,{upsert:true,contentType:blob.type||undefined});
  if(upE)throw new Error(upE.message);
  const {error:updE}=await sb.from('minyak_entries').update({receipt_url:null}).eq('id',entry.id);
  if(updE)throw new Error(updE.message);
}

// Dari folder backup storage: receipts/<user-id>/<fail>. Padan ikut laluan
// selepas "receipts/" (sama dengan receipt_path), atau ikut nama fail.
const legacyFolder=document.getElementById('legacyFolder');
document.getElementById('legacyFolderBtn').addEventListener('click',()=>legacyFolder.click());
legacyFolder.addEventListener('change',async()=>{
  const files=[...legacyFolder.files];
  legacyFolder.value='';
  if(!files.length)return;
  const btn=document.getElementById('legacyFolderBtn');
  const st=document.getElementById('legacyStatus');
  const msg=document.getElementById('legacyMsg');
  msg.hidden=true; btn.disabled=true;
  let ok=0; const failed=[];
  try{
    const list=await legacyEntries();
    const byPath=new Map(list.map(e=>[e.receipt_path,e]));
    const byName=new Map(list.map(e=>[e.receipt_path.split('/').pop(),e]));
    const matches=[];
    for(const f of files){
      const rel=(f.webkitRelativePath||f.name).replace(/\\/g,'/');
      const i=rel.lastIndexOf('receipts/');
      const e=byPath.get(i>=0?rel.slice(i+9):rel)||byName.get(f.name);
      if(e&&!matches.some(m=>m.e===e))matches.push({e,f});
    }
    if(!matches.length)throw new Error('Tiada fail yang sepadan. Pastikan anda pilih folder "receipts" dari backup.');
    for(const [n,{e,f}] of matches.entries()){
      st.textContent=`Memindah ${n+1} / ${matches.length}...`;
      try{await migrateReceipt(e,f);ok++;}catch(err){failed.push(err.message);}
    }
  }catch(err){failed.push(err.message);}
  if(failed.length){
    msg.textContent=`${ok} berjaya, ${failed.length} gagal (${failed[0]}).`;
    msg.hidden=false;
  } else showToast(`${ok} resit dipindah ✓`);
  await refreshLegacyStatus();
  loadEntries();
});

document.getElementById('legacyBtn').addEventListener('click',async()=>{
  const btn=document.getElementById('legacyBtn');
  const st=document.getElementById('legacyStatus');
  const msg=document.getElementById('legacyMsg');
  msg.hidden=true; btn.disabled=true;
  let ok=0; const failed=[];
  try{
    const list=await legacyEntries();
    for(const [n,e] of list.entries()){
      st.textContent=`Memindah ${n+1} / ${list.length}...`;
      try{
        const res=await fetch(e.receipt_url);
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        await migrateReceipt(e,await res.blob());
        ok++;
      }catch(err){failed.push(err.message);}
    }
  }catch(err){failed.push(err.message);}
  if(failed.length){
    msg.textContent=`${ok} berjaya, ${failed.length} gagal (${failed[0]}). Pastikan projek lama sudah di-resume, kemudian cuba lagi.`;
    msg.hidden=false;
  } else showToast(`${ok} resit dipindah ✓`);
  await refreshLegacyStatus();
  loadEntries();
});

// ── Data ──────────────────────────────────────────
function periodRange(){
  if(state.view==='year'){const y=state.viewDate.getFullYear();return{start:`${y}-01-01`,end:`${y}-12-31`};}
  return monthRange(state.viewDate);
}

async function loadEntries() {
  const {start,end}=periodRange();
  const {data,error}=await sb.from('minyak_entries').select('*')
    .gte('entry_date',start).lte('entry_date',end)
    .order('entry_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){showToast('Gagal load data.');return;}
  state.entries=data||[];
  render();
}

function render(){
  const isYear=state.view==='year';
  document.getElementById('monthText').textContent=isYear
    ?`${state.viewDate.getFullYear()}`
    :`${MONTH_NAMES[state.viewDate.getMonth()]} ${state.viewDate.getFullYear()}`;
  document.getElementById('gaugeSub').textContent=isYear?'jumlah tahun ini':'jumlah bulan ini';
  document.getElementById('emptyTitle').textContent=isYear?'Takde rekod tahun ni':'Takde rekod bulan ni';
  document.querySelectorAll('#viewToggle button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  renderGauge(); renderStats(); renderYear(); renderHistory();
}

// Paparan Tahun: ringkasan setiap bulan (Diesel vs RON95). Tekan bulan => paparan Bulan.
function renderYear(){
  const sec=document.getElementById('yearSection');
  sec.hidden=state.view!=='year';
  if(sec.hidden)return;
  const months=MONTH_NAMES.map(()=>({diesel:0,ron95:0,n:0}));
  for(const e of state.entries){
    const m=months[Number(e.entry_date.slice(5,7))-1];
    m[e.fuel_type]+=Number(e.amount||0); m.n++;
  }
  const max=Math.max(1,...months.map(m=>m.diesel+m.ron95));
  const table=document.getElementById('yearTable');
  table.innerHTML='';
  months.forEach((m,i)=>{
    const tot=m.diesel+m.ron95;
    const btn=document.createElement('button');
    btn.type='button'; btn.className='year-row'+(m.n?'':' empty');
    btn.innerHTML=`
      <span class="yr-month">${MONTH_NAMES[i].slice(0,3)}</span>
      <span class="yr-bar"><span class="yr-seg yr-diesel" style="width:${m.diesel/max*100}%"></span><span class="yr-seg yr-ron" style="width:${m.ron95/max*100}%"></span></span>
      <span class="yr-total">${m.n?fmtRM(tot):'—'}</span>
      <span class="yr-n">${m.n?`${m.n} entry`:''}</span>`;
    btn.title=m.n?`Diesel ${fmtRM(m.diesel)} · RON95 ${fmtRM(m.ron95)}`:'';
    btn.addEventListener('click',()=>{
      state.view='month';
      state.viewDate=new Date(state.viewDate.getFullYear(),i,1);
      loadEntries();
    });
    table.appendChild(btn);
  });
}

function renderGauge(){
  const dT=sum('diesel'),rT=sum('ron95'),tot=dT+rT;
  document.getElementById('gaugeTotal').textContent=fmtRM(tot);
  document.getElementById('dieselTotal').textContent=fmtRM(dT);
  document.getElementById('ronTotal').textContent=fmtRM(rT);
  const cx=120,cy=130,r=90;
  document.getElementById('gaugeTrack').setAttribute('d',arc(cx,cy,r,180,0));
  if(tot<=0){document.getElementById('gaugeDiesel').setAttribute('d','');document.getElementById('gaugeRon').setAttribute('d','');return;}
  const dEnd=180-(dT/tot*180);
  document.getElementById('gaugeDiesel').setAttribute('d',arc(cx,cy,r,180,dEnd));
  document.getElementById('gaugeRon').setAttribute('d',arc(cx,cy,r,dEnd,0));
}
function sum(ft){return state.entries.filter(e=>e.fuel_type===ft).reduce((a,e)=>a+Number(e.amount||0),0);}
function polar(cx,cy,r,a){const rad=a*Math.PI/180;return{x:cx+r*Math.cos(rad),y:cy-r*Math.sin(rad)};}
function arc(cx,cy,r,sa,ea){
  if(Math.abs(sa-ea)<.01)return'';
  const s=polar(cx,cy,r,sa),e=polar(cx,cy,r,ea);
  return`M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(sa-ea)>180?1:0} 1 ${e.x} ${e.y}`;
}

function renderStats(){
  const km=state.entries.reduce((a,e)=>a+Number(e.distance_km||0),0);
  document.getElementById('statMileage').innerHTML=`${fmtKm(km)} <span class="unit">km</span>`;
  const pend=state.entries.filter(e=>e.needs_claim&&e.claim_status==='pending').reduce((a,e)=>a+Number(e.amount||0),0);
  document.getElementById('statPending').textContent=fmtRM(pend);
}

function renderHistory(){
  const list=document.getElementById('historyList');
  const empty=document.getElementById('emptyState');
  list.innerHTML='';
  if(!state.entries.length){empty.hidden=false;document.getElementById('historyCount').textContent='';return;}
  empty.hidden=true;
  document.getElementById('historyCount').textContent=`${state.entries.length} entry`;
  let lastMonth=null;
  for(const entry of state.entries){
    // Paparan Tahun: tajuk setiap bulan dalam senarai.
    const mo=entry.entry_date.slice(0,7);
    if(state.view==='year'&&mo!==lastMonth){
      lastMonth=mo;
      const h=document.createElement('li');
      h.className='history-month';
      h.textContent=`${MONTH_NAMES[Number(mo.slice(5,7))-1]} ${mo.slice(0,4)}`;
      list.appendChild(h);
    }
    const li=document.createElement('li');
    const isD=entry.fuel_type==='diesel';
    const isOwner=state.currentUser&&entry.user_id===state.currentUser.id;
    const kmH=entry.distance_km?`<span class="h-km">${fmtKm(entry.distance_km)} km</span>`:'';
    const clH=entry.needs_claim?`<span class="h-claim-pill ${entry.claim_status==='claimed'?'claimed':'pending'}">${entry.claim_status==='claimed'?'Dah Claim':'Pending'}</span>`:'';
    const recH=(entry.receipt_path||entry.receipt_url)?'<span class="h-receipt-dot">📎</span>':'';
    const btn=document.createElement('button');
    btn.type='button'; btn.className='history-item';
    btn.innerHTML=`
      <div class="h-fuel-badge ${isD?'diesel':'ron'}">${isD?'🚗':'🚤'}</div>
      <div class="h-main">
        <div class="h-top">
          <span class="h-fuel-name">${isD?'Diesel':'RON95 (Boat)'}</span>
          <span class="h-amount">${fmtRM(entry.amount)}</span>
        </div>
        <div class="h-bottom">
          <div style="display:flex;flex-direction:column;gap:1px;">
            <span class="h-date">${fmtDateShort(entry.entry_date)}</span>
            <span class="h-owner">${entry.user_email||''}</span>
          </div>
          <div class="h-meta">${kmH}${recH}${clH}</div>
        </div>
      </div>`;
    btn.addEventListener('click',()=>openDetail(entry,isOwner));
    li.appendChild(btn); list.appendChild(li);
  }
}

// Month nav
document.querySelectorAll('.chev').forEach(c=>{
  c.addEventListener('click',()=>{
    const d=parseInt(c.dataset.dir,10);
    state.viewDate=state.view==='year'
      ?new Date(state.viewDate.getFullYear()+d,state.viewDate.getMonth(),1)
      :new Date(state.viewDate.getFullYear(),state.viewDate.getMonth()+d,1);
    loadEntries();
  });
});

document.getElementById('viewToggle').addEventListener('click',e=>{
  const b=e.target.closest('button[data-view]');
  if(!b||b.dataset.view===state.view)return;
  state.view=b.dataset.view;
  loadEntries();
});

// ── Add Entry ─────────────────────────────────────
const addDialog=document.getElementById('addDialog');
const detailDialog=document.getElementById('detailDialog');
const odoStart=document.getElementById('odoStart');
const odoEnd=document.getElementById('odoEnd');
const submitBtn=document.getElementById('submitBtn');
const formError=document.getElementById('formError');

document.getElementById('fabAdd').addEventListener('click',openAddDialog);
document.getElementById('addDialogClose').addEventListener('click',()=>addDialog.close());
document.getElementById('detailDialogClose').addEventListener('click',()=>detailDialog.close());
addDialog.addEventListener('click',e=>{if(e.target===addDialog)addDialog.close();});
detailDialog.addEventListener('click',e=>{if(e.target===detailDialog)detailDialog.close();});

function openAddDialog(){
  if(detailDialog.open)detailDialog.close();
  state.pendingFile=null; state.selectedFuel='diesel';
  document.getElementById('entryForm').reset();
  document.getElementById('entryDate').value=toLocalDateStr(new Date());
  setFuel('diesel'); resetDrop(); formError.hidden=true;
  submitBtn.disabled=false; submitBtn.textContent='Simpan Entry';
  addDialog.showModal();
}
function setFuel(f){
  state.selectedFuel=f;
  document.querySelectorAll('.fuel-opt').forEach(b=>b.classList.toggle('active',b.dataset.fuel===f));
}
document.getElementById('fuelToggle').addEventListener('click',e=>{const b=e.target.closest('.fuel-opt');if(b)setFuel(b.dataset.fuel);});

odoStart.addEventListener('input',updateDist);
odoEnd.addEventListener('input',updateDist);
function updateDist(){
  const s=parseFloat(odoStart.value),e=parseFloat(odoEnd.value);
  const prev=document.getElementById('distancePreview');
  if(!isNaN(s)&&!isNaN(e)&&e>=s){document.getElementById('distanceValue').textContent=fmtKm(e-s);prev.hidden=false;}
  else prev.hidden=true;
}

// Receipt file
const dropZone=document.getElementById('dropZone');
const receiptFile=document.getElementById('receiptFile');
dropZone.addEventListener('click',e=>{if(e.target.id!=='removeFile')receiptFile.click();});
receiptFile.addEventListener('change',()=>{const f=receiptFile.files[0];if(f){state.pendingFile=f;showFilePrev(f);}});
document.getElementById('removeFile').addEventListener('click',e=>{e.stopPropagation();state.pendingFile=null;receiptFile.value='';resetDrop();});
function resetDrop(){document.getElementById('dropZoneEmpty').hidden=false;document.getElementById('dropZonePreview').hidden=true;document.getElementById('previewImg').hidden=true;document.getElementById('previewPdf').hidden=true;}
function showFilePrev(f){
  document.getElementById('dropZoneEmpty').hidden=true;document.getElementById('dropZonePreview').hidden=false;
  if(f.type==='application/pdf'){document.getElementById('previewImg').hidden=true;document.getElementById('previewPdf').hidden=false;document.getElementById('previewPdfName').textContent=f.name;}
  else{const r=new FileReader();r.onload=ev=>{const i=document.getElementById('previewImg');i.src=ev.target.result;i.hidden=false;document.getElementById('previewPdf').hidden=true;};r.readAsDataURL(f);}
}

// Submit
submitBtn.addEventListener('click',async()=>{
  formError.hidden=true;submitBtn.disabled=true;submitBtn.textContent='Menyimpan...';
  try{
    const date=document.getElementById('entryDate').value;
    const amount=parseFloat(document.getElementById('entryAmount').value);
    const needsClaim=document.getElementById('needsClaim').checked;
    const notes=document.getElementById('entryNotes').value.trim();
    const oS=odoStart.value?parseFloat(odoStart.value):null;
    const oE=odoEnd.value?parseFloat(odoEnd.value):null;
    if(!date)throw new Error('Sila pilih tarikh.');
    if(isNaN(amount)||amount<=0)throw new Error('Sila masukkan amount yang sah.');
    if(oS!==null&&oE!==null&&oE<oS)throw new Error('Odometer akhir mesti lebih besar.');
    let recPath=null;
    if(state.pendingFile){
      const f=state.pendingFile,ext=f.name.split('.').pop();
      const path=`${state.currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
      const{error:upE}=await sb.storage.from(RECEIPT_BUCKET).upload(path,f);
      if(upE)throw new Error('Gagal upload resit.');
      recPath=path;
    }
    const payload={
      entry_date:date,fuel_type:state.selectedFuel,
      odometer_start:oS,odometer_end:oE,
      distance_km:oS!==null&&oE!==null?oE-oS:null,
      amount,needs_claim:needsClaim,
      claim_status:needsClaim?'pending':'not_applicable',
      notes:notes||null,user_id:state.currentUser.id,user_email:state.currentUser.email,
    };
    if(recPath)payload.receipt_path=recPath;
    const{error:insE}=await sb.from('minyak_entries').insert(payload);
    if(insE)throw new Error(insE.message);
    addDialog.close();showToast('Entry disimpan ✓');await loadEntries();
  }catch(err){formError.textContent=err.message||'Ralat.';formError.hidden=false;}
  finally{submitBtn.disabled=false;submitBtn.textContent='Simpan Entry';}
});

// ── Import resit Setel (PDF) ──────────────────────
// Aliran sama macam Penyu Tracker: baca → semak (anti-pendua, amaran) →
// sahkan dengan kiraan undur → simpan. Tiada apa disimpan sebelum disahkan.
const importDialog=document.getElementById('importDialog');
const importFiles=document.getElementById('importFiles');
const importList=document.getElementById('importList');
const importSave=document.getElementById('importSave');
const importBack=document.getElementById('importBack');
const FUEL_LABEL={diesel:'Diesel',ron95:'RON95 (Boat)'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let imp={rows:[],stage:'review',timer:null,seq:0};

document.getElementById('importOpen').addEventListener('click',openImport);
document.getElementById('importClose').addEventListener('click',()=>importDialog.close());
document.getElementById('importDrop').addEventListener('click',()=>importFiles.click());
importDialog.addEventListener('close',()=>{clearInterval(imp.timer);if(imp.stage==='done')loadEntries();});
importFiles.addEventListener('change',()=>{const f=[...importFiles.files];importFiles.value='';if(f.length)addImportFiles(f);});
document.getElementById('importClaimAll').addEventListener('change',e=>{
  imp.rows.forEach(r=>{if(r.status!=='fail'&&r.status!=='dup')r.claim=e.target.checked;});
  renderImport();
});
importBack.addEventListener('click',()=>{
  if(imp.stage==='confirm'){setImportStage('review');return;}
  importFiles.click();
});
importSave.addEventListener('click',()=>{
  if(imp.stage==='review')setImportStage('confirm');
  else if(imp.stage==='confirm')saveImport();
  else if(imp.stage==='done')importDialog.close();
});

function openImport(){
  if(addDialog.open)addDialog.close();
  if(detailDialog.open)detailDialog.close();
  imp={rows:[],stage:'review',timer:null,seq:0};
  document.getElementById('importPick').hidden=false;
  document.getElementById('importReview').hidden=true;
  document.getElementById('importFooter').hidden=true;
  document.getElementById('importClaimAll').checked=false;
  importList.innerHTML='';
  importDialog.showModal();
}

async function addImportFiles(files){
  if(imp.stage!=='review')return;
  document.getElementById('importPick').hidden=true;
  document.getElementById('importReview').hidden=false;
  document.getElementById('importFooter').hidden=false;
  const prog=document.getElementById('importProgress');
  importSave.disabled=true;
  // pdf.js hanya dimuat bila perlu (fail besar).
  const {readSetelPdf}=await import('./setel.js');
  for(const [n,file] of files.entries()){
    prog.textContent=`Membaca PDF ${n+1} / ${files.length}...`;
    const parsed=await readSetelPdf(file);
    const d=parsed.ok?parsed.data:{};
    imp.rows.push({id:++imp.seq,file,parsed,status:parsed.ok?'new':'fail',include:parsed.ok,
      date:d.date||'',fuel:d.fuel||'',amount:d.amount??'',claim:document.getElementById('importClaimAll').checked,
      notes:d.notes||'',reason:'',result:null});
  }
  prog.textContent='Menyemak pendua...';
  await classifyImport();
  prog.textContent='Semak setiap resit di bawah. Betulkan jika perlu, kemudian tekan Simpan.';
  renderImport();
}

// Pendua: (1) nombor invois sudah ada dalam sistem; (2) PDF sama dipilih
// lebih sekali; (3) "mungkin pendua": entri lain dengan tarikh, jenis dan
// jumlah sama (cth pernah key in manual) — tidak dimasukkan kecuali ditanda.
async function classifyImport(){
  const ok=imp.rows.filter(r=>r.parsed.ok);
  const refs=[...new Set(ok.map(r=>r.parsed.data.ref))];
  const dates=[...new Set(ok.map(r=>r.parsed.data.date))];
  let byRef=new Map(),sameDay=[];
  if(refs.length){
    const [a,b]=await Promise.all([
      sb.from('minyak_entries').select('receipt_ref,entry_date,user_email').in('receipt_ref',refs),
      sb.from('minyak_entries').select('entry_date,fuel_type,amount,user_email,receipt_ref').in('entry_date',dates),
    ]);
    const err=a.error||b.error;
    if(err){
      for(const r of ok){r.status='fail';r.include=false;r.reason=/receipt_ref/.test(err.message)
        ?'Database belum dikemas kini. Admin perlu run migration-minyak-setel.sql dalam Supabase.'
        :'Gagal semak pendua: '+err.message;}
      return;
    }
    byRef=new Map((a.data||[]).map(e=>[e.receipt_ref,e]));
    sameDay=b.data||[];
  }
  const seen=new Set();
  for(const r of imp.rows){
    if(!r.parsed.ok){r.reason=r.parsed.error;continue;}
    if(r.result)continue;
    const d=r.parsed.data,hit=byRef.get(d.ref);
    if(hit){r.status='dup';r.include=false;r.reason=`Sudah ada dalam sistem (${fmtDateShort(hit.entry_date)}, oleh ${hit.user_email||'?'}).`;}
    else if(seen.has(d.ref)){r.status='dup';r.include=false;r.reason='PDF yang sama dipilih lebih sekali.';}
    else{
      const like=sameDay.find(e=>!e.receipt_ref&&e.entry_date===d.date&&e.fuel_type===d.fuel&&Math.abs(Number(e.amount)-d.amount)<0.005);
      if(like&&r.status!=='maybe'){r.status='maybe';r.include=false;r.reason=`Mungkin sama dengan entri ${fmtRM(like.amount)} pada ${fmtDateShort(like.entry_date)} oleh ${like.user_email||'?'}. Tanda kotak jika ini resit berbeza.`;}
      else if(!like){r.status='new';r.reason='';}
    }
    seen.add(d.ref);
  }
}

const STATUS_CHIP={new:['Baharu','ok'],maybe:['Mungkin pendua','warn'],dup:['Pendua','bad'],fail:['Gagal baca','bad']};

function renderImport(){
  const locked=imp.stage!=='review';
  importList.innerHTML='';
  imp.rows.forEach(r=>{
    const li=document.createElement('li');
    const [chip,tone]=r.result==='ok'?['✓ Disimpan','ok']:r.result?['✗ Gagal simpan','bad']:STATUS_CHIP[r.status];
    const canInclude=r.status==='new'||r.status==='maybe';
    li.className=`imp-item imp-${tone}${r.include?'':' imp-off'}`;
    const d=r.parsed.data||{};
    const warns=[...(r.parsed.warnings||[]),r.reason,typeof r.result==='string'&&r.result!=='ok'?r.result:''].filter(Boolean);
    li.innerHTML=`
      <div class="imp-head">
        <label class="imp-include"><input type="checkbox" data-k="include" ${r.include?'checked':''} ${canInclude&&!locked?'':'disabled'} />
          <span class="imp-file">${esc(r.file.name)}</span></label>
        <span class="imp-chip imp-chip-${tone}">${chip}</span>
      </div>
      ${r.parsed.ok?`
      <div class="imp-grid">
        <label class="imp-f"><span>Tarikh</span><input type="date" data-k="date" value="${esc(r.date)}" ${locked?'disabled':''} /></label>
        <label class="imp-f"><span>Jenis</span><select data-k="fuel" ${locked?'disabled':''}>
          <option value="" ${r.fuel?'':'selected'}>— Pilih —</option>
          <option value="diesel" ${r.fuel==='diesel'?'selected':''}>Diesel</option>
          <option value="ron95" ${r.fuel==='ron95'?'selected':''}>RON95 (Boat)</option></select></label>
        <label class="imp-f"><span>Amount (RM)</span><input type="number" step="0.01" inputmode="decimal" data-k="amount" value="${esc(r.amount)}" ${locked?'disabled':''} /></label>
        <label class="imp-f imp-claim"><input type="checkbox" data-k="claim" ${r.claim?'checked':''} ${locked?'disabled':''} /><span>Perlu claim</span></label>
        <label class="imp-f imp-notes"><span>Nota</span><input type="text" data-k="notes" value="${esc(r.notes)}" ${locked?'disabled':''} /></label>
      </div>
      <div class="imp-meta">${esc(d.itemName||'')} · ${esc(d.time||'')}${d.gross!=null&&d.subsidy?` · Harga pam ${fmtRM(d.gross)} − subsidi ${fmtRM(d.subsidy)}`:''}</div>`:''}
      ${warns.length?`<div class="imp-warn">${warns.map(w=>`<div>⚠ ${esc(w)}</div>`).join('')}</div>`:''}`;
    li.querySelectorAll('[data-k]').forEach(el=>{
      const k=el.dataset.k;
      el.addEventListener(el.type==='checkbox'||el.tagName==='SELECT'?'change':'input',()=>{
        r[k]=el.type==='checkbox'?el.checked:k==='amount'?(el.value===''?'':Number(el.value)):el.value;
        if(k==='include')li.classList.toggle('imp-off',!r.include);
        updateImportSummary();
      });
    });
    importList.appendChild(li);
  });
  updateImportSummary();
}

function importProblems(rows){
  const p=[];
  rows.forEach(r=>{
    const n=r.file.name;
    if(!r.fuel)p.push(`${n}: pilih jenis minyak.`);
    if(!(Number(r.amount)>0))p.push(`${n}: amount tidak sah.`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))p.push(`${n}: tarikh tidak sah.`);
    else if(r.date>toLocalDateStr(new Date()))p.push(`${n}: tarikh pada masa depan.`);
  });
  return p;
}

function updateImportSummary(){
  const rows=imp.rows.filter(r=>r.include&&!r.result);
  const sumBy=f=>rows.filter(r=>r.fuel===f).reduce((a,r)=>a+Number(r.amount||0),0);
  const tot=rows.reduce((a,r)=>a+Number(r.amount||0),0);
  const claims=rows.filter(r=>r.claim).length;
  const skipped=imp.rows.filter(r=>!r.include&&!r.result).length;
  const saved=imp.rows.filter(r=>r.result==='ok').length;
  const sum=document.getElementById('importSummary');
  const errBox=document.getElementById('importError');
  if(imp.stage==='done'){
    sum.innerHTML=`<strong>${saved} entri disimpan.</strong>${imp.rows.some(r=>r.result&&r.result!=='ok')?' Ada yang gagal — lihat tanda ✗.':''}`;
    errBox.hidden=true;
    importSave.disabled=false; importSave.textContent='Tutup';
    importBack.hidden=true;
    return;
  }
  sum.className='import-summary'+(imp.stage==='confirm'?' confirm':'');
  sum.innerHTML=`${imp.stage==='confirm'?'<div class="imp-confirm-title">Sahkan sebelum simpan</div>':''}
    <div><strong>${rows.length} entri</strong> · ${fmtRM(tot)}</div>
    <div class="imp-sum-sub">Diesel ${fmtRM(sumBy('diesel'))} · RON95 ${fmtRM(sumBy('ron95'))} · ${claims} perlu claim${skipped?` · ${skipped} tidak dimasukkan`:''}</div>`;
  const probs=importProblems(rows);
  errBox.hidden=!probs.length;
  errBox.innerHTML=probs.map(esc).join('<br>');
  importBack.hidden=false;
  importBack.textContent=imp.stage==='confirm'?'← Betulkan':'+ PDF lain';
  if(imp.stage==='review'){
    importSave.disabled=!rows.length||!!probs.length;
    importSave.textContent=rows.length?`Semak & Simpan ${rows.length} entri`:'Tiada entri untuk disimpan';
  }
}

function setImportStage(stage){
  clearInterval(imp.timer);
  imp.stage=stage;
  renderImport();
  if(stage!=='confirm')return;
  // Kiraan undur 5 saat (macam Penyu Tracker) supaya sempat semak semula.
  let left=5;
  const n=imp.rows.filter(r=>r.include&&!r.result).length;
  const tick=()=>{
    if(left>0){importSave.disabled=true;importSave.textContent=`Sahkan (${left})`;left--;}
    else{clearInterval(imp.timer);importSave.disabled=false;importSave.textContent=`✓ Sahkan & Simpan ${n} entri`;}
  };
  tick(); imp.timer=setInterval(tick,1000);
}

async function saveImport(){
  imp.stage='saving';
  importSave.disabled=true; importBack.hidden=true;
  const rows=imp.rows.filter(r=>r.include&&!r.result);
  const prog=document.getElementById('importProgress');
  for(const [n,r] of rows.entries()){
    importSave.textContent=`Menyimpan ${n+1} / ${rows.length}...`;
    const d=r.parsed.data;
    const path=`${state.currentUser.id}/setel_${d.ref}.pdf`;
    try{
      // upsert:false (kerani tiada kebenaran update). Fail sama dari cubaan
      // yang gagal sebelum ini (laluan ikut nombor invois) boleh diguna semula.
      const{error:upE}=await sb.storage.from(RECEIPT_BUCKET).upload(path,r.file,{contentType:'application/pdf'});
      if(upE&&!/exists|duplicate/i.test(upE.message||''))throw new Error('Gagal upload PDF: '+upE.message);
      const{error:insE}=await sb.from('minyak_entries').insert({
        entry_date:r.date,fuel_type:r.fuel,amount:Number(r.amount),
        needs_claim:!!r.claim,claim_status:r.claim?'pending':'not_applicable',
        notes:r.notes.trim()||null,receipt_path:path,receipt_ref:d.ref,
        user_id:state.currentUser.id,user_email:state.currentUser.email,
      });
      if(insE){
        await sb.storage.from(RECEIPT_BUCKET).remove([path]);
        throw new Error(insE.code==='23505'?'Pendua: resit ini baru sahaja dimasukkan oleh orang lain.':insE.message);
      }
      r.result='ok';
    }catch(err){r.result=err.message||'Ralat.';}
  }
  imp.stage='done';
  prog.textContent='Selesai.';
  renderImport();
  const ok=rows.filter(r=>r.result==='ok').length;
  showToast(`${ok} entri Setel disimpan ✓`);
}

// ── Detail ────────────────────────────────────────
const detailBody=document.getElementById('detailBody');
const detailActions=document.getElementById('detailActions');
let curEntry=null;

function openDetail(entry,isOwner){
  if(addDialog.open)addDialog.close();
  curEntry=entry;
  const isD=entry.fuel_type==='diesel';
  const rows=[
    row('Tarikh',fmtDateLong(entry.entry_date)),
    row('Oleh',entry.user_email||'—'),
    row('Jenis',isD?'Diesel':'RON95 (Boat)'),
    row('Amount',fmtRM(entry.amount),true),
  ];
  if(entry.odometer_start!==null&&entry.odometer_end!==null){
    rows.push(row('Odo Mula',fmtKm(entry.odometer_start)+' km',true));
    rows.push(row('Odo Akhir',fmtKm(entry.odometer_end)+' km',true));
    rows.push(row('Jarak',fmtKm(entry.distance_km)+' km',true));
  }
  if(entry.needs_claim) rows.push(row('Claim',entry.claim_status==='claimed'?'Dah Claim ✓':'Pending'));
  if(entry.notes) rows.push(row('Nota',entry.notes));
  detailBody.innerHTML=rows.join('');
  if(entry.receipt_path||entry.receipt_url){
    const recBox=document.createElement('div');
    recBox.innerHTML='<div class="detail-row"><span class="detail-label">Resit</span><span class="detail-value">Memuatkan...</span></div>';
    detailBody.appendChild(recBox);
    receiptLink(entry).then(url=>{
      if(curEntry!==entry)return;
      if(!url){recBox.innerHTML='<div class="detail-row"><span class="detail-label">Resit</span><span class="detail-value">Tidak dapat dibuka</span></div>';return;}
      const isPdf=(entry.receipt_path||entry.receipt_url).toLowerCase().includes('.pdf');
      recBox.innerHTML=isPdf
        ?`<a href="${url}" target="_blank" rel="noopener" class="detail-receipt-link">📄 Buka Resit (PDF)</a>`
        :`<img src="${url}" class="detail-receipt" alt="Resit"/><a href="${url}" target="_blank" rel="noopener" class="detail-receipt-link" style="margin-top:8px;">⬇ Download Resit</a>`;
    });
  }
  // Claim toggle
  if(entry.needs_claim&&(isOwner||state.isAdmin)){
    const isClaimed=entry.claim_status==='claimed';
    const tb=document.createElement('button');tb.type='button';tb.className='detail-receipt-link';
    tb.style.cssText='margin-top:8px;width:100%;border:none;background:rgba(26,122,74,0.2);color:#4ACA7A;cursor:pointer;';
    tb.textContent=isClaimed?'Tandakan Pending':'Tandakan Dah Claim';
    tb.addEventListener('click',async()=>{
      const{error}=await sb.from('minyak_entries').update({claim_status:isClaimed?'pending':'claimed'}).eq('id',entry.id);
      if(!error){detailDialog.close();showToast('Status dikemaskini ✓');loadEntries();}
    });
    detailBody.appendChild(tb);
  }
  // Actions
  detailActions.innerHTML='';
  if(isOwner||state.isAdmin){
    const db=document.createElement('button');db.type='button';db.className='danger-btn';
    db.textContent=(state.isAdmin&&!isOwner)?'🔐 Padam (Admin)':'Padam Entry';
    db.addEventListener('click',()=>deleteEntry(entry));
    detailActions.appendChild(db);
  }
  detailDialog.showModal();
}

// Resit baharu: signed URL (bucket private, sah 1 jam). Resit lama yang belum
// dipindah: pautan awam projek lama (hanya jalan jika projek lama aktif).
async function receiptLink(entry){
  if(entry.receipt_url)return entry.receipt_url;
  const{data,error}=await sb.storage.from(RECEIPT_BUCKET).createSignedUrl(entry.receipt_path,3600);
  return error?null:data.signedUrl;
}

function row(l,v,m=false){return`<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value${m?' mono':''}">${v}</span></div>`;}

async function deleteEntry(entry){
  if(!confirm('Padam entry ni?'))return;
  const{error}=await sb.from('minyak_entries').delete().eq('id',entry.id);
  if(!error&&entry.receipt_path&&!entry.receipt_url)await sb.storage.from(RECEIPT_BUCKET).remove([entry.receipt_path]);
  if(error){showToast('Gagal padam.');return;}
  detailDialog.close();showToast('Entry dipadam');loadEntries();
}

// ── Init ──────────────────────────────────────────
if('serviceWorker' in navigator)
  window.addEventListener('load',()=>navigator.serviceWorker.register('../sw.js').catch(()=>{}));

initAuth();
