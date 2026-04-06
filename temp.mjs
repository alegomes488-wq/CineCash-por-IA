
import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics }      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, update, remove, onValue, push, off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:"AIzaSyDpB0dNIjeS6KnFDt057rbm0QGrcX3AvJE",
  authDomain:"playearn-b001b.firebaseapp.com",
  databaseURL:"https://playearn-b001b-default-rtdb.firebaseio.com",
  projectId:"playearn-b001b",
  storageBucket:"playearn-b001b.firebasestorage.app",
  messagingSenderId:"563829659490",
  appId:"1:563829659490:web:88e1f869db48b1df41fe3b",
  measurementId:"G-YDPS46ZDEZ"
};

const app  = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db   = getDatabase(app);

const ADMIN_CREDS = null; // credentials stored securely in Firebase
let _cachedUsers=[], _cachedVideos=[], chartGrowth=null, chartWeekly=null, toastTimer;

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts){return new Date(ts).toLocaleDateString('pt-BR')}
function fmt(v){return 'R$ '+Number(v||0).toFixed(2)}
function fmtU(v){return '$'+Number(v||0).toFixed(2)}
function setLoading(id,on,label){const b=document.getElementById(id);if(!b)return;b.disabled=on;b.textContent=on?'⏳ Aguarde...':label}
function showToast(msg,type='info'){const t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2800)}
function showPage(name){document.querySelectorAll('.page,.admin-page').forEach(p=>p.classList.remove('active'));const el=document.getElementById('page-'+name);if(el)el.classList.add('active')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
function togglePwd(id,btn){const inp=document.getElementById(id);if(inp.type==='password'){inp.type='text';btn.textContent='🙈'}else{inp.type='password';btn.textContent='👁'}}
function fbError(err){const m={'auth/email-already-in-use':'Este email já está cadastrado!','auth/invalid-email':'Email inválido!','auth/weak-password':'Senha fraca. Use pelo menos 6 caracteres.','auth/user-not-found':'Email ou senha incorretos!','auth/wrong-password':'Email ou senha incorretos!','auth/invalid-credential':'Email ou senha incorretos!','auth/too-many-requests':'Muitas tentativas. Tente novamente mais tarde.','auth/popup-closed-by-user':'Login com Google cancelado.','auth/network-request-failed':'Sem conexão. Verifique sua internet.'};return m[err.code]||('Erro: '+err.message)}

// auth state handled in dashboard section below

// ── ✅ register ───────────────────────────────────────────────────────────────
async function doRegister(){
  const fullname=document.getElementById('reg-fullname').value.trim()
  const display=document.getElementById('reg-display').value.trim()
  const email=document.getElementById('reg-email').value.trim()
  const pass=document.getElementById('reg-password').value
  const confirm=document.getElementById('reg-confirm').value
  if(!fullname||!display||!email||!pass||!confirm)return showToast('Preencha todos os campos!','error')
  if(pass.length<8)return showToast('A senha deve ter no mínimo 8 caracteres!','error')
  if(pass[0]!==pass[0].toUpperCase())return showToast('A senha deve começar com letra maiúscula!','error')
  if(pass!==confirm)return showToast('As senhas não coincidem!','error')
  setLoading('reg-btn',true,'Criar Conta')
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass)
    await set(ref(db,'users/'+cred.user.uid),{fullname,display,email,createdAt:Date.now(),status:'ativo',balance:0,videosWatched:0})
    showToast('Conta criada com sucesso! ✅','success')
    setTimeout(()=>showPage('login'),1000)
  }catch(err){showToast(fbError(err),'error')}
  finally{setLoading('reg-btn',false,'Criar Conta')}
}

// ── ✅ login (corrigido — estava com o corpo cortado) ─────────────────────────
async function doLogin(){
  if(_fraudLog && _fraudLog.blocked) return showToast('Acesso bloqueado. Aguarde.','error')
  if(_fraudLog) antiFraud_checkLogin()

  const input = document.getElementById('login-email').value.trim()
  const pass  = document.getElementById('login-password').value
  if(!input || !pass) return showToast('Preencha usuário/email e senha!','error')

  setLoading('login-btn', true, '⏳ Entrando...')
  try {
    // ── Resolve email: se digitou admin16 → admin@cinecash.com.br ──────────
    let emailToUse = input
    if(!input.includes('@')){
      // Could be username → check Firebase mapping
      emailToUse = input.toLowerCase() + '@cinecash.com.br'
    }

    // ── Firebase Auth login ────────────────────────────────────────────────
    const cred = await signInWithEmailAndPassword(auth, emailToUse, pass)
    const uid  = cred.user.uid

    // ── Check if this UID is the admin ─────────────────────────────────────
    const adminSnap = await get(ref(db, 'config/adminUID'))
    if(adminSnap.exists() && adminSnap.val() === uid){
      // ✅ IS ADMIN
      _cachedUsers = []; _cachedVideos = []
      showPage('admin-dashboard')
      attachRealtimeListeners()
      loadMaintenanceState()
      setTimeout(()=>{ renderCharts(); updateLucros() }, 300)
      showToast('🛡 Bem-vindo, Admin!', 'success')
      return
    }

    // ── Regular user handled by onAuthStateChanged ─────────────────────────

  } catch(err) {
    // If email not found, try looking up by display name
    if(!input.includes('@') && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')){
      try {
        const usersSnap = await get(ref(db,'users'))
        if(usersSnap.exists()){
          const found = Object.values(usersSnap.val()).find(u =>
            (u.display||'').toLowerCase() === input.toLowerCase() ||
            (u.fullname||'').toLowerCase() === input.toLowerCase()
          )
          if(found && found.email){
            const cred2 = await signInWithEmailAndPassword(auth, found.email, pass)
            // onAuthStateChanged handles the redirect
            return
          }
        }
      } catch(_){}
    }
    showToast(fbError(err), 'error')
  } finally {
    setLoading('login-btn', false, 'Entrar')
  }
}

// ── ✅ google login (corrigido — estava duplicado e com syntax error) ─────────
async function doGoogleLogin(){
  const provider=new GoogleAuthProvider()
  try{
    const result=await signInWithPopup(auth,provider)
    const user=result.user
    const snap=await get(ref(db,'users/'+user.uid))
    if(!snap.exists()){
      await set(ref(db,'users/'+user.uid),{
        fullname:user.displayName||'Usuário Google',
        display:(user.displayName||'').split(' ')[0]||'Usuário',
        email:user.email,
        createdAt:Date.now(),
        status:'ativo',
        balance:0,
        videosWatched:0
      })
    }
    showToast('Login com Google realizado! ✅','success')
  }catch(err){showToast(fbError(err),'error')}
}

// ── admin login — now handled by doLogin ─────────
async function doAdminLogin(){}

async function doAdminLogout(){
  try{off(ref(db,'users'));off(ref(db,'videos'))}catch(_){}
  _cachedUsers=[];_cachedVideos=[]
  await signOut(auth)
  showPage('login')
}

// ── realtime ──────────────────────────────────────────────────────────────────
function attachRealtimeListeners(){
  onValue(ref(db,'users'),snap=>{
    _cachedUsers=snap.exists()?Object.entries(snap.val()).map(([uid,u])=>({...u,uid})):[]
    updateStats();renderUsersTable();updateLucros()
  })
  onValue(ref(db,'videos'),snap=>{
    _cachedVideos=snap.exists()?Object.entries(snap.val()).map(([id,v])=>({...v,id})):[]
    renderVideosTable();updateLucros()
  })
}

// ── tabs ──────────────────────────────────────────────────────────────────────
function switchTab(name,btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'))
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'))
  document.getElementById('tab-'+name).classList.add('active')
  btn.classList.add('active')
  if(name==='crescimento')setTimeout(renderCharts,50)
  if(name==='lucros')updateLucros()
}

// ── stats ──────────────────────────────────────────────────────────────────────
function updateStats(){
  const users=_cachedUsers
  const totalVid=users.reduce((a,u)=>a+(u.videosWatched||0),0)
  document.getElementById('stat-total').textContent=users.length
  document.getElementById('stat-active').textContent=users.filter(u=>u.status==='ativo').length
  document.getElementById('stat-videos').textContent=totalVid
  document.getElementById('stat-saques').textContent=0
  document.getElementById('g-total').textContent=users.length
  const now=new Date(),m=now.getMonth(),y=now.getFullYear()
  const newM=users.filter(u=>{const d=new Date(u.createdAt);return d.getMonth()===m&&d.getFullYear()===y}).length
  document.getElementById('g-month').textContent=newM
  const prev=users.length-newM
  document.getElementById('g-rate').textContent=(prev===0?'0.0':((newM/prev)*100).toFixed(1))+'%'
}

// ── users table ────────────────────────────────────────────────────────────────
function renderUsersTable(){
  const query=(document.getElementById('user-search')||{}).value||''
  const all=_cachedUsers
  const users=all.filter(u=>{if(!query)return true;const q=query.toLowerCase();return(u.fullname||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)||(u.uid||'').toLowerCase().includes(q)})
  const tbody=document.getElementById('users-tbody')
  if(!tbody)return
  if(!users.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:24px">Nenhum usuário encontrado</td></tr>';document.getElementById('users-footer').textContent='Nenhum usuário encontrado';return}
  tbody.innerHTML=users.map(u=>`<tr><td style="font-size:11px;color:#6b7280;font-family:monospace">${u.uid.substring(0,16)}...</td><td><div class="user-names"><div class="name">${u.fullname||'-'}</div><div class="display">${u.display||''}</div></div></td><td>${u.email||'-'}</td><td style="color:#a78bfa">${u.videosWatched||0}</td><td style="color:#34d399">R$ ${Number(u.balance||0).toFixed(2)}</td><td>${fmtDate(u.createdAt)}</td><td>${u.status==='ativo'?'<span class="badge-active">✓ Ativo</span>':'<span class="badge-inactive">✗ Inativo</span>'}</td><td><button class="action-btn action-edit" onclick="window.openEditModal('${u.uid}')">Editar</button><button class="action-btn action-del" onclick="window.openDeleteModal('${u.uid}')">Remover</button></td></tr>`).join('')
  document.getElementById('users-footer').textContent='Mostrando '+users.length+' de '+all.length+' usuário'+(all.length!==1?'s':'')
}

function openEditModal(uid){
  const user=_cachedUsers.find(u=>u.uid===uid);if(!user)return
  document.getElementById('edit-user-id').value=uid
  document.getElementById('edit-fullname').value=user.fullname||''
  document.getElementById('edit-display').value=user.display||''
  document.getElementById('edit-email').value=user.email||''
  document.getElementById('edit-status').value=user.status||'ativo'
  document.getElementById('modal-edit').classList.add('open')
}

async function saveEditUser(){
  const uid=document.getElementById('edit-user-id').value
  try{await update(ref(db,'users/'+uid),{fullname:document.getElementById('edit-fullname').value.trim(),display:document.getElementById('edit-display').value.trim(),email:document.getElementById('edit-email').value.trim(),status:document.getElementById('edit-status').value});closeModal('modal-edit');showToast('Usuário atualizado! ✅','success')}
  catch(err){showToast('Erro: '+err.message,'error')}
}

function openDeleteModal(uid){document.getElementById('delete-user-id').value=uid;document.getElementById('modal-delete').classList.add('open')}

async function confirmDelete(){
  const uid=document.getElementById('delete-user-id').value
  try{await remove(ref(db,'users/'+uid));closeModal('modal-delete');showToast('Usuário removido!','success')}
  catch(err){showToast('Erro: '+err.message,'error')}
}

// ── videos ────────────────────────────────────────────────────────────────────
async function addVideo(){
  const title=document.getElementById('vid-title').value.trim()
  const url=document.getElementById('vid-url').value.trim()
  const reward=parseFloat(document.getElementById('vid-reward').value)||0
  if(!title||!url)return showToast('Preencha título e URL!','error')
  try{await push(ref(db,'videos'),{title,url,reward,createdAt:Date.now()});document.getElementById('vid-title').value='';document.getElementById('vid-url').value='';document.getElementById('vid-reward').value='';showToast('Vídeo adicionado! ✅','success')}
  catch(err){showToast('Erro: '+err.message,'error')}
}

function renderVideosTable(){
  const videos=_cachedVideos;const tbody=document.getElementById('videos-tbody');if(!tbody)return
  if(!videos.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:24px">Nenhum vídeo cadastrado</td></tr>';document.getElementById('videos-footer').textContent='Nenhum vídeo cadastrado';return}
  tbody.innerHTML=videos.map(v=>`<tr><td style="font-size:11px;color:#6b7280;font-family:monospace">${v.id.substring(0,12)}...</td><td style="color:#fff;font-weight:500">${v.title}</td><td><a href="${v.url}" target="_blank" style="color:#60a5fa;font-size:12px;text-decoration:none">${v.url.substring(0,38)}${v.url.length>38?'...':''}</a></td><td style="color:#34d399">R$ ${Number(v.reward||0).toFixed(2)}</td><td>${fmtDate(v.createdAt)}</td><td><button class="action-btn action-del" onclick="window.deleteVideo('${v.id}')">Remover</button></td></tr>`).join('')
  document.getElementById('videos-footer').textContent=videos.length+' vídeo'+(videos.length!==1?'s':'')+' cadastrado'+(videos.length!==1?'s':'')
}

async function deleteVideo(id){
  try{await remove(ref(db,'videos/'+id));showToast('Vídeo removido!','success')}
  catch(err){showToast('Erro: '+err.message,'error')}
}

// ── charts ────────────────────────────────────────────────────────────────────
function renderCharts(){
  const users=_cachedUsers;const months=[],counts=[]
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);months.push(d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));counts.push(users.filter(u=>{const ud=new Date(u.createdAt);return ud.getMonth()===d.getMonth()&&ud.getFullYear()===d.getFullYear()}).length)}
  const days=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const weekCounts=days.map((_,i)=>{const t=new Date();t.setDate(t.getDate()-(t.getDay()-i+7)%7);return _cachedVideos.filter(v=>new Date(v.createdAt).toDateString()===t.toDateString()).length})
  const opts={responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'#1f2937'},ticks:{color:'#6b7280',font:{size:11}}},y:{grid:{color:'#1f2937'},ticks:{color:'#6b7280',font:{size:11}},beginAtZero:true}}}
  const c1=document.getElementById('chart-growth');if(chartGrowth)chartGrowth.destroy()
  chartGrowth=new Chart(c1,{type:'line',data:{labels:months,datasets:[{data:counts,borderColor:'#60a5fa',backgroundColor:'rgba(96,165,250,.1)',tension:.4,pointBackgroundColor:'#60a5fa',pointRadius:4,fill:true}]},options:opts})
  const c2=document.getElementById('chart-weekly');if(chartWeekly)chartWeekly.destroy()
  chartWeekly=new Chart(c2,{type:'line',data:{labels:days,datasets:[{data:weekCounts,borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.1)',tension:.4,pointBackgroundColor:'#a78bfa',pointRadius:4,fill:true}]},options:opts})
}

// ── lucros ────────────────────────────────────────────────────────────────────
function updateLucros(){
  const users=_cachedUsers;const totalVid=users.reduce((a,u)=>a+(u.videosWatched||0),0);const totalBal=users.reduce((a,u)=>a+Number(u.balance||0),0)
  const taxa=parseFloat(document.getElementById('conv-taxa')?.value)||5.25;const bruto=totalBal,pag=0,pend=totalBal,lucro=bruto-pag-pend
  document.getElementById('p-usd').textContent=fmtU(bruto/taxa);document.getElementById('p-brl').textContent=fmt(bruto);document.getElementById('p-pag').textContent=fmt(pag);document.getElementById('p-lucro').textContent=fmt(lucro)
  document.getElementById('an-bruta').textContent=fmt(bruto);document.getElementById('an-pag').textContent='- '+fmt(pag);document.getElementById('an-pend').textContent='- '+fmt(pend);document.getElementById('an-liquido').textContent=fmt(lucro)
  document.getElementById('ins-margem').textContent='• Margem de lucro: '+(bruto===0?'0':((lucro/bruto)*100).toFixed(1))+'%'
  document.getElementById('ins-pervideo').textContent='• Receita por vídeo: R$'+(totalVid===0?'0.000':(bruto/totalVid).toFixed(3))
  document.getElementById('ins-totalvid').textContent='• Total de vídeos: '+totalVid
  document.getElementById('fontes-amount').textContent=fmt(bruto);document.getElementById('fontes-count').textContent=totalVid+' vídeos'
}

function doConversion(){
  const taxa=parseFloat(document.getElementById('conv-taxa').value)||5.25;const valor=parseFloat(document.getElementById('conv-valor').value)||0
  if(!valor)return showToast('Digite um valor para converter!','error')
  showToast(fmtU(valor)+' = '+fmt(valor*taxa)+' registrado!','success');document.getElementById('conv-valor').value=''
}

// ── expõe funções globais ──────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════
//  MODO MANUTENÇÃO — Firebase Realtime
// ═══════════════════════════════════════════════════════════
let _isMaintenance = false

// Verifica modo manutenção ao carregar a página (para usuários normais)
async function checkMaintenance(){
  try {
    const snap = await get(ref(db, 'config/maintenance'))
    if(snap.exists() && snap.val() === true){
      _isMaintenance = true
      const msgSnap = await get(ref(db, 'config/maintenanceMessage'))
      const msg = msgSnap.exists() ? msgSnap.val() : 'Estamos realizando melhorias. Voltamos em breve!'
      document.getElementById('maintenance-msg').textContent = msg
      const mp = document.getElementById('maintenance-page')
      mp.style.display = 'flex'
    }
  } catch(_){}
}

async function toggleMaintenance(){
  const newState = !_isMaintenance
  const btn = document.getElementById('maintenance-btn')
  btn.disabled = true
  try {
    await set(ref(db, 'config/maintenance'), newState)
    await set(ref(db, 'config/maintenanceMessage'), 'Estamos realizando melhorias. Voltamos em breve!')
    _isMaintenance = newState
    updateMaintenanceBtn()
    showToast(newState ? '🔧 Modo manutenção ATIVADO!' : '✅ Site voltou ao ar!', newState ? 'info' : 'success')
  } catch(err){
    showToast('Erro: '+err.message, 'error')
  } finally {
    btn.disabled = false
  }
}

function updateMaintenanceBtn(){
  const span = document.getElementById('maint-status')
  const btn  = document.getElementById('maintenance-btn')
  if(!span || !btn) return
  if(_isMaintenance){
    span.textContent = 'ON'
    btn.style.background = '#dc2626'
    btn.style.borderColor = '#ef4444'
    btn.style.color = '#fff'
  } else {
    span.textContent = 'OFF'
    btn.style.background = '#1f2937'
    btn.style.borderColor = '#374151'
    btn.style.color = '#fbbf24'
  }
}

// Ao abrir o painel admin, carrega estado atual de manutenção
async function loadMaintenanceState(){
  try {
    const snap = await get(ref(db, 'config/maintenance'))
    _isMaintenance = snap.exists() && snap.val() === true
    updateMaintenanceBtn()
  } catch(_){}
}

// ── Admin access URLs ────────────────────────────────────────
// cinecash.com.br/#admin  ← URL secreta
// cinecash.com.br/?adm=1  ← URL alternativa
// Duplo clique no logo    ← acesso discreto
// ── Admin access — checked synchronously BEFORE Firebase ─────────────────
// Detects: cinecash.com.br/#admin OR cinecash.com.br/?adm=1
// Admin access: via login form only (secure)

function checkAdminHash(){ return false }
// Checa manutenção ao carregar
setTimeout(checkMaintenance, 150)

// ── Anti-fraude: detecta tentativas suspeitas ─────────────
const _fraudLog = { attempts: 0, lastAttempt: 0, blocked: false }

function antiFraud_checkLogin(){
  const now = Date.now()
  // Reset contador se passou mais de 5 minutos
  if(now - _fraudLog.lastAttempt > 5 * 60 * 1000) _fraudLog.attempts = 0
  _fraudLog.attempts++
  _fraudLog.lastAttempt = now
  if(_fraudLog.attempts > 5){
    _fraudLog.blocked = true
    showToast('Muitas tentativas. Aguarde 5 minutos.', 'error')
    setTimeout(()=>{ _fraudLog.blocked = false; _fraudLog.attempts = 0 }, 5*60*1000)
    return false
  }
  return true
}

function antiFraud_checkVideoWatch(uid, videoId){
  // Chave local para evitar duplo clique
  const key = `watched_${uid}_${videoId}`
  if(sessionStorage.getItem(key)){
    showToast('Você já assistiu este vídeo nesta sessão!', 'error')
    return false
  }
  sessionStorage.setItem(key, '1')
  return true
}


// ═══════════════════════════════════════════════════════════
//  USER DASHBOARD
// ═══════════════════════════════════════════════════════════
let _currentUser = null
let _watchTimer = null
let _watchVideoId = null
let _watchDuration = 30

// Auth state - handles user login/logout
onAuthStateChanged(auth, async user => {
  // ❌ Never interfere with admin pages
  const adminActive = document.getElementById('page-admin-login')?.classList.contains('active')
    || document.getElementById('page-admin-dashboard')?.classList.contains('active')
  if(adminActive) return

  // ❌ Never interfere if admin mode was triggered via URL
  if(user){
    // ── Check if THIS user is the admin ─────────────────────────────────────
    try {
      const adminSnap = await get(ref(db, 'config/adminUID'));
      if (adminSnap.exists() && adminSnap.val() === user.uid) {
        const onLoginPage = ['page-login','page-register','page-maintenance'].some(
          id => document.getElementById(id)?.classList.contains('active')
        )
        if(onLoginPage){
          _cachedUsers = []; _cachedVideos = []
          showPage('admin-dashboard')
          attachRealtimeListeners()
          loadMaintenanceState()
          setTimeout(()=>{ renderCharts(); updateLucros() }, 300)
          showToast('🛡 Bem-vindo de volta, Admin!', 'success')
        }
        return; // Important: return here so admin doesn't load user dashboard
      }
    } catch(err){}

    const snap = await get(ref(db, 'users/'+user.uid))
    if(!snap.exists()) return
    const profile = snap.val()
    if(profile.status === 'inativo'){
      showToast('Conta inativa. Contate o suporte.','error')
      await signOut(auth); return
    }
    _currentUser = { uid: user.uid, ...profile }
    const onLoginPage = ['page-login','page-register','page-maintenance'].some(
      id => document.getElementById(id)?.classList.contains('active')
    )
    const onDash = document.getElementById('page-dashboard')?.classList.contains('active')
    if(onLoginPage || (!onDash)){
      showToast('Bem-vindo, '+(profile.display||'Usuário')+'! ✅','success')
      showPage('dashboard')
      loadMonetag()
      loadUserDashboard()
      initSupportWidget()
    }
  } else {
    const onDash = document.getElementById('page-dashboard')?.classList.contains('active')
    if(onDash){ _currentUser=null; showPage('login') }
  }
})

// Reward thresholds
const REWARD_LEVELS = [
  { vids:50,   val:0.50 },
  { vids:100,  val:1.00 },
  { vids:500,  val:3.00 },
  { vids:1000, val:5.00 },
  { vids:3000, val:10.00},
  { vids:9000, val:50.00}
]

function showDashTab(name, btn){
  document.querySelectorAll('.dash-tab-panel').forEach(p=>{ p.style.display='none'; p.classList.remove('active') })
  document.querySelectorAll('.dash-nav-btn').forEach(b=>b.classList.remove('active'))
  const el = document.getElementById('dash-tab-'+name)
  if(el){ el.style.display='block'; el.classList.add('active') }
  if(btn) btn.classList.add('active')
  if(name==='indicacoes') loadReferralTab()
}

async function loadUserDashboard(){
  if(!_currentUser) return
  const snap = await get(ref(db,'users/'+_currentUser.uid))
  if(!snap.exists()) return
  const u = snap.val()
  _currentUser = { ..._currentUser, ...u }

  const avatar = document.getElementById('dash-avatar')
  const username = document.getElementById('dash-username')
  if(avatar) avatar.textContent = (u.display||'U')[0].toUpperCase()
  if(username) username.textContent = u.display||'Usuário'

  const bal = document.getElementById('dash-balance')
  const coins = document.getElementById('dash-coins')
  const vids = document.getElementById('dash-videos')
  const streak = document.getElementById('dash-streak')
  const streakBadge = document.getElementById('streak-badge')
  const coinsDisp = document.getElementById('coins-display')

  const totalVids = u.videosWatched||0
  if(bal) bal.textContent = 'R$ '+Number(u.balance||0).toFixed(2).replace('.',',')
  if(coins) coins.textContent = totalVids
  if(coinsDisp) coinsDisp.textContent = totalVids
  if(vids) vids.textContent = totalVids
  if(streak) streak.textContent = (u.checkInStreak||0)+' 🔥'
  if(streakBadge) streakBadge.textContent = '🔥 '+(u.checkInStreak||0)+' dias seguidos'

  updateCheckInBtn(u)
  updateRewardButtons(totalVids, u.claimedRewards||{})
  fetchYouTubeVideos() // auto-fetch videos daily
  loadUserVideos()
  loadWithdrawalsConfig()
  loadUserWithdrawals()
  loadReferralStats()
}

function updateRewardButtons(totalVids, claimedRewards){
  // Find next level
  let nextLevel = null
  for(const lvl of REWARD_LEVELS){
    if(totalVids < lvl.vids){ nextLevel = lvl; break }
  }
  const pct = nextLevel ? Math.min((totalVids/nextLevel.vids)*100, 100) : 100
  const bar = document.getElementById('coins-progress-bar')
  const info = document.getElementById('next-reward-info')
  if(bar) bar.style.width = pct+'%'
  if(info && nextLevel) info.textContent = `Faltam ${nextLevel.vids - totalVids} vídeos para ganhar R$ ${nextLevel.val.toFixed(2)}!`
  else if(info) info.textContent = '🏆 Você atingiu o nível máximo!'

  for(const lvl of REWARD_LEVELS){
    const btn = document.getElementById('rr-btn-'+lvl.vids)
    const row = btn?.closest('.reward-row')
    if(!btn) continue
    const claimed = claimedRewards && claimedRewards[lvl.vids]
    if(claimed){
      btn.textContent='✅ Resgatado'; btn.className='rr-btn claimed'
      row?.classList.add('claimed')
    } else if(totalVids >= lvl.vids){
      btn.textContent='🎁 Resgatar'; btn.className='rr-btn ready'
      btn.onclick = ()=>claimReward(lvl.vids, lvl.val)
      row?.classList.add('unlocked')
    } else {
      btn.textContent='🔒'; btn.className='rr-btn locked'
    }
  }
}

async function claimReward(vids, val){
  if(!_currentUser) return
  const snap = await get(ref(db,'users/'+_currentUser.uid))
  const u = snap.val()
  if(Number(u.videosWatched||0) < vids) return showToast('Assista mais vídeos!','error')
  if(u.claimedRewards && u.claimedRewards[vids]) return showToast('Recompensa já resgatada!','error')

  // Admin earns 10% of reward
  const adminEarn = val * 0.10
  const adminBal = Number((await get(ref(db,'config/adminBalance'))).val()||0)
  await set(ref(db,'config/adminBalance'), adminBal + adminEarn)

  await update(ref(db,'users/'+_currentUser.uid),{
    balance: Number(u.balance||0)+val,
    totalEarned: Number(u.totalEarned||0)+val,
    ['claimedRewards/'+vids]: Date.now()
  })
  showToast('🎉 R$ '+val.toFixed(2)+' adicionado ao seu saldo!','success')
  loadUserDashboard()
}

function updateCheckInBtn(u){
  const btn = document.getElementById('checkin-btn')
  if(!btn) return
  const today = new Date().toDateString()
  const lastCI = u.lastCheckIn ? new Date(u.lastCheckIn).toDateString() : null
  if(lastCI === today){
    btn.disabled = true
    btn.textContent = '✅ Check-in feito hoje!'
  } else {
    btn.disabled = false
    btn.textContent = '🎁 Fazer Check-in'
  }
}

// _pendingCheckIn: set to true when user clicks check-in, cleared after watching
let _pendingCheckIn = false

async function doCheckIn(){
  if(!_currentUser) return
  const snap = await get(ref(db,'users/'+_currentUser.uid))
  const u = snap.val()
  const today = new Date().toDateString()
  const lastCI = u.lastCheckIn ? new Date(u.lastCheckIn).toDateString() : null
  if(lastCI === today){ showToast('Você já fez check-in hoje! ✅','error'); return }

  // Must watch a video first!
  _pendingCheckIn = true
  showToast('📹 Assista um vídeo para resgatar seu bônus diário!','info')
  // Scroll to videos section
  document.getElementById('user-video-grid')?.scrollIntoView({ behavior:'smooth' })
  const btn = document.getElementById('checkin-btn')
  if(btn){ btn.textContent = '⏳ Assista um vídeo para resgatar...'; btn.disabled = true }
}

async function completeCheckIn(){
  if(!_currentUser || !_pendingCheckIn) return
  _pendingCheckIn = false
  const snap = await get(ref(db,'users/'+_currentUser.uid))
  const u = snap.val()
  const today = new Date().toDateString()
  const lastCI = u.lastCheckIn ? new Date(u.lastCheckIn).toDateString() : null
  if(lastCI === today) return // already done

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1)
  const wasYesterday = lastCI === yesterday.toDateString()
  const newStreak = wasYesterday ? (u.checkInStreak||0)+1 : 1
  const cfgSnap = await get(ref(db,'config/dailyCheckInReward'))
  const reward = cfgSnap.exists() ? Number(cfgSnap.val()) : 0.05

  await update(ref(db,'users/'+_currentUser.uid),{
    balance: Number(u.balance||0)+reward,
    lastCheckIn: Date.now(),
    checkInStreak: newStreak,
    totalEarned: Number(u.totalEarned||0)+reward
  })
  const adminBal2 = Number((await get(ref(db,'config/adminBalance'))).val()||0)
  await set(ref(db,'config/adminBalance'), adminBal2 + reward*0.10)
  showToast('🎁 Bônus diário resgatado! +R$'+reward.toFixed(2)+' • '+newStreak+' dias 🔥','success')
  loadUserDashboard()
}

async function loadUserVideos(){
  const snap = await get(ref(db,'videos'))
  const grid = document.getElementById('user-video-grid')
  if(!grid) return

  if(!snap.exists()){
    grid.innerHTML='<div class="no-videos">📹 Nenhum vídeo disponível ainda. Volte em breve!</div>'
    return
  }

  const videos = Object.entries(snap.val()).map(([id,v])=>({...v,id}))
  const u = _currentUser
  const watchedList = u.watchedVideos || {}

  grid.innerHTML = videos.map(v=>{
    const watched = watchedList[v.id]
    const thumb = v.thumbnail ? `<img src="${v.thumbnail}" style="width:100%;height:100%;object-fit:cover;border-radius:0">` : '📹'
    const catBadge = v.category ? `<span style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.7);color:#fff;font-size:10px;padding:2px 8px;border-radius:20px">${v.category}</span>` : ''
    return `<div class="video-card">
      <div class="video-thumb" style="${v.thumbnail?'padding:0;':''}">
        ${thumb}
        ${catBadge}
        <span class="video-reward-badge">+R$ ${Number(v.reward||0).toFixed(2)}</span>
      </div>
      <div class="video-info">
        <div class="video-title">${v.title}</div>
        <button class="watch-btn ${watched?'watched':''}" onclick="startWatch('${v.id}',\`${v.title.replace(/`/g,"'")}\`,'${v.url}',${v.reward})" ${watched?'disabled':''}>
          ${watched ? '✅ Já assistido' : '▶ Assistir e ganhar'}
        </button>
      </div>
    </div>`
  }).join('')
}

async function startWatch(videoId, title, url, reward){
  if(!antiFraud_checkVideoWatch(_currentUser.uid, videoId)) return

  // Check if already watched in DB
  const snap = await get(ref(db,'users/'+_currentUser.uid+'/watchedVideos/'+videoId))
  if(snap.exists()){
    showToast('Você já assistiu este vídeo!','error'); return
  }

  _watchVideoId = videoId
  _watchDuration = 30
  document.getElementById('watch-modal-title').textContent = title
  document.getElementById('watch-modal-sub').textContent = 'Assista pelo menos 30 segundos para ganhar R$'+Number(reward).toFixed(2)
  document.getElementById('watch-video-link').href = url
  document.getElementById('watch-timer').textContent = _watchDuration
  document.getElementById('watch-progress-fill').style.width = '0%'
  document.getElementById('modal-watch').classList.add('open')

  let elapsed = 0
  _watchTimer = setInterval(async ()=>{
    elapsed++
    const remaining = _watchDuration - elapsed
    const pct = (elapsed/_watchDuration)*100
    document.getElementById('watch-timer').textContent = remaining > 0 ? remaining : '✅'
    document.getElementById('watch-progress-fill').style.width = Math.min(pct,100)+'%'

    if(elapsed >= _watchDuration){
      clearInterval(_watchTimer)
      _watchTimer = null
      await creditVideoReward(videoId, reward)
    }
  }, 1000)
}

async function creditVideoReward(videoId, reward){
  const u = _currentUser
  const userSnap = await get(ref(db,'users/'+u.uid))
  const userData = userSnap.val()
  const newVidsWatched = Number(userData.videosWatched||0)+1

  // Credit user
  await update(ref(db,'users/'+u.uid),{
    balance: Number(userData.balance||0)+Number(reward),
    videosWatched: newVidsWatched,
    totalEarned: Number(userData.totalEarned||0)+Number(reward),
    ['watchedVideos/'+videoId]: Date.now()
  })

  // Admin earns per video (5%)
  const adminEarn = Number(reward) * 0.05
  const adminBal = Number((await get(ref(db,'config/adminBalance'))).val()||0)
  await set(ref(db,'config/adminBalance'), adminBal + adminEarn)
  await set(ref(db,'config/totalVideosWatched'), Number((await get(ref(db,'config/totalVideosWatched'))).val()||0)+1)

  // Check referral completion (30 videos milestone)
  if(newVidsWatched === 30 && userData.referredBy){
    await completeReferral(userData.referredBy, u.uid)
  }

  // Show Monetag ad after video
  showAdAfterVideo(Number(reward))
  // Complete check-in if pending
  if(_pendingCheckIn) await completeCheckIn()
}

async function completeReferral(referrerId, newUserId){
  try {
    // Give R$1.00 to referrer
    const refSnap = await get(ref(db,'users/'+referrerId))
    if(refSnap.exists()){
      const rd = refSnap.val()
      await update(ref(db,'users/'+referrerId),{
        balance: Number(rd.balance||0)+1,
        totalEarned: Number(rd.totalEarned||0)+1,
        referralEarnings: Number(rd.referralEarnings||0)+1,
        ['completedReferrals/'+newUserId]: Date.now()
      })
    }
    // Give R$1.00 to new user
    const nuSnap = await get(ref(db,'users/'+newUserId))
    if(nuSnap.exists()){
      const nu = nuSnap.val()
      await update(ref(db,'users/'+newUserId),{
        balance: Number(nu.balance||0)+1,
        totalEarned: Number(nu.totalEarned||0)+1,
        referralBonusReceived: true
      })
    }
    // Mark referral as complete
    await update(ref(db,'referrals/'+referrerId+'/'+newUserId),{ status:'completed', completedAt: Date.now() })
    showToast('🎉 Bônus de R$ 1,00 de indicação adicionado!','success')
  } catch(e){ console.error(e) }
}

function cancelWatch(){
  if(_watchTimer){ clearInterval(_watchTimer); _watchTimer=null }
  document.getElementById('modal-watch').classList.remove('open')
  showToast('Vídeo cancelado. Assista completo para ganhar!','info')
}

async function loadWithdrawalsConfig(){
  const snap = await get(ref(db,'config/withdrawalsOpen'))
  const open = !snap.exists() || snap.val()===true
  const msg = document.getElementById('withdraw-closed-msg')
  const btn = document.getElementById('withdraw-btn')
  if(msg) msg.style.display = open ? 'none' : 'block'
  if(btn) btn.disabled = !open
}

async function requestWithdrawal(){
  if(!_currentUser) return
  const pix    = document.getElementById('withdraw-pix').value.trim()
  const amount = parseFloat(document.getElementById('withdraw-amount').value)||0

  if(!pix) return showToast('Digite sua chave PIX!','error')
  if(amount < 10) return showToast('Valor mínimo de saque: R$ 10,00!','error')

  const snap = await get(ref(db,'users/'+_currentUser.uid))
  const u = snap.val()
  if(Number(u.balance||0) < amount) return showToast('Saldo insuficiente!','error')

  // Verify minimum videos watched
  const minVidsSnap = await get(ref(db,'config/minVideosForWithdrawal'))
  const minVids = minVidsSnap.exists() ? Number(minVidsSnap.val()) : 5
  if(Number(u.videosWatched||0) < minVids){
    return showToast('Você precisa assistir pelo menos '+minVids+' vídeos para sacar!','error')
  }

  // Create withdrawal request
  const wRef = push(ref(db,'withdrawals'))
  await set(wRef,{
    uid: _currentUser.uid,
    userName: u.fullname||u.display,
    userEmail: u.email,
    pixKey: pix,
    amount: amount,
    videosWatched: u.videosWatched||0,
    balance: u.balance||0,
    status: 'pending',
    requestedAt: Date.now()
  })

  // Deduct from balance (hold)
  await update(ref(db,'users/'+_currentUser.uid),{
    balance: Number(u.balance||0)-amount
  })

  document.getElementById('withdraw-pix').value=''
  document.getElementById('withdraw-amount').value=''
  showToast('✅ Saque solicitado! O admin irá verificar e aprovar em breve.','success')
  loadUserDashboard()
}

async function loadUserWithdrawals(){
  const list = document.getElementById('user-withdrawals-list')
  if(!list) return
  const snap = await get(ref(db,'withdrawals'))
  if(!snap.exists()){ list.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);font-size:13px">Nenhum saque ainda</div>'; return }

  const all = Object.entries(snap.val())
    .filter(([,w])=>w.uid===_currentUser.uid)
    .sort(([,a],[,b])=>b.requestedAt-a.requestedAt)

  if(!all.length){ list.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);font-size:13px">Nenhum saque ainda</div>'; return }

  list.innerHTML = all.map(([id,w])=>`
    <div class="withdraw-history-item">
      <div>
        <div style="color:#fff;font-weight:600;font-size:12px">R$ ${Number(w.amount).toFixed(2)}</div>
        <div style="color:rgba(255,255,255,.4);font-size:11px">${new Date(w.requestedAt).toLocaleDateString('pt-BR')} • PIX: ${w.pixKey}</div>
      </div>
      <span class="wh-status-${w.status}">${w.status==='pending'?'⏳ Pendente':w.status==='approved'?'✅ Aprovado':'❌ Negado'}</span>
    </div>
  `).join('')
}

async function doUserLogout(){
  await signOut(auth)
  _currentUser = null
  showPage('login')
  showToast('Até logo!','info')
}


// ═══════════════════════════════════════════════════════════
//  AD AFTER VIDEO — shows Monetag ad for 30s after each video
// ═══════════════════════════════════════════════════════════
let _adTimer = null
const AD_DURATION = 30 // seconds

function showAdAfterVideo(reward){
  const overlay = document.getElementById('ad-overlay')
  const mainContent = document.getElementById('watch-main-content')
  if(!overlay || !mainContent) {
    // Fallback: just show toast and update dashboard
    showToast('🎉 +R$'+reward.toFixed(2)+' adicionado ao saldo! 🪙 +1 moeda','success')
    loadUserDashboard()
    return
  }

  // Show ad overlay
  overlay.style.display = 'flex'
  mainContent.style.opacity = '0'

  // Open Monetag popunder ad in background tab
  try {
    const adWin = window.open('about:blank', '_blank')
    if(adWin){
      adWin.document.write('<script src="https://al5sm.com/tag.min.js" data-zone="10828297"><\/script>')
      adWin.document.close()
    }
  } catch(e){}

  // Countdown
  let elapsed = 0
  document.getElementById('ad-countdown').textContent = AD_DURATION
  document.getElementById('ad-progress').style.width = '0%'

  _adTimer = setInterval(()=>{
    elapsed++
    const remaining = AD_DURATION - elapsed
    const pct = (elapsed/AD_DURATION)*100
    const countEl = document.getElementById('ad-countdown')
    const progEl  = document.getElementById('ad-progress')
    if(countEl) countEl.textContent = remaining > 0 ? remaining : '✅'
    if(progEl)  progEl.style.width = Math.min(pct,100)+'%'

    if(elapsed >= AD_DURATION){
      clearInterval(_adTimer); _adTimer = null
      overlay.style.display = 'none'
      mainContent.style.opacity = '1'
      document.getElementById('modal-watch').classList.remove('open')
      showToast('🎉 +R$'+reward.toFixed(2)+' adicionado ao saldo! 🪙 +1 moeda','success')
      loadUserDashboard()
    }
  }, 1000)
}

// ═══════════════════════════════════════════════════════════
//  YOUTUBE AUTO-FETCH — busca vídeos automaticamente
// ═══════════════════════════════════════════════════════════
const YT_API_KEY = 'AIzaSyDx0jwyezPxW02LnvJ51vEkjNw-IZRbXYQ'
const YT_CATEGORIES = [
  { q:'entretenimento brasil', label:'Entretenimento' },
  { q:'culinária receitas fáceis', label:'Culinária' },
  { q:'humor comédia brasil', label:'Humor' },
  { q:'música brasileira popular', label:'Música' },
  { q:'esportes futebol brasil', label:'Esportes' },
  { q:'tecnologia dicas tutorial', label:'Tecnologia' },
]
const DEFAULT_REWARD = 0.02

async function fetchYouTubeVideos(){
  const lastFetch = localStorage.getItem('_yt_last_fetch')
  const now = Date.now()
  // Only fetch once per 6 hours
  if(lastFetch && now - Number(lastFetch) < 6*60*60*1000) return

  try {
    // Fetch from random category
    const cat = YT_CATEGORIES[Math.floor(Math.random()*YT_CATEGORIES.length)]
    const maxDuration = 'long' // PT30M or less handled by maxResults filter
    const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=medium&maxResults=10&order=viewCount&regionCode=BR&relevanceLanguage=pt&q='+encodeURIComponent(cat.q)+'&key='+YT_API_KEY

    const res = await fetch(url)
    const data = await res.json()

    if(!data.items || !data.items.length) return

    // Get video details (duration check)
    const ids = data.items.map(i=>i.id.videoId).join(',')
    const detailUrl = 'https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id='+ids+'&key='+YT_API_KEY
    const detailRes = await fetch(detailUrl)
    const detailData = await detailRes.json()

    const validVideos = (detailData.items||[]).filter(v=>{
      const dur = v.contentDetails?.duration || ''
      // Parse ISO 8601 duration — accept up to PT30M
      const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
      if(!match) return false
      const hours = Number(match[1]||0)
      const mins  = Number(match[2]||0)
      if(hours > 0) return false // skip videos over 1h
      if(mins > 30) return false // skip over 30min
      if(mins < 1)  return false // skip under 1min
      return true
    })

    if(!validVideos.length) return

    // Save to Firebase (replace old auto-fetched videos)
    const existingSnap = await get(ref(db,'videos'))
    const existing = existingSnap.exists() ? existingSnap.val() : {}

    // Remove old auto-fetched videos (keep manually added ones)
    const toDelete = Object.entries(existing)
      .filter(([,v])=>v.autoFetched)
      .map(([id])=>id)
    for(const id of toDelete){
      await remove(ref(db,'videos/'+id))
    }

    // Add new videos
    for(const v of validVideos.slice(0,5)){
      const newRef = push(ref(db,'videos'))
      await set(newRef,{
        title: v.snippet.title.substring(0,80),
        url: 'https://www.youtube.com/watch?v='+v.id,
        thumbnail: v.snippet.thumbnails?.medium?.url || '',
        category: cat.label,
        reward: DEFAULT_REWARD,
        createdAt: Date.now(),
        autoFetched: true
      })
    }

    localStorage.setItem('_yt_last_fetch', String(now))
    console.log('✅ YouTube: '+validVideos.slice(0,5).length+' vídeos atualizados')
  } catch(e){
    console.warn('YouTube fetch error:', e)
  }
}

// Run auto-fetch when user opens dashboard

// ═══════════════════════════════════════════════════════════
//  ADMIN — SAQUES
// ═══════════════════════════════════════════════════════════
async function loadSaquesTab(){
  // Load pending
  const snap = await get(ref(db,'withdrawals'))
  const pendingList = document.getElementById('saques-pending-list')
  const historyList = document.getElementById('saques-history-list')
  if(!pendingList) return

  if(!snap.exists()){
    pendingList.innerHTML='<div style="text-align:center;padding:30px;color:#6b7280;font-size:13px">Nenhuma solicitação</div>'
    historyList.innerHTML='<div style="text-align:center;padding:30px;color:#6b7280;font-size:13px">Nenhum histórico</div>'
    return
  }

  const all = Object.entries(snap.val()).sort(([,a],[,b])=>b.requestedAt-a.requestedAt)
  const pending = all.filter(([,w])=>w.status==='pending')
  const history = all.filter(([,w])=>w.status!=='pending')

  if(!pending.length){
    pendingList.innerHTML='<div style="text-align:center;padding:30px;color:#6b7280;font-size:13px">✅ Nenhuma pendente</div>'
  } else {
    pendingList.innerHTML = pending.map(([id,w])=>`
      <div class="saque-item">
        <div class="saque-info">
          <div class="name">${w.userName||'Usuário'}</div>
          <div class="detail">${w.userEmail} • PIX: ${w.pixKey} • ${w.videosWatched} vídeos assistidos</div>
          <div class="detail">${new Date(w.requestedAt).toLocaleDateString('pt-BR')}</div>
        </div>
        <span class="saque-amount">R$ ${Number(w.amount).toFixed(2)}</span>
        <div class="saque-actions">
          <button class="btn-approve" onclick="approveWithdrawal('${id}','${w.uid}',${w.amount})">✅ Aprovar</button>
          <button class="btn-deny" onclick="denyWithdrawal('${id}','${w.uid}',${w.amount})">❌ Negar</button>
        </div>
      </div>
    `).join('')
  }

  if(!history.length){
    historyList.innerHTML='<div style="text-align:center;padding:30px;color:#6b7280;font-size:13px">Nenhum histórico</div>'
  } else {
    historyList.innerHTML = history.map(([id,w])=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0d1117;border-radius:8px;margin-bottom:8px;font-size:12px">
        <div>
          <span style="font-weight:600;color:#fff">${w.userName}</span>
          <span style="color:#6b7280"> • R$ ${Number(w.amount).toFixed(2)} • ${w.pixKey}</span>
        </div>
        <span class="${w.status==='approved'?'badge-active':'badge-inactive'}">${w.status==='approved'?'✅ Aprovado':'❌ Negado'}</span>
      </div>
    `).join('')
  }

  // Load withdrawal toggle state
  const cfgSnap = await get(ref(db,'config/withdrawalsOpen'))
  const toggle = document.getElementById('withdrawals-toggle')
  if(toggle) toggle.checked = !cfgSnap.exists() || cfgSnap.val()===true

  // Load admin balance
  document.getElementById('stat-saques').textContent = pending.length
}

async function approveWithdrawal(id, uid, amount){
  if(!confirm('Confirmar aprovação de R$ '+Number(amount).toFixed(2)+'?\\nLembre-se de enviar o PIX antes de aprovar!')) return
  try {
    await update(ref(db,'withdrawals/'+id),{ status:'approved', processedAt: Date.now() })
    showToast('✅ Saque aprovado! Lembre-se de enviar o PIX.','success')
    loadSaquesTab()
  } catch(err){ showToast('Erro: '+err.message,'error') }
}

async function denyWithdrawal(id, uid, amount){
  if(!confirm('Negar este saque? O valor será devolvido ao usuário.')) return
  try {
    await update(ref(db,'withdrawals/'+id),{ status:'denied', processedAt: Date.now() })
    // Refund user
    const snap = await get(ref(db,'users/'+uid))
    if(snap.exists()){
      await update(ref(db,'users/'+uid),{ balance: Number(snap.val().balance||0)+Number(amount) })
    }
    showToast('Saque negado. Saldo devolvido ao usuário.','info')
    loadSaquesTab()
  } catch(err){ showToast('Erro: '+err.message,'error') }
}

async function toggleWithdrawals(checkbox){
  await set(ref(db,'config/withdrawalsOpen'), checkbox.checked)
  showToast(checkbox.checked ? '✅ Saques abertos!' : '🔒 Saques fechados!', checkbox.checked?'success':'info')
}



// ═══════════════════════════════════════════════════════════
//  REFERRAL SYSTEM
// ═══════════════════════════════════════════════════════════
function getReferralLink(){
  const base = window.location.origin + window.location.pathname
  return base + '?ref=' + (_currentUser?.uid||'').substring(0,8)
}

function copyReferralLink(){
  const link = getReferralLink()
  navigator.clipboard.writeText(link).then(()=>showToast('🔗 Link copiado!','success'))
}

function shareReferral(){
  const link = getReferralLink()
  const msg = encodeURIComponent('🎬 Assista vídeos e ganhe dinheiro real no CineCash IA!\n\nUse meu link e ganhe R$ 1,00 de bônus: '+link)
  window.open('https://wa.me/?text='+msg,'_blank')
}

async function loadReferralTab(){
  const box = document.getElementById('referral-link-box')
  if(box) box.textContent = getReferralLink()
  loadReferralStats()
}

async function loadReferralStats(){
  if(!_currentUser) return
  const snap = await get(ref(db,'referrals/'+_currentUser.uid))
  const totalEl = document.getElementById('ref-total')
  const compEl = document.getElementById('ref-completed')
  const earnEl = document.getElementById('ref-earned')
  const listEl = document.getElementById('referral-list')

  if(!snap.exists()){
    if(totalEl) totalEl.textContent='0'
    if(compEl) compEl.textContent='0'
    if(earnEl) earnEl.textContent='R$ 0,00'
    if(listEl) listEl.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);font-size:13px">Nenhuma indicação ainda</div>'
    return
  }

  const refs = Object.entries(snap.val())
  const total = refs.length
  const completed = refs.filter(([,r])=>r.status==='completed').length
  if(totalEl) totalEl.textContent = total
  if(compEl) compEl.textContent = completed
  if(earnEl) earnEl.textContent = 'R$ '+completed.toFixed(2).replace('.',',')

  if(listEl) listEl.innerHTML = refs.map(([uid,r])=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:12px">
      <div style="color:rgba(255,255,255,.7)">${r.userName||'Usuário'}</div>
      <span style="padding:3px 10px;border-radius:20px;font-size:11px;${r.status==='completed'?'background:rgba(52,211,153,.1);color:#34d399':'background:rgba(251,191,36,.1);color:#fbbf24'}">
        ${r.status==='completed'?'✅ Concluído':'⏳ Assistindo vídeos ('+( r.videosWatched||0)+'/30)'}
      </span>
    </div>
  `).join('')
}

// Check referral param on registration
function checkReferralParam(){
  const params = new URLSearchParams(window.location.search)
  return params.get('ref') || null
}

async function registerReferral(newUid, newName, referrerId){
  if(!referrerId) return
  // Find full referrer UID from short ID
  const usersSnap = await get(ref(db,'users'))
  if(!usersSnap.exists()) return
  const entries = Object.entries(usersSnap.val())
  const referrer = entries.find(([uid])=>uid.startsWith(referrerId))
  if(!referrer) return
  const [fullReferrerId] = referrer

  await set(ref(db,'users/'+newUid+'/referredBy'), fullReferrerId)
  await set(ref(db,'referrals/'+fullReferrerId+'/'+newUid),{
    userName: newName,
    status: 'pending',
    videosWatched: 0,
    joinedAt: Date.now()
  })
}


// ═══════════════════════════════════════════════════════════
//  DEVICE TRACKING — ID único por usuário/dispositivo
// ═══════════════════════════════════════════════════════════
function getDeviceId(){
  let did = localStorage.getItem('_cc_did')
  if(!did){
    did = 'DEV_'+Date.now()+'_'+Math.random().toString(36).substr(2,9)
    localStorage.setItem('_cc_did', did)
  }
  return did
}

async function registerDevice(uid){
  const did = getDeviceId()
  const now = Date.now()
  const devSnap = await get(ref(db,'devices/'+uid))
  if(devSnap.exists()){
    const devs = devSnap.val()
    const devList = Object.keys(devs)
    // If this device is already registered, just update lastSeen
    if(devs[did]){ 
      await update(ref(db,'devices/'+uid+'/'+did),{ lastSeen: now })
      return
    }
    // Block if more than 2 different devices
    if(devList.length >= 2){
      showToast('⚠️ Acesso bloqueado: muitos dispositivos detectados. Contate o suporte.','error')
      await signOut(auth)
      return
    }
  }
  await set(ref(db,'devices/'+uid+'/'+did),{ 
    registered: now, lastSeen: now,
    ua: navigator.userAgent.substring(0,100)
  })
}

// ═══════════════════════════════════════════════════════════
//  IA MONITOR — Analisa usuários suspeitos
// ═══════════════════════════════════════════════════════════
async function runAICheck(){
  const report = document.getElementById('ia-report')
  const alerts = document.getElementById('ia-alerts')
  if(!report) return
  report.innerHTML = '<div style="text-align:center;color:#a78bfa;font-size:13px;padding:40px 0">🤖 IA analisando usuários... aguarde</div>'

  const usersSnap = await get(ref(db,'users'))
  const devicesSnap = await get(ref(db,'devices'))
  const withdrawalsSnap = await get(ref(db,'withdrawals'))

  if(!usersSnap.exists()){ report.innerHTML='<div style="text-align:center;color:#6b7280;padding:40px">Nenhum usuário para analisar</div>'; return }

  const users = Object.entries(usersSnap.val()).map(([uid,u])=>({...u,uid}))
  const devices = devicesSnap.exists() ? devicesSnap.val() : {}
  const withdrawals = withdrawalsSnap.exists() ? Object.values(withdrawalsSnap.val()) : []

  let suspicious = []
  let reportHtml = []
  let alertsHtml = []

  const now = Date.now()
  const dayMs = 24*60*60*1000

  for(const u of users){
    const issues = []
    const devList = devices[u.uid] ? Object.keys(devices[u.uid]) : []

    // Check 1: Multiple devices
    if(devList.length > 2) issues.push({ type:'error', msg:`🚨 ${devList.length} dispositivos detectados` })
    else if(devList.length > 1) issues.push({ type:'warn', msg:`⚠️ ${devList.length} dispositivos` })

    // Check 2: Too many videos in short time (more than 50 in one day)
    const watched = u.videosWatched || 0
    const joinedDays = Math.max(1, Math.floor((now - u.createdAt) / dayMs))
    const vidsPerDay = watched / joinedDays
    if(vidsPerDay > 100) issues.push({ type:'error', msg:`🚨 ${vidsPerDay.toFixed(0)} vídeos/dia (suspeito)` })
    else if(vidsPerDay > 50) issues.push({ type:'warn', msg:`⚠️ ${vidsPerDay.toFixed(0)} vídeos/dia (alto)` })

    // Check 3: Large balance without withdrawals
    const bal = Number(u.balance||0)
    const userWithdrawals = withdrawals.filter(w=>w.uid===u.uid && w.status==='approved')
    if(bal > 50 && userWithdrawals.length === 0) issues.push({ type:'warn', msg:`⚠️ Saldo R$${bal.toFixed(2)} sem saques` })

    // Check 4: Check-in streak too long without videos
    const streak = u.checkInStreak || 0
    if(streak > 30 && watched < 10) issues.push({ type:'warn', msg:`⚠️ ${streak} dias streak sem assistir vídeos` })

    const status = issues.some(i=>i.type==='error') ? '🚨' : issues.length > 0 ? '⚠️' : '✅'
    const color = issues.some(i=>i.type==='error') ? '#f87171' : issues.length > 0 ? '#fbbf24' : '#34d399'

    reportHtml.push(`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1f2937;font-size:12px">
        <div>
          <div style="font-weight:600;color:#fff">${status} ${u.fullname||u.display||'Usuário'}</div>
          <div style="color:#6b7280;margin-top:2px">${u.email} • ${watched} vídeos • R$${Number(u.balance||0).toFixed(2)} • ${devList.length} dispositivo(s)</div>
          ${issues.map(i=>`<div style="color:${i.type==='error'?'#f87171':'#fbbf24'};margin-top:2px">${i.msg}</div>`).join('')}
        </div>
        <span style="color:${color};font-size:16px">${status}</span>
      </div>
    `)

    if(issues.some(i=>i.type==='error')){
      alertsHtml.push(`
        <div style="padding:12px 16px;background:#1c0000;border:1px solid #7f1d1d;border-radius:10px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:13px;font-weight:700;color:#f87171">🚨 ${u.fullname||u.display}</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px">${u.email}</div>
              ${issues.filter(i=>i.type==='error').map(i=>`<div style="font-size:12px;color:#f87171;margin-top:4px">${i.msg}</div>`).join('')}
            </div>
            <button onclick="blockUser('${u.uid}')" style="padding:7px 14px;background:#dc2626;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sora',sans-serif">Bloquear</button>
          </div>
        </div>
      `)
    }
  }

  const total = users.length
  const clean = users.filter(u=>!suspicious.includes(u.uid)).length
  report.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <div style="background:#052e16;border:1px solid #166534;border-radius:10px;padding:12px 16px;flex:1;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#34d399">${total}</div>
        <div style="font-size:11px;color:#6b7280">Total usuários</div>
      </div>
      <div style="background:#1c0000;border:1px solid #7f1d1d;border-radius:10px;padding:12px 16px;flex:1;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#f87171">${alertsHtml.length}</div>
        <div style="font-size:11px;color:#6b7280">Alertas críticos</div>
      </div>
      <div style="background:#0c1f4a;border:1px solid #1e3a8a;border-radius:10px;padding:12px 16px;flex:1;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#60a5fa">${new Date().toLocaleTimeString('pt-BR')}</div>
        <div style="font-size:11px;color:#6b7280">Última análise</div>
      </div>
    </div>
    ${reportHtml.join('')}
  `
  alerts.innerHTML = alertsHtml.length ? alertsHtml.join('') : '<div style="text-align:center;padding:20px;color:#34d399;font-size:13px">✅ Nenhum alerta crítico detectado</div>'
  showToast('🤖 Análise concluída!','success')
}

async function blockUser(uid){
  if(!confirm('Bloquear este usuário?')) return
  try{
    await update(ref(db,'users/'+uid),{ status:'inativo' })
    showToast('Usuário bloqueado!','success')
    runAICheck()
  }catch(err){ showToast('Erro: '+err.message,'error') }
}

// ═══════════════════════════════════════════════════════════
//  WHATSAPP SUPPORT
// ═══════════════════════════════════════════════════════════
async function toggleSupport(checkbox){
  await set(ref(db,'config/supportEnabled'), checkbox.checked)
  showToast(checkbox.checked?'💬 Suporte ativado!':'Suporte desativado','info')
  if(checkbox.checked) loadSupportWidget()
  else removeSupportWidget()
}

async function saveSupport(){
  const phone = document.getElementById('support-phone')?.value.trim()
  const msg   = document.getElementById('support-msg')?.value.trim()
  if(!phone) return showToast('Digite o número do WhatsApp!','error')
  await set(ref(db,'config/supportPhone'), phone)
  await set(ref(db,'config/supportMsg'), msg)
  showToast('✅ Suporte salvo!','success')
}

async function loadSupportWidget(){
  const [enabledSnap, phoneSnap, msgSnap] = await Promise.all([
    get(ref(db,'config/supportEnabled')),
    get(ref(db,'config/supportPhone')),
    get(ref(db,'config/supportMsg'))
  ])
  if(!enabledSnap.exists() || !enabledSnap.val()) return
  const phone = phoneSnap.exists() ? phoneSnap.val() : ''
  const msg   = msgSnap.exists() ? msgSnap.val() : 'Olá! Preciso de ajuda com o CineCash IA.'
  if(!phone) return
  removeSupportWidget()
  const btn = document.createElement('a')
  btn.id = 'wa-support-btn'
  btn.href = 'https://wa.me/'+phone.replace(/\D/g,'')+'?text='+encodeURIComponent(msg)
  btn.target = '_blank'
  btn.rel = 'noopener'
  btn.innerHTML = '💬'
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;text-decoration:none;z-index:9997;box-shadow:0 4px 20px rgba(37,211,102,.4);transition:.2s'
  btn.onmouseover = ()=>btn.style.transform='scale(1.1)'
  btn.onmouseout  = ()=>btn.style.transform='scale(1)'
  document.body.appendChild(btn)
}

function removeSupportWidget(){
  document.getElementById('wa-support-btn')?.remove()
}

// Load support widget for users on dashboard
async function initSupportWidget(){
  await loadSupportWidget()
  // Load support config for admin
  const [enabledSnap, phoneSnap, msgSnap] = await Promise.all([
    get(ref(db,'config/supportEnabled')),
    get(ref(db,'config/supportPhone')),
    get(ref(db,'config/supportMsg'))
  ])
  const tog = document.getElementById('support-toggle')
  const ph  = document.getElementById('support-phone')
  const ms  = document.getElementById('support-msg')
  if(tog && enabledSnap.exists()) tog.checked = enabledSnap.val()
  if(ph  && phoneSnap.exists())  ph.value  = phoneSnap.val()
  if(ms  && msgSnap.exists())    ms.value  = msgSnap.val()
}


// Load Monetag ads ONLY after login (not on login page)
function loadMonetag(){
  if(document.getElementById('_monetag_loaded')) return
  const marker = document.createElement('span')
  marker.id = '_monetag_loaded'
  document.body.appendChild(marker)
  // Multitag
  const s1 = document.createElement('script')
  s1.src = 'https://quge5.com/88/tag.min.js'
  s1.setAttribute('data-zone','226253')
  s1.async = true
  s1.setAttribute('data-cfasync','false')
  document.body.appendChild(s1)
  // Register SW for push notifications
  if('serviceWorker' in navigator){
    const swPath = location.pathname.includes('CineCash') ? '/CineCash-por-IA/sw.js' : '/sw.js'
    navigator.serviceWorker.register(swPath).catch(()=>{})
  }
}

window.showPage=showPage;window.togglePwd=togglePwd;window.doLogin=doLogin;window.doRegister=doRegister
window.doGoogleLogin=doGoogleLogin;window.doAdminLogin=doAdminLogin;window.doAdminLogout=doAdminLogout
window.switchTab=switchTab;window.openEditModal=openEditModal;window.saveEditUser=saveEditUser
window.openDeleteModal=openDeleteModal;window.confirmDelete=confirmDelete;window.closeModal=closeModal
window.addVideo=addVideo;window.deleteVideo=deleteVideo;window.doConversion=doConversion;window.renderUsersTable=renderUsersTable
window.toggleMaintenance=toggleMaintenance
window.fetchYouTubeVideos=fetchYouTubeVideos
window.showAdAfterVideo=showAdAfterVideo
window.runAICheck=runAICheck
window.blockUser=blockUser
window.toggleSupport=toggleSupport
window.saveSupport=saveSupport
window.approveWithdrawal=approveWithdrawal
window.denyWithdrawal=denyWithdrawal
window.toggleWithdrawals=toggleWithdrawals
window.startWatch=startWatch
window.cancelWatch=cancelWatch
window.doCheckIn=doCheckIn
window.doUserLogout=doUserLogout
window.requestWithdrawal=requestWithdrawal
window.showDashTab=showDashTab
window.claimReward=claimReward
window.copyReferralLink=copyReferralLink
window.shareReferral=shareReferral
window.antiFraud_checkVideoWatch=antiFraud_checkVideoWatch

// init
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}))
