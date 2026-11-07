/* Compras V10 — recursos da tela Lista de compras. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 // `data` é um let global lexical do script clássico index.html, não window.data.
 if(!$('list')||typeof window.render!=='function'||typeof data==='undefined'){
  console.error('[Compras V10] Inicialização não encontrou lista, render ou dados globais.');
  return;
 }
 const OPEN_KEY='compras_v10_open',STORE_KEY='compras_v10_store',FILTER_KEY='compras_v10_store_filter';
 const clean=s=>(s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const savedOpen=()=>{try{return JSON.parse(localStorage.getItem(OPEN_KEY)||'{}')}catch{return {}}};
 let open=savedOpen(),store=localStorage.getItem(STORE_KEY)||'',storeFilter=localStorage.getItem(FILTER_KEY)||'';
 const prices=()=>Array.isArray(data.prices)?data.prices:[];
 function findPrices(item){return prices().filter(p=>clean(p.name)===clean(item.name)||clean(p.receiptName)===clean(item.name)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))}
 function storeNames(){return [...new Set(prices().map(p=>(p.store||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
 function buildToolbar(){
  const panel=$('panel-list');if(!panel)return;
  let bar=$('comprasV10Toolbar');
  if(!bar){bar=document.createElement('div');bar.id='comprasV10Toolbar';bar.className='toolbar';bar.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0';const progress=$('progress');(progress?.parentElement||panel).insertAdjacentElement('afterend',bar)}
  bar.replaceChildren();
  const version=document.createElement('span');version.className='chip active';version.textContent='Lista V10 ativa';version.title='Evolução da lista carregada';
  const expand=document.createElement('button');expand.type='button';expand.className='small';expand.textContent='Expandir tudo';expand.onclick=()=>setAllOpen(true);
  const collapse=document.createElement('button');collapse.type='button';collapse.className='small';collapse.textContent='Recolher tudo';collapse.onclick=()=>setAllOpen(false);
  const mark=document.createElement('button');mark.type='button';mark.className='small primary';mark.textContent='Marcar todos';mark.onclick=()=>{const pending=data.items.filter(i=>!i.checked);if(!pending.length)return toast('Todos os itens já estão marcados.');pending.forEach(i=>i.checked=true);logActivity('Marcou todos os itens',pending.length+' produtos');save();toast(pending.length+' item(ns) marcados')};
  const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:6px;margin:0;flex:1 1 200px';label.append('Estou em:');
  const input=document.createElement('input');input.type='text';input.value=store;input.placeholder='Nome do supermercado';input.setAttribute('aria-label','Supermercado atual');input.style.cssText='flex:1;min-width:145px';input.onchange=()=>{store=input.value.trim();localStorage.setItem(STORE_KEY,store);decorate()};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}};label.append(input);
  const filterLabel=document.createElement('label');filterLabel.style.cssText='display:flex;align-items:center;gap:6px;margin:0;flex:1 1 180px';filterLabel.append('Filtrar loja:');
  const select=document.createElement('select');select.setAttribute('aria-label','Filtrar itens por supermercado');select.style.cssText='flex:1;min-width:140px';select.innerHTML='<option value="">Todas as lojas</option>'+storeNames().map(s=>`<option value="${esc(s)}" ${clean(s)===clean(storeFilter)?'selected':''}>${esc(s)}</option>`).join('');select.onchange=()=>{storeFilter=select.value;localStorage.setItem(FILTER_KEY,storeFilter);decorate()};filterLabel.append(select);
  bar.append(version,expand,collapse,mark,label,filterLabel);
 }
 function setAllOpen(value){document.querySelectorAll('#list .category').forEach(section=>{const key=section.dataset.v10Key;if(key)open[key]=value});localStorage.setItem(OPEN_KEY,JSON.stringify(open));decorate()}
 function itemSummary(item){
  const ps=findPrices(item);if(!ps.length)return 'Sem preço registrado';
  const last=ps[0],lowest=ps.reduce((a,p)=>Number(p.value)<Number(a.value)?p:a,ps[0]);
  const storePs=store?ps.filter(p=>clean(p.store)===clean(store)):[];
  const storeShort=store?store.trim().split(/\s+/).slice(0,2).join(' '):'';
  const storeLowest=storePs.length?storePs.reduce((a,p)=>Number(p.value)<Number(a.value)?p:a,storePs[0]):null;
  const isBest=!!storeLowest&&Number(storeLowest.value)<=Number(lowest.value)+.005;
  const comparison=store?storeLowest?(isBest?`✓ Melhor preço em ${storeShort}`:`! Menor histórico: ${money(lowest.value)} · ${lowest.store||'loja desconhecida'}`):`? Sem preço registrado em ${storeShort}`:`Menor: ${money(lowest.value)} · ${lowest.store||'loja desconhecida'}`;
  return `Último: ${money(last.value)} · ${last.date||'data desconhecida'} · 🏬 ${last.store||'loja não informada'} · ${comparison}`;
 }
 function decorate(){
  const root=$('list');if(!root)return;
  root.querySelectorAll('.category').forEach((section,index)=>{
   let heading=section.querySelector(':scope > h3');let toggle=section.querySelector(':scope > .v10-category-toggle');
   if(!heading&&!toggle)return;
   const title=(heading||toggle.querySelector('[data-v10-title]'))?.textContent?.trim()||'Categoria';
   const rows=[...section.querySelectorAll('.item')].filter(row=>row.querySelector('[data-check]'));
   const key=title+'#'+index;section.dataset.v10Key=key;
   if(!(key in open))open[key]=rows.some(r=>!r.querySelector('[data-check]').checked);
   let body=section.querySelector(':scope > .v10-category-body');
   if(!body){body=document.createElement('div');body.className='v10-category-body';[...section.children].filter(c=>c!==heading&&c!==toggle).forEach(c=>body.append(c));section.append(body)}
   if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='v10-category-toggle';toggle.style.cssText='display:flex;width:100%;align-items:center;justify-content:space-between;text-align:left;background:transparent;border:0;padding:9px 2px;color:inherit;font-weight:750';heading.replaceWith(toggle)}
   toggle.innerHTML=`<span data-v10-title>${esc(title)} <small class="note">${rows.length} itens · ${rows.filter(r=>!r.querySelector('[data-check]').checked).length} pendentes</small></span><span aria-hidden="true">${open[key]?'▾':'▸'}</span>`;
   toggle.setAttribute('aria-expanded',String(!!open[key]));body.hidden=!open[key];toggle.onclick=()=>{open[key]=!open[key];localStorage.setItem(OPEN_KEY,JSON.stringify(open));body.hidden=!open[key];toggle.setAttribute('aria-expanded',String(!!open[key]));toggle.lastElementChild.textContent=open[key]?'▾':'▸'};
   rows.forEach(row=>{
    const check=row.querySelector('[data-check]'),item=data.items.find(i=>String(i.id)===String(check?.dataset.check));if(!item)return;
    row.hidden=!!(storeFilter&&!findPrices(item).some(p=>clean(p.store)===clean(storeFilter)));
    const nameNode=row.querySelector('.name');if(nameNode){let summary=nameNode.querySelector('[data-v10-price]');if(!summary){summary=document.createElement('small');summary.dataset.v10Price='1';nameNode.append(summary)}summary.textContent=itemSummary(item);summary.title='Comparação baseada apenas nos preços registrados no app';summary.style.color=store&&findPrices(item).length?'#087443':''}
    const actions=row.querySelector('.item-actions');if(actions&&!actions.querySelector('[data-v10-edit]')){const edit=document.createElement('button');edit.type='button';edit.className='small ghost';edit.dataset.v10Edit='1';edit.textContent='✎';edit.title='Editar nome do item';edit.setAttribute('aria-label','Editar nome do item');edit.onclick=()=>{const next=prompt('Editar nome do produto:',item.name);if(next===null)return;const value=next.trim();if(!value)return toast('O nome não pode ficar vazio.');const previous=item.name;item.name=value;logActivity('Editou item',previous+' → '+value);save();toast('Item atualizado')};actions.insertBefore(edit,actions.firstChild)}
   });
  });
  localStorage.setItem(OPEN_KEY,JSON.stringify(open));
 }
 const original=window.render;
 window.render=function(...args){const result=original.apply(this,args);buildToolbar();decorate();return result};
 buildToolbar();decorate();
 document.title=document.title.replace(/V\d+/,'V10');
})();
