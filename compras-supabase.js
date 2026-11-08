/* Minha Lista de Compras V14 — Supabase (projeto "Bases"): login, sincronização, família e IA de notas.
   Sem login o app segue em modo local (localStorage). A chave abaixo é a publishable (pública); nunca use a service_role. */
(()=>{
const SB_URL='https://ytsabhbkywymtevkeokg.supabase.co',SB_KEY='sb_publishable_cyIolmmdF5zKN0rAOJQOXg_ECcSq7z6';
const $=id=>document.getElementById(id);
const sb=window.supabase?.createClient(SB_URL,SB_KEY);
let me=null,listId=null,role=null,cats={},snap=null,lists=[],members=[],busy=Promise.resolve(),timer=null,dirty=false,aiOk=false,notas=[];
const AL=()=>data.aliases||(data.aliases=[]);
const isUUID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s||'');
const persist=()=>localStorage.setItem('compras_v2',JSON.stringify(data));
const setSync=(t,pill)=>{$('syncStatus').textContent=t;$('headerSync').lastElementChild.textContent=pill||t};
const auth=m=>{$('authStatus').textContent=m||''};
window.uid=()=>crypto.randomUUID();
if(!sb){auth('Biblioteca Supabase não carregou; o app segue em modo local.');return}

/* ---------- sincronização ---------- */
const emptySnap=()=>({items:new Map(),pur:{}});
async function ensureCats(){
  const {data:c,error}=await sb.from('shopping_categories').upsert(categories.map((name,i)=>({list_id:listId,name,sort_order:i})),{onConflict:'list_id,name'}).select('id,name');
  if(error)throw error;cats=Object.fromEntries(c.map(x=>[x.name,x.id]));
}
async function productIds(names){
  const u=[...new Set(names)];
  const {data:p,error}=await sb.from('shopping_products').upsert(u.map(name=>({list_id:listId,name})),{onConflict:'list_id,name'}).select('id,name');
  if(error)throw error;return Object.fromEntries(p.map(x=>[x.name,x.id]));
}
async function pull(wanted){
  const {data:ls,error}=await sb.from('shopping_lists').select('id,name').order('created_at');
  if(error)throw error;lists=ls;
  if(!lists.length){
    const {data:id,error:e2}=await sb.rpc('shopping_create_list',{p_name:data.profile.listName||'Compras da família'});
    if(e2)throw e2;listId=id;lists=[{id,name:data.profile.listName||'Compras da família'}];role='owner';
    await ensureCats();snap=emptySnap();await doPush();await loadMembers();return;
  }
  listId=(wanted&&lists.find(l=>l.id===wanted)?.id)||lists.find(l=>l.id===localStorage.compras_list)?.id||lists[0].id;
  localStorage.compras_list=listId;
  if(!localStorage.compras_backup_pre_cloud)localStorage.compras_backup_pre_cloud=JSON.stringify(data);
  const {data:cr,error:ce}=await sb.from('shopping_categories').select('id,name').eq('list_id',listId).order('sort_order');
  if(ce)throw ce;
  if(!cr.length)await ensureCats();else{cats=Object.fromEntries(cr.map(x=>[x.name,x.id]));data.categories=cr.map(x=>x.name);categories=data.categories}
  const cn=Object.fromEntries(Object.entries(cats).map(([n,i])=>[i,n]));
  const [it,pu,ac,pr,al,st]=await Promise.all([
    sb.from('shopping_items').select('id,name,is_checked,category_id,product_id').eq('list_id',listId).order('created_at'),
    sb.from('shopping_purchases').select('id,store_name,purchased_at,total_amount,shopping_purchase_items(id,product_id,unit_price,total_price,quantity,unit,product_name)').eq('list_id',listId).order('purchased_at',{ascending:false}).limit(500),
    sb.from('shopping_activity').select('action,details,created_at').eq('list_id',listId).order('created_at',{ascending:false}).limit(100),
    sb.from('shopping_products').select('id,name,cycle_days').eq('list_id',listId),
    sb.from('shopping_product_aliases').select('alias,alias_norm,store_norm,store_name,product_id').eq('list_id',listId),
    sb.from('shopping_stores').select('alias,alias_norm,name,sigla').eq('list_id',listId)]);
  for(const r of [it,pu,ac,pr,al,st])if(r.error)throw r.error;
  const pn=Object.fromEntries(pr.data.map(x=>[x.id,x.name])),pc=Object.fromEntries(pr.data.map(x=>[x.id,x.cycle_days||0]));
  data.stores=st.data.map(s=>({alias:s.alias,norm:s.alias_norm,name:s.name,sigla:s.sigla||'',sent:1}));
  await loadMembers();
  const ld=d=>{const x=new Date(d);return new Date(x-x.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
  data.items=it.data.map(r=>({id:r.id,name:r.name,cat:cn[r.category_id]||'Outros',checked:r.is_checked,pid:r.product_id,cycle:pc[r.product_id]||0}));
  data.aliases=al.data.map(a=>({text:a.alias,norm:a.alias_norm,store:a.store_norm||'',storeName:a.store_name||'',name:pn[a.product_id]||'',sent:1})).filter(a=>a.name);
  data.prices=pu.data.flatMap(p=>p.shopping_purchase_items.map(i=>({name:pn[i.product_id]||i.product_name,receiptName:i.product_name,pid:i.id,tot:Number(i.total_price),value:Number(i.unit_price??i.total_price),qty:Number(i.quantity)||1,unit:i.unit,date:ld(p.purchased_at),store:p.store_name||'',grp:p.id,sent:1})));
  data.activity=ac.data.map(a=>({action:a.action,item:a.details?.item||'',actor:a.details?.actor||'Alguém',at:a.created_at,sent:1}));
  data.profile.listName=lists.find(l=>l.id===listId).name;
  snap={items:new Map(data.items.map(i=>[i.id,{checked:!!i.checked,name:i.name,cat:i.cat,cycle:i.cycle||0}])),pur:Object.fromEntries(pu.data.map(p=>[p.id,{id:p.id,total:Number(p.total_amount)||0}]))};
  persist();render();
}
async function loadMembers(){
  const {data:m}=await sb.from('shopping_members').select('id,user_id,invited_email,role').eq('list_id',listId);
  members=m||[];role=members.find(x=>x.user_id===me.id)?.role||'viewer';
}
async function doPush(){
  if(!listId||role==='viewer')return;
  const now=new Date().toISOString(),cur=new Map(data.items.map(i=>[i.id,i]));
  const ops=data.catOps||[];
  for(const op of ops){
    if(op.op==='rename'){const {error}=await sb.from('shopping_categories').update({name:op.to}).eq('list_id',listId).eq('name',op.from);if(error)throw error;cats[op.to]=cats[op.from];delete cats[op.from];snap.items.forEach(o=>{if(o.cat===op.from)o.cat=op.to})}
    else await ensureCats();
  }
  data.catOps=[];
  const gone=[...snap.items.keys()].filter(id=>!cur.has(id));
  if(gone.length){const {error}=await sb.from('shopping_items').delete().in('id',gone);if(error)throw error;gone.forEach(id=>snap.items.delete(id))}
  const nw=data.items.filter(i=>!snap.items.has(i.id));
  if(nw.length){
    nw.forEach(i=>{if(!isUUID(i.id))i.id=uid()});
    const {data:pr,error}=await sb.from('shopping_products').upsert(nw.map(i=>({list_id:listId,name:i.name,category_id:cats[i.cat]||null})),{onConflict:'list_id,name'}).select('id,name');
    if(error)throw error;const pm=Object.fromEntries(pr.map(p=>[p.name,p.id]));
    const {error:e2}=await sb.from('shopping_items').insert(nw.map(i=>({id:i.id,list_id:listId,product_id:pm[i.name],category_id:cats[i.cat]||null,name:i.name,is_checked:!!i.checked,added_by:me.id,checked_by:i.checked?me.id:null,checked_at:i.checked?now:null})));
    if(e2)throw e2;nw.forEach(i=>{i.pid=pm[i.name];snap.items.set(i.id,{checked:!!i.checked,name:i.name,cat:i.cat})});
  }
  for(const i of data.items.filter(i=>{const o=snap.items.get(i.id);return o&&(o.name!==i.name||o.cat!==i.cat||(o.cycle||0)!==(i.cycle||0))})){
    let pid=i.pid;
    if(pid){const {error}=await sb.from('shopping_products').update({name:i.name,category_id:cats[i.cat]||null,cycle_days:i.cycle||null}).eq('id',pid);if(error){if(error.code==='23505')pid=null;else throw error}}
    if(!pid){const pm=await productIds([i.name]);pid=i.pid=pm[i.name]}
    const {error}=await sb.from('shopping_items').update({name:i.name,category_id:cats[i.cat]||null,product_id:pid,updated_at:now}).eq('id',i.id);
    if(error)throw error;Object.assign(snap.items.get(i.id),{name:i.name,cat:i.cat,cycle:i.cycle||0});
  }
  const on=[],off=[];
  data.items.forEach(i=>{const s=snap.items.get(i.id);if(s&&s.checked!==!!i.checked)(i.checked?on:off).push(i.id)});
  if(on.length){const {error}=await sb.from('shopping_items').update({is_checked:true,checked_by:me.id,checked_at:now,updated_at:now}).in('id',on);if(error)throw error}
  if(off.length){const {error}=await sb.from('shopping_items').update({is_checked:false,checked_by:null,checked_at:null,updated_at:now}).in('id',off);if(error)throw error}
  [...on,...off].forEach(id=>snap.items.get(id).checked=on.includes(id));
  const np=data.prices.filter(p=>!p.sent),groups={};
  np.forEach(p=>{const g=p.grp||(p.grp=p.date+'|'+norm(p.store));(groups[g]=groups[g]||[]).push(p)});
  for(const [g,arr] of Object.entries(groups)){
    let pu=snap.pur[g];
    if(!pu){
      const {data:r,error}=await sb.from('shopping_purchases').insert({list_id:listId,store_name:arr[0].store||null,purchased_at:new Date(arr[0].date+'T12:00:00').toISOString(),total_amount:0,receipt_source:arr[0].ocr?'ocr':'manual',created_by:me.id}).select('id').single();
      if(error)throw error;pu=snap.pur[g]={id:r.id,total:0};
    }
    const pm=await productIds(arr.map(p=>p.name));
    const rows=arr.map(p=>({purchase_id:pu.id,product_id:pm[p.name]||null,product_name:p.receiptName||p.name,quantity:p.qty||1,unit:p.unit||'un',unit_price:p.value,total_price:+(p.value*(p.qty||1)).toFixed(2)}));
    const {data:ins,error}=await sb.from('shopping_purchase_items').insert(rows).select('id');if(error)throw error;ins.forEach((r,k)=>arr[k].pid=r.id);
    pu.total=+(pu.total+rows.reduce((s,r)=>s+r.total_price,0)).toFixed(2);
    const {error:e3}=await sb.from('shopping_purchases').update({total_amount:pu.total}).eq('id',pu.id);if(e3)throw e3;
    arr.forEach(p=>p.sent=1);
  }
  const pidOf=g=>snap.pur[g]?.id||(isUUID(g)?g:null),touched=new Set(),gl=data.prices.filter(p=>p.sent&&p.pid&&(p.del||p.edit)),dels=gl.filter(p=>p.del).map(p=>p.pid);
  if(dels.length){const {error}=await sb.from('shopping_purchase_items').delete().in('id',dels);if(error)throw error}
  for(const p of gl.filter(p=>p.edit&&!p.del)){const {error}=await sb.from('shopping_purchase_items').update({quantity:p.qty||1,unit_price:p.value,total_price:+(p.value*(p.qty||1)).toFixed(2)}).eq('id',p.pid);if(error)throw error;p.tot=null;p.edit=0}
  gl.forEach(p=>touched.add(p.grp));data.prices.filter(p=>p.sent&&p.meta).forEach(p=>touched.add(p.grp));
  data.prices=data.prices.filter(p=>!p.del);
  for(const g of touched){
    const id=pidOf(g);if(!id)continue;const ls=data.prices.filter(p=>p.grp===g);
    if(!ls.length){const {error}=await sb.from('shopping_purchases').delete().eq('id',id);if(error)throw error;delete snap.pur[g];continue}
    const m=ls.find(p=>p.meta)||ls[0],tot=+ls.reduce((s,p)=>s+(p.tot!=null?p.tot:p.value*(p.qty||1)),0).toFixed(2);
    const {error}=await sb.from('shopping_purchases').update({store_name:m.store||null,purchased_at:new Date(m.date+'T12:00:00').toISOString(),total_amount:tot}).eq('id',id);if(error)throw error;
    ls.forEach(p=>p.meta=0);if(snap.pur[g])snap.pur[g].total=tot;
  }
  for(const p of data.prices.filter(x=>x.sent&&x.dirty&&x.pid)){
    const pm=await productIds([p.name]);
    const {error}=await sb.from('shopping_purchase_items').update({product_id:pm[p.name]}).eq('id',p.pid);if(error)throw error;p.dirty=0;
  }
  for(const o of data.storeOps||[]){const {error}=await sb.from('shopping_product_aliases').update({store_norm:o.to,store_name:o.name}).eq('list_id',listId).eq('store_norm',o.from);if(error)throw error}
  data.storeOps=[];
  const ua=AL().filter(a=>!a.sent);
  if(ua.length){
    const pm=await productIds(ua.map(a=>a.name));
    const {error}=await sb.from('shopping_product_aliases').upsert(ua.map(a=>({list_id:listId,product_id:pm[a.name],alias:a.text,alias_norm:a.norm,store_norm:a.store||'',store_name:a.storeName||null,created_by:me.id})),{onConflict:'list_id,store_norm,alias_norm'});
    if(error)throw error;ua.forEach(a=>a.sent=1);
  }
  const dl=AL().filter(a=>a.del);
  if(dl.length){for(const a of dl){const {error}=await sb.from('shopping_product_aliases').delete().eq('list_id',listId).eq('store_norm',a.store||'').eq('alias_norm',a.norm);if(error)throw error}data.aliases=AL().filter(a=>!a.del)}
  const us=(data.stores||[]).filter(s=>!s.sent);
  if(us.length){const {error}=await sb.from('shopping_stores').upsert(us.map(s=>({list_id:listId,alias:s.alias,alias_norm:s.norm,name:s.name,sigla:s.sigla||null})),{onConflict:'list_id,alias_norm'});if(error)throw error;us.forEach(s=>s.sent=1)}
  const na=data.activity.filter(a=>!a.sent);
  if(na.length){const {error}=await sb.from('shopping_activity').insert([...na].reverse().map(a=>({list_id:listId,actor_id:me.id,action:a.action,details:{item:a.item,actor:a.actor}})));if(error)throw error;na.forEach(a=>a.sent=1)}
  dirty=false;persist();setSync('Sincronizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),'Nuvem');
}
const push=()=>(busy=busy.then(doPush).catch(e=>{setSync('Erro ao sincronizar: '+(e.message||e),'Erro');toast('Não sincronizou: '+(e.message||e))}));
const origSave=window.save;
window.save=function(){
  origSave();if(!listId)return;
  if(role==='viewer'){toast('Acesso somente leitura: alteração não enviada');busy=busy.then(()=>pull(listId));return}
  dirty=true;setSync('Sincronizando…','Sincronizando');clearTimeout(timer);timer=setTimeout(push,600);
};
const oi=$('importData').onchange;
$('importData').onchange=e=>{if(listId&&!confirm('Importar o backup substitui a lista da nuvem. Continuar?')){e.target.value='';return}oi(e)};
const refresh=()=>{if(listId&&!dirty)busy=busy.then(()=>pull(listId)).then(()=>renderFamily()).catch(e=>setSync('Erro: '+e.message,'Erro'))};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
$('syncNow').onclick=()=>{refresh();toast('Sincronizando…')};

/* ---------- família ---------- */
function renderFamily(){
  if(!listId)return;
  $('listSelect').innerHTML=lists.map(l=>`<option value="${l.id}" ${l.id===listId?'selected':''}>${esc(l.name)}</option>`).join('');
  const rl={owner:'dono',editor:'pode editar',viewer:'só leitura'};
  $('familyBox').innerHTML='<label>Participantes</label>'+members.map(x=>`<div class="item"><div class="name">${esc(x.invited_email||(x.user_id===me.id?'Você':'Dono da lista'))}<small>${rl[x.role]}${x.user_id?'':' · convite pendente'}</small></div>${role==='owner'&&x.role!=='owner'?`<button class="small ghost" data-rm="${x.id}" title="Remover">×</button>`:''}</div>`).join('')+(role==='owner'?'<div class="row" style="margin-top:8px"><input id="invEmail" type="email" placeholder="E-mail de quem vai participar"><button class="small" id="invBtn">Convidar</button></div><p class="note">A pessoa entra com esse mesmo e-mail e o acesso é liberado automaticamente.</p>':'');
  document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Remover este participante?'))return;
    const {error}=await sb.from('shopping_members').delete().eq('id',b.dataset.rm);
    if(error)return toast(error.message);await loadMembers();renderFamily();
  });
  $('invBtn')?.addEventListener('click',async()=>{
    const email=$('invEmail').value.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))return toast('E-mail inválido');
    const {error}=await sb.from('shopping_members').insert({list_id:listId,invited_email:email,role:'editor',invited_by:me.id});
    if(error)return toast(error.code==='23505'?'Essa pessoa já foi convidada':error.message);
    toast('Convite criado');await loadMembers();renderFamily();
  });
}
$('listSelect').onchange=e=>{busy=busy.then(()=>pull(e.target.value)).then(renderFamily)};

/* ---------- login ---------- */
async function afterLogin(user){
  me=user;$('authForm').hidden=true;$('authLogged').hidden=false;$('authWho').textContent=user.email;setSync('Conectando…','Conectando');
  try{
    const {data:pend}=await sb.from('shopping_members').select('id,invited_email').is('user_id',null);
    for(const p of (pend||[]).filter(x=>(x.invited_email||'').toLowerCase()===user.email.toLowerCase())){
      const {error}=await sb.rpc('shopping_accept_invite',{p_member_id:p.id});if(!error)toast('Convite aceito: você entrou em uma lista');
    }
    await pull();renderFamily();
    const {data:a}=await sb.rpc('study_my_access');aiOk=!!(a&&a[0]&&a[0].r_ai);
    $('aiBox').hidden=!aiOk;$('aiDenied').hidden=aiOk;
    const nm=user.user_metadata?.nome;if(nm&&!data.profile.actor){data.profile.actor=nm;persist();render()}
    setSync('Sincronizado','Nuvem');auth('');
  }catch(e){setSync('Erro: '+(e.message||e),'Erro');auth('Erro ao carregar a lista: '+(e.message||e))}
}
function afterLogout(){
  me=listId=role=snap=null;aiOk=false;dirty=false;$('authForm').hidden=false;$('authLogged').hidden=true;
  $('aiBox').hidden=true;$('aiDenied').hidden=false;setSync('Modo local: os dados ficam só neste aparelho.','Modo local');
}
const cred=()=>({email:$('authEmail').value.trim(),password:$('authPass').value});
$('btnLogin').onclick=async()=>{const {error}=await sb.auth.signInWithPassword(cred());auth(error?'Falha no login: '+error.message:'')};
$('btnSignup').onclick=async()=>{
  const {data:d,error}=await sb.auth.signUp({...cred(),options:{emailRedirectTo:location.origin+location.pathname}});
  auth(error?'Falha no cadastro: '+error.message:d.session?'':'Conta criada. Confirme o e-mail enviado para concluir o acesso.');
};
$('googleLogin').onclick=async()=>{const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)auth('Falha no login Google: '+error.message)};
$('googleLogout').onclick=()=>sb.auth.signOut();
window.cloudOn=()=>!!listId;
window.saveActorName=n=>{if(me)sb.auth.updateUser({data:{nome:n}})};
sb.auth.onAuthStateChange((ev,s)=>setTimeout(()=>{
  if(s?.user&&me?.id!==s.user.id)afterLogin(s.user);
  else if(!s&&me)afterLogout();
},0));

/* ---------- IA: notas fiscais (modo "nota" da edge function dynamic-service) ---------- */
const shrink=f=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.82).split(',')[1])};im.onerror=()=>no(new Error('Imagem inválida: use JPG ou PNG (HEIC do iPhone pode falhar)'));im.src=URL.createObjectURL(f)});
const SCHEMA={type:'OBJECT',properties:{loja:{type:'STRING'},data:{type:'STRING'},itens:{type:'ARRAY',items:{type:'OBJECT',properties:{nome:{type:'STRING'},quantidade:{type:'NUMBER'},unidade:{type:'STRING'},preco_unitario:{type:'NUMBER'},total:{type:'NUMBER'}},required:['nome','preco_unitario']}}},required:['itens']};
const SYSTEM='Você extrai dados de fotos de notas fiscais e cupons de supermercado do Brasil. Liste apenas itens legíveis, com nome de produto claro (sem códigos), quantidade, unidade (un, kg, g, L, ml), preço unitário e total em reais como número. A data vai no formato AAAA-MM-DD e a loja é o nome do mercado. Se algo não estiver legível, omita; nunca invente itens.';
let ctl=null;
const friendly=e=>/quota|429|rate/i.test(e)?'A cota da IA (Gemini) está esgotada ou limitada; confira o plano no Google AI Studio.':/Unterminated|Expected|JSON|formato/i.test(e)?'A IA devolveu uma resposta incompleta ou inválida.':e;
function parseLoose(t){
  t=t.replace(/```json|```/g,'').trim();const a=t.indexOf('{');if(a<0)throw new Error('formato inválido');t=t.slice(a);
  const fix=x=>x.replace(/,\s*([}\]])/g,'$1'),cut=t.lastIndexOf('}'),tries=[t,fix(t)];
  if(cut>0)tries.push(fix(t.slice(0,cut+1))+']}',t.slice(0,cut+1)+']}');
  for(const x of tries){try{return JSON.parse(x)}catch{}}
  throw new Error('formato inválido (resposta cortada)');
}
$('receiptPhotos').addEventListener('change',e=>{
  const files=[...e.target.files].filter(f=>f.type.startsWith('image/')),box=$('receiptPhotoPreview');box.innerHTML='';
  files.forEach(f=>{const im=document.createElement('img');im.className='receipt-preview';im.alt='Prévia da nota';im.src=URL.createObjectURL(f);box.append(im)});
  $('analyzeReceiptPhotos').disabled=!files.length||!aiOk;
  $('receiptAiStatus').textContent=files.length?files.length+' foto(s) selecionada(s). A imagem é enviada só para a análise e não é guardada.':'';
});
$('cancelReceiptAI').onclick=()=>ctl?.abort();
$('analyzeReceiptPhotos').onclick=async()=>{
  if(!aiOk)return;const files=[...$('receiptPhotos').files].filter(f=>f.type.startsWith('image/')),st=$('receiptAiStatus');
  $('analyzeReceiptPhotos').disabled=true;$('cancelReceiptAI').hidden=false;notas=[];
  for(const [n,f] of files.entries()){
    const t0=Date.now(),tick=setInterval(()=>st.textContent=`Analisando foto ${n+1} de ${files.length}… ${Math.round((Date.now()-t0)/1000)} s`,500);
    ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),130000);let ok=true,err=null,j={};
    try{
      const {data:{session}}=await sb.auth.getSession();
      const r=await fetch(SB_URL+'/functions/v1/dynamic-service',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json',apikey:SB_KEY,Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({modo:'nota',systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:'Extraia os dados desta nota fiscal.'},{inlineData:{mimeType:'image/jpeg',data:await shrink(f)}}]}],generationConfig:{responseSchema:SCHEMA}})});
      j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'HTTP '+r.status);
      const txt=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').replace(/```json|```/g,'');
      const o=parseLoose(txt);notas.push({loja:o.loja||'',data:/^\d{4}-\d{2}-\d{2}$/.test(o.data)?o.data:ymd(),itens:(o.itens||[]).filter(i=>i.nome&&Number(i.preco_unitario)>0)});
    }catch(e){ok=false;err=e.name==='AbortError'?'Cancelado ou passou de 130 s':e.message;console.error('[IA nota]',e);st.textContent='Foto '+(n+1)+': '+friendly(err)+' Você pode tentar de novo.'}
    finally{clearInterval(tick);clearTimeout(to)}
    const u=j.usageMetadata||{};
    sb.rpc('study_log_ai',{p_modo:'compras_nota',p_model:j.modelVersion||'',p_prompt:u.promptTokenCount||0,p_output:u.candidatesTokenCount||0,p_total:u.totalTokenCount||0,p_estimated:!u.totalTokenCount,p_ok:ok,p_error:err,p_ms:Date.now()-t0}).then(()=>{});
    if(!ok&&err.startsWith('Cancelado'))break;
  }
  $('cancelReceiptAI').hidden=true;$('analyzeReceiptPhotos').disabled=false;
  if(notas.length){st.textContent='Revise os dados abaixo antes de salvar no histórico.';renderNotas()}
};
const tk=s=>[...new Set(norm(s).split(/[^a-z0-9]+/).filter(w=>w.length>2))];
const tc=s=>s.toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
function match(name,store){
  const an=aliasNorm(name),sk=storeKey(store),all=AL().filter(x=>x.norm===an&&!x.del),it=x=>x&&data.items.find(i=>i.name===x.name);
  const same=all.find(x=>x.store===sk),other=all.find(x=>x.store!==sk);
  if(it(same))return{c:[{i:it(same),s:1}],st:'ok',alias:true};
  if(it(other))return{c:[{i:it(other),s:.9}],st:'doubt',other:true};
  const a=tk(name),en=norm(name);
  const c=data.items.map(i=>{if(norm(i.name)===en)return{i,s:1};const b=tk(i.name);if(!a.length||!b.length)return{i,s:0};
    return{i,s:a.filter(x=>b.some(y=>x.startsWith(y)||y.startsWith(x))).length/Math.sqrt(a.length*b.length)}}).filter(x=>x.s>=.34).sort((x,y)=>y.s-x.s).slice(0,4);
  return{c,st:!c.length||c[0].s<.5?'new':c[0].s>=.85?'ok':'doubt'};
}
function renderNotas(){
  $('receiptExtracted').innerHTML=notas.map((n,k)=>{n.itens.forEach(i=>i.m=match(i.nome,n.loja));
    return `<div class="panel" style="box-shadow:none;margin:10px 0 0"><div class="formgrid"><div><label>Supermercado</label><input data-n="${k}" data-f="loja" value="${esc(displayStore(n.loja))}" style="width:100%"></div><div><label>Data</label><input type="date" data-n="${k}" data-f="data" value="${n.data}" style="width:100%"></div></div>
    <div style="overflow-x:auto"><table><tr><th></th><th>Na nota</th><th>Associar a</th><th>Qtd</th><th>Preço un.</th></tr>${n.itens.map((i,m)=>`<tr><td><input type="checkbox" checked data-n="${k}" data-i="${m}" data-f="on"></td><td>${esc(i.nome)}${i.m.st==='doubt'?' <b class="bad">⚠</b>':''}${i.m.alias?' <small title="Conversão já aprendida neste mercado">✓</small>':''}${i.m.other?' <small title="Associação vista em outro mercado">outro mercado</small>':''}</td><td><select data-n="${k}" data-i="${m}" data-f="assoc" style="max-width:190px">${i.m.st==='doubt'?'<option value="?">Confirme o item…</option>':''}${i.m.c.map((x,q)=>`<option value="${x.i.id}" ${i.m.st==='ok'&&q===0?'selected':''}>${esc(x.i.name)}</option>`).join('')}<option value="new" ${i.m.st==='new'?'selected':''}>➕ Novo: ${esc(tc(i.nome))}</option></select></td><td><input type="number" step="any" data-n="${k}" data-i="${m}" data-f="quantidade" value="${i.quantidade||1}" style="width:60px"></td><td><input type="number" step=".01" data-n="${k}" data-i="${m}" data-f="preco_unitario" value="${i.preco_unitario}" style="width:80px"></td></tr>`).join('')}</table></div></div>`}).join('')+'<p class="note">⚠ = dúvida: escolha o item certo ou crie um novo antes de salvar. Depois, dá para revisar no histórico.</p><button class="primary" id="saveNotas" style="width:100%;margin-top:6px">Salvar notas no histórico</button>';
  $('saveNotas').onclick=saveNotas;
}
function saveNotas(){
  const val=(k,f,m)=>document.querySelector(`[data-n="${k}"][data-f="${f}"]${m===undefined?'':`[data-i="${m}"]`}`);
  if(notas.some((n,k)=>n.itens.some((_,m)=>val(k,'on',m).checked&&val(k,'assoc',m).value==='?')))return toast('Confirme os itens marcados com ⚠ antes de salvar');
  let total=0;
  notas.forEach((n,k)=>{
    const loja=val(k,'loja').value.trim();if(n.loja&&loja&&aliasNorm(n.loja)!==aliasNorm(loja))setStore(n.loja,loja);
    const dt=val(k,'data').value||ymd(),grp='ocr-'+uid();let c=0;
    n.itens.forEach((it,m)=>{
      if(!val(k,'on',m).checked)return;
      const v=Number(val(k,'preco_unitario',m).value),q=Number(val(k,'quantidade',m).value)||1,as=val(k,'assoc',m).value;
      if(!(v>0))return;
      let item=as==='new'?null:data.items.find(i=>String(i.id)===as);
      if(!item)data.items.push(item={id:uid(),name:tc(it.nome),cat:'Outros',checked:true});
      item.checked=true;
      putAlias(it.nome,item.name,loja);
      data.prices.push({name:item.name,receiptName:it.nome,value:v,qty:q,date:dt,store:loja,ocr:true,grp});c++;
    });
    if(c){logActivity('Importou nota fiscal',(loja||'Nota')+' · '+c+' itens');total+=c}
  });
  save();notas=[];$('receiptExtracted').innerHTML='';$('receiptPhotos').value='';$('receiptPhotoPreview').innerHTML='';$('receiptAiStatus').textContent='';
  toast(total+' item(ns) salvos no histórico');
}
afterLogout();
})();
