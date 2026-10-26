(() => {
  const call = window.__TAURI__.core.invoke;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('fa-IR');
  const digits = value => String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g,'');
  let state, catalog, workspaceMenu, workspaceCustomers, workspaceInventory, workspaceOrders, workspaceOrdersLoaded=false, workspaceSyncKey='', workspaceCustomerMetaKey='', workspaceCustomerSyncKey='', workspaceInventoryMetaKey='', workspaceInventorySyncKey='', workspaceOrdersMetaKey='', workspaceOrdersSyncKey='', workspaceCommandsKey='', showPairPanel=false, cart=[], draftId=crypto.randomUUID(), total=0, chosen, payingId=null, busy=false, ready=false, timer, toastTimer, historyOlder=[], historyHasMore=true, historyNewestId=null, serverOrderSales=[];
  function notify(message,bad=false){const el=$('pos-toast');el.textContent=message;el.style.background=bad?'#903737':'#173564';el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),6500);}
  function draft(){return {id:draftId,items:cart,type:$('pos-type').value,tableId:$('pos-type').value==='dine_in'&&$('pos-table').value?Number($('pos-table').value):null,customerName:$('pos-customer').value,customerPhone:digits($('pos-phone').value),note:$('pos-note').value};}
  function persist(){if(!ready)return;clearTimeout(timer);timer=setTimeout(()=>call('offline_draft',{draft:draft()}).catch(e=>notify(e,true)),200);}
  function allSales(){return [...(state?.sales||[]),...historyOlder];}
  function renderSalesHistory(){
    const sales=allSales();
    $('pos-history').innerHTML=sales.map(s=>`<tr><td><b dir="ltr">${esc(s.id.slice(0,8))}</b>${s.number?`<small>سایت: ${money(s.number)}</small>`:''}</td><td>${money(s.total)}</td><td>${s.paid?'دریافت ثبت شد':'پرداخت نشده'}</td><td><span class="pos-badge ${esc(s.state)}">${({pending:'در صف',conflict:'نیازمند بررسی',synced:'ارسال شد'})[s.state]||esc(s.state)}</span>${s.error?`<small>${esc(s.error)}</small>`:''}</td><td><button class="button secondary" data-details="${esc(s.id)}">جزئیات</button>${!s.paid?`<button class="button secondary" data-pay="${esc(s.id)}">دریافت وجه</button>`:''}${s.state==='conflict'?`<button class="text-button" data-retry="${esc(s.id)}">تلاش مجدد</button>`:''}</td></tr>`).join('');
    $('pos-history-more').hidden=!historyHasMore;
  }
  function showSaleDetails(id,override=null){
    const sale=override||allSales().find(item=>item.id===id);if(!sale)return;
    const d=sale.details||{},items=Array.isArray(d.items)?d.items:[],tender=d.tender;
    const date=d.occurredAt||sale.at;let dateText='—';try{if(date)dateText=new Date(date).toLocaleString('fa-IR');}catch{}
    const type=d.type==='dine_in'?'داخل سالن':'بیرون‌بر',table=d.tableName||d.tableId||'—';
    const itemRows=items.map(item=>{
      const name=item.productName||item.name||`کالای شناسهٔ ${item.productId??'—'}`;
      const options=Array.isArray(item.optionNames)?item.optionNames.filter(Boolean).join('، '):'';
      const gross=Number(item.weightGrams||0),tare=Number(item.tareGrams||0),net=item.netWeightGrams!=null?Number(item.netWeightGrams):Math.max(0,gross-tare);
      const unit=item.unitPrice?`${money(item.unitPrice)} تومان${gross?' / کیلو':''}`:'—';
      return `<tr><td><b>${esc(name)}</b>${options?`<small>افزودنی‌ها: ${esc(options)}</small>`:''}${item.note?`<small>توضیح: ${esc(item.note)}</small>`:''}</td><td>${money(item.quantity)}</td><td>${gross?`${money(net)} گرم${tare?` (وزن ظرف ${money(tare)} گرم)`:''}`:'—'}</td><td>${unit}</td><td>${money(item.amount)} تومان</td></tr>`;
    }).join('');
    const terminal=(d.terminals||[]).find(item=>item.id===tender?.posDeviceId)?.name||tender?.posDeviceId||'—';
    const payment=tender?`<div class="pos-detail-grid"><span>نقدی</span><b>${money(tender.cashAmount)} تومان</b>${Number(tender.bankAmount||0)?`<span>واریز بانکی</span><b>${money(tender.bankAmount)} تومان${tender.bankAccountName?` · ${esc(tender.bankAccountName)}`:''}</b>`:''}<span>کارتخوان</span><b>${money(tender.posAmount)} تومان${tender.posBankAccountName?` · ${esc(tender.posBankAccountName)}`:''}</b>${Number(tender.creditAmount||0)?`<span>اعتباری</span><b>${money(tender.creditAmount)} تومان</b>`:''}<span>دستگاه</span><b>${esc(tender.posDeviceName||terminal)}${tender.posTerminalNumber?` · ${esc(tender.posTerminalNumber)}`:''}</b><span>شماره پیگیری</span><b dir="ltr">${esc(tender.posRefNo||'—')}</b></div>`:sale.paid?'<p class="pos-detail-legacy">پرداخت برای این سفارش ثبت شده، اما تفکیک روش‌های دریافت در snapshot موجود نبود.</p>':'<p class="pos-detail-unpaid">برای این سفارش هنوز دریافت وجه ثبت نشده است.</p>';
    const legacy=d.legacy?'<p class="pos-detail-legacy">این فاکتور پیش از ذخیرهٔ جزئیات اقلام ساخته شده است؛ اطلاعات پایهٔ سفارش در دسترس است، اما نام و قیمت زمان فروش برای آن ثبت نشده بود.</p>':'';
    const oldItems=d.legacy?`<ul class="pos-detail-legacy-items">${items.map(item=>`<li>شناسهٔ کالا ${esc(item.productId??'—')} · تعداد ${money(item.quantity||0)}${Array.isArray(item.optionIds)&&item.optionIds.length?` · گزینه‌ها: ${item.optionIds.map(esc).join('، ')}`:''}</li>`).join('')}</ul>`:'';
    const extraFields=[];
    if(d.address)extraFields.push(['نشانی تحویل',d.address]);
    if(d.deliveryStatus)extraFields.push(['وضعیت ارسال',d.deliveryStatus]);
    if(Number(d.deliveryFee||0))extraFields.push(['هزینه ارسال',`${money(d.deliveryFee)} تومان`]);
    if(Number(d.discountAmount||0))extraFields.push(['تخفیف',`${money(d.discountAmount)} تومان`]);
    if(d.discountCode)extraFields.push(['کد تخفیف',d.discountCode]);
    if(Number(d.membershipDiscount||0))extraFields.push(['تخفیف عضویت',`${money(d.membershipDiscount)} تومان`]);
    if(Number(d.cashbackUsed||0))extraFields.push(['اعتبار مصرف‌شده',`${money(d.cashbackUsed)} تومان`]);
    if(d.scheduledFor)extraFields.push(['زمان سفارش برنامه‌ریزی‌شده',new Date(d.scheduledFor).toLocaleString('fa-IR')]);
    $('pos-history-detail-title').textContent=`جزئیات سفارش ${sale.number?`#${money(sale.number)}`:`#${sale.id.slice(0,8)}`}`;
    $('pos-history-detail-content').innerHTML=`<div class="pos-detail-badges"><span class="pos-badge ${esc(sale.state)}">${({pending:'در صف ارسال',conflict:'نیازمند بررسی',synced:'همگام‌شده'})[sale.state]||esc(sale.state)}</span><span class="pos-badge ${sale.paid?'synced':''}">${sale.paid?'پرداخت ثبت شده':'پرداخت نشده'}</span>${sale.error?`<span class="pos-detail-error">${esc(sale.error)}</span>`:''}</div><div class="pos-detail-grid"><span>زمان سفارش</span><b>${esc(dateText)}</b><span>نوع سفارش</span><b>${type}</b><span>میز</span><b>${esc(table)}</b>${d.status?`<span>وضعیت سفارش</span><b>${esc(d.status)}</b>`:''}${d.paymentStatus?`<span>وضعیت پرداخت</span><b>${esc(d.paymentStatus)}</b>`:''}<span>مشتری</span><b>${esc(d.customerName||'—')}</b><span>تلفن</span><b dir="ltr">${esc(d.customerPhone||'—')}</b><span>یادداشت</span><b>${esc(d.note||'—')}</b></div>${legacy}<div class="pos-detail-table-wrap"><table class="pos-table pos-detail-table"><thead><tr><th>شرح کالا</th><th>تعداد</th><th>وزن خالص</th><th>بهای واحد</th><th>جمع</th></tr></thead><tbody>${itemRows||'<tr><td colspan="5">جزئیات اقلام موجود نیست.</td></tr>'}</tbody></table></div>${oldItems}<div class="pos-detail-totals">${Number.isFinite(Number(d.subtotal))?`<div><span>جمع اقلام</span><b>${money(d.subtotal)} تومان</b></div><div><span>مالیات</span><b>${money(d.tax)} تومان</b></div><div><span>خدمات</span><b>${money(d.service)} تومان</b></div>`:''}<div class="grand-total"><span>مبلغ کل</span><b>${money(sale.total)} تومان</b></div></div><h3 class="pos-detail-payment-title">جزئیات تسویه</h3>${payment}${sale.number?`<p class="muted">شماره سفارش سایت: ${money(sale.number)}</p>`:''}`;
    if(extraFields.length)$('pos-history-detail-content').querySelector('.pos-detail-grid')?.insertAdjacentHTML('beforeend',extraFields.map(([label,value])=>`<span>${esc(label)}</span><b>${esc(value)}</b>`).join(''));
    $('pos-history-detail-dialog').showModal();
  }
  async function refresh(){
    try {
      const previousNewest=historyNewestId;state=await call('offline_status'); const next=state.catalog;historyNewestId=state.sales[0]?.id||null;if(previousNewest&&historyNewestId&&previousNewest!==historyNewestId){historyOlder=[];historyHasMore=state.sales.length===100;}else if(!previousNewest){historyHasMore=state.sales.length===100;}
      $('pos-pair-card').hidden=state.paired&&state.localManagerPinConfigured&&!showPairPanel;
      $('pos-health').textContent=state.health.online?'متصل به سایت':'ذخیره محلی';$('pos-health').className=`pos-status ${state.health.online?'online':''}`;
      $('pos-sync-message').textContent=state.health.message;
      $('pos-counts').textContent=`${money(state.counts.pending)} در صف ارسال · ${money(state.counts.conflict)} نیازمند بررسی`;
      const localMenuMeta=state.workspaceSnapshots?.find(item=>item.dataset==='menu');
      const localCustomersMeta=state.workspaceSnapshots?.find(item=>item.dataset==='customers');
      const localInventoryMeta=state.workspaceSnapshots?.find(item=>item.dataset==='inventory');
      const localOrdersMeta=state.workspaceSnapshots?.find(item=>item.dataset==='orders');
      const nextWorkspaceSync=JSON.stringify(state.workspaceSync||null);
      const workspaceSyncChanged=nextWorkspaceSync!==workspaceSyncKey;workspaceSyncKey=nextWorkspaceSync;
      const nextWorkspaceCommands=JSON.stringify(state.workspaceCommands||null);
      const workspaceCommandsChanged=nextWorkspaceCommands!==workspaceCommandsKey;workspaceCommandsKey=nextWorkspaceCommands;
      const nextCustomerMeta=JSON.stringify(localCustomersMeta||null),customerMetaChanged=nextCustomerMeta!==workspaceCustomerMetaKey;workspaceCustomerMetaKey=nextCustomerMeta;
      const nextCustomerSync=JSON.stringify(state.workspaceCustomerSync||null),customerSyncChanged=nextCustomerSync!==workspaceCustomerSyncKey;workspaceCustomerSyncKey=nextCustomerSync;
      const nextInventoryMeta=JSON.stringify(localInventoryMeta||null),inventoryMetaChanged=nextInventoryMeta!==workspaceInventoryMetaKey;workspaceInventoryMetaKey=nextInventoryMeta;
      const nextInventorySync=JSON.stringify(state.workspaceInventorySync||null),inventorySyncChanged=nextInventorySync!==workspaceInventorySyncKey;workspaceInventorySyncKey=nextInventorySync;
      const nextOrdersMeta=JSON.stringify(localOrdersMeta||null),ordersMetaChanged=nextOrdersMeta!==workspaceOrdersMetaKey;workspaceOrdersMetaKey=nextOrdersMeta;
      const nextOrdersSync=JSON.stringify(state.workspaceOrdersSync||null),ordersSyncChanged=nextOrdersSync!==workspaceOrdersSyncKey;workspaceOrdersSyncKey=nextOrdersSync;
      renderWorkspaceCommands();
      renderWorkspaceReservations();
      if(!$('workspace-menu-app').hidden&&((localMenuMeta&&(!workspaceMenu||workspaceMenu.revision!==localMenuMeta.revision||workspaceMenu.validUntil!==localMenuMeta.validUntil))||workspaceSyncChanged||workspaceCommandsChanged))void loadWorkspaceMenu();
      if(!$('customers-app').hidden&&(customerMetaChanged||customerSyncChanged||!workspaceCustomers))void loadWorkspaceCustomers();
      if(!$('inventory-app').hidden&&(inventoryMetaChanged||inventorySyncChanged||!workspaceInventory))void loadWorkspaceInventory();
      if(!$('pos-app').hidden&&(ordersMetaChanged||ordersSyncChanged||!workspaceOrdersLoaded))void loadWorkspaceOrders();
      if(next&&(!catalog||catalog.snapshotId!==next.snapshotId)){
        catalog=next;$('pos-name').textContent=catalog.name;
        const selected=$('pos-category').value,table=$('pos-table').value;
        $('pos-category').innerHTML='<option value="">همه دسته‌ها</option>'+catalog.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('pos-category').value=selected;
        $('pos-table').innerHTML='<option value="">بدون میز</option>'+catalog.tables.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('pos-table').value=table;
        $('pos-terminal').innerHTML=catalog.terminals.filter(t=>t.settlementBankAccountId).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');renderProducts();
      }
      if(next)renderReservationTables();
      if(!ready){
        ready=true;if(state.draft?.items){cart=state.draft.items;draftId=state.draft.id||crypto.randomUUID();$('pos-type').value=state.draft.type||'dine_in';$('pos-table').value=state.draft.tableId||'';$('pos-customer').value=state.draft.customerName||'';$('pos-phone').value=state.draft.customerPhone||'';$('pos-note').value=state.draft.note||'';} await renderCart();await routes();
      }
      renderSalesHistory();
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
  function renderWorkspaceReservations(){
    const summary=state?.workspaceCommands||{},recent=(summary.recent||[]).filter(item=>item.module==='reservations');
    const counts=recent.reduce((result,item)=>{result[item.state]=(result[item.state]||0)+1;return result;},{});
    $('reservation-counts').textContent=`${money(counts.pending||0)} در انتظار همگام‌سازی · ${money(counts.conflict||0)} نیازمند بررسی · ${money(counts.rejected||0)} ردشده · درخواست آفلاین تا تأیید سرور قطعی نیست`;
    $('reservation-connection').textContent=state?.health?.online?'متصل · بررسی پس از همگام‌سازی':'ذخیرهٔ محلی';
    $('reservation-connection').className=`pos-status ${state?.health?.online?'online':''}`;
    $('reservation-submit').disabled=!state?.paired;
    const states={pending:'در انتظار اتصال · غیرقطعی',synced:'درخواست در سرور ثبت شد',conflict:'نیازمند بررسی',rejected:'ثبت نشد'};
    $('reservation-commands').innerHTML=recent.length?recent.slice(0,30).map(item=>`<div class="workspace-command-row"><span><b>درخواست رزرو · ${esc(item.id.slice(0,8))}</b><small>${esc(item.error||item.createdAt||'')}</small></span><strong class="workspace-command-state ${esc(item.state)}">${states[item.state]||esc(item.state)}</strong></div>`).join(''):'<p class="muted">درخواستی در صف این دستگاه وجود ندارد.</p>';
  }
  function renderReservationTables(){
    const selected=$('reservation-table').value,tables=(catalog?.tables||[]).filter(table=>!table.operationalStatus||table.operationalStatus==='available');
    $('reservation-table').innerHTML='<option value="">انتخاب میز هنگام بررسی سرور</option>'+tables.map(table=>`<option value="${table.id}">${esc(table.name)}</option>`).join('');
    $('reservation-table').value=selected;
  }
  function renderWorkspaceCustomers(){
    const snapshot=workspaceCustomers,payload=snapshot?.payload;
    const sync=state?.workspaceCustomerSync;
    if(!snapshot||!payload){
      $('customers-sync').textContent=sync?.message||'داده‌ای دریافت نشده';
      $('customers-sync').className='pos-status';
      $('customers-state').textContent=sync?.message||'برای دریافت فهرست مشتریان، دستگاه را هنگام اتصال به اینترنت همگام‌سازی کنید.';
      $('customers-summary').innerHTML='';$('customers-list').innerHTML='';return;
    }
    const customers=Array.isArray(payload.customers)?payload.customers:[];
    const query=$('customers-search').value.trim().toLocaleLowerCase('fa-IR');
    const filtered=customers.filter(customer=>!query||`${customer.name||''} ${customer.phone||''}`.toLocaleLowerCase('fa-IR').includes(query));
    const totalSpent=customers.reduce((sum,customer)=>sum+Number(customer.totalSpent||0),0);
    const totalPoints=customers.reduce((sum,customer)=>sum+Number(customer.points||0),0);
    $('customers-sync').textContent=snapshot.expired?'نسخه منقضی · فقط مشاهده':`نسخه ${money(snapshot.revision)} · ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}`;
    $('customers-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('customers-state').textContent=`${money(payload.totalCustomers)} مشتری در نسخهٔ محلی · ${money(filtered.length)} نتیجه · آخرین دریافت ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}${sync?.message?` · ${sync.message}`:''}`;
    $('customers-summary').innerHTML=`<article><span>مشتریان ذخیره‌شده</span><b>${money(payload.totalCustomers)}</b></article><article><span>مجموع امتیاز ثبت‌شده</span><b>${money(totalPoints)}</b></article><article><span>مجموع خرید در snapshot</span><b>${money(totalSpent)} تومان</b></article>`;
    $('customers-list').innerHTML=filtered.length?`<table class="pos-table"><thead><tr><th>مشتری</th><th>تعداد سفارش</th><th>مجموع خرید</th><th>امتیاز</th><th>اعتبار کیف پول</th><th>آخرین خرید</th></tr></thead><tbody>${filtered.map(customer=>`<tr><td><b>${esc(customer.name)}</b><small dir="ltr">${esc(customer.phone)}</small></td><td>${money(customer.ordersCount)}</td><td>${money(customer.totalSpent)} تومان</td><td>${money(customer.points)}</td><td>${money(customer.walletBalance)} تومان</td><td>${customer.lastOrderAt?new Date(customer.lastOrderAt).toLocaleDateString('fa-IR'):'—'}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">مشتری‌ای با این جست‌وجو در نسخهٔ محلی پیدا نشد.</p>';
  }
  async function loadWorkspaceCustomers(){
    try{workspaceCustomers=await call('offline_workspace_customers');renderWorkspaceCustomers();}
    catch(error){$('customers-state').textContent=String(error);$('customers-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('customers-sync').className='pos-status offline';}
  }
  function inventoryExpiryDays(item,today){
    if(!item.expiryDate||Number(item.stock)<=0)return null;
    const expiry=Date.parse(`${item.expiryDate}T00:00:00Z`),current=Date.parse(`${today}T00:00:00Z`);
    return Number.isFinite(expiry)&&Number.isFinite(current)?Math.ceil((expiry-current)/86400000):null;
  }
  function renderWorkspaceInventory(){
    const snapshot=workspaceInventory,payload=snapshot?.payload,sync=state?.workspaceInventorySync;
    if(!snapshot||!payload){
      $('inventory-sync').textContent=sync?.message||'داده‌ای دریافت نشده';$('inventory-sync').className='pos-status';
      $('inventory-state').textContent=sync?.message||'برای دریافت فهرست انبار، دستگاه را هنگام اتصال به اینترنت همگام‌سازی کنید.';
      $('inventory-summary').innerHTML='';$('inventory-list').innerHTML='';$('inventory-movements').innerHTML='';return;
    }
    const items=Array.isArray(payload.items)?payload.items:[],warehouses=Array.isArray(payload.warehouses)?payload.warehouses:[],movements=Array.isArray(payload.movements)?payload.movements:[];
    const warehouseById=new Map(warehouses.map(warehouse=>[warehouse.id,warehouse.name]));
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const lowItems=items.filter(item=>item.isActive&&item.trackStock&&Number(item.stock)<=Number(item.minStock));
    const expiringItems=items.filter(item=>{const days=inventoryExpiryDays(item,today);return item.isActive&&days!==null&&days<=30;});
    const query=$('inventory-search').value.trim().toLocaleLowerCase('fa-IR'),filter=$('inventory-filter').value;
    const visible=items.filter(item=>{
      const matchesText=!query||`${item.name||''} ${item.sku||''} ${warehouseById.get(item.warehouseId)||''}`.toLocaleLowerCase('fa-IR').includes(query);
      const days=inventoryExpiryDays(item,today),matchesFilter=filter==='low'?item.isActive&&item.trackStock&&Number(item.stock)<=Number(item.minStock):filter==='expiry'?item.isActive&&days!==null&&days<=30:true;
      return matchesText&&matchesFilter;
    });
    const expiringIds=new Set(expiringItems.map(item=>item.id)),lowIds=new Set(lowItems.map(item=>item.id));
    $('inventory-sync').textContent=snapshot.expired?'نسخه منقضی · فقط مشاهده':`نسخه ${money(snapshot.revision)} · ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}`;
    $('inventory-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('inventory-state').textContent=`${money(payload.totalItems)} قلم کالا · ${money(visible.length)} نتیجه · ${money(movements.length)} گردش اخیر · آخرین دریافت ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}${sync?.message?` · ${sync.message}`:''}`;
    $('inventory-summary').innerHTML=`<article><span>کالاهای ثبت‌شده</span><b>${money(payload.totalItems)}</b></article><article><span>نیازمند تأمین</span><b>${money(lowItems.length)}</b></article><article><span>نزدیک انقضا / منقضی</span><b>${money(expiringItems.length)}</b></article>`;
    $('inventory-list').innerHTML=visible.length?`<table class="pos-table inventory-table"><thead><tr><th>کالا</th><th>انبار</th><th>موجودی / حداقل</th><th>هشدار</th><th>انقضا</th><th>بهای واحد</th></tr></thead><tbody>${visible.map(item=>{const days=inventoryExpiryDays(item,today),isLow=lowIds.has(item.id),isExpiring=expiringIds.has(item.id),warning=isLow&&isExpiring?'کمبود · انقضا':isLow?'کمبود':isExpiring?'انقضا':item.isActive?'عادی':'غیرفعال';return `<tr><td><b>${esc(item.name)}</b><small>${esc(item.sku||'بدون کد')}</small></td><td>${esc(warehouseById.get(item.warehouseId)||'انبار اصلی')}</td><td>${money(item.stock)} ${esc(item.unit)}<small>حداقل ${money(item.minStock)} ${esc(item.unit)}</small></td><td><span class="inventory-badge ${isLow||isExpiring?'warning':item.isActive?'':'muted'}">${warning}</span></td><td>${item.expiryDate?`${new Date(`${item.expiryDate}T12:00:00Z`).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'})}${days!==null&&days<=30?`<small>${days<0?'گذشته از تاریخ':days===0?'امروز':`${money(days)} روز مانده`}</small>`:''}`:'—'}</td><td>${money(item.costPerUnit)} تومان / ${esc(item.unit)}</td></tr>`}).join('')}</tbody></table>`:'<p class="muted">کالایی با این جست‌وجو یا فیلتر در نسخهٔ محلی پیدا نشد.</p>';
    const itemNameById=new Map(items.map(item=>[item.id,item.name]));
    const movementLabels={in:'ورود',out:'خروج',waste:'ضایعات',adjust:'اصلاح',sale:'مصرف فروش',transfer:'انتقال'};
    $('inventory-movements').innerHTML=movements.length?`<table class="pos-table inventory-table"><thead><tr><th>زمان</th><th>کالا</th><th>نوع</th><th>مقدار</th><th>مانده پس از گردش</th><th>مبلغ</th></tr></thead><tbody>${movements.map(movement=>`<tr><td>${new Date(movement.createdAt).toLocaleString('fa-IR')}</td><td>${esc(itemNameById.get(movement.itemId)||`کالای ${movement.itemId}`)}</td><td>${movementLabels[movement.type]||esc(movement.type)}</td><td>${Number(movement.delta)>0?'+':''}${money(movement.delta)}</td><td>${money(movement.balanceAfter)}</td><td>${money(movement.amount)} تومان</td></tr>`).join('')}</tbody></table>`:'<p class="muted">گردشی در نسخهٔ محلی موجود نیست.</p>';
  }
  async function loadWorkspaceInventory(){
    try{workspaceInventory=await call('offline_workspace_inventory');renderWorkspaceInventory();}
    catch(error){$('inventory-state').textContent=String(error);$('inventory-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('inventory-sync').className='pos-status offline';}
  }
  function renderWorkspaceOrders(){
    const snapshot=workspaceOrders,payload=snapshot?.payload,sync=state?.workspaceOrdersSync;
    if(!snapshot||!payload){
      $('server-orders-sync').textContent=sync?.message||'در انتظار دریافت';$('server-orders-sync').className='pos-status offline';
      $('server-orders-state').textContent=sync?.message||'برای دیدن سفارش‌های سایت در زمان قطعی، دستگاه را هنگام اتصال به اینترنت همگام‌سازی کنید.';
      $('server-orders-list').innerHTML='';serverOrderSales=[];return;
    }
    const orders=Array.isArray(payload.orders)?payload.orders:[];
    const statusLabels={pending:'در انتظار',preparing:'در حال آماده‌سازی',ready:'آماده',served:'تحویل‌شده',paid:'پرداخت‌شده',canceled:'لغوشده',confirmed:'تأییدشده'};
    const paymentLabels={paid:'پرداخت‌شده',unpaid:'پرداخت‌نشده',partial:'پرداخت بخشی',pending:'در انتظار پرداخت',failed:'ناموفق',refunded:'بازپرداخت'};
    const deliveryLabels={none:'ارسال ندارد',assigned:'پیک تخصیص یافت',picked_up:'تحویل پیک شد',delivered:'تحویل مشتری شد',not_home:'مشتری در محل نبود',failed:'ارسال ناموفق'};
    serverOrderSales=orders.map(order=>{
      const breakdown=order.paymentBreakdown;
      const tender=breakdown?{cashAmount:breakdown.cashAmount||0,bankAmount:breakdown.bankAmount||0,bankAccountName:breakdown.bankAccountName,posAmount:breakdown.posAmount||0,posDeviceId:breakdown.posDeviceId,posDeviceName:breakdown.posDeviceName,posBankAccountName:breakdown.posBankAccountName,posTerminalNumber:breakdown.posTerminalNumber,posRefNo:breakdown.posRefNo,creditAmount:breakdown.creditAmount||0}:null;
      const details={...order,status:statusLabels[order.status]||order.status,deliveryStatus:deliveryLabels[order.deliveryStatus]||order.deliveryStatus,paymentStatus:paymentLabels[order.paymentStatus]||order.paymentStatus,tender,items:(order.items||[]).map(item=>({productName:item.name,name:item.name,optionNames:(item.optionSnapshot||[]).map(option=>option.optionName),unitPrice:item.price,quantity:item.quantity,weightGrams:item.weightGrams,netWeightGrams:item.weightGrams,tareGrams:item.tareGrams,amount:item.lineTotal,note:item.note}))};
      return {id:`server-${order.id}`,number:order.number,total:order.total,paid:order.paymentStatus==='paid',state:'synced',error:'',at:order.createdAt,details};
    });
    const updated=new Date(snapshot.issuedAt).toLocaleString('fa-IR');
    $('server-orders-sync').textContent=snapshot.expired?'نسخهٔ قدیمی · فقط مشاهده':`آخرین دریافت ${updated}`;$('server-orders-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('server-orders-state').textContent=`${money(payload.totalOrders)} سفارش در نسخهٔ محلی · آخرین دریافت ${updated}${sync?.message?` · ${sync.message}`:''}`;
    $('server-orders-list').innerHTML=orders.length?`<table class="pos-table server-orders-table"><thead><tr><th>شماره</th><th>زمان</th><th>نوع</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت سفارش</th><th>جزئیات</th></tr></thead><tbody>${orders.map((order,index)=>`<tr><td><b>#${money(order.number)}</b></td><td>${new Date(order.createdAt).toLocaleString('fa-IR')}</td><td>${order.type==='dine_in'?'داخل سالن':'بیرون‌بر'}${order.tableName?`<small>${esc(order.tableName)}</small>`:''}</td><td>${money(order.total)} تومان</td><td><span class="pos-badge ${order.paymentStatus==='paid'?'synced':'conflict'}">${paymentLabels[order.paymentStatus]||esc(order.paymentStatus)}</span></td><td>${statusLabels[order.status]||esc(order.status)}</td><td><button class="button secondary" data-server-order="${index}">جزئیات</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">سفارشی در آخرین نسخهٔ دریافت‌شده وجود ندارد.</p>';
  }
  async function loadWorkspaceOrders(){
    try{workspaceOrders=await call('offline_workspace_orders');workspaceOrdersLoaded=true;renderWorkspaceOrders();}
    catch(error){workspaceOrdersLoaded=true;$('server-orders-state').textContent=String(error);$('server-orders-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('server-orders-sync').className='pos-status offline';}
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
  function checkout(id=null){payingId=id;const s=id?allSales().find(s=>s.id===id):null;const due=s?s.total:total;$('pos-payment-total').textContent='مبلغ فاکتور: '+money(due)+' تومان';$('pos-payment-form').dataset.total=String(due);$('pos-method').value='cash';$('pos-method').querySelector('[value=unpaid]').disabled=!!id;$('pos-cash').value=String(due);$('pos-ref').value='';$('pos-payment-error').textContent='';paymentFields();$('pos-checkout-dialog').showModal();}
  function paymentFields(){const method=$('pos-method').value;const due=Number($('pos-payment-form').dataset.total);$('pos-payment-fields').hidden=method==='unpaid';$('pos-cash-label').hidden=method!=='mixed';$('pos-bank-fields').hidden=!['pos','mixed'].includes(method);$('pos-card-amount').textContent='مبلغ کارتخوان: '+money(due-(method==='mixed'?Number(digits($('pos-cash').value)):0))+' تومان';}
  $('pos-payment-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('pos-submit').disabled=true;try{const method=$('pos-method').value,due=Number(e.target.dataset.total);const cash=method==='cash'?due:method==='mixed'?Number(digits($('pos-cash').value)):0;const tender=method==='unpaid'?null:{cashAmount:cash,posAmount:due-cash,posDeviceId:method==='cash'?null:Number($('pos-terminal').value),posRefNo:method==='cash'?'':digits($('pos-ref').value.trim())};if(payingId){await call('offline_pay',{id:payingId,tender});const old=historyOlder.find(item=>item.id===payingId);if(old){old.paid=!!tender;old.details={...old.details,tender,paid:!!tender};}}else{await call('offline_save',{sale:{...draft(),tender}});cart=[];draftId=crypto.randomUUID();$('pos-customer').value='';$('pos-phone').value='';$('pos-note').value='';await call('offline_draft',{draft:draft()});await renderCart();}$('pos-checkout-dialog').close();notify('با موفقیت در پایگاه محلی ذخیره شد');await refresh();}catch(error){$('pos-payment-error').textContent=error;}finally{busy=false;$('pos-submit').disabled=false;}};
  async function routes(){const bridge=await call('bridge_status');const config=bridge.config?JSON.parse(bridge.config):{devices:[]};$('pos-routes').innerHTML=config.devices.filter(d=>d.kind==='printer').map(d=>{const saved=state.routes.find(r=>r.code===d.code);return `<div class="pos-route" data-code="${esc(d.code)}"><b>${esc(d.name||d.code)}</b><select aria-label="نقش چاپگر"><option value="">غیرفعال در صندوق محلی</option><option value="customer" ${saved?.kind==='customer'?'selected':''}>فیش مشتری</option><option value="kitchen" ${saved?.kind==='kitchen'?'selected':''}>آشپزخانه / بار</option></select><div class="pos-route-cats">${(catalog?.categories||[]).map(c=>`<label><input type="checkbox" value="${c.id}" ${saved?.categoryIds.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</div></div>`}).join('')||'<p class="muted">ابتدا چاپگر را در تب تجهیزات تنظیم کنید.</p>';$('pos-pager').innerHTML=config.devices.filter(d=>d.kind==='pager').map(d=>`<option value="${esc(d.code)}">${esc(d.name||d.code)}</option>`).join('');}
  $('pos-route-save').onclick=async()=>{try{const routes=[...$('pos-routes').querySelectorAll('[data-code]')].filter(r=>r.querySelector('select').value).map(r=>({code:r.dataset.code,kind:r.querySelector('select').value,categoryIds:[...r.querySelectorAll('input:checked')].map(c=>Number(c.value))}));await call('offline_routes',{routes});notify('مسیرهای چاپ ذخیره شد');await refresh();}catch(e){notify(e,true);}};
  $('pos-pair-toggle').onclick=()=>{showPairPanel=!showPairPanel;$('pos-pair-card').hidden=state?.paired&&state.localManagerPinConfigured&&!showPairPanel;if(showPairPanel)$('pos-pair-pin').focus();};
  $('pos-pair').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const managerPin=digits($('pos-pair-pin').value);await call('offline_pair',{content:await file.text(),managerPin});$('pos-pair-pin').value='';showPairPanel=false;await call('offline_refresh');notify('اتصال و PIN مدیر محلی ذخیره شد؛ دریافت منو در حال انجام است');await refresh();}catch(error){notify(error,true);}finally{e.target.value='';}};
  $('pos-backup').onclick=async()=>{try{notify('پشتیبان ذخیره شد: '+await call('offline_backup'));}catch(e){notify(e,true);}};
  $('pos-refresh').onclick=async()=>{try{await call('offline_refresh');notify('درخواست به‌روزرسانی ثبت شد');await routes();}catch(e){notify(e,true);}};
  $('pos-ring').onclick=async()=>{try{await call('offline_ring',{code:$('pos-pager').value,number:Number($('pos-pager-number').value)});notify('فرمان به فرستنده پیجر ارسال شد؛ پاسخ فیزیکی را بررسی کنید');}catch(e){notify(e,true);}};
  $('pos-products').onclick=e=>{const b=e.target.closest('[data-product]');if(b)product(Number(b.dataset.product));};
  $('pos-cart-lines').onclick=async e=>{const b=e.target.closest('[data-remove]');if(b){cart.splice(Number(b.dataset.remove),1);await renderCart();}};
  $('pos-history').onclick=async e=>{try{const details=e.target.closest('[data-details]'),pay=e.target.closest('[data-pay]'),retry=e.target.closest('[data-retry]');if(details)showSaleDetails(details.dataset.details);if(pay)checkout(pay.dataset.pay);if(retry){await call('offline_retry',{id:retry.dataset.retry});const old=historyOlder.find(item=>item.id===retry.dataset.retry);if(old){old.state='pending';old.error='';}await refresh();}}catch(error){notify(error,true);}};
  $('pos-history-more').onclick=async()=>{try{const page=await call('offline_history',{offset:state.sales.length+historyOlder.length});historyOlder.push(...page.sales);historyHasMore=page.hasMore;renderSalesHistory();}catch(error){notify(error,true);}};
  $('server-orders-list').onclick=e=>{const button=e.target.closest('[data-server-order]');if(button){const sale=serverOrderSales[Number(button.dataset.serverOrder)];if(sale)showSaleDetails(sale.id,sale);}};
  $('server-orders-refresh').onclick=async()=>{try{await call('offline_refresh');$('server-orders-state').textContent='درخواست دریافت snapshot تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق قابل مشاهده می‌ماند.';}catch(error){notify(error,true);}};
  $('pos-prints').onclick=async e=>{const b=e.target.closest('[data-print]');if(b&&confirm('ممکن است فیش قبلاً چاپ شده باشد. پس از بررسی خروج کاغذ، دوباره ارسال شود؟')){try{await call('offline_retry_print',{id:Number(b.dataset.print)});await refresh();}catch(error){notify(error,true);}}};
  $('pos-search').oninput=renderProducts;$('pos-category').onchange=renderProducts;$('pos-method').onchange=paymentFields;$('pos-cash').oninput=()=>{const n=digits($('pos-cash').value);$('pos-cash').value=/^\d*$/.test(n)?Number(n||0).toLocaleString('en-US'):n;paymentFields();};$('pos-checkout').onclick=()=>checkout();
  const jalaliFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
  const jalaliLocalFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'});
  function jalaliToGregorian(value){
    const parts=digits(value).split(/[/-]/).map(Number);if(parts.length!==3)return null;
    const [year,month,day]=parts;if(year<1300||year>1500||month<1||month>12||day<1||day>31)return null;
    const target=[year,month,day],dayMs=86400000;
    const compare=ordinal=>{const values={};for(const part of jalaliFormatter.formatToParts(new Date(ordinal*dayMs)))if(part.type==='year'||part.type==='month'||part.type==='day')values[part.type]=Number(part.value);const current=[values.year,values.month,values.day];for(let i=0;i<3;i++){if(current[i]!==target[i])return current[i]<target[i]?-1:1;}return 0;};
    let low=Math.floor(Date.UTC(year+620,0,1)/dayMs),high=Math.floor(Date.UTC(year+623,0,1)/dayMs);
    while(low<=high){const middle=Math.floor((low+high)/2),order=compare(middle);if(order===0){const date=new Date(middle*dayMs);return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate()};}if(order<0)low=middle+1;else high=middle-1;}
    return null;
  }
  function setReservationDefaults(){
    const suggested=new Date(Date.now()+90*60*1000);suggested.setMinutes(0,0,0);const parts={};for(const part of jalaliLocalFormatter.formatToParts(suggested))if(part.type==='year'||part.type==='month'||part.type==='day')parts[part.type]=part.value;
    $('reservation-date').value=parts.year+'/'+String(parts.month).padStart(2,'0')+'/'+String(parts.day).padStart(2,'0');$('reservation-time').value=String(suggested.getHours()).padStart(2,'0')+':'+String(suggested.getMinutes()).padStart(2,'0');
  }
  setReservationDefaults();
  $('reservation-form').onsubmit=async event=>{
    event.preventDefault();const button=$('reservation-submit');if(button.disabled)return;button.disabled=true;$('reservation-error').textContent='';
    const phone=digits($('reservation-phone').value).replace(/\D/g,''),jalali=jalaliToGregorian($('reservation-date').value),time=$('reservation-time').value.split(':').map(Number);
    const startsAt=jalali&&time.length===2?new Date(jalali.year,jalali.month-1,jalali.day,time[0],time[1]):new Date(NaN);
    if(phone.length<10||phone.length>15||!Number.isFinite(startsAt.getTime())||startsAt.getTime()<Date.now()+30*60*1000||startsAt.getTime()>Date.now()+90*86400000){$('reservation-error').textContent='شماره موبایل یا تاریخ و ساعت شمسی معتبر نیست؛ زمان باید از ۳۰ دقیقهٔ آینده تا ۹۰ روز بعد باشد.';button.disabled=false;return;}
    const payload={name:$('reservation-name').value.trim(),phone,guestCount:Number($('reservation-guests').value),startsAt:startsAt.toISOString(),note:$('reservation-note').value.trim(),reservationType:$('reservation-type').value,tableId:$('reservation-table').value?Number($('reservation-table').value):null};
    try{await call('offline_reservation_create',{payload});$('reservation-form').reset();$('reservation-guests').value='2';setReservationDefaults();notify('درخواست روی همین دستگاه ذخیره شد؛ رزرو پس از اتصال و بررسی سرور تأیید می‌شود.');await refresh();}
    catch(error){$('reservation-error').textContent=String(error);}
    finally{button.disabled=!state?.paired;}
  };
  $('pos-clear').onclick=async()=>{if(cart.length&&confirm('سبد جاری خالی شود؟')){cart=[];draftId=crypto.randomUUID();await renderCart();}};
  ['pos-type','pos-table','pos-customer','pos-phone','pos-note'].forEach(id=>$(id).addEventListener('input',()=>{persist();}));
  $('customers-search').oninput=renderWorkspaceCustomers;
  $('customers-refresh').onclick=async()=>{try{await call('offline_refresh');await loadWorkspaceCustomers();notify('درخواست دریافت تازهٔ فهرست مشتریان ثبت شد.');}catch(error){notify(error,true);}};
  $('inventory-search').oninput=renderWorkspaceInventory;$('inventory-filter').onchange=renderWorkspaceInventory;
  $('inventory-refresh').onclick=async()=>{try{await call('offline_refresh');await loadWorkspaceInventory();notify('درخواست دریافت تازهٔ موجودی و گردش‌ها ثبت شد.');}catch(error){notify(error,true);}};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  function selectDesktopTab(tab){
    const selected={pos:'pos-app',menu:'workspace-menu-app',customers:'customers-app',inventory:'inventory-app',reservations:'reservations-app',hardware:'hardware-app'};
    Object.entries(selected).forEach(([key,id])=>{$(id).hidden=key!==tab;$(`tab-${key}`).classList.toggle('selected',key===tab);});
    if(tab==='pos'){void routes();void loadWorkspaceOrders();}if(tab==='menu')void loadWorkspaceMenu();if(tab==='customers')void loadWorkspaceCustomers();if(tab==='inventory')void loadWorkspaceInventory();if(tab==='reservations'){renderReservationTables();renderWorkspaceReservations();}
  }
  $('tab-pos').onclick=()=>selectDesktopTab('pos');$('tab-menu').onclick=()=>selectDesktopTab('menu');$('tab-customers').onclick=()=>selectDesktopTab('customers');$('tab-inventory').onclick=()=>selectDesktopTab('inventory');$('tab-reservations').onclick=()=>selectDesktopTab('reservations');$('tab-hardware').onclick=()=>selectDesktopTab('hardware');
  $('workspace-menu-refresh').onclick=async()=>{try{await call('offline_refresh');$('workspace-menu-state').textContent='درخواست دریافت snapshot تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};$('workspace-menu-search').oninput=renderWorkspaceMenu;$('workspace-menu-category').onchange=renderWorkspaceMenu;
  void refresh();setInterval(()=>void refresh(),5000);
})();
