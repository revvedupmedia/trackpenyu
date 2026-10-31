// ===========================================
// Minyak Tracker v6 — dalam Portal LPP
// Login dikongsi (../login.html). Hanya admin & kerani; RLS dalam Supabase
// menyekat data untuk peranan lain.
// ===========================================

import { supabase as sb, requireApp, logout, APP_VERSION } from '../shared/auth.js';

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
  semakan: false,       // lajur migration-minyak-semakan.sql wujud?
  dupConfirmKey: null,  // entri manual: pendua yang pengguna sudah sahkan "berbeza"
  fuelFilter: (()=>{try{return localStorage.getItem('minyak-fuel-filter')||'all'}catch{return 'all'}})(),
};

// Entri ikut penapis jenis minyak (Semua / Diesel / RON95).
const shown=()=>state.fuelFilter==='all'?state.entries:state.entries.filter(e=>e.fuel_type===state.fuelFilter);
const FUEL_NAME={diesel:'Diesel',ron95:'RON95'};

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
  document.getElementById('appVersion').textContent = `Minyak Tracker · versi ${APP_VERSION}`;
  loadBackgroundVideo();
  state.semakan = await hasSemakanColumns();
  if(!state.semakan&&state.isAdmin)showToast('Admin: run migration-minyak-semakan.sql dalam Supabase');
  loadEntries();
}

// App tetap berjalan sebelum migration-minyak-semakan.sql dirun (tanpa padam
// boleh pulih & cap jari resit), supaya kemas kini kod tidak memecahkan app.
async function hasSemakanColumns(){
  const{error}=await sb.from('minyak_entries').select('deleted_at,dup_ok,receipt_hash').limit(1);
  return !error;
}
// Hanya entri yang belum dipadam.
const live=q=>state.semakan?q.is('deleted_at',null):q;

// Cap jari fail (SHA-256): fail resit sama => cap jari sama.
async function sha256(blob){
  const b=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
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
  loadAudit();
}

// ── Admin: Log Perubahan ──────────────────────────
const AUDIT_FIELDS={entry_date:'Tarikh',fuel_type:'Jenis',amount:'Jumlah',odometer_start:'Odo mula',odometer_end:'Odo akhir',
  needs_claim:'Perlu claim',claim_status:'Status claim',notes:'Nota',receipt_path:'Resit',dup_ok:'Bukan pendua'};
async function loadAudit(){
  const ul=document.getElementById('auditList');
  ul.innerHTML='<li class="admin-hint">Memuatkan...</li>';
  const{data,error}=await sb.from('minyak_entries_audit').select('*').order('changed_at',{ascending:false}).limit(50);
  if(error){ul.innerHTML=`<li class="admin-hint">${/minyak_entries_audit/.test(error.message)?'Belum dipasang: run migration-minyak-audit.sql dalam Supabase.':esc(error.message)}</li>`;return;}
  if(!data.length){ul.innerHTML='<li class="admin-hint">Tiada perubahan direkod lagi.</li>';return;}
  const ids=[...new Set(data.map(a=>a.changed_by).filter(Boolean))];
  const{data:people}=await sb.from('staff_profiles').select('id,full_name').in('id',ids);
  const who=new Map((people||[]).map(p=>[p.id,p.full_name]));
  ul.innerHTML='';
  for(const a of data){
    const e=a.after||a.before||{},b=a.before||{},n=a.after||{};
    let act=a.action==='insert'?'Tambah':a.action==='delete'?'Padam kekal':'Ubah',detail='';
    if(a.action==='update'){
      if(!b.deleted_at&&n.deleted_at)act='Padam';
      else if(b.deleted_at&&!n.deleted_at)act='Pulih';
      else detail=Object.keys(AUDIT_FIELDS).filter(k=>JSON.stringify(b[k])!==JSON.stringify(n[k])).map(k=>AUDIT_FIELDS[k]).join(', ');
      if(!detail&&act==='Ubah')detail=b.receipt_hash!==n.receipt_hash?'Cap jari resit':'—';
    }
    const li=document.createElement('li');
    li.className='audit-item';
    li.innerHTML=`<span class="audit-act audit-${act==='Tambah'?'add':act.startsWith('Padam')?'del':act==='Pulih'?'add':'upd'}">${act}</span>
      <span class="audit-main">${e.entry_date?fmtDateShort(e.entry_date):'?'} · ${e.fuel_type==='diesel'?'Diesel':'RON95'} · ${fmtRM(e.amount)}${detail?` <span class="audit-det">(${esc(detail)})</span>`:''}</span>
      <span class="audit-sub">${esc(who.get(a.changed_by)||e.user_email||'Sistem')} · ${new Date(a.changed_at).toLocaleString('ms-MY',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>`;
    ul.appendChild(li);
  }
}

// ── Export Excel (tempoh & penapis semasa) ────────
// SheetJS hanya dimuat bila perlu (fail besar), dari vendor/ dalam repo.
let xlsxReady=null;
function loadXLSX(){
  return xlsxReady||=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='../vendor/sheetjs-0.20.3/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX); s.onerror=()=>{xlsxReady=null;rej(new Error('Gagal muat pembina Excel.'));};
    document.head.appendChild(s);
  });
}
document.getElementById('exportBtn').addEventListener('click',async()=>{
  const btn=document.getElementById('exportBtn');
  const rows=shown();
  if(!rows.length){showToast('Tiada rekod untuk dieksport.');return;}
  btn.disabled=true; btn.textContent='Menyedia...';
  try{
    const XLSX=await loadXLSX();
    const y=state.viewDate.getFullYear(),m=state.viewDate.getMonth();
    const period=state.view==='year'?`${y}`:`${MONTH_NAMES[m]} ${y}`;
    const fuelLbl=state.fuelFilter==='all'?'Semua jenis':FUEL_NAME[state.fuelFilter];
    // Tarikh sebagai nombor siri Excel (bukan objek Date) supaya tidak anjak
    // sehari mengikut zon waktu peranti.
    const asDate=s=>{const[yy,mm,dd]=s.split('-').map(Number);return{t:'n',v:(Date.UTC(yy,mm-1,dd)-Date.UTC(1899,11,30))/864e5,z:'dd/mm/yyyy'};};
    const sorted=[...rows].sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
    const rekod=[['Tarikh','Jenis','Jumlah (RM)','Odo Mula (km)','Odo Akhir (km)','Jarak (km)','Perlu Claim','Status Claim','Nota','Dimasukkan oleh','No. Invois Setel','Resit'],
      ...sorted.map(e=>[asDate(e.entry_date),e.fuel_type==='diesel'?'Diesel':'RON95 (Boat)',Number(e.amount),
        e.odometer_start??'',e.odometer_end??'',e.distance_km??'',e.needs_claim?'Ya':'Tidak',
        e.needs_claim?(e.claim_status==='claimed'?'Dah Claim':'Belum Claim'):'',e.notes||'',e.user_email||'',e.receipt_ref||'',
        (e.receipt_path||e.receipt_url)?'Ada':'Tiada'])];
    const tot=f=>sorted.filter(e=>!f||e.fuel_type===f).reduce((a,e)=>a+Number(e.amount),0);
    rekod.push([],['JUMLAH','',tot()],['Diesel','',tot('diesel')],['RON95 (Boat)','',tot('ron95')],
      ['Belum claim','',sorted.filter(e=>e.needs_claim&&e.claim_status==='pending').reduce((a,e)=>a+Number(e.amount),0)]);
    const ws1=XLSX.utils.aoa_to_sheet(rekod);
    ws1['!cols']=[12,14,12,12,12,10,11,12,30,30,38,8].map(w=>({wch:w}));
    for(let r=1;r<rekod.length;r++){const c=ws1[XLSX.utils.encode_cell({r,c:2})];if(c&&c.t==='n')c.z='#,##0.00';}
    const byMonth=MONTH_NAMES.map((name,i)=>{const xs=sorted.filter(e=>Number(e.entry_date.slice(5,7))===i+1);
      const s=f=>xs.filter(e=>!f||e.fuel_type===f).reduce((a,e)=>a+Number(e.amount),0);
      return [name,xs.length,s('diesel'),s('ron95'),s(),xs.filter(e=>e.needs_claim&&e.claim_status==='pending').reduce((a,e)=>a+Number(e.amount),0)];}).filter(r=>r[1]);
    const ring=[[`Minyak Tracker — ${period} — ${fuelLbl}`],[`Dijana: ${new Date().toLocaleString('ms-MY')}`],[],
      ['Bulan','Bil. Entri','Diesel (RM)','RON95 (RM)','Jumlah (RM)','Belum Claim (RM)'],...byMonth,
      ['JUMLAH',byMonth.reduce((a,r)=>a+r[1],0),...[2,3,4,5].map(i=>byMonth.reduce((a,r)=>a+r[i],0))]];
    const ws2=XLSX.utils.aoa_to_sheet(ring);
    ws2['!cols']=[{wch:14},{wch:10},{wch:14},{wch:14},{wch:14},{wch:16}];
    for(let r=4;r<ring.length;r++)for(let c=2;c<=5;c++){const cell=ws2[XLSX.utils.encode_cell({r,c})];if(cell&&cell.t==='n')cell.z='#,##0.00';}
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws2,'Ringkasan');
    XLSX.utils.book_append_sheet(wb,ws1,'Rekod');
    const tag=state.view==='year'?`${y}`:`${y}-${String(m+1).padStart(2,'0')}`;
    XLSX.writeFile(wb,`Minyak_${tag}${state.fuelFilter==='all'?'':'_'+FUEL_NAME[state.fuelFilter]}.xlsx`);
    showToast('Excel dimuat turun ✓');
  }catch(err){showToast(err.message||'Gagal eksport.');}
  finally{btn.disabled=false;btn.textContent='⬇ Excel';}
});

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
  btn.disabled=true; btn.textContent='Memuat naik...';
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
    btn.textContent='Muat Naik Video'; btn.disabled=true;
  } catch(err){
    msg.textContent=err.message||'Muat naik gagal.'; msg.hidden=false;
    btn.textContent='Muat Naik Video'; btn.disabled=false;
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
  const {data,error}=await live(sb.from('minyak_entries').select('*'))
    .gte('entry_date',start).lte('entry_date',end)
    .order('entry_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){showToast('Gagal load data.');return;}
  state.entries=data||[];
  render();
  runChecks().catch(()=>{});
}

function render(){
  const isYear=state.view==='year';
  document.getElementById('monthText').textContent=isYear
    ?`${state.viewDate.getFullYear()}`
    :`${MONTH_NAMES[state.viewDate.getMonth()]} ${state.viewDate.getFullYear()}`;
  document.getElementById('gaugeSub').textContent=isYear?'jumlah tahun ini':'jumlah bulan ini';
  document.getElementById('emptyTitle').textContent=isYear?'Takde rekod tahun ni':'Takde rekod bulan ni';
  document.querySelectorAll('#viewToggle button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  document.querySelectorAll('#fuelFilter button').forEach(b=>b.classList.toggle('active',b.dataset.f===state.fuelFilter));
  document.getElementById('emptyTitle').textContent=(state.fuelFilter==='all'?'Takde rekod':`Takde rekod ${FUEL_NAME[state.fuelFilter]}`)+(isYear?' tahun ni':' bulan ni');
  animSeq=0;
  document.querySelectorAll('.hero-card, .stat-card, .import-open').forEach(animIn);
  renderGauge(); renderStats(); renderYear(); renderHistory();
}

// Kad sentiasa beranimasi ikut scroll: masuk bila kelihatan, keluar bila
// meninggalkan skrin, masuk semula bila scroll balik. Arah berselang-seli:
// kad pertama dari kiri, kad bawahnya dari kanan, dan seterusnya. Kad yang
// masuk serentak berturutan (90ms). Hanya transform + opacity.
const REDUCED_MOTION=matchMedia('(prefers-reduced-motion: reduce)').matches;
let animSeq=0;
const revealer=REDUCED_MOTION?null:new IntersectionObserver(items=>{
  let n=0;
  items.sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top).forEach(i=>{
    if(i.isIntersecting){
      i.target.style.setProperty('--d',`${Math.min(n++,6)*90}ms`);
      i.target.classList.add('in');
    } else i.target.classList.remove('in');
  });
},{rootMargin:'-3% 0px -3% 0px',threshold:0});
// Kosongkan bekas senarai dan lepaskan kad lamanya dari pemerhati scroll.
function forget(box){
  if(revealer)box.querySelectorAll('.reveal').forEach(el=>revealer.unobserve(el));
  box.innerHTML='';
}
function animIn(el){
  if(!revealer)return;
  el.dataset.side=animSeq++%2?'r':'l';
  if(el.classList.contains('reveal'))return; // kad tetap (gauge, statistik) sudah diperhati
  el.classList.add('reveal');
  revealer.observe(el);
}

// Jumlah RM naik dari 0 (kira naik) bersama lukisan gauge.
function countUp(el,to){
  if(REDUCED_MOTION||to<=0){el.textContent=fmtRM(to);return;}
  const t0=performance.now(),dur=700;
  cancelAnimationFrame(countUp._raf);
  const step=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=fmtRM(to*e);if(k<1)countUp._raf=requestAnimationFrame(step);};
  countUp._raf=requestAnimationFrame(step);
}

// Lukis lengkok gauge dari kiri ke kanan.
function drawArc(path,delay){
  if(REDUCED_MOTION||!path.getAttribute('d'))return;
  const L=path.getTotalLength();
  path.style.transition='none';
  path.style.strokeDasharray=`${L}`;
  path.style.strokeDashoffset=`${L}`;
  void path.getBoundingClientRect();
  path.style.transition=`stroke-dashoffset .7s cubic-bezier(.22,1,.36,1) ${delay}ms`;
  path.style.strokeDashoffset='0';
}

// Paparan Tahun: ringkasan setiap bulan (Diesel vs RON95). Tekan bulan => paparan Bulan.
function renderYear(){
  const sec=document.getElementById('yearSection');
  sec.hidden=state.view!=='year';
  if(sec.hidden)return;
  const months=MONTH_NAMES.map(()=>({diesel:0,ron95:0,n:0}));
  for(const e of shown()){
    const m=months[Number(e.entry_date.slice(5,7))-1];
    m[e.fuel_type]+=Number(e.amount||0); m.n++;
  }
  const max=Math.max(1,...months.map(m=>m.diesel+m.ron95));
  const table=document.getElementById('yearTable');
  forget(table);
  months.forEach((m,i)=>{
    const tot=m.diesel+m.ron95;
    const btn=document.createElement('button');
    btn.type='button'; btn.className='year-row'+(m.n?'':' empty');
    btn.innerHTML=`
      <span class="yr-month">${MONTH_NAMES[i].slice(0,3)}</span>
      <span class="yr-bar"><span class="yr-seg yr-diesel" style="width:${m.diesel/max*100}%"></span><span class="yr-seg yr-ron" style="width:${m.ron95/max*100}%"></span></span>
      <span class="yr-total">${m.n?fmtRM(tot):'—'}</span>
      <span class="yr-n">${m.n?`${m.n} entri`:''}</span>`;
    btn.title=m.n?`Diesel ${fmtRM(m.diesel)} · RON95 ${fmtRM(m.ron95)}`:'';
    btn.addEventListener('click',()=>{
      state.view='month';
      state.viewDate=new Date(state.viewDate.getFullYear(),i,1);
      loadEntries();
    });
    table.appendChild(btn); animIn(btn);
  });
}

function renderGauge(){
  const dT=sum('diesel'),rT=sum('ron95'),tot=dT+rT,f=state.fuelFilter;
  countUp(document.getElementById('gaugeTotal'),f==='all'?tot:sum(f));
  document.getElementById('gaugeSub').textContent=`${f==='all'?'jumlah':FUEL_NAME[f]} ${state.view==='year'?'tahun':'bulan'} ini`;
  document.getElementById('gaugeDiesel').classList.toggle('dim',f==='ron95');
  document.getElementById('gaugeRon').classList.toggle('dim',f==='diesel');
  document.querySelectorAll('.legend-item').forEach((el,i)=>el.classList.toggle('dim',f!=='all'&&f!==(i?'ron95':'diesel')));
  document.getElementById('dieselTotal').textContent=fmtRM(dT);
  document.getElementById('ronTotal').textContent=fmtRM(rT);
  const cx=120,cy=130,r=90;
  document.getElementById('gaugeTrack').setAttribute('d',arc(cx,cy,r,180,0));
  if(tot<=0){document.getElementById('gaugeDiesel').setAttribute('d','');document.getElementById('gaugeRon').setAttribute('d','');return;}
  const dEnd=180-(dT/tot*180);
  document.getElementById('gaugeDiesel').setAttribute('d',arc(cx,cy,r,180,dEnd));
  document.getElementById('gaugeRon').setAttribute('d',arc(cx,cy,r,dEnd,0));
  drawArc(document.getElementById('gaugeDiesel'),80);
  drawArc(document.getElementById('gaugeRon'),80+Math.round(dT/tot*500));
}
function sum(ft){return state.entries.filter(e=>e.fuel_type===ft).reduce((a,e)=>a+Number(e.amount||0),0);}
function polar(cx,cy,r,a){const rad=a*Math.PI/180;return{x:cx+r*Math.cos(rad),y:cy-r*Math.sin(rad)};}
function arc(cx,cy,r,sa,ea){
  if(Math.abs(sa-ea)<.01)return'';
  const s=polar(cx,cy,r,sa),e=polar(cx,cy,r,ea);
  return`M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(sa-ea)>180?1:0} 1 ${e.x} ${e.y}`;
}

function renderStats(){
  const km=shown().reduce((a,e)=>a+Number(e.distance_km||0),0);
  document.getElementById('statMileage').innerHTML=`${fmtKm(km)} <span class="unit">km</span>`;
  const pend=shown().filter(e=>e.needs_claim&&e.claim_status==='pending').reduce((a,e)=>a+Number(e.amount||0),0);
  document.getElementById('statPending').textContent=fmtRM(pend);
}

function renderHistory(){
  const list=document.getElementById('historyList');
  const empty=document.getElementById('emptyState');
  forget(list);
  const rows=shown();
  if(!rows.length){empty.hidden=false;document.getElementById('historyCount').textContent='';return;}
  empty.hidden=true;
  document.getElementById('historyCount').textContent=`${rows.length} entri`;
  let lastMonth=null;
  for(const entry of rows){
    // Paparan Tahun: tajuk setiap bulan dalam senarai.
    const mo=entry.entry_date.slice(0,7);
    if(state.view==='year'&&mo!==lastMonth){
      lastMonth=mo;
      const h=document.createElement('li');
      h.className='history-month';
      h.textContent=`${MONTH_NAMES[Number(mo.slice(5,7))-1]} ${mo.slice(0,4)}`;
      list.appendChild(h); animIn(h);
    }
    const li=document.createElement('li');
    const isD=entry.fuel_type==='diesel';
    const isOwner=state.currentUser&&entry.user_id===state.currentUser.id;
    const kmH=entry.distance_km?`<span class="h-km">${fmtKm(entry.distance_km)} km</span>`:'';
    const clH=entry.needs_claim?`<span class="h-claim-pill ${entry.claim_status==='claimed'?'claimed':'pending'}">${entry.claim_status==='claimed'?'Dah Claim':'Belum Claim'}</span>`:'';
    const recH=(entry.receipt_path||entry.receipt_url)?'<span class="h-receipt-dot">📎</span>':'';
    const btn=document.createElement('button');
    btn.type='button'; btn.className=`history-item fuel-${isD?'diesel':'ron'}`;
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
    li.appendChild(btn); list.appendChild(li); animIn(li);
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

document.getElementById('fuelFilter').addEventListener('click',e=>{
  const b=e.target.closest('button[data-f]');
  if(!b||b.dataset.f===state.fuelFilter)return;
  state.fuelFilter=b.dataset.f;
  try{localStorage.setItem('minyak-fuel-filter',state.fuelFilter)}catch{}
  render();
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
  state.pendingFile=null; state.pendingOriginal=null; state.selectedFuel='diesel'; state.dupConfirmKey=null;
  document.getElementById('entryForm').reset();
  document.getElementById('entryDate').value=toLocalDateStr(new Date());
  setFuel('diesel'); resetDrop(); formError.hidden=true;
  submitBtn.disabled=false; submitBtn.textContent='Simpan Entri';
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
receiptFile.addEventListener('change',async()=>{
  const f=receiptFile.files[0];if(!f)return;
  const sizeEl=document.getElementById('previewSize');
  sizeEl.textContent='Memproses...';
  state.pendingOriginal=f;
  state.pendingFile=await compressImage(f);
  showFilePrev(state.pendingFile);
  sizeEl.textContent=state.pendingFile===f?fmtSize(f.size):`${fmtSize(f.size)} → ${fmtSize(state.pendingFile.size)}`;
});
document.getElementById('removeFile').addEventListener('click',e=>{e.stopPropagation();state.pendingFile=null;state.pendingOriginal=null;receiptFile.value='';resetDrop();});

const fmtSize=b=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(b/1024))} KB`;

// Gambar resit dari kamera (~3–5 MB) dikecilkan sebelum upload: sisi panjang
// maksimum 2000px, JPEG 85%. Teks resit kekal jelas; saiz ~8–10× lebih kecil.
// PDF dan gambar yang sudah kecil tidak diubah. Putaran ikut EXIF dibetulkan.
const RESIT_MAX_PX=2000, RESIT_MIN_BYTES=700*1024;
async function compressImage(file){
  if(!/^image\//.test(file.type)||/gif|svg/.test(file.type))return file;
  try{
    const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});
    const k=Math.min(1,RESIT_MAX_PX/Math.max(bmp.width,bmp.height));
    if(k===1&&file.size<=RESIT_MIN_BYTES){bmp.close?.();return file;}
    const c=document.createElement('canvas');
    c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
    const g=c.getContext('2d');
    g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height);
    g.imageSmoothingQuality='high';
    g.drawImage(bmp,0,0,c.width,c.height); bmp.close?.();
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.85));
    if(!blob||blob.size>=file.size)return file;
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
  }catch{return file;}  // cth HEIC yang pelayar tidak boleh baca: upload asal
}
function resetDrop(){document.getElementById('dropZoneEmpty').hidden=false;document.getElementById('dropZonePreview').hidden=true;document.getElementById('previewImg').hidden=true;document.getElementById('previewPdf').hidden=true;}
function showFilePrev(f){
  document.getElementById('dropZoneEmpty').hidden=true;document.getElementById('dropZonePreview').hidden=false;
  if(f.type==='application/pdf'){document.getElementById('previewImg').hidden=true;document.getElementById('previewPdf').hidden=false;document.getElementById('previewPdfName').textContent=f.name;}
  else{const r=new FileReader();r.onload=ev=>{const i=document.getElementById('previewImg');i.src=ev.target.result;i.hidden=false;document.getElementById('previewPdf').hidden=true;};r.readAsDataURL(f);}
}

// Submit
submitBtn.addEventListener('click',async()=>{
  formError.hidden=true;formError.classList.remove('is-warn');submitBtn.disabled=true;submitBtn.textContent='Menyimpan...';
  try{
    const date=document.getElementById('entryDate').value;
    const amount=parseFloat(document.getElementById('entryAmount').value);
    const needsClaim=document.getElementById('needsClaim').checked;
    const notes=document.getElementById('entryNotes').value.trim();
    const oS=odoStart.value?parseFloat(odoStart.value):null;
    const oE=odoEnd.value?parseFloat(odoEnd.value):null;
    if(!date)throw new Error('Sila pilih tarikh.');
    if(isNaN(amount)||amount<=0)throw new Error('Sila masukkan jumlah yang sah.');
    if(oS!==null&&oE!==null&&oE<oS)throw new Error('Odometer akhir mesti lebih besar.');
    if(date>toLocalDateStr(new Date()))throw new Error('Tarikh tidak boleh pada masa depan.');
    // Pencegahan pendua (1): resit yang sama tidak boleh digunakan dua kali.
    let recHash=null;
    if(state.pendingFile&&state.semakan){
      // Cap jari fail ASAL: gambar sama dari telefon dikesan walaupun dikecilkan.
      recHash=await sha256(state.pendingOriginal||state.pendingFile);
      const{data:same}=await live(sb.from('minyak_entries').select('entry_date,amount,user_email')).eq('receipt_hash',recHash).limit(1);
      if(same&&same.length)throw new Error(`Resit ini sudah digunakan untuk entri ${fmtDateLong(same[0].entry_date)} (${fmtRM(same[0].amount)}, ${same[0].user_email||'?'}). Satu resit untuk satu entri sahaja.`);
    }
    // Pencegahan pendua (2): entri dengan tarikh, jenis & jumlah sama. Amaran
    // dulu; tekan Simpan sekali lagi untuk sahkan ia pengisian berbeza.
    const sig=`${date}|${state.selectedFuel}|${amount.toFixed(2)}`;
    let dupOk=false;
    const{data:twins}=await live(sb.from('minyak_entries').select('entry_date,amount,user_email,created_at'))
      .eq('entry_date',date).eq('fuel_type',state.selectedFuel).eq('amount',amount);
    if(twins&&twins.length){
      if(state.dupConfirmKey!==sig){
        state.dupConfirmKey=sig;
        const w=new Error(`⚠ Entri ${state.selectedFuel==='diesel'?'Diesel':'RON95'} ${fmtRM(amount)} pada ${fmtDateLong(date)} sudah ada (oleh ${twins.map(t=>t.user_email||'?').join(', ')}). Jika ini pengisian BERBEZA, tekan Simpan sekali lagi.`);
        w.warn=true; throw w;
      }
      dupOk=true;
    }
    let recPath=null;
    if(state.pendingFile){
      const f=state.pendingFile,ext=f.name.split('.').pop();
      const path=`${state.currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
      const{error:upE}=await sb.storage.from(RECEIPT_BUCKET).upload(path,f);
      if(upE)throw new Error('Gagal muat naik resit.');
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
    if(state.semakan){payload.receipt_hash=recHash;payload.dup_ok=dupOk;}
    const{error:insE}=await sb.from('minyak_entries').insert(payload);
    if(insE)throw new Error(insE.message);
    addDialog.close();showToast('Entri disimpan ✓');await loadEntries();
  }catch(err){formError.textContent=err.message||'Ralat.';formError.classList.toggle('is-warn',!!err.warn);formError.hidden=false;}
  finally{submitBtn.disabled=false;submitBtn.textContent=state.dupConfirmKey?'Simpan juga (entri berbeza)':'Simpan Entri';}
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
    if(parsed.ok&&state.semakan)parsed.data.hash=await sha256(file);
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
      live(sb.from('minyak_entries').select('receipt_ref,entry_date,user_email')).in('receipt_ref',refs),
      live(sb.from('minyak_entries').select('entry_date,fuel_type,amount,user_email,receipt_ref'+(state.semakan?',receipt_hash':''))).in('entry_date',dates),
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
    const d=r.parsed.data,hit=byRef.get(d.ref)||(d.hash&&sameDay.find(e=>e.receipt_hash===d.hash));
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
        <label class="imp-f"><span>Jumlah (RM)</span><input type="number" step="0.01" inputmode="decimal" data-k="amount" value="${esc(r.amount)}" ${locked?'disabled':''} /></label>
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
    if(!(Number(r.amount)>0))p.push(`${n}: jumlah tidak sah.`);
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
      if(upE&&!/exists|duplicate/i.test(upE.message||''))throw new Error('Gagal muat naik PDF: '+upE.message);
      const{error:insE}=await sb.from('minyak_entries').insert({
        entry_date:r.date,fuel_type:r.fuel,amount:Number(r.amount),
        needs_claim:!!r.claim,claim_status:r.claim?'pending':'not_applicable',
        notes:r.notes.trim()||null,receipt_path:path,receipt_ref:d.ref,
        user_id:state.currentUser.id,user_email:state.currentUser.email,
        ...(state.semakan?{receipt_hash:d.hash||null,dup_ok:r.status==='maybe'}:{}),
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

// ── Semakan Data ──────────────────────────────────
// Imbas SEMUA entri (bukan bulan semasa sahaja) untuk masalah biasa: pendua,
// odometer songsang, tarikh masa depan, jumlah luar biasa, resit tiada, claim
// lama tertunggak. Lencana pada butang = bilangan isu merah + kuning.
const checkDialog=document.getElementById('checkDialog');
document.getElementById('checkOpen').addEventListener('click',()=>{checkDialog.showModal();renderChecks();});
document.getElementById('checkClose').addEventListener('click',()=>checkDialog.close());
let chk={entries:[],deleted:[],issues:[]};

// PostgREST pulangkan maksimum 1000 baris sekali; ambil semua halaman.
async function fetchAll(build){
  const out=[];
  for(let from=0;;from+=1000){
    const{data,error}=await build().range(from,from+999);
    if(error)throw new Error(error.message);
    out.push(...data);
    if(data.length<1000)return out;
  }
}

const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

async function runChecks(){
  const all=await fetchAll(()=>sb.from('minyak_entries').select('*').order('entry_date',{ascending:false}).order('id'));
  chk.entries=all.filter(e=>!e.deleted_at);
  chk.deleted=all.filter(e=>e.deleted_at).sort((a,b)=>b.deleted_at.localeCompare(a.deleted_at));
  const E=chk.entries,issues=[],today=toLocalDateStr(new Date());
  const groupBy=(arr,key)=>{const m=new Map();arr.forEach(e=>{const k=key(e);if(k==null)return;(m.get(k)||m.set(k,[]).get(k)).push(e);});return m;};

  const sameHash=new Set();
  for(const g of groupBy(E,e=>e.receipt_hash||null).values()) if(g.length>1){
    g.forEach(e=>sameHash.add(e.id));
    issues.push({level:'bad',title:`Resit sama digunakan untuk ${g.length} entri`,detail:'Fail resit sama persis. Hampir pasti pendua: padam yang berlebihan.',entries:g});
  }
  for(const g of groupBy(E,e=>`${e.entry_date}|${e.fuel_type}|${Number(e.amount).toFixed(2)}`).values()){
    if(g.length<2||g.every(e=>sameHash.has(e.id)))continue;
    if(g.filter(e=>!e.dup_ok).length<2)continue;
    issues.push({level:'warn',kind:'dup',title:`Mungkin pendua: ${g.length} entri ${g[0].fuel_type==='diesel'?'Diesel':'RON95'} ${fmtRM(g[0].amount)} pada ${fmtDateShort(g[0].entry_date)}`,
      detail:'Tarikh, jenis dan jumlah sama. Tekan "Bandingkan resit" atau buka setiap entri. Jika memang pengisian berbeza, tekan "Bukan pendua".',entries:g});
  }
  const odo=E.filter(e=>e.odometer_start!=null&&e.odometer_end!=null&&(Number(e.odometer_end)<Number(e.odometer_start)||(e.distance_km!=null&&Math.abs(Number(e.odometer_end)-Number(e.odometer_start)-Number(e.distance_km))>0.5)));
  if(odo.length)issues.push({level:'bad',title:`Odometer tidak sah (${odo.length})`,detail:'Odometer akhir lebih kecil daripada mula, atau jarak tidak sepadan.',entries:odo});
  const fut=E.filter(e=>e.entry_date>today);
  if(fut.length)issues.push({level:'bad',title:`Tarikh pada masa depan (${fut.length})`,detail:'Kemungkinan salah taip tarikh.',entries:fut});
  for(const f of ['diesel','ron95']){
    const xs=E.filter(e=>e.fuel_type===f),med=median(xs.map(e=>Number(e.amount)));
    if(xs.length<5)continue;
    const odd=xs.filter(e=>Number(e.amount)>med*3);
    if(odd.length)issues.push({level:'warn',title:`Jumlah luar biasa ${f==='diesel'?'Diesel':'RON95'} (${odd.length})`,detail:`Lebih 3× jumlah biasa (${fmtRM(med)}). Semak jika tersalah taip.`,entries:odd});
  }
  const old=new Date();old.setDate(old.getDate()-30);
  const pend=E.filter(e=>e.needs_claim&&e.claim_status==='pending'&&e.entry_date<toLocalDateStr(old));
  if(pend.length)issues.push({level:'warn',title:`Claim tertunggak lebih 30 hari (${pend.length})`,detail:`Jumlah ${fmtRM(pend.reduce((a,e)=>a+Number(e.amount),0))} belum di-claim.`,entries:pend});
  const leg=E.filter(e=>e.receipt_url);
  if(leg.length)issues.push({level:'warn',title:`Resit lama belum dipindah (${leg.length})`,detail:'Resit masih di projek Supabase lama. Admin: ⚙️ Admin → Pindah Resit Lama.',entries:leg});
  const norec=E.filter(e=>!e.receipt_path&&!e.receipt_url);
  if(norec.length)issues.push({level:'info',title:`Tiada resit (${norec.length})`,detail:'Entri tanpa resit dilampirkan.',entries:norec});
  const noown=E.filter(e=>!e.user_id);
  if(noown.length)issues.push({level:'info',title:`Tiada pemilik akaun (${noown.length})`,detail:'Emel entri tidak sepadan dengan mana-mana akaun; hanya admin boleh ubah.',entries:noown});

  const rank={bad:0,warn:1,info:2};
  chk.issues=issues.sort((a,b)=>rank[a.level]-rank[b.level]);
  const n=issues.filter(i=>i.level!=='info').length;
  const badge=document.getElementById('checkBadge');
  badge.hidden=!n; badge.textContent=n;
  badge.classList.toggle('bad',issues.some(i=>i.level==='bad'));
  if(checkDialog.open)renderChecks();
}

function checkEntryRow(e){
  const li=document.createElement('div');
  li.className='chk-entry';
  li.innerHTML=`<span class="chk-e-main">${fmtDateShort(e.entry_date)} · ${e.fuel_type==='diesel'?'Diesel':'RON95'} · <b>${fmtRM(e.amount)}</b>${(e.receipt_path||e.receipt_url)?' 📎':''}</span>
    <span class="chk-e-sub">${esc(e.user_email||'?')}${e.notes?' · '+esc(e.notes):''}</span>
    <span class="chk-e-act"><button type="button" class="logout-btn" data-a="open">Lihat</button><button type="button" class="logout-btn chk-del" data-a="del">Padam</button></span>`;
  const own=state.currentUser&&e.user_id===state.currentUser.id;
  if(!own&&!state.isAdmin)li.querySelector('[data-a=del]').remove();
  li.querySelector('[data-a=open]').onclick=()=>{checkDialog.close();openDetail(e,own);};
  li.querySelector('[data-a=del]')?.addEventListener('click',async()=>{if(await deleteEntry(e))renderChecks();});
  return li;
}

function renderChecks(){
  const list=document.getElementById('checkList');
  const sum=document.getElementById('checkSummary');
  const tools=document.getElementById('checkTools');
  const bad=chk.issues.filter(i=>i.level==='bad').length,warn=chk.issues.filter(i=>i.level==='warn').length;
  sum.className='check-summary '+(bad?'bad':warn?'warn':'ok');
  sum.innerHTML=bad||warn
    ?`<b>${bad?`${bad} isu perlu dibetulkan`:''}${bad&&warn?' · ':''}${warn?`${warn} perlu disemak`:''}</b><span>${chk.entries.length} entri diimbas</span>`
    :`<b>✓ Tiada masalah dijumpai</b><span>${chk.entries.length} entri diimbas</span>`;
  tools.innerHTML='';
  if(!state.semakan){
    tools.innerHTML='<div class="form-error is-warn">Database belum dikemas kini. Admin perlu run <b>migration-minyak-semakan.sql</b> dalam Supabase untuk padam boleh pulih dan semakan resit sama.</div>';
  } else if(state.isAdmin){
    const missing=chk.entries.filter(e=>!e.receipt_hash&&(e.receipt_path||e.receipt_url));
    if(missing.length){
      const b=document.createElement('button');b.type='button';b.className='logout-btn chk-tool';
      b.textContent=`🔍 Kira cap jari ${missing.length} resit (cari resit sama)`;
      b.onclick=()=>fingerprint(missing,b);
      tools.appendChild(b);
    }
  }
  forget(list);
  chk.issues.forEach((it,idx)=>{
    const li=document.createElement('li');
    li.className=`imp-item imp-${it.level==='bad'?'bad':it.level==='warn'?'warn':'ok'} chk-item`;
    li.innerHTML=`<div class="imp-head"><b class="chk-title">${esc(it.title)}</b><span class="imp-chip imp-chip-${it.level==='bad'?'bad':it.level==='warn'?'warn':'ok'}">${it.level==='bad'?'Betulkan':it.level==='warn'?'Semak':'Info'}</span></div>
      <div class="chk-detail">${esc(it.detail)}</div><div class="chk-entries"></div><div class="chk-actions"></div>`;
    const box=li.querySelector('.chk-entries');
    const shown=it.entries.slice(0,it.level==='info'?5:20);
    shown.forEach(e=>box.appendChild(checkEntryRow(e)));
    if(it.entries.length>shown.length)box.insertAdjacentHTML('beforeend',`<div class="chk-more">+${it.entries.length-shown.length} lagi</div>`);
    if(it.kind==='dup'&&state.semakan){
      const act=li.querySelector('.chk-actions');
      const cmp=document.createElement('button');cmp.type='button';cmp.className='logout-btn';cmp.textContent='🔍 Bandingkan resit';
      cmp.onclick=()=>fingerprint(it.entries.filter(e=>!e.receipt_hash&&(e.receipt_path||e.receipt_url)),cmp);
      const ok=document.createElement('button');ok.type='button';ok.className='logout-btn';ok.textContent='✓ Bukan pendua';
      ok.onclick=()=>markNotDup(it.entries,ok);
      act.append(cmp,ok);
    }
    animIn(li);
    list.appendChild(li);
  });
  const dw=document.getElementById('checkDeletedWrap'),dl=document.getElementById('checkDeleted');
  dw.hidden=!chk.deleted.length; forget(dl);
  chk.deleted.slice(0,30).forEach(e=>{
    const li=document.createElement('li');li.className='imp-item chk-item imp-off-soft';
    li.innerHTML=`<div class="chk-entry"><span class="chk-e-main">${fmtDateShort(e.entry_date)} · ${e.fuel_type==='diesel'?'Diesel':'RON95'} · <b>${fmtRM(e.amount)}</b></span>
      <span class="chk-e-sub">${esc(e.user_email||'?')} · dipadam ${new Date(e.deleted_at).toLocaleDateString('ms-MY',{day:'numeric',month:'short'})}</span>
      <span class="chk-e-act"><button type="button" class="logout-btn">↩ Pulihkan</button></span></div>`;
    li.querySelector('button').onclick=async()=>{
      const{data,error}=await sb.from('minyak_entries').update({deleted_at:null,deleted_by:null}).eq('id',e.id).select('id');
      if(error||!data?.length){showToast(error?'Gagal pulihkan: '+error.message:'Tiada kebenaran pulihkan entri ini.');return;}
      showToast('Entri dipulihkan ✓');await loadEntries();
    };
    dl.appendChild(li);
  });
}

// Muat turun resit, kira cap jari, simpan. Entri yang pengguna tiada
// kebenaran ubah tetap dibandingkan dalam sesi ini.
async function fingerprint(entries,btn){
  if(!entries.length){showToast('Semua resit sudah ada cap jari ✓');await runChecks();return;}
  btn.disabled=true;let done=0,fail=0;
  for(const e of entries){
    btn.textContent=`Mengira ${done+fail+1} / ${entries.length}...`;
    try{
      const url=await receiptLink(e);
      if(!url)throw 0;
      const res=await fetch(url);if(!res.ok)throw 0;
      e.receipt_hash=await sha256(await res.blob());
      await sb.from('minyak_entries').update({receipt_hash:e.receipt_hash}).eq('id',e.id);
      done++;
    }catch{fail++;}
  }
  showToast(`${done} cap jari dikira${fail?`, ${fail} gagal (resit tidak dapat dibuka)`:''}`);
  await runChecks();
}

async function markNotDup(entries,btn){
  btn.disabled=true;
  const{data,error}=await sb.from('minyak_entries').update({dup_ok:true}).in('id',entries.map(e=>e.id)).select('id');
  if(error){showToast('Gagal: '+error.message);btn.disabled=false;return;}
  if((data||[]).length<entries.length-1)showToast('Sebahagian entri milik orang lain. Minta admin sahkan.');
  else showToast('Ditanda bukan pendua ✓');
  await runChecks();
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
    row('Jumlah',fmtRM(entry.amount),true),
  ];
  if(entry.odometer_start!==null&&entry.odometer_end!==null){
    rows.push(row('Odo Mula',fmtKm(entry.odometer_start)+' km',true));
    rows.push(row('Odo Akhir',fmtKm(entry.odometer_end)+' km',true));
    rows.push(row('Jarak',fmtKm(entry.distance_km)+' km',true));
  }
  if(entry.needs_claim) rows.push(row('Claim',entry.claim_status==='claimed'?'Dah Claim ✓':'Belum Claim'));
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
    tb.textContent=isClaimed?'Tandakan Belum Claim':'Tandakan Dah Claim';
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
    db.textContent=(state.isAdmin&&!isOwner)?'🔐 Padam (Admin)':'Padam Entri';
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
  if(state.semakan){
    // Padam boleh dipulihkan: tanda sahaja, resit disimpan.
    if(!confirm(`Padam entri ${fmtRM(entry.amount)} (${fmtDateShort(entry.entry_date)})?\nBoleh dipulihkan dalam Semakan Data.`))return false;
    const{data,error}=await sb.from('minyak_entries').update({deleted_at:new Date().toISOString(),deleted_by:state.currentUser.id}).eq('id',entry.id).select('id');
    if(error||!data?.length){showToast(error?'Gagal padam.':'Tiada kebenaran padam entri ini.');return false;}
  } else {
    if(!confirm('Padam entri ini?'))return false;
    const{error}=await sb.from('minyak_entries').delete().eq('id',entry.id);
    if(!error&&entry.receipt_path&&!entry.receipt_url)await sb.storage.from(RECEIPT_BUCKET).remove([entry.receipt_path]);
    if(error){showToast('Gagal padam.');return false;}
  }
  if(detailDialog.open)detailDialog.close();
  showToast('Entri dipadam');
  await loadEntries();
  return true;
}

// ── Init ──────────────────────────────────────────
if('serviceWorker' in navigator)
  window.addEventListener('load',()=>navigator.serviceWorker.register('../sw.js').catch(()=>{}));

initAuth();
