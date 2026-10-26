(() => {
  const call = window.__TAURI__.core.invoke;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('fa-IR');
  const digits = value => String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g,'');
  let state, catalog, workspaceMenu, workspaceSyncKey='', workspaceCommandsKey='', showPairPanel=false, cart=[], draftId=crypto.randomUUID(), total=0, chosen, payingId=null, busy=false, ready=false, timer, toastTimer;
  function notify(message,bad=false){const el=$('pos-toast');el.textContent=message;el.style.background=bad?'#903737':'#173564';el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),6500);}
  function draft(){return {id:draftId,items:cart,type:$('pos-type').value,tableId:$('pos-type').value==='dine_in'&&$('pos-table').value?Number($('pos-table').value):null,customerName:$('pos-customer').value,customerPhone:digits($('pos-phone').value),note:$('pos-note').value};}
  function persist(){if(!ready)return;clearTimeout(timer);timer=setTimeout(()=>call('offline_draft',{draft:draft()}).catch(e=>notify(e,true)),200);}
  async function refresh(){
    try {
      state=await call('offline_status'); const next=state.catalog;
      $('pos-pair-card').hidden=state.paired&&state.localManagerPinConfigured&&!showPairPanel;
      $('pos-health').textContent=state.health.online?'متصل به سایت':'ذخیره محلی';$('pos-health').className=`pos-status ${state.health.online?'online':''}`;
      $('pos-sync-message').textContent=state.health.message;
      $('pos-counts').textContent=`${money(state.counts.pending)} در صف ارسال · ${money(state.counts.conflict)} نیازمند بررسی`;
      const localMenuMeta=state.workspaceSnapshots?.find(item=>item.dataset==='menu');
      const nextWorkspaceSync=JSON.stringify(state.workspaceSync||null);
      const workspaceSyncChanged=nextWorkspaceSync!==workspaceSyncKey;workspaceSyncKey=nextWorkspaceSync;
      const nextWorkspaceCommands=JSON.stringify(state.workspaceCommands||null);
      const workspaceCommandsChanged=nextWorkspaceCommands!==workspaceCommandsKey;workspaceCommandsKey=nextWorkspaceCommands;
      renderWorkspaceCommands();
      if(!$('workspace-menu-app').hidden&&((localMenuMeta&&(!workspaceMenu||workspaceMenu.revision!==localMenuMeta.revision||workspaceMenu.validUntil!==localMenuMeta.validUntil))||workspaceSyncChanged||workspaceCommandsChanged))void loadWorkspaceMenu();
      if(next&&(!catalog||catalog.snapshotId!==next.snapshotId)){
        catalog=next;$('pos-name').textContent=catalog.name;
        const selected=$('pos-category').value,table=$('pos-table').value;
        $('pos-category').innerHTML='<option value="">همه دسته‌ها</option>'+catalog.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('pos-category').value=selected;
        $('pos-table').innerHTML='<option value="">بدون میز</option>'+catalog.tables.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('pos-table').value=table;
        $('pos-terminal').innerHTML=catalog.terminals.filter(t=>t.settlementBankAccountId).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');renderProducts();
      }
      if(!ready){
        ready=true;if(state.draft?.items){cart=state.draft.items;draftId=state.draft.id||crypto.randomUUID();$('pos-type').value=state.draft.type||'dine_in';$('pos-table').value=state.draft.tableId||'';$('pos-customer').value=state.draft.customerName||'';$('pos-phone').value=state.draft.customerPhone||'';$('pos-note').value=state.draft.note||'';} await renderCart();await routes();
      }
      $('pos-history').innerHTML=state.sales.map(s=>`<tr><td><b dir="ltr">${esc(s.id.slice(0,8))}</b>${s.number?`<small>سایت: ${money(s.number)}</small>`:''}</td><td>${money(s.total)}</td><td>${s.paid?'دریافت ثبت شد':'پرداخت نشده'}</td><td><span class="pos-badge ${esc(s.state)}">${({pending:'در صف',conflict:'نیاز به بررسی',synced:'ارسال شد'})[s.state]||esc(s.state)}</span>${s.error?`<small>${esc(s.error)}</small>`:''}</td><td>${!s.paid?`<button class="button secondary" data-pay="${s.id}">دریافت وجه</button>`:''}${s.state==='conflict'?`<button class="text-button" data-retry="${s.id}">تلاش مجدد</button>`:''}</td></tr>`).join('');
      $('pos-prints').innerHTML=state.prints.map(p=>`<div class="pos-print-row"><b>${esc(p.code)}</b><span>${({pending:'در صف چاپ',sending:'در حال ارسال',sent:'تحویل صف/درگاه چاپ',unknown:'نیاز به بررسی خروج کاغذ'})[p.state]}</span><small>${esc(p.error)}</small>${p.state==='unknown'?`<button class="text-button" data-print="${p.id}">چاپ مجدد</button>`:''}</div>`).join('');
    }catch(e){notify(e,true);}
  }
  function renderProducts(){if(!catalog)return;const q=$('pos-search').value.trim(),cat=$('pos-category').value;const prods=catalog.products.filter(p=>(!q||p.name.includes(q))&&(!cat||String(p.categoryId)===cat));$('pos-products').innerHTML=prods.length?prods.map(p=>`<button class="pos-product" data-product="${p.id}"><b>${esc(p.name)}</b><span>${money(p.price)} <small>تومان${p.sellingMode==='weight'?' / کیلو':''}</small></span></button>`).join(''):'<p class="muted">محصولی پیدا نشد.</p>';}
  function workspaceMenuView(){
    const base=workspaceMenu?.payload;if(!base)return null;
    const view={...base,products:(base.products||[]).map(item=>({...item})),categories:(base.categories||[]).map(item=>({...item}))};
    for(const change of workspaceMenu.localChanges||[]){
      const payload=change.payload||{},isProduct=change.action==='update_product',id=isProduct?payload.productId:payload.categoryId;
      const rows=isProduct?view.products:view.categories,item=rows.find(row=>row.id===id);
      if(item&&change.state==='pending'){Object.assign(item,payload.patch||{});item.localChange=change;}
    }
    return view;
  }
  function canEditLocalMenu(){return !!state?.localManagerPinConfigured&&!workspaceMenu?.expired;}
  function renderWorkspaceMenu(){
    const payload=workspaceMenuView();
    if(!payload){$('workspace-menu-products').innerHTML='';$('workspace-menu-categories').innerHTML='';return;}
    const q=$('workspace-menu-search').value.trim().toLocaleLowerCase('fa-IR'),category=$('workspace-menu-category').value,editable=canEditLocalMenu();
    const products=payload.products.filter(p=>(!q||`${p.name} ${p.description}`.toLocaleLowerCase('fa-IR').includes(q))&&(!category||String(p.categoryId??'')===category));
    $('workspace-menu-products').innerHTML=products.length?products.map(p=>{const categoryName=payload.categories.find(c=>c.id===p.categoryId)?.name||'بدون دسته';const pending=p.localChange;return `<article class="workspace-product"><div><span class="workspace-product-category">${esc(categoryName)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description||'توضیحی ثبت نشده است')}</p></div><div class="workspace-product-meta"><b>${money(p.price)} تومان${p.sellingMode==='weight'?' / کیلو':''}</b><span class="${p.isAvailable?'workspace-available':'workspace-unavailable'}">${p.isAvailable?'موجود برای سفارش':'فعلاً ناموجود'}</span></div><div class="workspace-product-actions">${pending?'<span class="workspace-pending-label">تغییر محلی در صف ارسال است</span>':'<span></span>'}<button class="button secondary" data-edit-menu="product" data-id="${p.id}" ${!editable||pending?'disabled':''}>ویرایش</button></div></article>`}).join(''):'<p class="muted">محصولی در این دسته یا جست‌وجو پیدا نشد.</p>';
    $('workspace-menu-categories').innerHTML=payload.categories.length?payload.categories.map(c=>{const pending=c.localChange;return `<article class="workspace-category-row"><div><h3>${esc(c.name)}</h3><p>${esc(c.description||'توضیحی ثبت نشده است')} · ${c.isActive?'فعال':'غیرفعال'} · ترتیب ${money(c.sortOrder)}</p>${pending?'<small class="workspace-pending-label">تغییر محلی در صف ارسال است</small>':''}</div><button class="button secondary" data-edit-menu="category" data-id="${c.id}" ${!editable||pending?'disabled':''}>ویرایش</button></article>`}).join(''):'<p class="muted">دسته‌بندی‌ای در snapshot منو موجود نیست.</p>';
  }
  function renderWorkspaceCommands(){
    const summary=state?.workspaceCommands||{},recent=(summary.recent||[]).filter(item=>item.module==='menu');
    $('workspace-menu-command-counts').textContent=`${money(summary.pending||0)} در صف · ${money(summary.conflicts||0)} نیازمند بررسی · ${money(summary.rejected||0)} ردشده`;
    const labels={update_product:'ویرایش محصول',update_category:'ویرایش دسته‌بندی'},states={pending:'در صف ارسال',conflict:'نیازمند بررسی',rejected:'ردشده',synced:'همگام شد'};
    $('workspace-menu-commands').innerHTML=recent.length?recent.slice(0,20).map(item=>`<div class="workspace-command-row"><span><b>${labels[item.action]||esc(item.action)} · ${esc(item.id.slice(0,8))}</b><small>${esc(item.error||item.createdAt||'')}</small></span><strong class="workspace-command-state ${esc(item.state)}">${states[item.state]||esc(item.state)}</strong></div>`).join(''):'<p class="muted">تغییر محلی در صف نیست.</p>';
  }
  let editingMenu=null;
  function openMenuEditor(kind,id){
    const view=workspaceMenuView(),base=workspaceMenu?.payload;
    if(!view||!base||!canEditLocalMenu())return;
    const isProduct=kind==='product',row=(isProduct?view.products:view.categories).find(item=>item.id===id),original=(isProduct?base.products:base.categories).find(item=>item.id===id);
    if(!row||!original||row.localChange){notify('برای این قلم تغییر در صف وجود دارد؛ پس از همگام‌سازی دوباره ویرایش کنید.',true);return;}
    editingMenu={kind,id,original};$('workspace-edit-error').textContent='';$('workspace-edit-title').textContent=isProduct?'ویرایش محصول آفلاین':'ویرایش دسته‌بندی آفلاین';
    $('workspace-edit-name').value=row.name||'';$('workspace-edit-name').maxLength=isProduct?100:60;$('workspace-edit-description').value=row.description||'';$('workspace-edit-description').maxLength=isProduct?400:500;
    $('workspace-edit-price-wrap').hidden=!isProduct;$('workspace-edit-sort-wrap').hidden=isProduct;$('workspace-edit-price').required=isProduct;$('workspace-edit-sort').required=!isProduct;$('workspace-edit-price').value=isProduct?String(row.price):'';$('workspace-edit-sort').value=isProduct?'':String(row.sortOrder||0);
    $('workspace-edit-enabled-wrap').hidden=false;$('workspace-edit-enabled').checked=isProduct?!!row.isAvailable:!!row.isActive;$('workspace-edit-enabled-label').textContent=isProduct?'در دسترس برای سفارش':'دسته‌بندی فعال';$('workspace-edit-pin').value='';$('workspace-edit-dialog').showModal();
  }
  $('workspace-menu-products').onclick=e=>{const button=e.target.closest('[data-edit-menu="product"]');if(button&&!button.disabled)openMenuEditor('product',Number(button.dataset.id));};
  $('workspace-menu-categories').onclick=e=>{const button=e.target.closest('[data-edit-menu="category"]');if(button&&!button.disabled)openMenuEditor('category',Number(button.dataset.id));};
  $('workspace-edit-form').onsubmit=async e=>{
    e.preventDefault();if(!editingMenu)return;
    const isProduct=editingMenu.kind==='product',original=editingMenu.original,name=$('workspace-edit-name').value.trim(),description=$('workspace-edit-description').value;
    const patch={};if(name!==original.name)patch.name=name;if(description!== (original.description||''))patch.description=description;
    if(isProduct){const price=Number(digits($('workspace-edit-price').value));if(!Number.isSafeInteger(price)){$('workspace-edit-error').textContent='قیمت را به‌صورت عدد صحیح وارد کنید.';return;}if(price!==original.price)patch.price=price;const available=$('workspace-edit-enabled').checked;if(available!==original.isAvailable)patch.isAvailable=available;}
    else{const sortOrder=Number($('workspace-edit-sort').value);if(!Number.isSafeInteger(sortOrder)){$('workspace-edit-error').textContent='ترتیب نمایش باید عدد صحیح باشد.';return;}if(sortOrder!==original.sortOrder)patch.sortOrder=sortOrder;const active=$('workspace-edit-enabled').checked;if(active!==original.isActive)patch.isActive=active;}
    if(!Object.keys(patch).length){$('workspace-edit-error').textContent='تغییری برای ذخیره وارد نشده است.';return;}
    $('workspace-edit-submit').disabled=true;$('workspace-edit-error').textContent='';
    try{const result=await call('offline_workspace_update_menu',{action:isProduct?'update_product':'update_category',targetId:editingMenu.id,patch,managerPin:digits($('workspace-edit-pin').value)});$('workspace-edit-dialog').close();notify('تغییر روی این دستگاه ذخیره شد؛ پس از اتصال همگام می‌شود.');await refresh();if(result.state!=='pending')notify('وضعیت تغییر منو را بررسی کنید.',true);}
    catch(error){$('workspace-edit-error').textContent=String(error);}
    finally{$('workspace-edit-submit').disabled=false;}
  };
  async function loadWorkspaceMenu(){
    $('workspace-menu-state').textContent='در حال خواندن snapshot رمز‌شدهٔ دستگاه…';
    try{
      workspaceMenu=await call('offline_workspace_menu');
      if(!workspaceMenu){$('workspace-menu-name').textContent='منوی آفلاین';$('workspace-menu-revision').textContent='داده‌ای دریافت نشده';$('workspace-menu-revision').className='pos-status';const sync=state?.workspaceSync;$('workspace-menu-state').textContent=sync?.message||'پس از اتصال صندوق و دریافت اولیهٔ منو، اطلاعات اینجا در دسترس خواهد بود.';$('workspace-menu-products').innerHTML='';$('workspace-menu-categories').innerHTML='';return;}
      const payload=workspaceMenu.payload||{};$('workspace-menu-name').textContent=payload.business?.name||'منوی آفلاین';
      $('workspace-menu-revision').textContent=`نسخه ${money(workspaceMenu.revision)} · ${workspaceMenu.expired?'منقضی':'معتبر'}`;$('workspace-menu-revision').className=`pos-status ${workspaceMenu.expired?'':'online'}`;
      const snapshotText=workspaceMenu.expired?`این snapshot در ${new Date(workspaceMenu.validUntil).toLocaleString('fa-IR')} منقضی شده است. داده برای مشاهده باقی مانده، اما نباید مبنای تغییر جدید باشد.`:`${money(payload.products?.length||0)} محصول · ${money(payload.categories?.length||0)} دسته · دریافت ${new Date(workspaceMenu.issuedAt).toLocaleString('fa-IR')}`;const sync=state?.workspaceSync;const syncText=sync?.ok?` · دریافت سرور ${new Date(sync.checkedAt).toLocaleTimeString('fa-IR')}`:sync?.message?` · دریافت تازه ناموفق: ${sync.message}`:'';$('workspace-menu-state').textContent=snapshotText+syncText;
      const view=workspaceMenuView(),selected=$('workspace-menu-category').value;$('workspace-menu-category').innerHTML='<option value="">همهٔ دسته‌ها</option>'+(view.categories||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('workspace-menu-category').value=selected;renderWorkspaceMenu();renderWorkspaceCommands();
    }catch(error){$('workspace-menu-state').textContent=`خواندن منوی محلی ممکن نشد: ${error}`;$('workspace-menu-products').innerHTML='';}
  }
  async function renderCart(){
    $('pos-cart-lines').innerHTML=cart.length?cart.map((item,i)=>{const p=catalog?.products.find(p=>p.id===item.productId);return `<div class="pos-cart-line"><b>${esc(p?.name||'محصول')} <small>× ${money(item.quantity)}</small></b><button data-remove="${i}" aria-label="حذف ${esc(p?.name)}">حذف</button><small>${item.weightGrams?`${money(item.weightGrams-item.tareGrams)} گرم`:''}${item.optionIds.length?' · با گزینه':''}</small></div>`}).join(''):'<p class="muted">برای شروع، محصول را انتخاب کنید.</p>';
    if(cart.length){try{const q=await call('offline_quote',{sale:draft()});total=q.total;$('pos-checkout').disabled=false;}catch(e){total=0;$('pos-checkout').disabled=true;notify(e,true);}}else{total=0;$('pos-checkout').disabled=true;}
    $('pos-total').textContent=money(total)+' تومان';persist();
  }
  function product(id){chosen=catalog.products.find(p=>p.id===id);if(!chosen)return;$('pos-product-title').textContent=chosen.name;$('pos-qty').value='1';$('pos-gross').value='';$('pos-tare').value='0';$('pos-product-error').textContent='';$('pos-weight').hidden=chosen.sellingMode!=='weight';$('pos-gross').required=chosen.sellingMode==='weight';$('pos-options').innerHTML=chosen.modifierGroups.filter(g=>g.active).map(g=>`<fieldset><legend>${esc(g.name)} · ${g.min} تا ${g.max} انتخاب</legend>${g.options.filter(o=>o.active).map(o=>`<label class="option-choice"><input type="checkbox" value="${esc(o.id)}">${esc(o.name)} <small>${o.priceDelta?money(o.priceDelta)+' تومان':''}</small></label>`).join('')}</fieldset>`).join('');$('pos-product-dialog').showModal();}
  $('pos-product-form').onsubmit=async e=>{e.preventDefault();const item={productId:chosen.id,quantity:Number($('pos-qty').value),optionIds:[...$('pos-options').querySelectorAll('input:checked')].map(i=>i.value),weightGrams:chosen.sellingMode==='weight'?Number($('pos-gross').value):null,tareGrams:chosen.sellingMode==='weight'?Number($('pos-tare').value):0};try{await call('offline_quote',{sale:{...draft(),items:[item]}});cart.push(item);$('pos-product-dialog').close();await renderCart();}catch(error){$('pos-product-error').textContent=error;}};
  function checkout(id=null){payingId=id;const s=id?state.sales.find(s=>s.id===id):null;const due=s?s.total:total;$('pos-payment-total').textContent='مبلغ فاکتور: '+money(due)+' تومان';$('pos-payment-form').dataset.total=String(due);$('pos-method').value='cash';$('pos-method').querySelector('[value=unpaid]').disabled=!!id;$('pos-cash').value=String(due);$('pos-ref').value='';$('pos-payment-error').textContent='';paymentFields();$('pos-checkout-dialog').showModal();}
  function paymentFields(){const method=$('pos-method').value;const due=Number($('pos-payment-form').dataset.total);$('pos-payment-fields').hidden=method==='unpaid';$('pos-cash-label').hidden=method!=='mixed';$('pos-bank-fields').hidden=!['pos','mixed'].includes(method);$('pos-card-amount').textContent='مبلغ کارتخوان: '+money(due-(method==='mixed'?Number(digits($('pos-cash').value)):0))+' تومان';}
  $('pos-payment-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('pos-submit').disabled=true;try{const method=$('pos-method').value,due=Number(e.target.dataset.total);const cash=method==='cash'?due:method==='mixed'?Number(digits($('pos-cash').value)):0;const tender=method==='unpaid'?null:{cashAmount:cash,posAmount:due-cash,posDeviceId:method==='cash'?null:Number($('pos-terminal').value),posRefNo:method==='cash'?'':digits($('pos-ref').value.trim())};if(payingId){await call('offline_pay',{id:payingId,tender});}else{await call('offline_save',{sale:{...draft(),tender}});cart=[];draftId=crypto.randomUUID();$('pos-customer').value='';$('pos-phone').value='';$('pos-note').value='';await call('offline_draft',{draft:draft()});await renderCart();}$('pos-checkout-dialog').close();notify('با موفقیت در پایگاه محلی ذخیره شد');await refresh();}catch(error){$('pos-payment-error').textContent=error;}finally{busy=false;$('pos-submit').disabled=false;}};
  async function routes(){const bridge=await call('bridge_status');const config=bridge.config?JSON.parse(bridge.config):{devices:[]};$('pos-routes').innerHTML=config.devices.filter(d=>d.kind==='printer').map(d=>{const saved=state.routes.find(r=>r.code===d.code);return `<div class="pos-route" data-code="${esc(d.code)}"><b>${esc(d.name||d.code)}</b><select aria-label="نقش چاپگر"><option value="">غیرفعال در صندوق محلی</option><option value="customer" ${saved?.kind==='customer'?'selected':''}>فیش مشتری</option><option value="kitchen" ${saved?.kind==='kitchen'?'selected':''}>آشپزخانه / بار</option></select><div class="pos-route-cats">${(catalog?.categories||[]).map(c=>`<label><input type="checkbox" value="${c.id}" ${saved?.categoryIds.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</div></div>`}).join('')||'<p class="muted">ابتدا چاپگر را در تب تجهیزات تنظیم کنید.</p>';$('pos-pager').innerHTML=config.devices.filter(d=>d.kind==='pager').map(d=>`<option value="${esc(d.code)}">${esc(d.name||d.code)}</option>`).join('');}
  $('pos-route-save').onclick=async()=>{try{const routes=[...$('pos-routes').querySelectorAll('[data-code]')].filter(r=>r.querySelector('select').value).map(r=>({code:r.dataset.code,kind:r.querySelector('select').value,categoryIds:[...r.querySelectorAll('input:checked')].map(c=>Number(c.value))}));await call('offline_routes',{routes});notify('مسیرهای چاپ ذخیره شد');await refresh();}catch(e){notify(e,true);}};
  $('pos-pair-toggle').onclick=()=>{showPairPanel=!showPairPanel;$('pos-pair-card').hidden=state?.paired&&state.localManagerPinConfigured&&!showPairPanel;if(showPairPanel)$('pos-pair-pin').focus();};
  $('pos-pair').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const managerPin=digits($('pos-pair-pin').value);await call('offline_pair',{content:await file.text(),managerPin});$('pos-pair-pin').value='';showPairPanel=false;await call('offline_refresh');notify('اتصال و PIN مدیر محلی ذخیره شد؛ دریافت منو در حال انجام است');await refresh();}catch(error){notify(error,true);}finally{e.target.value='';}};
  $('pos-backup').onclick=async()=>{try{notify('پشتیبان ذخیره شد: '+await call('offline_backup'));}catch(e){notify(e,true);}};
  $('pos-refresh').onclick=async()=>{try{await call('offline_refresh');notify('درخواست به‌روزرسانی ثبت شد');await routes();}catch(e){notify(e,true);}};
  $('pos-ring').onclick=async()=>{try{await call('offline_ring',{code:$('pos-pager').value,number:Number($('pos-pager-number').value)});notify('فرمان به فرستنده پیجر ارسال شد؛ پاسخ فیزیکی را بررسی کنید');}catch(e){notify(e,true);}};
  $('pos-products').onclick=e=>{const b=e.target.closest('[data-product]');if(b)product(Number(b.dataset.product));};
  $('pos-cart-lines').onclick=async e=>{const b=e.target.closest('[data-remove]');if(b){cart.splice(Number(b.dataset.remove),1);await renderCart();}};
  $('pos-history').onclick=async e=>{try{const pay=e.target.closest('[data-pay]'),retry=e.target.closest('[data-retry]');if(pay)checkout(pay.dataset.pay);if(retry){await call('offline_retry',{id:retry.dataset.retry});await refresh();}}catch(error){notify(error,true);}};
  $('pos-prints').onclick=async e=>{const b=e.target.closest('[data-print]');if(b&&confirm('ممکن است فیش قبلاً چاپ شده باشد. پس از بررسی خروج کاغذ، دوباره ارسال شود؟')){try{await call('offline_retry_print',{id:Number(b.dataset.print)});await refresh();}catch(error){notify(error,true);}}};
  $('pos-search').oninput=renderProducts;$('pos-category').onchange=renderProducts;$('pos-method').onchange=paymentFields;$('pos-cash').oninput=()=>{const n=digits($('pos-cash').value);$('pos-cash').value=/^\d*$/.test(n)?Number(n||0).toLocaleString('en-US'):n;paymentFields();};$('pos-checkout').onclick=()=>checkout();
  $('pos-clear').onclick=async()=>{if(cart.length&&confirm('سبد جاری خالی شود؟')){cart=[];draftId=crypto.randomUUID();await renderCart();}};
  ['pos-type','pos-table','pos-customer','pos-phone','pos-note'].forEach(id=>$(id).addEventListener('input',()=>{persist();}));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  function selectDesktopTab(tab){
    const selected={pos:'pos-app',menu:'workspace-menu-app',hardware:'hardware-app'};
    Object.entries(selected).forEach(([key,id])=>{$(id).hidden=key!==tab;$(`tab-${key}`).classList.toggle('selected',key===tab);});
    if(tab==='pos')void routes();if(tab==='menu')void loadWorkspaceMenu();
  }
  $('tab-pos').onclick=()=>selectDesktopTab('pos');$('tab-menu').onclick=()=>selectDesktopTab('menu');$('tab-hardware').onclick=()=>selectDesktopTab('hardware');
  $('workspace-menu-refresh').onclick=async()=>{try{await call('offline_refresh');$('workspace-menu-state').textContent='درخواست دریافت snapshot تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};$('workspace-menu-search').oninput=renderWorkspaceMenu;$('workspace-menu-category').onchange=renderWorkspaceMenu;
  void refresh();setInterval(()=>void refresh(),5000);
})();
