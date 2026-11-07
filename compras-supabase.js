/* Loader de compatibilidade do app de compras.
 * O index.html existente carrega este arquivo. Encadeamos o sincronizador estável
 * e, depois, os aprimoramentos visuais da lista, sem depender de editar HTML.
 */
(()=>{
 'use strict';
 const current=document.currentScript;
 const base=current?.src?new URL('.',current.src):new URL('.',location.href);
 const status=document.getElementById('authStatus');
 const load=src=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=src;
  script.onload=()=>resolve();
  script.onerror=()=>reject(new Error('Falha ao carregar '+src));
  document.head.appendChild(script);
 });
 const stableApp='https://raw.githubusercontent.com/WestterJ/compras/cda3a65a73ae487a7690aeb6a050c1c970152031/compras-supabase.js';
 load(stableApp)
  .then(()=>load(new URL('compras-lista-v9.js?v=10',base).href))
  .catch(error=>{
   console.error('[Compras] Não foi possível inicializar o app:',error);
   if(status)status.textContent='Não foi possível carregar os recursos da lista. Verifique a conexão e recarregue a página.';
  });
})();
