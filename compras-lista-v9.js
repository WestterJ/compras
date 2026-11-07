/* Compras V9 — melhorias da tela Lista de compras.
 * Carregue este arquivo DEPOIS de compras-supabase.js no index.html.
 * Categorias recolhíveis; ação para marcar tudo; renomear item na própria tela;
 * supermercado atual e comparação com o histórico de preços.
 */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 if(!$('list')||typeof window.render!=='function'||typeof window.data==='undefined')return;
 const KEY_OPEN='compras_v9_category_open',KEY_STORE='compras_v9_current_store';
 const readOpen=()=>{try{return JSON.parse(localStorage.getItem(KEY_OPEN)||'{}')}catch{return {}}};
 const normalized=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let openState=readOpen(),currentStore=localStorage.getItem(KEY_STORE)||'';
 const data=()=>window.data;
 const getPrices=item=>(data().prices||[]).filter(p=>normalized(p.name)===normalized(item.name)||normalized(p.receiptName)===normalized(item.name)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 function priceBadge(item){
  const prices=getPrices(item);if(!prices.length)return '';
  const latest=prices[0],lowest=prices.reduce((best,p)=>Number(p.value)<Number(best.value)?p:best,prices[0]);
  const storePrices=currentStore?prices.filter(p=>normalized(p.store)===normalized(currentStore)):[];
  let msg=`Última compra: ${latest.store||'supermercado não informado'} · ${Number(latest.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`;
  if(currentStore){
   if(!storePrices.length)msg+=` · Sem preço registrado em ${currentStore}`;
   else {
    const currentLatest=storePrices[0],currentLow=storePrices.reduce((best,p)=>Number(p.value)<Number(best.value)?p:best,storePrices[0]);
    const isBest=Number(currentLow.value)<=Number(lowest.value)+0.005;
    msg+=` · ${currentStore}: último ${Number(currentLatest.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`;
    msg+=isBest?' · menor preço registrado':' · menor histórico: '+Number(lowest.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' ('+(lowest.store||'loja não informada')+')';
   }
  } else msg+=` · menor: ${Number(lowest.value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} (${lowest.store||'loja não informada'})`;
  return msg;
 }
 function addToolbar(){
  const panel=$('panel-list');if(!panel)return;
  let bar=$('comprasV9Toolbar');
  if(!bar){bar=document.createElement('div');bar.id='comprasV9Toolbar';bar.className='row';bar.style.cssText='justify-content:space-between;flex-wrap:wrap;margin:10px 0';
   const progress=$('progress');if(progress?.parentElement)progress.parentElement.insertAdjacentElement('afterend',bar);else panel.insertBefore(bar,$('list'));
  }
  bar.replaceChildren();
  const mark=document.createElement('button');mark.type='button';mark.className='small primary';mark.textContent='Marcar todos os itens';mark.title='Marcar como comprados todos os itens ainda desmarcados';
  mark.onclick=()=>{const pending=data().items.filter(i=>!i.checked);if(!pending.length){window.toast?.('Todos os itens já estão marcados.');return}pending.forEach(i=>i.checked=true);window.logActivity?.('Marcou todos os itens',pending.length+' produtos');window.save();window.toast?.(pending.length+' item(ns) marcados como comprados')};
  const storeWrap=document.createElement('label');storeWrap.style.cssText='display:flex;align-items:center;gap:7px;margin:0;flex:1;min-width:220px';storeWrap.textContent='Supermercado atual';
  const store=document.createElement('input');store.type='text';store.value=currentStore;store.placeholder='Ex.: Supermercado Central';store.setAttribute('aria-label','Supermercado onde estou');store.style.cssText='max-width:300px;flex:1';
  store.onchange=()=>{currentStore=store.value.trim();localStorage.setItem(KEY_STORE,currentStore);decorateList()};store.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();store.blur()}};
  storeWrap.append(store);bar.append(mark,storeWrap);
 }
 function decorateList(){
  const root=$('list');if(!root)return;
  root.querySelectorAll('.category').forEach((section,index)=>{
   const heading=section.querySelector('h3');if(!heading)return;
   const name=heading.textContent.trim(),items=[...section.querySelectorAll('.item')].filter(row=>row.querySelector('[data-check]'));
   const key=name+'#'+index,hasPending=items.some(row=>!row.querySelector('[data-check]').checked);
   if(!(key in openState))openState[key]=hasPending;
   let body=section.querySelector(':scope > .category-content');
   if(!body){body=document.createElement('div');body.className='category-content';[...section.children].filter(child=>child!==heading).forEach(child=>body.append(child));section.append(body)}
   let toggle=section.querySelector(':scope > .category-toggle');
   if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='category-toggle';toggle.style.cssText='display:flex;width:100%;align-items:center;justify-content:space-between;text-align:left;background:transparent;border:0;padding:8px 2px;color:inherit;font-weight:750';heading.replaceWith(toggle)}
   toggle.innerHTML=`<span>${esc(name)} <small class="note">${items.length} item(ns) · ${items.filter(row=>!row.querySelector('[data-check]').checked).length} pendente(s)</small></span><span aria-hidden="true">${openState[key]?'▾':'▸'}</span>`;
   toggle.setAttribute('aria-expanded',String(!!openState[key]));body.hidden=!openState[key];toggle.onclick=()=>{openState[key]=!openState[key];localStorage.setItem(KEY_OPEN,JSON.stringify(openState));body.hidden=!openState[key];toggle.setAttribute('aria-expanded',String(!!openState[key]));toggle.lastElementChild.textContent=openState[key]?'▾':'▸'};
   items.forEach(row=>{
    const nameNode=row.querySelector('.name');if(nameNode){let badge=nameNode.querySelector('[data-v9-store]');if(!badge){badge=document.createElement('small');badge.dataset.v9Store='1';nameNode.append(badge)}badge.textContent=priceBadge(data().items.find(i=>String(i.id)===String(row.querySelector('[data-check]')?.dataset.check))||{name:''})}
    const actions=row.querySelector('.item-actions');if(actions&&!actions.querySelector('[data-v9-edit]')){const edit=document.createElement('button');edit.type='button';edit.className='small ghost';edit.dataset.v9Edit='1';edit.textContent='✎';edit.title='Editar nome do item';edit.setAttribute('aria-label','Editar nome do item');edit.onclick=async()=>{
      const checkbox=row.querySelector('[data-check]'),item=data().items.find(i=>String(i.id)===String(checkbox?.dataset.check));if(!item)return;
      const next=prompt('Editar nome do item:',item.name);if(next===null)return;const newName=next.trim();if(!newName)return window.toast?.('O nome não pode ficar vazio.');
      const oldName=item.name;item.name=newName;
      try{
       const client=window.supabase?.createClient?.('https://ytsabhbkywymtevkeokg.supabase.co','sb_publishable_cyIolmmdF5zKN0rAOJQOXg_ECcSq7z6');
       if(client&&/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(item.id))){const {error}=await client.from('shopping_items').update({name:newName,updated_at:new Date().toISOString()}).eq('id',item.id);if(error)throw error}
       window.logActivity?.('Editou item',oldName+' → '+newName);window.save();window.toast?.('Item atualizado');
      }catch(error){item.name=oldName;window.toast?.('Não foi possível sincronizar a edição: '+(error.message||error))}
    };actions.insertBefore(edit,actions.firstChild)}
   });
  });
  localStorage.setItem(KEY_OPEN,JSON.stringify(openState));
 }
 const original=window.render;
 window.render=function(...args){const result=original.apply(this,args);addToolbar();decorateList();return result};
 addToolbar();decorateList();
})();
