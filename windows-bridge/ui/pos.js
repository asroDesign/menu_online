(() => {
  const call = window.__TAURI__.core.invoke;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('fa-IR');
  const digits = value => String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g,'');
  let state, catalog, workspaceMenu, workspaceCustomers, workspaceInventory, workspaceOrders, workspaceOrdersLoaded=false, workspaceReservations, workspaceReservationsLoaded=false, workspaceShifts, workspaceShiftsLoaded=false, workspaceAccounting, workspaceAccountingLoaded=false, workspaceReceivables, workspaceReceivablesLoaded=false, workspaceCashShifts, workspaceCashShiftsLoaded=false, workspaceReports, workspaceReportsLoaded=false, workspaceCheques, workspaceChequesLoaded=false, workspaceReceivablesMetaKey='', workspaceReceivablesSyncKey='', workspaceCashShiftsMetaKey='', workspaceCashShiftsSyncKey='', workspaceReportsMetaKey='', workspaceReportsSyncKey='', workspaceChequesMetaKey='', workspaceChequesSyncKey='', workspaceSyncKey='', workspaceCustomerMetaKey='', workspaceCustomerSyncKey='', workspaceInventoryMetaKey='', workspaceInventorySyncKey='', workspaceOrdersMetaKey='', workspaceOrdersSyncKey='', workspaceOrderHistorySyncKey='', workspaceReservationsMetaKey='', workspaceReservationsSyncKey='', workspaceShiftsMetaKey='', workspaceShiftsSyncKey='', workspaceAccountingMetaKey='', workspaceAccountingSyncKey='', workspaceCommandsKey='', showPairPanel=false, cart=[], draftId=crypto.randomUUID(), total=0, chosen, payingId=null, activeInventoryWasteItem=null, activeInventoryMovement=null, activeInventoryTransferDecision=null, activeReservationStatus=null, activeReceivablePayment=null, activeChequeStatus=null, inventoryPaidEdited=false, busy=false, ready=false, timer, toastTimer, historyOlder=[], historyHasMore=true, historyNewestId=null, serverOrderSales=[];
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
      const localReservationsMeta=state.workspaceSnapshots?.find(item=>item.dataset==='reservations');
      const localShiftsMeta=state.workspaceSnapshots?.find(item=>item.dataset==='shifts');
      const localAccountingMeta=state.workspaceSnapshots?.find(item=>item.dataset==='accounting');
      const localReceivablesMeta=state.workspaceSnapshots?.find(item=>item.dataset==='receivables');
      const localCashShiftsMeta=state.workspaceSnapshots?.find(item=>item.dataset==='cash_shifts');
      const localReportsMeta=state.workspaceSnapshots?.find(item=>item.dataset==='reports');
      const localChequesMeta=state.workspaceSnapshots?.find(item=>item.dataset==='cheques');
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
      const nextOrderHistorySync=JSON.stringify([state.workspaceOrderHistorySync||null,state.workspaceOrderHistoryError||null]),orderHistorySyncChanged=nextOrderHistorySync!==workspaceOrderHistorySyncKey;workspaceOrderHistorySyncKey=nextOrderHistorySync;
      const nextReservationsMeta=JSON.stringify(localReservationsMeta||null),reservationsMetaChanged=nextReservationsMeta!==workspaceReservationsMetaKey;workspaceReservationsMetaKey=nextReservationsMeta;
      const nextReservationsSync=JSON.stringify(state.workspaceReservationsSync||null),reservationsSyncChanged=nextReservationsSync!==workspaceReservationsSyncKey;workspaceReservationsSyncKey=nextReservationsSync;
      const nextShiftsMeta=JSON.stringify(localShiftsMeta||null),shiftsMetaChanged=nextShiftsMeta!==workspaceShiftsMetaKey;workspaceShiftsMetaKey=nextShiftsMeta;
      const nextShiftsSync=JSON.stringify(state.workspaceShiftsSync||null),shiftsSyncChanged=nextShiftsSync!==workspaceShiftsSyncKey;workspaceShiftsSyncKey=nextShiftsSync;
      const nextAccountingMeta=JSON.stringify(localAccountingMeta||null),accountingMetaChanged=nextAccountingMeta!==workspaceAccountingMetaKey;workspaceAccountingMetaKey=nextAccountingMeta;
      const nextAccountingSync=JSON.stringify(state.workspaceAccountingSync||null),accountingSyncChanged=nextAccountingSync!==workspaceAccountingSyncKey;workspaceAccountingSyncKey=nextAccountingSync;
      const nextReceivablesMeta=JSON.stringify(localReceivablesMeta||null),receivablesMetaChanged=nextReceivablesMeta!==workspaceReceivablesMetaKey;workspaceReceivablesMetaKey=nextReceivablesMeta;
      const nextReceivablesSync=JSON.stringify(state.workspaceReceivablesSync||null),receivablesSyncChanged=nextReceivablesSync!==workspaceReceivablesSyncKey;workspaceReceivablesSyncKey=nextReceivablesSync;
      const nextCashShiftsMeta=JSON.stringify(localCashShiftsMeta||null),cashShiftsMetaChanged=nextCashShiftsMeta!==workspaceCashShiftsMetaKey;workspaceCashShiftsMetaKey=nextCashShiftsMeta;
      const nextCashShiftsSync=JSON.stringify(state.workspaceCashShiftsSync||null),cashShiftsSyncChanged=nextCashShiftsSync!==workspaceCashShiftsSyncKey;workspaceCashShiftsSyncKey=nextCashShiftsSync;
      const nextReportsMeta=JSON.stringify(localReportsMeta||null),reportsMetaChanged=nextReportsMeta!==workspaceReportsMetaKey;workspaceReportsMetaKey=nextReportsMeta;
      const nextReportsSync=JSON.stringify(state.workspaceReportsSync||null),reportsSyncChanged=nextReportsSync!==workspaceReportsSyncKey;workspaceReportsSyncKey=nextReportsSync;
      const nextChequesMeta=JSON.stringify(localChequesMeta||null),chequesMetaChanged=nextChequesMeta!==workspaceChequesMetaKey;workspaceChequesMetaKey=nextChequesMeta;
      const nextChequesSync=JSON.stringify(state.workspaceChequesSync||null),chequesSyncChanged=nextChequesSync!==workspaceChequesSyncKey;workspaceChequesSyncKey=nextChequesSync;
      renderWorkspaceCommands();
      renderWorkspaceReservations();
      renderWorkspaceAccountingCommands();
      if(!$('inventory-app').hidden){renderWorkspaceInventoryWasteRequests();renderWorkspaceInventoryTransfers();}
      if(!$('workspace-menu-app').hidden&&((localMenuMeta&&(!workspaceMenu||workspaceMenu.revision!==localMenuMeta.revision||workspaceMenu.validUntil!==localMenuMeta.validUntil))||workspaceSyncChanged||workspaceCommandsChanged))void loadWorkspaceMenu();
      if(!$('customers-app').hidden&&(customerMetaChanged||customerSyncChanged||!workspaceCustomers))void loadWorkspaceCustomers();
      if(!$('inventory-app').hidden&&(inventoryMetaChanged||inventorySyncChanged||workspaceCommandsChanged||!workspaceInventory))void loadWorkspaceInventory();
      if(!$('pos-app').hidden&&(ordersMetaChanged||ordersSyncChanged||orderHistorySyncChanged||!workspaceOrdersLoaded))void loadWorkspaceOrders(0,Math.max(100,workspaceOrders?.payload?.orders?.length||0));
      if(!$('reservations-app').hidden&&(reservationsMetaChanged||reservationsSyncChanged||!workspaceReservationsLoaded))void loadWorkspaceReservations();
      if(!$('shifts-app').hidden&&(shiftsMetaChanged||shiftsSyncChanged||workspaceCommandsChanged||!workspaceShiftsLoaded))void loadWorkspaceShifts();
      if(!$('accounting-app').hidden&&(accountingMetaChanged||accountingSyncChanged||workspaceCommandsChanged||!workspaceAccountingLoaded))void loadWorkspaceAccounting();
      if(!$('receivables-app').hidden&&(receivablesMetaChanged||receivablesSyncChanged||workspaceCommandsChanged||!workspaceReceivablesLoaded))void loadWorkspaceReceivables();
      if(!$('cash-shifts-app').hidden&&(cashShiftsMetaChanged||cashShiftsSyncChanged||!workspaceCashShiftsLoaded))void loadWorkspaceCashShifts();
      if(!$('reports-app').hidden&&(reportsMetaChanged||reportsSyncChanged||!workspaceReportsLoaded))void loadWorkspaceReports();
      if(!$('cheques-app').hidden&&(chequesMetaChanged||chequesSyncChanged||workspaceCommandsChanged||!workspaceChequesLoaded))void loadWorkspaceCheques();
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
      if(!['update_product','update_category'].includes(change.action))continue;
      const payload=change.payload||{},isProduct=change.action==='update_product',id=isProduct?payload.productId:payload.categoryId;
      const rows=isProduct?view.products:view.categories,item=rows.find(row=>row.id===id);
      if(item&&change.state==='pending'){Object.assign(item,payload.patch||{});item.localChange=change;}
    }
    return view;
  }
  function canEditLocalMenu(){return !!state?.localManagerPinConfigured&&!workspaceMenu?.expired;}
  function renderWorkspaceMenu(){
    const payload=workspaceMenuView();
    if(!payload){$('workspace-menu-products').innerHTML='';$('workspace-menu-categories').innerHTML='';$('workspace-menu-product-create').disabled=true;$('workspace-menu-category-create').disabled=true;return;}
    const q=$('workspace-menu-search').value.trim().toLocaleLowerCase('fa-IR'),category=$('workspace-menu-category').value,editable=canEditLocalMenu();
    $('workspace-menu-product-create').disabled=!editable;$('workspace-menu-category-create').disabled=!editable;
    const products=payload.products.filter(p=>(!q||`${p.name} ${p.description}`.toLocaleLowerCase('fa-IR').includes(q))&&(!category||String(p.categoryId??'')===category));
    $('workspace-menu-products').innerHTML=products.length?products.map(p=>{const categoryName=payload.categories.find(c=>c.id===p.categoryId)?.name||'بدون دسته';const pending=p.localChange;return `<article class="workspace-product"><div><span class="workspace-product-category">${esc(categoryName)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description||'توضیحی ثبت نشده است')}</p></div><div class="workspace-product-meta"><b>${money(p.price)} تومان${p.sellingMode==='weight'?' / کیلو':''}</b><span class="${p.isAvailable?'workspace-available':'workspace-unavailable'}">${p.isAvailable?'موجود برای سفارش':'فعلاً ناموجود'}</span></div><div class="workspace-product-actions">${pending?'<span class="workspace-pending-label">تغییر محلی در صف ارسال است</span>':'<span></span>'}<button class="button secondary" data-edit-menu="product" data-id="${p.id}" ${!editable||pending?'disabled':''}>ویرایش</button></div></article>`}).join(''):'<p class="muted">محصولی در این دسته یا جست‌وجو پیدا نشد.</p>';
    $('workspace-menu-categories').innerHTML=payload.categories.length?payload.categories.map(c=>{const pending=c.localChange;return `<article class="workspace-category-row"><div><h3>${esc(c.name)}</h3><p>${esc(c.description||'توضیحی ثبت نشده است')} · ${c.isActive?'فعال':'غیرفعال'} · ترتیب ${money(c.sortOrder)}</p>${pending?'<small class="workspace-pending-label">تغییر محلی در صف ارسال است</small>':''}</div><button class="button secondary" data-edit-menu="category" data-id="${c.id}" ${!editable||pending?'disabled':''}>ویرایش</button></article>`}).join(''):'<p class="muted">دسته‌بندی‌ای در snapshot منو موجود نیست.</p>';
  }
  function renderWorkspaceCommands(){
    const summary=state?.workspaceCommands||{},recent=(summary.recent||[]).filter(item=>item.module==='menu');
    $('workspace-menu-command-counts').textContent=`${money(summary.pending||0)} در صف · ${money(summary.conflicts||0)} نیازمند بررسی · ${money(summary.rejected||0)} ردشده`;
    const labels={update_product:'ویرایش محصول',update_category:'ویرایش دسته‌بندی',create_product:'ایجاد محصول',create_category:'ایجاد دسته‌بندی'},states={pending:'در صف ارسال',conflict:'نیازمند بررسی',rejected:'ردشده',synced:'همگام شد'};
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
  function renderWorkspaceAccountingCommands(){
    const summary=state?.workspaceCommands||{},recent=(summary.recent||[]).filter(item=>item.module==='accounting');
    const states={pending:'در انتظار اتصال',conflict:'نیازمند بررسی',rejected:'رد شد',synced:'ثبت شد'};
    $('accounting-commands').innerHTML=recent.length?recent.slice(0,30).map(item=>`<div class="workspace-command-row"><span><b>سند عمومی · ${esc(item.id.slice(0,8))}</b><small>${esc(item.error||item.createdAt||'')}</small></span><strong class="workspace-command-state ${esc(item.state)}">${states[item.state]||esc(item.state)}</strong></div>`).join(''):'<p class="muted">سند آفلاینی در صف نیست.</p>';
  }
  function activeAccountingAccounts(){return (workspaceAccounting?.payload?.accounts||[]).filter(account=>account.isActive&&account.level!=='kol');}
  function appendAccountingLine(){
    const accounts=activeAccountingAccounts(),tbody=$('accounting-lines');
    const row=document.createElement('tr');
    row.innerHTML=`<td><select data-account required aria-label="حساب سند"><option value="">انتخاب حساب</option>${accounts.map(account=>`<option value="${account.id}">${esc(account.code)} · ${esc(account.name)} (${account.level==='tafsili'?'تفصیلی':'معین'})</option>`).join('')}</select></td><td><input data-debit inputmode="numeric" value="0" aria-label="بدهکار به تومان"></td><td><input data-credit inputmode="numeric" value="0" aria-label="بستانکار به تومان"></td><td><input data-line-description maxlength="200" aria-label="شرح ردیف" placeholder="اختیاری"></td><td><button class="text-button" data-remove-accounting-line type="button" aria-label="حذف ردیف">حذف</button></td>`;
    tbody.append(row);renderAccountingTotals();
  }
  function accountingLineAmounts(){
    return [...$('accounting-lines').querySelectorAll('tr')].map(row=>({
      accountId:Number(row.querySelector('[data-account]').value),
      debit:Number(digits(row.querySelector('[data-debit]').value)||0),
      credit:Number(digits(row.querySelector('[data-credit]').value)||0),
      description:row.querySelector('[data-line-description]').value.trim(),
    }));
  }
  function renderAccountingTotals(){
    const lines=accountingLineAmounts(),debit=lines.reduce((sum,line)=>sum+line.debit,0),credit=lines.reduce((sum,line)=>sum+line.credit,0);
    const valid=!!workspaceAccounting?.payload&&!workspaceAccounting.expired&&lines.length>=2&&lines.every(line=>line.accountId>0&&Number.isSafeInteger(line.debit)&&Number.isSafeInteger(line.credit)&&line.debit>=0&&line.credit>=0&&!(line.debit>0&&line.credit>0))&&debit>0&&debit===credit;
    $('accounting-debit-total').textContent=money(debit);$('accounting-credit-total').textContent=money(credit);
    $('accounting-balance-state').textContent=debit===credit&&debit>0?'سند تراز است':'تراز نشده';$('accounting-balance-state').className=valid?'accounting-balanced':'accounting-unbalanced';
    $('accounting-submit').disabled=!valid||!state?.paired;
  }
  function renderWorkspaceAccounting(){
    const snapshot=workspaceAccounting,payload=snapshot?.payload,sync=state?.workspaceAccountingSync;
    if(!snapshot||!payload){
      $('accounting-sync').textContent=sync?.message||'snapshot دریافت نشده';$('accounting-sync').className='pos-status offline';
      $('accounting-state').textContent=sync?.message||'برای مشاهده و ثبت سند آفلاین، یک‌بار هنگام اتصال حساب‌ها و سال مالی را دریافت کنید.';
      $('accounting-revision').textContent='—';$('accounting-summary').innerHTML='';$('accounting-documents').innerHTML='';$('accounting-lines').innerHTML='';renderAccountingTotals();return;
    }
    const accounts=Array.isArray(payload.accounts)?payload.accounts:[],years=Array.isArray(payload.years)?payload.years:[],documents=Array.isArray(payload.documents)?payload.documents:[];
    const openYears=years.filter(year=>!year.isClosed),activeAccounts=accounts.filter(account=>account.isActive&&account.level!=='kol');
    const updated=snapshot.issuedAt?new Date(snapshot.issuedAt).toLocaleString('fa-IR'):'زمان دریافت ثبت نشده';
    $('accounting-sync').textContent=snapshot.expired?'نسخهٔ منقضی · فقط مشاهده':'نسخهٔ محلی رمزگذاری‌شده';$('accounting-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('accounting-revision').textContent=`نسخه ${money(snapshot.revision)}`;
    $('accounting-state').textContent=`${money(documents.length)} سند اخیر · ${money(payload.totalDocuments)} سند در snapshot · ${money(activeAccounts.length)} حساب قابل ثبت · ${money(openYears.length)} سال مالی باز · آخرین دریافت ${updated}${sync?.message?` · ${sync.message}`:''}`;
    $('accounting-summary').innerHTML=`<article><span>حساب قابل انتخاب</span><b>${money(activeAccounts.length)}</b></article><article><span>سال مالی باز</span><b>${money(openYears.length)}</b></article><article><span>اسناد cache شده</span><b>${money(documents.length)}</b></article>`;
    $('accounting-documents').innerHTML=documents.length?documents.map(doc=>`<article class="offline-shift-card accounting-document"><div class="offline-shift-head"><b>سند #${money(doc.number)}</b><span class="pos-badge ${doc.status==='posted'?'synced':'conflict'}">${doc.status==='posted'?'قطعی':'پیش‌نویس'}</span></div><p>${esc(doc.description||'بدون شرح')}</p><div class="offline-shift-meta"><span>${new Date(doc.date).toLocaleDateString('fa-IR')}</span><span>${money(doc.totalAmount)} تومان</span><span>${esc(doc.source||'manual')}</span>${doc.reversed?'<span>برگشت‌خورده</span>':''}</div><div class="accounting-document-lines">${(doc.lines||[]).map(line=>`<div><span>${esc(line.accountCode)} · ${esc(line.accountName)}</span><b>${line.debit?`بدهکار ${money(line.debit)}`:`بستانکار ${money(line.credit)}`} تومان</b></div>`).join('')}</div></article>`).join(''):'<p class="muted">سندی در نسخهٔ حسابداری محلی موجود نیست.</p>';
    const previous=Array.from($('accounting-lines').querySelectorAll('tr')).map(row=>({account:row.querySelector('[data-account]')?.value||'',debit:row.querySelector('[data-debit]')?.value||'0',credit:row.querySelector('[data-credit]')?.value||'0',description:row.querySelector('[data-line-description]')?.value||''}));
    if(!previous.length){appendAccountingLine();appendAccountingLine();}
    else for(const [index,row] of Array.from($('accounting-lines').querySelectorAll('tr')).entries()){
      const accountsMarkup=`<option value="">انتخاب حساب</option>${activeAccounts.map(account=>`<option value="${account.id}">${esc(account.code)} · ${esc(account.name)} (${account.level==='tafsili'?'تفصیلی':'معین'})</option>`).join('')}`;
      row.querySelector('[data-account]').innerHTML=accountsMarkup;row.querySelector('[data-account]').value=previous[index]?.account||'';
    }
    renderAccountingTotals();
  }
  async function loadWorkspaceAccounting(){
    try{workspaceAccounting=await call('offline_workspace_accounting');workspaceAccountingLoaded=true;renderWorkspaceAccounting();}
    catch(error){workspaceAccountingLoaded=true;$('accounting-state').textContent=String(error);$('accounting-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('accounting-sync').className='pos-status offline';}
  }
  const chequeStatuses={registered:'ثبت شد',passed:'پاس شد',bounced:'برگشت خورده',returned:'عودت داده شد',assigned:'واگذار شد',voided:'ابطال شد'};
  const chequeDirections={payable:'پرداختنی',receivable:'دریافتنی'};
  function jalaliInputIso(value){const d=jalaliToGregorian(value);if(!d)return null;const p=n=>String(n).padStart(2,'0');const date=new Date(`${d.year}-${p(d.month)}-${p(d.day)}T12:00:00+03:30`);return Number.isFinite(date.getTime())?date.toISOString():null;}
  function defaultChequeDate(){const p={};for(const part of jalaliTehranFormatter.formatToParts(new Date()))if(part.type==='year'||part.type==='month'||part.type==='day')p[part.type]=part.value;return `${p.year}/${p.month}/${p.day}`;}
  function chequeCommands(){return (state?.workspaceCommands?.recent||[]).filter(item=>item.module==='cheques');}
  function renderChequeCommands(){
    const recent=chequeCommands(),actionLabels={register:'ثبت چک',set_status:'تغییر وضعیت'},stateLabels={pending:'در انتظار اتصال',conflict:'نیازمند بررسی',rejected:'رد شد',synced:'ثبت شد'};
    $('cheques-commands').innerHTML=recent.length?recent.slice(0,50).map(item=>{const p=item.commandPayload||{};const summary=item.action==='register'?`${chequeDirections[p.direction]||'چک'} · ${esc(p.partnerName||'طرف چک')} · ${money(p.amount||0)} تومان`: `چک #${money(p.chequeId||0)} · ${chequeStatuses[p.status]||esc(p.status||'')}`;return `<div class="workspace-command-row"><span><b>${actionLabels[item.action]||esc(item.action)} · ${summary}</b><small>${esc(item.error||item.createdAt||'')}</small></span><strong class="workspace-command-state ${esc(item.state)}">${stateLabels[item.state]||esc(item.state)}</strong></div>`}).join(''):'<p class="muted">فرمان چکی در صف این دستگاه نیست.</p>';
  }
  function renderWorkspaceCheques(){
    const snapshot=workspaceCheques,payload=snapshot?.payload,sync=state?.workspaceChequesSync;
    if(!snapshot||!payload){
      $('cheques-sync').textContent=sync?.message||'snapshot دریافت نشده';$('cheques-sync').className='pos-status offline';$('cheques-state').textContent=sync?.message||'برای ثبت و مشاهدهٔ چک در قطعی اینترنت، ابتدا هنگام اتصال دفتر چک را دریافت کنید.';$('cheques-summary').innerHTML='';$('cheques-list').innerHTML='';$('cheque-account').innerHTML='<option value="">حساب محلی دریافت نشده</option>';$('cheque-register-form').querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=true);renderChequeCommands();return;
    }
    const cheques=Array.isArray(payload.cheques)?payload.cheques:[],beneficiaries=Array.isArray(payload.beneficiaries)?payload.beneficiaries:[],accounts=Array.isArray(payload.accounts)?payload.accounts.filter(row=>row.isActive):[],events=Array.isArray(payload.events)?payload.events:[],valid=!snapshot.expired&&!!state?.localManagerPinConfigured;
    const accountOptions=`<option value="">انتخاب حساب معین/تفصیلی</option>${accounts.map(row=>`<option value="${row.id}">${esc(row.code)} · ${esc(row.name)} (${row.level==='tafsili'?'تفصیلی':'معین'})</option>`).join('')}`;
    const oldAccount=$('cheque-account').value,oldStatusAccount=$('cheque-status-account').value;
    $('cheque-account').innerHTML=accountOptions;$('cheque-account').value=accounts.some(row=>String(row.id)===oldAccount)?oldAccount:'';
    $('cheque-status-account').innerHTML=accountOptions;$('cheque-status-account').value=accounts.some(row=>String(row.id)===oldStatusAccount)?oldStatusAccount:'';
    const oldBeneficiary=$('cheque-beneficiary').value,oldBank=$('cheque-bank').value,oldPurpose=$('cheque-purpose').value;
    $('cheque-beneficiary').innerHTML='<option value="">ثبت ذی‌نفع/طرف جدید</option>'+beneficiaries.map(row=>`<option value="${row.id}">${esc(row.fullName)}${row.nationalId?` · ${esc(row.nationalId)}`:''}</option>`).join('');
    $('cheque-beneficiary').value=beneficiaries.some(row=>String(row.id)===oldBeneficiary)?oldBeneficiary:'';
    $('cheque-bank').innerHTML='<option value="">انتخاب بانک</option>'+(payload.banks||[]).map(bank=>`<option value="${esc(bank)}">${esc(bank)}</option>`).join('')+'<option value="سایر">سایر</option>';$('cheque-bank').value=oldBank;$('cheque-bank-custom-wrap').hidden=oldBank!=='سایر';
    $('cheque-purpose').innerHTML='<option value="">انتخاب بابت</option>'+(payload.purposes||[]).map(item=>`<option value="${esc(item)}">${esc(item)}</option>`).join('');$('cheque-purpose').value=oldPurpose;$('cheque-purpose-custom-wrap').hidden=oldPurpose!=='سایر';
    const person=beneficiaries.find(row=>String(row.id)===$('cheque-beneficiary').value);$('cheque-new-beneficiary-fields').hidden=!!person;if(person){$('cheque-partner').value=person.fullName;$('cheque-national-id').value=person.nationalId||'';$('cheque-phone').value=person.phone||'';$('cheque-partner').readOnly=true;$('cheque-national-id').readOnly=true;$('cheque-phone').readOnly=true;}else{$('cheque-partner').readOnly=false;$('cheque-national-id').readOnly=false;$('cheque-phone').readOnly=false;}
    $('cheque-register-submit').disabled=!valid||accounts.length===0;
    const recent=chequeCommands(),projections=new Map();for(const item of recent){if(item.action==='set_status'&&item.baseSnapshotId===snapshot.snapshotId&&Date.parse(item.createdAt)>Date.parse(snapshot.issuedAt)&&item.commandPayload?.chequeId&&['pending','conflict','synced'].includes(item.state)){const current=projections.get(Number(item.commandPayload.chequeId));if(!current||Date.parse(item.createdAt)>Date.parse(current.createdAt))projections.set(Number(item.commandPayload.chequeId),{status:item.commandPayload.status,state:item.state,error:item.error,createdAt:item.createdAt});}}
    const direction=$('cheques-filter-direction').value,status=$('cheques-filter-status').value,term=$('cheques-search').value.trim().toLocaleLowerCase('fa');
    $('cheques-filter-status').innerHTML='<option value="">همهٔ وضعیت‌ها</option>'+Object.entries(chequeStatuses).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');$('cheques-filter-status').value=status;
    const filtered=cheques.filter(row=>{const matchesDirection=!direction||row.direction===direction,matchesStatus=!status||row.status===status;const haystack=[row.partnerName,row.chequeNumber,row.serialNumber,row.bank,row.branch,row.expensePurpose].join(' ').toLocaleLowerCase('fa');return matchesDirection&&matchesStatus&&(!term||haystack.includes(term));});
    const payable=cheques.filter(row=>row.direction==='payable'),receivable=cheques.filter(row=>row.direction==='receivable'),dueSoon=cheques.filter(row=>{const delta=new Date(row.dueDate).getTime()-Date.now();return delta>=0&&delta<=7*86400000&&['registered','assigned'].includes(row.status);});
    $('cheques-sync').textContent=snapshot.expired?'نسخهٔ منقضی · فقط مشاهده':'نسخهٔ رمزگذاری‌شدهٔ محلی';$('cheques-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('cheques-state').textContent=`${money(payload.totalCheques)} چک در snapshot · ${money(filtered.length)} نتیجه · ${money(beneficiaries.length)} ذی‌نفع · آخرین دریافت ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}${sync?.message?` · ${sync.message}`:''}`;
    $('cheques-summary').innerHTML=`<article><span>چک پرداختنی</span><b>${money(payable.length)} · ${money(payable.reduce((sum,row)=>sum+Number(row.amount),0))} تومان</b></article><article><span>چک دریافتنی</span><b>${money(receivable.length)} · ${money(receivable.reduce((sum,row)=>sum+Number(row.amount),0))} تومان</b></article><article><span>سررسید ۷ روز آینده</span><b>${money(dueSoon.length)}</b></article>`;
    $('cheques-list').innerHTML=filtered.length?`<table class="pos-table cheque-table"><thead><tr><th>طرف چک</th><th>نوع و بانک</th><th>شماره / سریال</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${filtered.map(row=>{const projection=projections.get(Number(row.id));return `<tr><td><b>${esc(row.partnerName)}</b><small>${esc(chequeDirections[row.direction]||row.direction)}</small></td><td>${esc(row.bank)}<small>${esc(row.branch||'شعبه ثبت نشده')}</small></td><td>${esc(row.chequeNumber)}<small>سریال ${esc(row.serialNumber)}</small></td><td>${new Date(row.dueDate).toLocaleDateString('fa-IR')}</td><td>${money(row.amount)} تومان</td><td><span class="pos-badge">${chequeStatuses[row.status]||esc(row.status)}</span>${projection?`<small class="cheque-projection">درخواست محلی: ${chequeStatuses[projection.status]||esc(projection.status)} · ${projection.state==='pending'?'در صف':projection.state==='conflict'?'نیازمند بررسی':'منتظر snapshot تازه'}</small>`:''}</td><td><div class="cheque-actions"><button class="button secondary" data-cheque-detail="${row.id}">جزئیات</button><button class="button secondary" data-cheque-status="${row.id}" ${valid&&!projection?'':'disabled'}>${projection?'در انتظار sync':'تغییر وضعیت'}</button></div></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">چکی با این فیلتر در snapshot محلی پیدا نشد.</p>';
    $('cheque-register-form').querySelectorAll('input,select,textarea').forEach(control=>control.disabled=!valid);$('cheque-register-submit').disabled=!valid||accounts.length===0;
    renderChequeCommands();
  }
  async function loadWorkspaceCheques(){try{workspaceCheques=await call('offline_workspace_cheques');workspaceChequesLoaded=true;renderWorkspaceCheques();}catch(error){workspaceChequesLoaded=true;$('cheques-state').textContent=String(error);$('cheques-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('cheques-sync').className='pos-status offline';}}
  function showChequeDetails(id){
    const payload=workspaceCheques?.payload,row=(payload?.cheques||[]).find(item=>Number(item.id)===Number(id));if(!row)return;
    const events=(payload.events||[]).filter(item=>Number(item.chequeId)===Number(id)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    const person=(payload.beneficiaries||[]).find(item=>Number(item.id)===Number(row.beneficiaryId));
    $('cheque-detail-title').textContent=`جزئیات چک #${money(row.id)}`;
    $('cheque-detail-content').innerHTML=`<div class="pos-detail-badges"><span class="pos-badge">${chequeDirections[row.direction]||esc(row.direction)}</span><span class="pos-badge">${chequeStatuses[row.status]||esc(row.status)}</span></div><div class="pos-detail-grid"><span>ذی‌نفع</span><b>${esc(row.partnerName)}</b><span>کد ملی</span><b>${esc(person?.nationalId||'—')}</b><span>موبایل</span><b dir="ltr">${esc(person?.phone||'—')}</b><span>مبلغ</span><b>${money(row.amount)} تومان</b><span>بانک / شعبه</span><b>${esc(row.bank)} · ${esc(row.branch||'—')}</b><span>شماره / سریال</span><b>${esc(row.chequeNumber)} · ${esc(row.serialNumber)}</b><span>تاریخ صدور</span><b>${new Date(row.issueDate).toLocaleDateString('fa-IR')}</b><span>سررسید</span><b>${new Date(row.dueDate).toLocaleDateString('fa-IR')}</b><span>شناسه صیاد</span><b dir="ltr">${esc(row.sayadIdentifier||'—')}</b><span>بابت</span><b>${esc(row.expensePurpose||'—')}</b><span>حساب طرف سند</span><b>${esc((payload.accounts||[]).find(item=>item.id===row.accountingAccountId)?.name||'—')}</b><span>شماره سند پایه</span><b>${money(row.accountingDocumentId||0)||'—'}</b></div><div class="pos-detail-note"><b>توضیح</b><p>${esc(row.note||'توضیحی ثبت نشده است')}</p></div><h3 class="pos-detail-payment-title">گردش وضعیت و اسناد</h3><div class="offline-shift-list">${events.length?events.map(event=>`<article class="offline-shift-card"><div class="offline-shift-head"><b>${event.fromStatus?`${chequeStatuses[event.fromStatus]||esc(event.fromStatus)} ← `:''}${chequeStatuses[event.toStatus]||esc(event.toStatus)}</b><span class="pos-badge">${new Date(event.createdAt).toLocaleString('fa-IR')}</span></div><p>${esc(event.note||'بدون توضیح')}</p><div class="offline-shift-meta"><span>سند وضعیت: ${money(event.accountingDocumentId||0)||'—'}</span><span>سند برگشت: ${money(event.reversalDocumentId||0)||'—'}</span></div></article>`).join(''):'<p class="muted">رویدادی در snapshot ذخیره نشده است.</p>'}</div>`;
    $('cheque-detail-dialog').showModal();
  }
  function openChequeStatus(id){
    const row=(workspaceCheques?.payload?.cheques||[]).find(item=>Number(item.id)===Number(id));if(!row)return;activeChequeStatus=row;
    const options=[['registered','ثبت شد'],['passed','پاس شد'],['bounced','برگشت خورده'],['returned','عودت داده شد'],...(row.direction==='receivable'?[['assigned','واگذار شد']]:[]),['voided','ابطال شد']].filter(([key])=>key!==row.status);
    $('cheque-next-status').innerHTML=options.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
    $('cheque-status-account-wrap').hidden=row.direction!=='receivable'||$('cheque-next-status').value!=='assigned';$('cheque-status-context').textContent=`${row.partnerName} · ${chequeDirections[row.direction]} · ${money(row.amount)} تومان · وضعیت فعلی: ${chequeStatuses[row.status]||row.status}`;$('cheque-status-note').value='';$('cheque-status-pin').value='';$('cheque-status-error').textContent='';$('cheque-status-dialog').showModal();
  }
  function localReceivablePaymentCommand(row,snapshot){
    return (state?.workspaceCommands?.recent||[]).find(command=>command.module==='receivables'&&command.action==='record_payment'&&Number(command.receivableId)===Number(row.id)&&command.baseSnapshotId===snapshot.snapshotId&&(command.state==='pending'||Date.parse(command.createdAt)>Date.parse(snapshot.issuedAt)));
  }
  function renderReceivableCommands(){
    const recent=(state?.workspaceCommands?.recent||[]).filter(command=>command.module==='receivables'),labels={pending:'در انتظار اتصال',conflict:'نیازمند بررسی',rejected:'رد شد',synced:'ثبت شد'};
    $('receivables-commands').innerHTML=recent.length?recent.slice(0,30).map(item=>`<div class="workspace-command-row"><span><b>دریافت نقدی طلب #${money(item.receivableId||0)} · ${money(item.amount||0)} تومان</b><small>${esc(item.error||item.createdAt||'')}</small></span><strong class="workspace-command-state ${esc(item.state)}">${labels[item.state]||esc(item.state)}</strong></div>`).join(''):'<p class="muted">دریافتی آفلاینی در صف نیست.</p>';
  }
  function showReceivableStatement(id){
    const snapshot=workspaceReceivables,payload=snapshot?.payload,row=(payload?.receivables||[]).find(item=>Number(item.id)===Number(id));if(!row)return;
    const payments=(payload.payments||[]).filter(item=>Number(item.receivableId)===Number(id)),paymentIds=payments.map(item=>item.id),reversals=(payload.reversals||[]).filter(item=>paymentIds.includes(item.paymentId));
    const rows=[{date:row.createdAt,html:`<tr><td>${new Date(row.createdAt).toLocaleString('fa-IR')}</td><td>ثبت طلب</td><td>—</td><td>${money(row.amount)} تومان</td><td>${esc(row.description||'طلب ثبت‌شده')}</td></tr>`},...payments.map(payment=>({date:payment.createdAt,html:`<tr><td>${new Date(payment.createdAt).toLocaleString('fa-IR')}</td><td>دریافت</td><td>${payment.method==='cash'?'نقدی':esc(payment.method)}</td><td>− ${money(payment.amount)} تومان</td><td>${esc(payment.note||'—')}</td></tr>`})),...reversals.map(reversal=>({date:reversal.createdAt,html:`<tr><td>${new Date(reversal.createdAt).toLocaleString('fa-IR')}</td><td>برگشت دریافت</td><td>—</td><td>+ ${money(reversal.amount)} تومان</td><td>${esc(reversal.reason||'—')}</td></tr>`}))].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).map(item=>item.html);
    $('receivable-detail-title').textContent=`صورت‌حساب طلب #${money(row.id)}`;
    $('receivable-detail-content').innerHTML=`<div class="pos-detail-grid"><span>بدهکار</span><b>${esc(row.accountName)}</b><span>شماره موبایل</span><b dir="ltr">${esc(row.phone||'—')}</b><span>مبلغ اولیه</span><b>${money(row.amount)} تومان</b><span>دریافت خالص</span><b>${money(row.received)} تومان</b><span>مانده سرور</span><b>${money(row.balance)} تومان</b><span>سفارش</span><b>${row.orderNumber?`#${money(row.orderNumber)}`:'طلب دستی'}</b><span>سررسید</span><b>${row.dueAt?new Date(row.dueAt).toLocaleDateString('fa-IR'):'—'}</b></div><div class="pos-history-scroll"><table class="pos-table"><thead><tr><th>زمان</th><th>رویداد</th><th>روش</th><th>مبلغ</th><th>شرح</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="muted">این صورت‌حساب از نسخهٔ محلی است؛ دریافت‌های در انتظار همگام‌سازی هنوز در ماندهٔ رسمی لحاظ نشده‌اند.</p>`;
    $('receivable-detail-dialog').showModal();
  }
  function renderWorkspaceReceivables(){
    const snapshot=workspaceReceivables,payload=snapshot?.payload,sync=state?.workspaceReceivablesSync;
    if(!snapshot||!payload){$('receivables-sync').textContent=sync?.message||'snapshot دریافت نشده';$('receivables-sync').className='pos-status offline';$('receivables-state').textContent=sync?.message||'برای مشاهدهٔ مطالبات آفلاین، دستگاه را هنگام اتصال با حسابداری همگام‌سازی کنید.';$('receivables-summary').innerHTML='';$('receivables-list').innerHTML='';renderReceivableCommands();return;}
    const rows=Array.isArray(payload.receivables)?payload.receivables:[],query=$('receivables-search').value.trim().toLowerCase(),statusLabels={open:'باز',partial:'بخشی دریافت شد',overdue:'سررسیدگذشته',settled:'تسویه‌شده'},commands=state?.workspaceCommands?.recent||[];
    const visible=rows.filter(row=>`${row.accountName} ${row.phone} ${row.orderNumber||''} ${row.description}`.toLowerCase().includes(query));
    const updated=snapshot.issuedAt?new Date(snapshot.issuedAt).toLocaleString('fa-IR'):'—';
    $('receivables-sync').textContent=snapshot.expired?'نسخهٔ منقضی · فقط مشاهده':'نسخهٔ محلی محافظت‌شده';$('receivables-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('receivables-state').textContent=`${money(rows.length)} طلب در نسخهٔ محلی · آخرین دریافت ${updated}${sync?.message?` · ${sync.message}`:''}`;
    $('receivables-summary').innerHTML=`<article><span>ماندهٔ مطالبات</span><b>${money(payload.totalBalance)} تومان</b></article><article><span>بدهکاران سررسیدگذشته</span><b>${money(rows.filter(row=>row.status==='overdue').length)}</b></article><article><span>حساب‌های تسویه‌شده</span><b>${money(rows.filter(row=>row.status==='settled').length)}</b></article>`;
    $('receivables-list').innerHTML=visible.length?`<table class="pos-table receivables-table"><thead><tr><th>بدهکار / سفارش</th><th>مبلغ</th><th>دریافت‌شده</th><th>مانده</th><th>سررسید</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${visible.map(row=>{const queued=localReceivablePaymentCommand(row,snapshot),projected=queued&&['pending','synced'].includes(queued.state)?Math.max(0,Number(row.balance)-Number(queued.amount||0)):Number(row.balance),stateLabel=queued?.state==='pending'?'دریافت در صف':queued?.state==='synced'?'دریافت ثبت شد · نسخه تازه در راه':queued?.state==='conflict'?'تعارض · تازه‌سازی لازم':queued?.state==='rejected'?'رد شد · تازه‌سازی لازم':statusLabels[row.status]||esc(row.status),canPay=!snapshot.expired&&!!state?.localManagerPinConfigured&&Number(row.balance)>0&&!queued;return `<tr><td><b>${esc(row.accountName)}</b><small>${row.orderNumber?`سفارش #${money(row.orderNumber)}`:esc(row.description||'طلب دستی')}</small><small dir="ltr">${esc(row.phone||'')}</small></td><td>${money(row.amount)} تومان</td><td>${money(row.received)} تومان</td><td><b>${money(projected)} تومان</b>${queued&&projected!==Number(row.balance)?`<small>پس از درخواست محلی · غیرقطعی</small>`:''}</td><td>${row.dueAt?new Date(row.dueAt).toLocaleDateString('fa-IR'):'—'}</td><td><span class="workspace-command-state ${queued?.state==='pending'?'pending':queued?.state==='conflict'?'conflict':queued?.state==='rejected'?'rejected':queued?.state==='synced'?'synced':''}">${stateLabel}</span>${queued?.error?`<small>${esc(queued.error)}</small>`:''}</td><td><div class="reservation-actions"><button class="button secondary" type="button" data-receivable-detail="${row.id}">صورت‌حساب</button>${Number(row.balance)>0?`<button class="button primary" type="button" data-receivable-pay="${row.id}" ${canPay?'':'disabled'}>دریافت نقدی</button>`:''}</div></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">طلبی در نسخهٔ محلی پیدا نشد.</p>';
    renderReceivableCommands();
  }
  async function loadWorkspaceReceivables(){try{workspaceReceivables=await call('offline_workspace_receivables');workspaceReceivablesLoaded=true;renderWorkspaceReceivables();}catch(error){workspaceReceivablesLoaded=true;$('receivables-state').textContent=String(error);$('receivables-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('receivables-sync').className='pos-status offline';}}
  function renderWorkspaceCashShifts(){
    const snapshot=workspaceCashShifts,payload=snapshot?.payload,sync=state?.workspaceCashShiftsSync;
    if(!snapshot||!payload){$('cash-shifts-sync').textContent=sync?.message||'snapshot دریافت نشده';$('cash-shifts-sync').className='pos-status offline';$('cash-shifts-state').textContent=sync?.message||'برای مشاهدهٔ شیفت صندوق، دستگاه را هنگام اتصال همگام‌سازی کنید.';$('cash-shifts-summary').innerHTML='';$('cash-shifts-active').innerHTML='';$('cash-shifts-history').innerHTML='';return;}
    const active=payload.active,history=Array.isArray(payload.history)?payload.history:[],formatDate=value=>value?new Date(value).toLocaleString('fa-IR'):'—';
    $('cash-shifts-sync').textContent=snapshot.expired?'نسخهٔ منقضی · فقط مشاهده':'نسخهٔ محلی محافظت‌شده';$('cash-shifts-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('cash-shifts-state').textContent=`آخرین دریافت ${formatDate(snapshot.issuedAt)} · ${money(history.length)} شیفت بسته‌شده در نسخهٔ محلی${payload.historyHasMore?' · فقط ۱۰۰ مورد اخیر دریافت شده':''}${sync?.message?` · ${sync.message}`:''}`;
    $('cash-shifts-summary').innerHTML=`<article><span>وضعیت شیفت</span><b>${active?'باز':'بسته'}</b></article><article><span>فروش نقدی در شیفت جاری</span><b>${money(active?.cashSales||0)} تومان</b></article><article><span>موجودی نقد مورد انتظار</span><b>${money(active?.expectedCash||0)} تومان</b></article>`;
    $('cash-shifts-active').innerHTML=active?`<article class="offline-shift-card"><div class="offline-shift-head"><b>شیفت جاری #${money(active.id)}</b><span class="pos-badge pending">باز</span></div><div class="offline-shift-meta"><span>شروع ${formatDate(active.openedAt)}</span><span>صندوقدار ${esc(active.openedByName||'—')}</span><span>نقد آغاز ${money(active.openingCash)} تومان</span><span>فروش نقدی ${money(active.cashSales)} تومان</span><span>فروش غیرنقدی ${money(active.nonCashSales)} تومان</span></div>${active.note?`<p>${esc(active.note)}</p>`:''}<p class="muted">جمع رسمی از تراکنش‌های ثبت‌شده در سرور است؛ فروش‌های صف‌شدهٔ این دستگاه در آن لحاظ نشده‌اند.</p></article>`:'<p class="muted">در آخرین نسخهٔ دریافت‌شده شیفت بازی وجود نداشت.</p>';
    $('cash-shifts-history').innerHTML=history.length?`<table class="pos-table"><thead><tr><th>شیفت</th><th>صندوقدار</th><th>شروع / پایان</th><th>نقد آغاز</th><th>نقد مورد انتظار</th><th>نقد پایان</th><th>اختلاف</th></tr></thead><tbody>${history.map(row=>`<tr><td><b>#${money(row.id)}</b></td><td>${esc(row.openedByName||'—')}<small>بستن: ${esc(row.closedByName||'—')}</small></td><td>${formatDate(row.openedAt)}<small>${formatDate(row.closedAt)}</small></td><td>${money(row.openingCash)} تومان</td><td>${money(row.expectedCash)} تومان</td><td>${money(row.closingCash)} تومان</td><td>${money(row.cashDifference)} تومان<small>فروش نقدی ${money(row.cashSales)} · غیرنقدی ${money(row.nonCashSales)}</small></td></tr>`).join('')}</tbody></table>`:'<p class="muted">شیفت بسته‌شده‌ای در نسخهٔ محلی نیست.</p>';
  }
  async function loadWorkspaceCashShifts(){try{workspaceCashShifts=await call('offline_workspace_cash_shifts');workspaceCashShiftsLoaded=true;renderWorkspaceCashShifts();}catch(error){workspaceCashShiftsLoaded=true;$('cash-shifts-state').textContent=String(error);$('cash-shifts-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('cash-shifts-sync').className='pos-status offline';}}
  function renderWorkspaceReports(){
    const snapshot=workspaceReports,payload=snapshot?.payload,sync=state?.workspaceReportsSync;
    if(!snapshot||!payload){$('reports-sync').textContent=sync?.message||'snapshot دریافت نشده';$('reports-sync').className='pos-status offline';$('reports-state').textContent=sync?.message||'این گزارش برای مشاهدهٔ آفلاین باید هنگام اتصال یک‌بار دریافت شود.';$('reports-summary').innerHTML='';$('reports-chart').innerHTML='';$('reports-products').innerHTML='';$('reports-statuses').innerHTML='';return;}
    const totals=payload.totals||{},series=Array.isArray(payload.series)?payload.series:[],products=Array.isArray(payload.byProduct)?payload.byProduct:[],statuses=Array.isArray(payload.statuses)?payload.statuses:[],date=value=>new Date(value).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'});
    $('reports-sync').textContent=snapshot.expired?'نسخهٔ منقضی · فقط مشاهده':'نسخهٔ محلی محافظت‌شده';$('reports-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('reports-state').textContent=`بازه ${date(payload.from)} تا ${date(payload.to)} · آخرین دریافت ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}${sync?.message?` · ${sync.message}`:''}`;
    $('reports-summary').innerHTML=`<article><span>درآمد فروش پرداخت‌شده</span><b>${money(totals.revenue)} تومان</b></article><article><span>سفارش پرداخت‌شده</span><b>${money(totals.orders)}</b></article><article><span>میانگین فاکتور</span><b>${money(totals.average)} تومان</b></article><article><span>سود ناخالص برآوردی</span><b>${money(totals.grossProfit)} تومان</b></article><article><span>بهای تمام‌شدهٔ ثبت‌شده</span><b>${money(totals.cogs)} تومان</b></article><article><span>تخفیف‌ها</span><b>${money(totals.discounts)} تومان</b></article><article><span>مالیات فروش</span><b>${money(totals.tax)} تومان</b></article><article><span>اقلام فروخته‌شده</span><b>${money(totals.soldItems)}</b></article>`;
    const days=series.slice(-30),max=Math.max(1,...days.map(row=>Number(row.revenue)||0));
    $('reports-chart').innerHTML=days.map(row=>{const value=Number(row.revenue)||0,height=value?Math.max(3,Math.round(value/max*100)):1;return `<div class="offline-report-bar" title="${date(row.date)} · ${money(value)} تومان · ${money(row.orders)} سفارش"><span class="offline-report-bar-fill" style="height:${height}%"></span><small>${new Date(row.date).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',month:'numeric',day:'numeric'})}</small></div>`}).join('');
    $('reports-products').innerHTML=products.length?`<table class="pos-table"><thead><tr><th>محصول</th><th>تعداد</th><th>مبلغ فروش</th></tr></thead><tbody>${products.map(row=>`<tr><td>${esc(row.name)}</td><td>${money(row.quantity)}</td><td>${money(row.revenue)} تومان</td></tr>`).join('')}</tbody></table>`:'<p class="muted">در این بازه محصول فروخته‌شده‌ای وجود ندارد.</p>';
    const statusLabels={pending:'در انتظار',preparing:'آماده‌سازی',ready:'آماده',served:'تحویل‌شده',paid:'پرداخت‌شده',canceled:'لغوشده',confirmed:'تأییدشده'},paymentLabels={paid:'پرداخت‌شده',unpaid:'پرداخت‌نشده',partial:'پرداخت بخشی',pending:'در انتظار',failed:'ناموفق',refunded:'بازپرداخت'};
    $('reports-statuses').innerHTML=statuses.length?`<table class="pos-table"><thead><tr><th>وضعیت سفارش</th><th>وضعیت پرداخت</th><th>تعداد</th><th>مبلغ اسمی</th></tr></thead><tbody>${statuses.map(row=>`<tr><td>${statusLabels[row.status]||esc(row.status)}</td><td>${paymentLabels[row.paymentStatus]||esc(row.paymentStatus)}</td><td>${money(row.orders)}</td><td>${money(row.amount)} تومان</td></tr>`).join('')}</tbody></table>`:'<p class="muted">سفارشی در این بازه ثبت نشده است.</p>';
  }
  async function loadWorkspaceReports(){try{workspaceReports=await call('offline_workspace_reports');workspaceReportsLoaded=true;renderWorkspaceReports();}catch(error){workspaceReportsLoaded=true;$('reports-state').textContent=String(error);$('reports-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('reports-sync').className='pos-status offline';}}
  function openReceivablePayment(id){
    const snapshot=workspaceReceivables,row=(snapshot?.payload?.receivables||[]).find(item=>Number(item.id)===Number(id));if(!row)return;
    if(snapshot.expired||!state?.localManagerPinConfigured){notify('برای ثبت دریافت، نسخهٔ تازه و PIN مدیر محلی لازم است.',true);return;}
    if(localReceivablePaymentCommand(row,snapshot)){notify('برای این طلب دریافت محلی ثبت شده است؛ تا دریافت نسخهٔ تازه، دریافت دیگری ثبت نکنید.',true);return;}
    activeReceivablePayment=row;$('receivable-payment-context').textContent=`${row.accountName} · ماندهٔ رسمی ${money(row.balance)} تومان. فقط وجه نقد ثبت می‌شود و تا تأیید سرور قطعی نیست.`;$('receivable-payment-amount').value=String(row.balance);$('receivable-payment-note').value='';$('receivable-payment-pin').value='';$('receivable-payment-error').textContent='';$('receivable-payment-dialog').showModal();
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
  function inventoryProjectedState(item){
    const stored=workspaceInventory?.localProjection?.[String(item.id)];if(stored)return {stock:Number(stored.stock)||0,cost:Number(stored.costPerUnit)||0,stale:stored.stale===true};
    let stock=Number(item.stock)||0,cost=Number(item.costPerUnit)||0,stale=false;
    const snapshotId=workspaceInventory?.snapshotId;
    for(const entry of state?.workspaceInventoryCommands||[]){
      if(entry.baseSnapshotId!==snapshotId||!['pending','synced'].includes(entry.state))continue;
      const payload=entry.payload||{};
      if(entry.action==='waste'&&Number(payload.itemId)===Number(item.id)){
        const expected=Number(payload.expectedStock);
        if(!Number.isFinite(expected)||Math.abs(expected-stock)>1e-8){stale=true;break;}
        stock=Math.max(0,expected-Number(payload.quantity||0));
      }else if(entry.action==='movement'&&Number(payload.itemId)===Number(item.id)){
        const expected=Number(payload.expectedStock),expectedCost=Number(payload.expectedCostPerUnit),quantity=Number(payload.quantity);
        if(!Number.isFinite(expected)||Math.abs(expected-stock)>1e-8||expectedCost!==cost||!Number.isFinite(quantity)){stale=true;break;}
        if(payload.type==='out'&&quantity>0&&quantity<=stock+1e-8)stock=Math.max(0,stock-quantity);
        else if(payload.type==='adjust'&&quantity>=0)stock=quantity;
        else {stale=true;break;}
      }else if(entry.action==='receive'){
        const line=(payload.lines||[]).find(row=>Number(row.itemId)===Number(item.id));if(!line)continue;
        if(Math.abs(Number(line.expectedStock)-stock)>1e-8||Number(line.expectedCostPerUnit)!==cost){stale=true;break;}
        stock+=Number(line.quantity||0);cost=Number(line.resultCostPerUnit);
      }
    }
    return {stock,cost,stale};
  }
  function appendInventoryWasteActions(visible){
    const table=$('inventory-list').querySelector('table');if(!table)return;
    const header=table.querySelector('thead tr');if(header){const cell=document.createElement('th');cell.textContent='عملیات';header.append(cell);}
    table.querySelectorAll('tbody tr').forEach((row,index)=>{const item=visible[index];if(!item)return;const cell=document.createElement('td'),projection=inventoryProjectedState(item),eligible=item.isActive&&item.trackStock&&!projection.stale&&!workspaceInventory?.expired&&!!state?.localManagerPinConfigured;cell.className='inventory-actions-cell';cell.innerHTML=`<div class="inventory-actions"><button class="button secondary" type="button" data-inventory-movement="out" data-item-id="${item.id}" ${eligible&&projection.stock>0?'':'disabled'}>خروج</button><button class="button secondary" type="button" data-inventory-movement="adjust" data-item-id="${item.id}" ${eligible?'':'disabled'}>شمارش</button><button class="button secondary" type="button" data-inventory-waste="${item.id}" ${eligible&&projection.stock>0?'':'disabled'}>ضایعات</button></div>`;if(projection.stale)cell.title='فرمان قبلی متعارض است؛ ابتدا snapshot تازه بگیرید';else if(!state?.localManagerPinConfigured)cell.title='برای گردش آفلاین PIN مدیر محلی تنظیم کنید';row.append(cell);});
  }
  function inventoryTransferDestinations(sourceId){
    const items=workspaceInventory?.payload?.items||[],source=items.find(item=>Number(item.id)===Number(sourceId));
    if(!source)return [];
    return items.filter(item=>Number(item.id)!==Number(source.id)&&item.isActive&&item.trackStock&&item.warehouseId&&item.warehouseId!==source.warehouseId&&item.unit===source.unit&&String(item.name||'').trim().toLocaleLowerCase('fa-IR')===String(source.name||'').trim().toLocaleLowerCase('fa-IR'));
  }
  function inventoryTransferSources(){
    const items=workspaceInventory?.payload?.items||[],groups=new Map();
    for(const item of items){if(!item.isActive||!item.trackStock||!item.warehouseId)continue;const key=`${String(item.name||'').trim().toLocaleLowerCase('fa-IR')}\u0000${item.unit}`,group=groups.get(key)||new Set();group.add(item.warehouseId);groups.set(key,group);}
    return items.filter(item=>{if(!item.isActive||!item.trackStock||!item.warehouseId)return false;const key=`${String(item.name||'').trim().toLocaleLowerCase('fa-IR')}\u0000${item.unit}`;return (groups.get(key)?.size||0)>1;});
  }
  function addInventoryTransferLine(sourceId=null,destinationId=null){
    const sources=inventoryTransferSources(),host=$('inventory-transfer-lines');
    if(!sources.length){notify('برای انتقال باید کالای هم‌نام و هم‌واحد در دست‌کم دو انبار ثبت شده باشد.',true);return;}
    const source=sources.find(item=>item.id===Number(sourceId))||sources[0],destinations=inventoryTransferDestinations(source.id),destination=destinations.find(item=>item.id===Number(destinationId))||destinations[0];
    const row=document.createElement('div');row.className='inventory-transfer-row';
    row.innerHTML=`<label>کالای مبدأ<select data-transfer-source>${sources.map(item=>`<option value="${item.id}" ${item.id===source.id?'selected':''}>${esc(item.name)} · ${esc(item.unit)} · ${esc((workspaceInventory?.payload?.warehouses||[]).find(warehouse=>warehouse.id===item.warehouseId)?.name||'انبار')}</option>`).join('')}</select></label><label>کالای مقصد<select data-transfer-destination>${destinations.map(item=>`<option value="${item.id}" ${item.id===destination.id?'selected':''}>${esc((workspaceInventory?.payload?.warehouses||[]).find(warehouse=>warehouse.id===item.warehouseId)?.name||'انبار')} · موجودی ${money(inventoryProjectedState(item).stock)} ${esc(item.unit)}</option>`).join('')}</select></label><label>مقدار انتقال<input data-transfer-quantity type="number" min="0.000001" step="any" max="${inventoryProjectedState(source).stock}" required></label><button class="text-button" type="button" data-transfer-remove aria-label="حذف قلم">حذف</button>`;
    host.append(row);
  }
  function inventoryTransferApprovalFits(transfer,itemById=new Map((workspaceInventory?.payload?.items||[]).map(item=>[Number(item.id),item]))){
    const balances=new Map();
    for(const line of transfer.lines||[]){
      for(const id of [line.sourceItemId,line.destinationItemId]){
        const item=itemById.get(Number(id));if(!item)return false;
        const projection=inventoryProjectedState(item);if(projection.stale)return false;balances.set(item.id,balances.has(item.id)?balances.get(item.id):projection.stock);
      }
      const sourceId=Number(line.sourceItemId),destinationId=Number(line.destinationItemId),quantity=Number(line.quantity),source=itemById.get(sourceId),destination=itemById.get(destinationId);
      if(!Number.isFinite(quantity)||quantity<=0||balances.get(sourceId)+1e-9<quantity||balances.get(destinationId)+quantity>1_000_000_000||!source?.isActive||!destination?.isActive||!source.trackStock||!destination.trackStock)return false;
      balances.set(sourceId,Math.max(0,balances.get(sourceId)-quantity));balances.set(destinationId,balances.get(destinationId)+quantity);
    }
    return true;
  }
  function renderWorkspaceInventoryTransfers(){
    const transfers=workspaceInventory?.payload?.transfers||[],items=workspaceInventory?.payload?.items||[],warehouses=workspaceInventory?.payload?.warehouses||[],commands=state?.workspaceInventoryCommands||[];
    const itemById=new Map(items.map(item=>[Number(item.id),item])),warehouseById=new Map(warehouses.map(row=>[Number(row.id),row.name]));
    const states={pending:'در انتظار بررسی',approved:'تأییدشده',rejected:'ردشده'},requestRows=[...transfers].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,100);
    $('inventory-transfers').innerHTML=transfers.length?requestRows.map(transfer=>{
      const lines=(transfer.lines||[]).map(line=>{const source=itemById.get(Number(line.sourceItemId))||line.source,destination=itemById.get(Number(line.destinationItemId))||line.destination;return `${source?.name||`کالای ${line.sourceItemId}`} · ${warehouseById.get(Number(source?.warehouseId))||'مبدأ'} ← ${warehouseById.get(Number(destination?.warehouseId))||'مقصد'} · ${money(line.quantity)} ${source?.unit||''}`;}).join('، ');
      const queued=commands.some(command=>command.action==='transfer'&&Number(command.payload?.transferId)===Number(transfer.id)&&['pending','synced'].includes(command.state));
      const canDecide=transfer.status==='pending'&&!queued&&!workspaceInventory?.expired&&!!state?.localManagerPinConfigured,fit=inventoryTransferApprovalFits(transfer,itemById);
      return `<article class="workspace-command-row"><span><b>انتقال #${money(transfer.id)} · ${states[transfer.status]||esc(transfer.status)}</b><small>${esc(lines)} · ${new Date(transfer.createdAt).toLocaleString('fa-IR')}${transfer.note?` · ${esc(transfer.note)}`:''}${transfer.decidedAt?` · بررسی ${new Date(transfer.decidedAt).toLocaleString('fa-IR')}`:''}</small></span><span class="inventory-transfer-actions">${transfer.status==='pending'?`<button class="button primary" type="button" data-transfer-decision="approve" data-transfer-id="${transfer.id}" ${canDecide&&fit?'':'disabled'}>تأیید و انتقال</button><button class="button secondary" type="button" data-transfer-decision="reject" data-transfer-id="${transfer.id}" ${canDecide?'':'disabled'}>رد درخواست</button>`:''}</span></article>`;
    }).join(''):'<p class="muted">در snapshot انبار درخواست انتقالی وجود ندارد.</p>';
    $('inventory-transfer-open').disabled=!workspaceInventory||workspaceInventory.expired||!state?.localManagerPinConfigured||!inventoryTransferSources().length;
  }
  function renderWorkspaceInventoryWasteRequests(){
    const requests=state?.workspaceInventoryCommands||[],items=workspaceInventory?.payload?.items||[],warehouses=workspaceInventory?.payload?.warehouses||[],reasons={spoilage:'خرابی یا فساد',expired:'انقضا',prep_loss:'پرت آماده‌سازی',quality:'افت کیفیت',damaged:'آسیب‌دیدگی',other:'سایر'},states={pending:'در انتظار همگام‌سازی',synced:'در سرور ثبت شد',conflict:'نیازمند بررسی',rejected:'رد شد'};
    $('inventory-waste-requests').innerHTML=requests.length?[...requests].reverse().slice(0,50).map(row=>{
      const p=row.payload||{},isCreate=row.action==='create_item',isReceive=row.action==='receive',isMovement=row.action==='movement',isTransfer=row.action==='transfer',itemName=items.find(item=>item.id===p.itemId)?.name||`کالای ${p.itemId}`;
      const detail=isTransfer?(p.lines||[]).map(line=>{const source=items.find(item=>item.id===Number(line.sourceItemId)),destination=items.find(item=>item.id===Number(line.destinationItemId));return `${source?.name||`کالای ${line.sourceItemId}`} · ${warehouses.find(row=>row.id===source?.warehouseId)?.name||'مبدأ'} ← ${warehouses.find(row=>row.id===destination?.warehouseId)?.name||'مقصد'} × ${money(line.quantity)} ${source?.unit||''}`;}).join('، '):isReceive?(p.lines||[]).map(line=>{const item=items.find(candidate=>candidate.id===line.itemId);return `${item?.name||`کالای ${line.itemId}`} × ${money(line.quantity)} ${item?.unit||''}`;}).join('، '):`${itemName} × ${money(p.quantity)} ${items.find(item=>item.id===p.itemId)?.unit||''}`;
      const movementLabel=p.type==='out'?'خروج مصرف':'اصلاح موجودی',transferLabel=p.intent==='request'?'درخواست انتقال':p.intent==='approve'?'تأیید انتقال':'رد انتقال';
      const title=isCreate?`تعریف کالا · ${p.name||'کالای جدید'}`:isTransfer?`${transferLabel}${p.transferId?` #${money(p.transferId)}`:''} · ${detail}`:isReceive?`ورود فاکتور ${p.invoiceNo?`#${p.invoiceNo}`:''} · ${money(p.total)} تومان`:isMovement?`${movementLabel} · ${detail}`:`ضایعات · ${detail}`;
      const note=p.note||p.openingNote?` · ${p.note||p.openingNote}`:'',subtitle=`${isCreate?`${money(p.openingStock)} ${p.unit||''} موجودی آغازین`:isTransfer?'انتقال داخلی':isReceive?'ورود فاکتور':isMovement?`موجودی مبنا ${money(p.expectedStock)}`:(reasons[p.wasteReason]||'سایر')}${note} · ${new Date(row.createdAt).toLocaleString('fa-IR')}`;
      return `<div class="workspace-command-row"><span><b>${esc(title)}</b><small>${esc(subtitle)}${row.error?` · ${esc(row.error)}`:''}</small></span><strong class="workspace-command-state ${esc(row.state)}">${states[row.state]||esc(row.state)}</strong></div>`;
    }).join(''):'<p class="muted">گردش آفلاینی روی این دستگاه ثبت نشده است.</p>';
  }
  function openInventoryWaste(itemId){
    const item=(workspaceInventory?.payload?.items||[]).find(row=>row.id===itemId);if(!item)return;
    if(workspaceInventory?.expired||!state?.localManagerPinConfigured){notify('برای ثبت ضایعات، snapshot تازه و PIN مدیر محلی لازم است.',true);return;}
    const projected=inventoryProjectedState(item);if(projected.stale){notify('گردش‌های قبلی با snapshot فعلی سازگار نیستند؛ ابتدا نسخهٔ انبار را تازه کنید.',true);return;}
    activeInventoryWasteItem=item;$('inventory-waste-title').textContent=`ثبت ضایعات · ${item.name}`;$('inventory-waste-context').textContent=`موجودی snapshot: ${money(item.stock)} ${item.unit} · موجودی محلی پس از درخواست‌های صف: ${money(projected.stock)} ${item.unit} · بهای مبنا: ${money(projected.cost)} تومان / ${item.unit}`;
    $('inventory-waste-quantity').max=String(projected.stock);$('inventory-waste-quantity').value='';$('inventory-waste-reason').value='spoilage';$('inventory-waste-note').value='';$('inventory-waste-pin').value='';$('inventory-waste-error').textContent='';$('inventory-waste-dialog').showModal();$('inventory-waste-quantity').focus();
  }
  function openInventoryTransfer(){
    if(!workspaceInventory||workspaceInventory.expired||!state?.localManagerPinConfigured){notify('برای انتقال، snapshot تازهٔ انبار و PIN مدیر محلی لازم است.',true);return;}
    if(!inventoryTransferSources().length){notify('برای انتقال باید یک قلم هم‌نام و هم‌واحد در دو انبار مختلف داشته باشید.',true);return;}
    $('inventory-transfer-lines').innerHTML='';addInventoryTransferLine();$('inventory-transfer-note').value='';$('inventory-transfer-pin').value='';$('inventory-transfer-error').textContent='';$('inventory-transfer-dialog').showModal();
  }
  function openInventoryTransferDecision(transferId,decision){
    const transfer=(workspaceInventory?.payload?.transfers||[]).find(row=>Number(row.id)===Number(transferId));
    if(!transfer||transfer.status!=='pending'||workspaceInventory?.expired||!state?.localManagerPinConfigured){notify('درخواست در انتظار بررسی یا snapshot تازه در دسترس نیست.',true);return;}
    if(decision==='approve'&&!inventoryTransferApprovalFits(transfer)){notify('موجودی فعلی برای تأیید این انتقال کافی نیست؛ snapshot را تازه کنید.',true);return;}
    activeInventoryTransferDecision={transferId:Number(transferId),decision};
    $('inventory-transfer-decision-title').textContent=decision==='approve'?'تأیید انتقال بین انبارها':'رد درخواست انتقال';
    $('inventory-transfer-decision-context').textContent=(transfer.lines||[]).map(line=>`${line.source?.name||`کالای ${line.sourceItemId}`} × ${money(line.quantity)} ${line.source?.unit||''}`).join('، ');
    $('inventory-transfer-decision-note').value='';$('inventory-transfer-decision-pin').value='';$('inventory-transfer-decision-error').textContent='';$('inventory-transfer-decision-submit').textContent=decision==='approve'?'تأیید و ثبت انتقال':'ثبت رد درخواست';$('inventory-transfer-decision-dialog').showModal();
  }
  function openInventoryMovement(itemId,movementType){
    const item=(workspaceInventory?.payload?.items||[]).find(row=>Number(row.id)===Number(itemId));if(!item)return;
    if(workspaceInventory?.expired||!state?.localManagerPinConfigured){notify('برای ثبت گردش، snapshot تازه و PIN مدیر محلی لازم است.',true);return;}
    const projected=inventoryProjectedState(item);if(projected.stale){notify('گردش قبلی با snapshot فعلی سازگار نیست؛ ابتدا نسخهٔ انبار را تازه کنید.',true);return;}
    if(!item.isActive||!item.trackStock){notify('این کالا فعال نیست یا ردیابی موجودی ندارد.',true);return;}
    activeInventoryMovement={item,movementType};$('inventory-movement-type').value=movementType;
    $('inventory-movement-title').textContent=`${movementType==='out'?'ثبت خروج':'ثبت شمارش موجودی'} · ${item.name}`;
    $('inventory-movement-context').textContent=`موجودی snapshot: ${money(item.stock)} ${item.unit} · موجودی پیش‌بینی‌شدهٔ محلی: ${money(projected.stock)} ${item.unit} · بهای واحد: ${money(projected.cost)} تومان`;
    $('inventory-movement-label').textContent=movementType==='out'?'مقدار خروج':'موجودی شمارش‌شده';$('inventory-movement-quantity').min=movementType==='out'?'0.000001':'0';$('inventory-movement-quantity').max=String(movementType==='out'?projected.stock:1_000_000_000);$('inventory-movement-quantity').value='';$('inventory-movement-note').value='';$('inventory-movement-pin').value='';$('inventory-movement-error').textContent='';$('inventory-movement-dialog').showModal();$('inventory-movement-quantity').focus();
  }
  function addInventoryReceiptLine(itemId=''){
    const available=(workspaceInventory?.payload?.items||[]).filter(item=>item.isActive&&item.trackStock&&!inventoryProjectedState(item).stale),host=$('inventory-receipt-lines');
    if(!available.length){notify('برای ثبت فاکتور، کالای فعال و قابل ردیابی در snapshot موجود نیست.',true);return;}
    const selectedId=Number(itemId)||Number(available[0].id);
    const row=document.createElement('div');row.className='inventory-receipt-row';
    row.innerHTML=`<label>کالا<select data-receipt-item required>${available.map(item=>`<option value="${item.id}" ${Number(item.id)===selectedId?'selected':''}>${esc(item.name)} · ${esc(item.unit)}</option>`).join('')}</select></label><label>مقدار<input data-receipt-quantity type="number" min="0.000001" step="any" value="1" required></label><label>بهای خرید واحد (تومان)<input data-receipt-unit-cost inputmode="numeric" dir="ltr" required></label><span class="inventory-receipt-line-total">جمع: <b data-receipt-line-total>۰</b> تومان</span><button class="text-button" type="button" data-receipt-remove aria-label="حذف ردیف">حذف</button>`;
    const selected=available.find(item=>Number(item.id)===selectedId);row.querySelector('[data-receipt-unit-cost]').value=money(selected?.lastPurchaseCost||selected?.costPerUnit||0);host.append(row);inventoryReceiptRecalculate();
  }
  function inventoryReceiptRecalculate(){
    const rows=[...$('inventory-receipt-lines').children];let subtotal=0,valid=rows.length>0;
    for(const row of rows){const quantity=Number(digits(row.querySelector('[data-receipt-quantity]').value)),unitCost=Number(digits(row.querySelector('[data-receipt-unit-cost]').value)),amount=Number.isFinite(quantity)&&Number.isFinite(unitCost)?Math.round(quantity*unitCost):0;if(!row.querySelector('[data-receipt-item]').value||quantity<=0||unitCost<=0||amount<=0)valid=false;subtotal+=amount;row.querySelector('[data-receipt-line-total]').textContent=money(amount);}
    const discount=Number(digits($('inventory-receipt-discount').value)),extra=Number(digits($('inventory-receipt-extra').value)),shipping=Number(digits($('inventory-receipt-shipping').value)),tax=Number(digits($('inventory-receipt-tax').value)),invoiceTotal=subtotal-discount+extra+shipping+tax;
    $('inventory-receipt-subtotal').textContent=money(subtotal);$('inventory-receipt-total').textContent=money(Number.isFinite(invoiceTotal)?invoiceTotal:0);
    if(!inventoryPaidEdited||$('inventory-receipt-pay-from').value==='payable')$('inventory-receipt-paid').value=money($('inventory-receipt-pay-from').value==='payable'?0:Math.max(0,invoiceTotal));
    return {rows,subtotal,total:invoiceTotal,discount,extra,shipping,tax,valid:valid&&Number.isSafeInteger(subtotal)&&Number.isSafeInteger(invoiceTotal)&&invoiceTotal>0&&discount<=subtotal};
  }
  function inventoryCreateItemFactor(stockUnit,recipeUnit){
    if(stockUnit===recipeUnit)return 1;
    const conversion={گرم:{dimension:'weight',scale:1},کیلوگرم:{dimension:'weight',scale:1000},'میلی‌لیتر':{dimension:'volume',scale:1},لیتر:{dimension:'volume',scale:1000},عدد:{dimension:'piece',scale:1},بسته:{dimension:'pack',scale:1},کارتن:{dimension:'carton',scale:1},متر:{dimension:'length',scale:1}},stock=conversion[stockUnit],recipe=conversion[recipeUnit];
    return stock&&recipe&&stock.dimension===recipe.dimension?recipe.scale/stock.scale:null;
  }
  function updateInventoryCreateItemFactor(){
    const factor=inventoryCreateItemFactor($('inventory-create-item-unit').value,$('inventory-create-item-recipe-unit').value),wrap=$('inventory-create-item-factor-wrap'),input=$('inventory-create-item-factor');
    wrap.hidden=factor!==null;input.required=factor===null;if(factor!==null)input.value=String(factor);else if(!input.value||Number(input.value)<=0)input.value='1';
  }
  function openInventoryCreateItem(){
    const snapshot=workspaceInventory,payload=snapshot?.payload;
    if(!snapshot||snapshot.expired||!state?.localManagerPinConfigured){notify('برای تعریف کالا، snapshot تازهٔ انبار و PIN مدیر محلی لازم است.',true);return;}
    $('inventory-create-item-form').reset();$('inventory-create-item-name').value='';$('inventory-create-item-sku').value='';$('inventory-create-item-warehouse').innerHTML='<option value="">انبار اصلی / بدون انبار</option>'+((payload.warehouses||[]).map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join(''));
    $('inventory-create-item-category').innerHTML='<option value="">بدون دسته‌بندی</option>'+((payload.categories||[]).map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join(''));
    $('inventory-create-item-unit').value='عدد';$('inventory-create-item-recipe-unit').value='عدد';$('inventory-create-item-factor').value='1';$('inventory-create-item-opening-stock').value='0';$('inventory-create-item-min-stock').value='0';$('inventory-create-item-reorder-point').value='0';$('inventory-create-item-opening-cost').value='۰';$('inventory-create-item-last-cost').value='۰';$('inventory-create-item-expiry').value='';$('inventory-create-item-track').checked=true;$('inventory-create-item-active').checked=true;$('inventory-create-item-note').value='';$('inventory-create-item-pin').value='';$('inventory-create-item-error').textContent='';updateInventoryCreateItemFactor();$('inventory-create-item-dialog').showModal();$('inventory-create-item-name').focus();
  }
  function inventoryCreateExpiryDate(){
    const value=$('inventory-create-item-expiry').value.trim();if(!value)return null;const date=jalaliToGregorian(value);if(!date)return undefined;const pad=part=>String(part).padStart(2,'0');return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
  }
  function openInventoryReceipt(){
    const snapshot=workspaceInventory,payload=snapshot?.payload,available=(payload?.items||[]).filter(item=>item.isActive&&item.trackStock);
    if(!snapshot||snapshot.expired||!state?.localManagerPinConfigured||!available.length){notify('برای ثبت فاکتور، snapshot تازهٔ انبار، کالای قابل ردیابی و PIN مدیر لازم است.',true);return;}
    $('inventory-receipt-date').value=tehranJalaliDateTime(new Date()).date;$('inventory-receipt-invoice').value='';
    $('inventory-receipt-supplier').innerHTML='<option value="">بدون فروشنده</option>'+((payload.suppliers||[]).filter(item=>item.isActive).map(item=>`<option value="${item.id}">${esc(item.name)}${item.hasPayableAccount?' · حساب تفصیلی دارد':''}</option>`).join(''));
    $('inventory-receipt-lines').innerHTML='';addInventoryReceiptLine();
    $('inventory-receipt-discount').value='۰';$('inventory-receipt-extra').value='۰';$('inventory-receipt-shipping').value='۰';$('inventory-receipt-tax').value='۰';$('inventory-receipt-pay-from').value='cash';$('inventory-receipt-paid').value='۰';$('inventory-receipt-note').value='';$('inventory-receipt-pin').value='';$('inventory-receipt-error').textContent='';inventoryPaidEdited=false;inventoryReceiptRecalculate();$('inventory-receipt-dialog').showModal();
  }
  function inventoryReceiptDate(){return parseTehranJalaliDateTime($('inventory-receipt-date').value,'12:00');}
  function renderWorkspaceInventory(){
    const snapshot=workspaceInventory,payload=snapshot?.payload,sync=state?.workspaceInventorySync;
    if(!snapshot||!payload){
      $('inventory-sync').textContent=sync?.message||'داده‌ای دریافت نشده';$('inventory-sync').className='pos-status';
      $('inventory-state').textContent=sync?.message||'برای دریافت فهرست انبار، دستگاه را هنگام اتصال به اینترنت همگام‌سازی کنید.';
      $('inventory-summary').innerHTML='';$('inventory-list').innerHTML='';$('inventory-movements').innerHTML='';$('inventory-receipt-open').disabled=true;$('inventory-create-item-open').disabled=true;renderWorkspaceInventoryWasteRequests();renderWorkspaceInventoryTransfers();return;
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
    $('inventory-receipt-open').disabled=snapshot.expired||!state?.localManagerPinConfigured||!items.some(item=>item.isActive&&item.trackStock&&!inventoryProjectedState(item).stale);
    $('inventory-create-item-open').disabled=snapshot.expired||!state?.localManagerPinConfigured;
    $('inventory-state').textContent=`${money(payload.totalItems)} قلم کالا · ${money(visible.length)} نتیجه · ${money(movements.length)} گردش اخیر · آخرین دریافت ${new Date(snapshot.issuedAt).toLocaleString('fa-IR')}${sync?.message?` · ${sync.message}`:''}`;
    $('inventory-summary').innerHTML=`<article><span>کالاهای ثبت‌شده</span><b>${money(payload.totalItems)}</b></article><article><span>نیازمند تأمین</span><b>${money(lowItems.length)}</b></article><article><span>نزدیک انقضا / منقضی</span><b>${money(expiringItems.length)}</b></article>`;
    $('inventory-list').innerHTML=visible.length?`<table class="pos-table inventory-table"><thead><tr><th>کالا</th><th>انبار</th><th>موجودی / حداقل</th><th>هشدار</th><th>انقضا</th><th>بهای واحد</th></tr></thead><tbody>${visible.map(item=>{const days=inventoryExpiryDays(item,today),isLow=lowIds.has(item.id),isExpiring=expiringIds.has(item.id),projection=inventoryProjectedState(item),hasQueued=Math.abs(projection.stock-Number(item.stock))>1e-8,warning=projection.stale?'نیازمند snapshot تازه':isLow&&isExpiring?'کمبود · انقضا':isLow?'کمبود':isExpiring?'انقضا':item.isActive?'عادی':'غیرفعال';return `<tr><td><b>${esc(item.name)}</b><small>${esc(item.sku||'بدون کد')}</small></td><td>${esc(warehouseById.get(item.warehouseId)||'انبار اصلی')}</td><td>${money(item.stock)} ${esc(item.unit)}<small>حداقل ${money(item.minStock)} ${esc(item.unit)}</small>${projection.stale?'<small>فرمان قبلی متعارض/ردشده است</small>':hasQueued?`<small>با درخواست‌های صف: ${money(projection.stock)} ${esc(item.unit)}</small>`:''}</td><td><span class="inventory-badge ${projection.stale||isLow||isExpiring?'warning':item.isActive?'':'muted'}">${warning}</span></td><td>${item.expiryDate?`${new Date(`${item.expiryDate}T12:00:00Z`).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'})}${days!==null&&days<=30?`<small>${days<0?'گذشته از تاریخ':days===0?'امروز':`${money(days)} روز مانده`}</small>`:''}`:'—'}</td><td>${money(item.costPerUnit)} تومان / ${esc(item.unit)}${projection.stale?'':hasQueued?`<small>پیش‌بینی صف: ${money(projection.cost)} تومان</small>`:''}</td></tr>`}).join('')}</tbody></table>`:'<p class="muted">کالایی با این جست‌وجو یا فیلتر در نسخهٔ محلی پیدا نشد.</p>';
    appendInventoryWasteActions(visible);
    const itemNameById=new Map(items.map(item=>[item.id,item.name]));
    const movementLabels={in:'ورود',out:'خروج',waste:'ضایعات',adjust:'اصلاح',sale:'مصرف فروش',transfer:'انتقال'};
    $('inventory-movements').innerHTML=movements.length?`<table class="pos-table inventory-table"><thead><tr><th>زمان</th><th>کالا</th><th>نوع</th><th>مقدار</th><th>مانده پس از گردش</th><th>مبلغ</th></tr></thead><tbody>${movements.map(movement=>`<tr><td>${new Date(movement.createdAt).toLocaleString('fa-IR')}</td><td>${esc(itemNameById.get(movement.itemId)||`کالای ${movement.itemId}`)}</td><td>${movementLabels[movement.type]||esc(movement.type)}</td><td>${Number(movement.delta)>0?'+':''}${money(movement.delta)}</td><td>${money(movement.balanceAfter)}</td><td>${money(movement.amount)} تومان</td></tr>`).join('')}</tbody></table>`:'<p class="muted">گردشی در نسخهٔ محلی موجود نیست.</p>';
    renderWorkspaceInventoryWasteRequests();renderWorkspaceInventoryTransfers();
  }
  async function loadWorkspaceInventory(){
    try{workspaceInventory=await call('offline_workspace_inventory');renderWorkspaceInventory();}
    catch(error){$('inventory-state').textContent=String(error);$('inventory-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('inventory-sync').className='pos-status offline';}
  }
  function renderWorkspaceOrders(){
    const snapshot=workspaceOrders,payload=snapshot?.payload,sync=state?.workspaceOrdersSync;
    if(!snapshot||!payload){
      $('server-orders-sync').textContent=sync?.message||'در انتظار دریافت';$('server-orders-sync').className='pos-status offline';
      $('server-orders-state').textContent=state?.workspaceOrderHistoryError?.message||sync?.message||'برای دیدن سفارش‌های سایت در زمان قطعی، دستگاه را هنگام اتصال به اینترنت همگام‌سازی کنید.';
      $('server-orders-list').innerHTML='';serverOrderSales=[];$('server-orders-more').hidden=true;return;
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
    const updated=snapshot.issuedAt?new Date(snapshot.issuedAt).toLocaleString('fa-IR'):'زمان همگام‌سازی ثبت نشده';
    const historySync=state?.workspaceOrderHistorySync,historyError=state?.workspaceOrderHistoryError?.message;
    $('server-orders-sync').textContent=snapshot.expired?'نسخهٔ قدیمی · فقط مشاهده':historySync?.complete?'آرشیو کامل':`دریافت ${money(payload.totalOrders)} سفارش`;$('server-orders-sync').className=`pos-status ${snapshot.expired?'offline':historySync?.complete?'online':''}`;
    $('server-orders-state').textContent=`${money(historySync?.cachedOrders??payload.totalOrders)} سفارش و جزئیاتشان روی این دستگاه ذخیره است · ${historySync?.complete?'آرشیو کامل و قابل مشاهده بدون اینترنت است':'آرشیو در پس‌زمینه در حال تکمیل است؛ در قطعی، موارد دریافت‌شده باز می‌شوند'} · آخرین دریافت ${updated}${historyError?` · ${historyError}`:sync?.message?` · ${sync.message}`:''}`;
    $('server-orders-list').innerHTML=orders.length?`<table class="pos-table server-orders-table"><thead><tr><th>شماره</th><th>زمان</th><th>نوع</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت سفارش</th><th>جزئیات</th></tr></thead><tbody>${orders.map((order,index)=>`<tr><td><b>#${money(order.number)}</b></td><td>${new Date(order.createdAt).toLocaleString('fa-IR')}</td><td>${order.type==='dine_in'?'داخل سالن':'بیرون‌بر'}${order.tableName?`<small>${esc(order.tableName)}</small>`:''}</td><td>${money(order.total)} تومان</td><td><span class="pos-badge ${order.paymentStatus==='paid'?'synced':'conflict'}">${paymentLabels[order.paymentStatus]||esc(order.paymentStatus)}</span></td><td>${statusLabels[order.status]||esc(order.status)}</td><td><button class="button secondary" data-server-order="${index}">جزئیات</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">سفارشی در آخرین نسخهٔ دریافت‌شده وجود ندارد.</p>';
    $('server-orders-more').hidden=!snapshot.hasMore&&snapshot.complete;$('server-orders-more').disabled=!snapshot.hasMore&&!snapshot.complete;$('server-orders-more').textContent=snapshot.hasMore?'سفارش‌های قدیمی‌تر':snapshot.complete?'تاریخچه کامل است':'در حال دریافت سفارش‌های قدیمی‌تر…';
  }
  async function loadWorkspaceOrders(offset=0,limit=100,append=false){
    try{const page=await call('offline_workspace_orders',{offset,limit});if(append&&workspaceOrders){page.payload.orders=[...workspaceOrders.payload.orders,...page.payload.orders];page.hasMore=page.payload.orders.length<page.payload.totalOrders;}workspaceOrders=page;workspaceOrdersLoaded=true;renderWorkspaceOrders();}
    catch(error){workspaceOrdersLoaded=true;$('server-orders-state').textContent=String(error);$('server-orders-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('server-orders-sync').className='pos-status offline';}
  }
  function showReservationDetails(id){
    const row=(workspaceReservations?.payload?.reservations||[]).find(item=>item.id===id);if(!row)return;
    const statuses={requested:'درخواست‌شده',confirmed:'تأییدشده',cancelled:'لغوشده',completed:'انجام‌شده',no_show:'عدم حضور'};
    const types={normal:'عادی',occasion:'مناسبت',business:'کاری'};
    const deposits={not_required:'نیازی نیست',pending:'در انتظار پرداخت',paid:'پرداخت‌شده',waived:'معاف‌شده'};
    const date=value=>{try{return new Date(value).toLocaleString('fa-IR')}catch{return '—'}};
    $('reservation-detail-title').textContent=`جزئیات رزرو #${money(row.id)}`;
    $('reservation-detail-content').innerHTML=`<div class="pos-detail-badges"><span class="pos-badge">${statuses[row.status]||esc(row.status)}</span><span class="pos-badge">${deposits[row.depositStatus]||esc(row.depositStatus)}</span></div><div class="pos-detail-grid"><span>نام مهمان</span><b>${esc(row.customerName)}</b><span>شماره موبایل</span><b dir="ltr">${esc(row.customerPhone)}</b><span>زمان رزرو</span><b>${esc(date(row.startsAt))}</b><span>میز</span><b>${esc(row.tableName||'تعیین نشده')}</b><span>تعداد مهمان</span><b>${money(row.guestCount)} نفر</b><span>مدت</span><b>${money(row.durationMinutes)} دقیقه</b><span>نوع رزرو</span><b>${types[row.reservationType]||esc(row.reservationType)}</b><span>پیش‌پرداخت</span><b>${money(row.depositAmount)} تومان · ${deposits[row.depositStatus]||esc(row.depositStatus)}${row.depositMethod?` · ${esc(row.depositMethod)}`:''}</b><span>ثبت اولیه</span><b>${esc(date(row.createdAt))}</b><span>آخرین تغییر</span><b>${esc(date(row.updatedAt))}</b></div><div class="pos-detail-note"><b>توضیحات</b><p>${esc(row.note||'توضیحی ثبت نشده است')}</p></div>`;
    $('reservation-detail-dialog').showModal();
  }
  function renderWorkspaceReservationHistory(){
    const snapshot=workspaceReservations,payload=snapshot?.payload,sync=state?.workspaceReservationsSync;
    if(!snapshot||!payload){
      $('server-reservations-sync').textContent=sync?.message||'در انتظار دریافت';$('server-reservations-sync').className='pos-status offline';
      $('server-reservations-state').textContent=sync?.message||'برای مشاهدهٔ رزروهای ثبت‌شده هنگام قطعی، این دستگاه را در زمان اتصال همگام‌سازی کنید.';
      $('server-reservations-list').innerHTML='';return;
    }
    const reservations=Array.isArray(payload.reservations)?payload.reservations:[];
    const statuses={requested:'درخواست‌شده',confirmed:'تأییدشده',cancelled:'لغوشده',completed:'انجام‌شده',no_show:'عدم حضور'};
    const deposits={not_required:'بدون پیش‌پرداخت',pending:'پیش‌پرداخت در انتظار',paid:'پیش‌پرداخت‌شده',waived:'معاف‌شده'};
    const updated=new Date(snapshot.issuedAt).toLocaleString('fa-IR');
    $('server-reservations-sync').textContent=snapshot.expired?'نسخهٔ قدیمی · فقط مشاهده':`آخرین دریافت ${updated}`;$('server-reservations-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('server-reservations-state').textContent=`${money(payload.totalReservations)} رزرو در نسخهٔ محلی · آخرین دریافت ${updated}${sync?.message?` · ${sync.message}`:''}`;
    $('server-reservations-list').innerHTML=reservations.length?`<table class="pos-table server-reservations-table"><thead><tr><th>مهمان</th><th>زمان رزرو</th><th>میز</th><th>تعداد</th><th>وضعیت</th><th>پیش‌پرداخت</th><th>جزئیات</th><th>عملیات آفلاین</th></tr></thead><tbody>${reservations.map(row=>{const queued=localReservationStatusCommand(row,snapshot),canAct=!snapshot.expired&&!!state?.localManagerPinConfigured&&!queued,actions=row.status==='requested'?`${row.depositStatus==='pending'?'<button class="button secondary" type="button" disabled title="پیش‌پرداخت فقط پس از دریافت وجه قابل تأیید است">تأیید</button>':`<button class="button primary" type="button" data-reservation-status-change="${row.id}" data-status="confirmed" ${canAct?'':'disabled'}>تأیید</button>`}<button class="button secondary" type="button" data-reservation-status-change="${row.id}" data-status="cancelled" ${canAct?'':'disabled'}>رد / لغو</button>`:row.status==='confirmed'?`<button class="button secondary" type="button" data-reservation-status-change="${row.id}" data-status="cancelled" ${canAct?'':'disabled'}>لغو</button><button class="button secondary" type="button" data-reservation-status-change="${row.id}" data-status="completed" ${canAct?'':'disabled'}>انجام شد</button><button class="button secondary" type="button" data-reservation-status-change="${row.id}" data-status="no_show" ${canAct?'':'disabled'}>عدم حضور</button>`:'—';return `<tr><td><b>${esc(row.customerName)}</b><small dir="ltr">${esc(row.customerPhone)}</small></td><td>${new Date(row.startsAt).toLocaleString('fa-IR')}</td><td>${esc(row.tableName||'تعیین نشده')}</td><td>${money(row.guestCount)}</td><td>${statuses[row.status]||esc(row.status)}${queued?`<small class="reservation-pending">${queued.state==='pending'?`در صف: ${statuses[queued.targetStatus]||queued.targetStatus}`:queued.error||'در انتظار snapshot تازه'}</small>`:''}</td><td>${deposits[row.depositStatus]||esc(row.depositStatus)}${Number(row.depositAmount)?`<small>${money(row.depositAmount)} تومان</small>`:''}</td><td><button class="button secondary" data-reservation-detail="${row.id}">جزئیات</button></td><td><div class="reservation-actions">${actions}</div></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">رزروی در آخرین نسخهٔ دریافت‌شده وجود ندارد.</p>';
  }
  async function loadWorkspaceReservations(){
    try{workspaceReservations=await call('offline_workspace_reservations');workspaceReservationsLoaded=true;renderWorkspaceReservationHistory();}
    catch(error){workspaceReservationsLoaded=true;$('server-reservations-state').textContent=String(error);$('server-reservations-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('server-reservations-sync').className='pos-status offline';}
  }
  function localReservationStatusCommand(row,snapshot){
    return (state?.workspaceCommands?.recent||[]).find(command=>command.module==='reservations'&&command.action==='set_status'&&Number(command.reservationId)===Number(row.id)&&command.baseSnapshotId===snapshot.snapshotId&&(command.state==='pending'||Date.parse(command.createdAt)>Date.parse(snapshot.issuedAt)));
  }
  function openReservationStatusChange(id,status){
    const snapshot=workspaceReservations,row=(snapshot?.payload?.reservations||[]).find(item=>Number(item.id)===Number(id));if(!row)return;
    if(snapshot.expired||!state?.localManagerPinConfigured){notify('برای تغییر آفلاین، snapshot تازه و PIN مدیر محلی لازم است.',true);return;}
    if(localReservationStatusCommand(row,snapshot)){notify('تغییر قبلی هنوز همگام یا با snapshot تازه بازبینی نشده است.',true);return;}
    const labels={confirmed:'تأیید رزرو',cancelled:'رد یا لغو رزرو',completed:'ثبت انجام رزرو',no_show:'ثبت عدم حضور'};
    activeReservationStatus={id:Number(id),status};$('reservation-status-title').textContent=labels[status]||'تغییر وضعیت رزرو';$('reservation-status-context').textContent=`رزرو ${row.customerName} · ${new Date(row.startsAt).toLocaleString('fa-IR')} · وضعیت فعلی: ${row.status==='requested'?'درخواست‌شده':'تأییدشده'}. این تغییر پس از اتصال در سرور بررسی می‌شود.`;$('reservation-status-pin').value='';$('reservation-status-error').textContent='';$('reservation-status-dialog').showModal();
  }
  function renderWorkspaceShifts(){
    const snapshot=workspaceShifts,payload=snapshot?.payload,sync=state?.workspaceShiftsSync;
    if(!snapshot||!payload){
      $('shifts-sync').textContent=sync?.message||'در انتظار دریافت';$('shifts-sync').className='pos-status offline';
      $('shifts-state').textContent=sync?.message||'برای مشاهدهٔ برنامه هنگام قطعی، دستگاه را در زمان اتصال به اینترنت همگام‌سازی کنید.';
      $('shifts-summary').innerHTML='';$('staff-schedule-list').innerHTML='';$('staff-leave-list').innerHTML='';$('staff-swap-list').innerHTML='';$('staff-local-requests').innerHTML='';$('staff-roster').innerHTML='';$('staff-shift-create-open').disabled=true;$('staff-leave-open').disabled=true;return;
    }
    const schedules=Array.isArray(payload.schedules)?payload.schedules:[],leaves=Array.isArray(payload.leaveRequests)?payload.leaveRequests:[],swaps=Array.isArray(payload.shiftSwapRequests)?payload.shiftSwapRequests:[],staffRows=Array.isArray(payload.staff)?payload.staff:[],localAttendanceEvents=Array.isArray(snapshot.localAttendanceEvents)?snapshot.localAttendanceEvents:[];
    const issuedAt=new Date(snapshot.issuedAt).toLocaleString('fa-IR'),rangeStart=new Date(payload.range?.from||snapshot.issuedAt).toLocaleDateString('fa-IR'),rangeEnd=new Date(payload.range?.to||snapshot.validUntil).toLocaleDateString('fa-IR');
    $('shifts-sync').textContent=snapshot.expired?'نسخهٔ قدیمی · فقط مشاهده':`آخرین دریافت ${issuedAt}`;$('shifts-sync').className=`pos-status ${snapshot.expired?'offline':'online'}`;
    $('shifts-state').textContent=`بازهٔ ذخیره‌شده: ${rangeStart} تا ${rangeEnd} · ${money(payload.totalSchedules)} شیفت و ${money(payload.totalLeaveRequests)} درخواست مرخصی${sync?.message?` · ${sync.message}`:''}`;
    $('staff-shift-create-open').disabled=snapshot.expired||!state?.localManagerPinConfigured||!staffRows.length;
    $('staff-leave-open').disabled=snapshot.expired||!state?.localManagerPinConfigured||!staffRows.length;
    const now=Date.now(),upcoming=schedules.filter(item=>item.status==='scheduled'&&new Date(item.startsAt).getTime()>=now).length,pendingLeaves=leaves.filter(item=>item.status==='pending').length,staffWithShift=new Set(schedules.map(item=>item.staffId)).size;
    $('shifts-summary').innerHTML=`<article><span>شیفت‌های پیش‌رو</span><b>${money(upcoming)}</b></article><article><span>مرخصی‌های در انتظار بررسی</span><b>${money(pendingLeaves)}</b></article><article><span>کارمند دارای شیفت در بازه</span><b>${money(staffWithShift)}</b></article>`;
    const query=$('shifts-search').value.trim().toLocaleLowerCase('fa-IR'),statusLabels={scheduled:'برنامه‌ریزی‌شده',absent:'غیبت',canceled:'لغوشده'},roleLabels={waiter:'گارسون',cashier:'صندوقدار',chef:'آشپز',warehouse:'انباردار',accountant:'حسابدار',manager:'مدیر'};
    const filtered=schedules.filter(item=>!query||`${item.staffName} ${item.location}`.toLocaleLowerCase('fa-IR').includes(query));
    const localEvent=(scheduleId,action)=>localAttendanceEvents.find(event=>event.payload?.scheduleId===scheduleId&&event.payload?.action===action&&(event.state==='pending'||(event.state==='synced'&&!['approved','rejected','conflict'].includes(event.reviewStatus))));
    const eventLabel=event=>event?.state==='pending'?'ذخیره شد · در صف ارسال':event?.reviewStatus==='approved'?'تأیید مدیر شد':event?.reviewStatus==='rejected'?'درخواست توسط مدیر رد شد':event?.reviewStatus==='conflict'?'نیازمند بازبینی مدیر':'ارسال شد · منتظر تأیید مدیر';
    $('staff-schedule-list').innerHTML=filtered.length?filtered.map(item=>{const checkInEvent=localEvent(item.id,'check_in'),checkOutEvent=localEvent(item.id,'check_out'),checkInAt=item.attendance?.checkInAt||checkInEvent?.payload?.occurredAt,checkOutAt=item.attendance?.checkOutAt||checkOutEvent?.payload?.occurredAt,checkIn=checkInAt?new Date(checkInAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}):'ثبت نشده',checkOut=checkOutAt?new Date(checkOutAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}):'ثبت نشده',start=new Date(item.startsAt).getTime(),end=new Date(item.endsAt).getTime(),valid=!snapshot.expired&&state?.localManagerPinConfigured,canCheckIn=valid&&item.status==='scheduled'&&!checkInAt&&now>=start-2*60*60_000&&now<=end+2*60*60_000,canCheckOut=valid&&item.status==='scheduled'&&!!checkInAt&&!checkOutAt&&now>=start&&now<=end+12*60*60_000,canRequestSwap=valid&&item.status==='scheduled'&&start>now;return `<article class="offline-shift-card"><div class="offline-shift-head"><b>${esc(item.staffName)}</b><span class="pos-badge ${item.status==='scheduled'?'synced':item.status==='absent'?'conflict':''}">${statusLabels[item.status]||esc(item.status)}</span></div><p>${new Date(item.startsAt).toLocaleString('fa-IR')} تا ${new Date(item.endsAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</p><div class="offline-shift-meta"><span>محل: ${esc(item.location||'ثبت نشده')}</span><span>ورود: ${checkIn}</span><span>خروج: ${checkOut}</span></div>${checkInEvent&&!item.attendance?.checkInAt?`<small class="offline-event-status ${checkInEvent.state==='synced'?'synced':''}">${eventLabel(checkInEvent)}</small>`:''}${checkOutEvent&&!item.attendance?.checkOutAt?`<small class="offline-event-status ${checkOutEvent.state==='synced'?'synced':''}">${eventLabel(checkOutEvent)}</small>`:''}${item.absenceNote?`<small class="offline-shift-note">توضیح غیبت: ${esc(item.absenceNote)}</small>`:''}${canCheckIn||canCheckOut||canRequestSwap?`<div class="offline-shift-actions">${canCheckIn?`<button class="button secondary" data-offline-attendance="check_in" data-schedule-id="${item.id}">ثبت ورود آفلاین</button>`:''}${canCheckOut?`<button class="button secondary" data-offline-attendance="check_out" data-schedule-id="${item.id}">ثبت خروج آفلاین</button>`:''}${canRequestSwap?`<button class="button secondary" data-request-shift-change="${item.id}">درخواست تعویض</button>`:''}</div>`:''}</article>`}).join(''):'<p class="muted">شیفتی در بازهٔ snapshot پیدا نشد.</p>';
    const leaveKinds={personal:'شخصی',sick:'استعلاجی',unpaid:'بدون حقوق'},leaveStatuses={pending:'در انتظار',approved:'تأییدشده',rejected:'ردشده'};
    $('staff-leave-list').innerHTML=leaves.length?leaves.map(item=>`<article class="offline-shift-card"><div class="offline-shift-head"><b>${esc(item.staffName)}</b><span class="pos-badge ${item.status==='approved'?'synced':item.status==='pending'?'conflict':''}">${leaveStatuses[item.status]||esc(item.status)}</span></div><p>${new Date(item.startsAt).toLocaleString('fa-IR')} تا ${new Date(item.endsAt).toLocaleString('fa-IR')}</p><div class="offline-shift-meta"><span>نوع: ${leaveKinds[item.kind]||esc(item.kind)}</span><span>ثبت: ${new Date(item.createdAt).toLocaleDateString('fa-IR')}</span></div>${item.reason?`<small class="offline-shift-note">دلیل: ${esc(item.reason)}</small>`:''}${item.decisionNote?`<small class="offline-shift-note">یادداشت تصمیم: ${esc(item.decisionNote)}</small>`:''}</article>`).join(''):'<p class="muted">در بازهٔ ذخیره‌شده درخواست مرخصی وجود ندارد.</p>';
    const swapStatuses={pending_target:'در انتظار پاسخ همکار',pending_manager:'در انتظار تأیید مدیر',approved:'تأییدشده',rejected:'ردشده'};
    $('staff-swap-list').innerHTML=swaps.length?swaps.map(item=>`<article class="offline-shift-card"><div class="offline-shift-head"><b>${esc(item.fromStaffName)} ← ${esc(item.toStaffName)}</b><span class="offline-swap-status ${esc(item.status)}">${swapStatuses[item.status]||esc(item.status)}</span></div><p>${new Date(item.startsAt).toLocaleString('fa-IR')} تا ${new Date(item.endsAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</p>${item.reason?`<small class="offline-shift-note">توضیح: ${esc(item.reason)}</small>`:''}${item.decisionNote?`<small class="offline-shift-note">یادداشت: ${esc(item.decisionNote)}</small>`:''}</article>`).join(''):'<p class="muted">درخواست تعویض ثبت‌شده‌ای در نسخهٔ ذخیره‌شده نیست.</p>';
    const pendingRequests=localAttendanceEvents.filter(item=>item.action==='create_shift'||item.action==='leave_request'||item.action==='shift_change');
    const localState={pending:'ذخیره‌شده · در صف ارسال',synced:'ارسال‌شده · در انتظار بررسی',conflict:'تعارض · نیازمند بررسی',rejected:'ردشده'};
    $('staff-local-requests').innerHTML=pendingRequests.length?pendingRequests.map(event=>{const data=event.payload||{},isLeave=event.action==='leave_request',isCreate=event.action==='create_shift',shift=schedules.find(item=>item.id===data.scheduleId),person=staffRows.find(row=>row.id===(isLeave||isCreate?data.staffId:shift?.staffId)),target=staffRows.find(row=>row.id===data.targetStaffId),label=isCreate?'ثبت شیفت':isLeave?'درخواست مرخصی':'درخواست تعویض شیفت',detail=isLeave?`${new Date(data.startsAt).toLocaleString('fa-IR')} تا ${new Date(data.endsAt).toLocaleString('fa-IR')}`:isCreate?`${new Date(data.startsAt).toLocaleString('fa-IR')} تا ${new Date(data.endsAt).toLocaleString('fa-IR')} · ${esc(data.location||'بدون محل')}`:`${new Date(shift?.startsAt||event.createdAt).toLocaleString('fa-IR')} · مقصد: ${target?.name||'—'}`,status=event.state==='synced'&&isCreate?'در سرور ثبت شد':localState[event.state]||esc(event.state);return `<article class="workspace-menu-command"><div><b>${label} · ${esc(person?.name||'کارمند')}</b><small>${detail}</small>${event.error?`<small class="offline-shift-note">${esc(event.error)}</small>`:''}</div><span class="offline-swap-status ${esc(event.state)}">${status}</span></article>`}).join(''):'<p class="muted">درخواستی روی این دستگاه ذخیره نشده است.</p>';
    $('staff-roster').innerHTML=staffRows.length?staffRows.map(item=>`<article class="workspace-category-row"><div><h3>${esc(item.name)}</h3><p>${roleLabels[item.role]||esc(item.role)}</p></div></article>`).join(''):'<p class="muted">کارمند فعالی در snapshot نیست.</p>';
  }
  async function loadWorkspaceShifts(){
    try{workspaceShifts=await call('offline_workspace_shifts');workspaceShiftsLoaded=true;renderWorkspaceShifts();}
    catch(error){workspaceShiftsLoaded=true;$('shifts-state').textContent=String(error);$('shifts-sync').textContent='خواندن نسخهٔ محلی ناموفق بود';$('shifts-sync').className='pos-status offline';}
  }
  let attendanceIntent=null,editingMenu=null,shiftChangeIntent=null;
  const localDateTimeValue=date=>new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
  function openOfflineShiftCreate(){
    const snapshot=workspaceShifts,payload=snapshot?.payload,staffRows=Array.isArray(payload?.staff)?payload.staff:[];
    if(!snapshot||snapshot.expired||!state?.localManagerPinConfigured||!staffRows.length){notify('برای ثبت شیفت، snapshot تازهٔ کارکنان و PIN مدیر لازم است.',true);return;}
    $('staff-shift-create-member').innerHTML=staffRows.map(row=>`<option value="${row.id}">${esc(row.name)} · ${esc(row.role)}</option>`).join('');
    const from=new Date(payload.range.from),to=new Date(payload.range.to),start=new Date(Math.min(Math.max(Date.now()+60*60_000,from.getTime()),to.getTime()-8*60*60_000)),end=new Date(start.getTime()+8*60*60_000);
    const startValue=tehranJalaliDateTime(start),endValue=tehranJalaliDateTime(end);
    $('staff-shift-start-date').value=startValue.date;$('staff-shift-start-time').value=startValue.time;$('staff-shift-end-date').value=endValue.date;$('staff-shift-end-time').value=endValue.time;
    $('staff-shift-create-location').value='';$('staff-shift-create-pin').value='';$('staff-shift-create-error').textContent='';$('staff-shift-create-dialog').showModal();
  }
  function openOfflineLeaveRequest(){
    const snapshot=workspaceShifts,payload=snapshot?.payload,staffRows=Array.isArray(payload?.staff)?payload.staff:[];
    if(!snapshot||snapshot.expired||!state?.localManagerPinConfigured||!staffRows.length){notify('برای ثبت درخواست، snapshot تازهٔ کارکنان و PIN مدیر لازم است.',true);return;}
    $('staff-leave-member').innerHTML=staffRows.map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join('');
    const from=new Date(payload.range.from),to=new Date(payload.range.to),latestStart=new Date(to.getTime()-8*60*60_000),start=new Date(Math.min(Math.max(Date.now()+60*60_000,from.getTime()),latestStart.getTime()));
    $('staff-leave-start').min=localDateTimeValue(from);$('staff-leave-start').max=localDateTimeValue(to);$('staff-leave-end').min=localDateTimeValue(from);$('staff-leave-end').max=localDateTimeValue(to);
    $('staff-leave-start').value=localDateTimeValue(start);$('staff-leave-end').value=localDateTimeValue(new Date(start.getTime()+8*60*60_000));$('staff-leave-kind').value='personal';$('staff-leave-reason').value='';$('staff-leave-pin').value='';$('staff-leave-error').textContent='';$('staff-leave-dialog').showModal();
  }
  function openOfflineShiftChange(scheduleId){
    const snapshot=workspaceShifts,payload=snapshot?.payload,shift=(payload?.schedules||[]).find(row=>row.id===scheduleId),staffRows=Array.isArray(payload?.staff)?payload.staff:[];
    if(!shift||snapshot.expired||!state?.localManagerPinConfigured){notify('برای درخواست تعویض، snapshot تازه و PIN مدیر لازم است.',true);return;}
    const choices=staffRows.filter(row=>row.id!==shift.staffId);if(!choices.length){notify('کارمند فعال دیگری برای تعویض شیفت وجود ندارد.',true);return;}
    shiftChangeIntent={scheduleId};$('staff-swap-target').innerHTML=choices.map(row=>`<option value="${row.id}">${esc(row.name)}</option>`).join('');$('staff-swap-context').textContent=`${shift.staffName} · ${new Date(shift.startsAt).toLocaleString('fa-IR')} · مقصد فعلی: ${shift.location||'ثبت نشده'}`;$('staff-swap-reason').value='';$('staff-swap-pin').value='';$('staff-swap-error').textContent='';$('staff-swap-dialog').showModal();
  }
  function openOfflineAttendance(scheduleId,action){
    const item=(workspaceShifts?.payload?.schedules||[]).find(row=>row.id===scheduleId);if(!item)return;
    attendanceIntent={scheduleId,action};$('offline-attendance-title').textContent=action==='check_in'?'ثبت ورود آفلاین':'ثبت خروج آفلاین';$('offline-attendance-context').textContent=`${item.staffName} · ${new Date(item.startsAt).toLocaleString('fa-IR')} · زمان ثبت: ${new Date().toLocaleString('fa-IR')}`;$('offline-attendance-pin').value='';$('offline-attendance-error').textContent='';$('offline-attendance-dialog').showModal();$('offline-attendance-pin').focus();
  }
  $('staff-schedule-list').onclick=e=>{const swap=e.target.closest('[data-request-shift-change]'),button=e.target.closest('[data-offline-attendance]');if(swap)openOfflineShiftChange(Number(swap.dataset.requestShiftChange));else if(button)openOfflineAttendance(Number(button.dataset.scheduleId),button.dataset.offlineAttendance);};
  $('staff-leave-open').onclick=openOfflineLeaveRequest;
  $('staff-leave-form').onsubmit=async e=>{e.preventDefault();const submit=$('staff-leave-submit');submit.disabled=true;$('staff-leave-error').textContent='';try{const starts=new Date($('staff-leave-start').value),ends=new Date($('staff-leave-end').value);if(!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts){throw new Error('زمان شروع و پایان مرخصی را بررسی کنید.');}await call('offline_workspace_request_leave',{staffId:Number($('staff-leave-member').value),startsAt:starts.toISOString(),endsAt:ends.toISOString(),kind:$('staff-leave-kind').value,reason:$('staff-leave-reason').value,managerPin:digits($('staff-leave-pin').value)});$('staff-leave-dialog').close();notify('درخواست مرخصی به‌صورت رمزگذاری‌شده روی دستگاه ذخیره شد.');await loadWorkspaceShifts();await refresh();}catch(error){$('staff-leave-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('staff-swap-form').onsubmit=async e=>{e.preventDefault();if(!shiftChangeIntent)return;const submit=$('staff-swap-submit');submit.disabled=true;$('staff-swap-error').textContent='';try{await call('offline_workspace_request_shift_change',{scheduleId:shiftChangeIntent.scheduleId,targetStaffId:Number($('staff-swap-target').value),reason:$('staff-swap-reason').value,managerPin:digits($('staff-swap-pin').value)});$('staff-swap-dialog').close();shiftChangeIntent=null;notify('درخواست تعویض شیفت روی این دستگاه ذخیره شد؛ پس از اتصال، بررسی می‌شود.');await loadWorkspaceShifts();await refresh();}catch(error){$('staff-swap-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('offline-attendance-form').onsubmit=async e=>{e.preventDefault();if(!attendanceIntent)return;const submit=$('offline-attendance-submit');submit.disabled=true;$('offline-attendance-error').textContent='';try{await call('offline_workspace_record_attendance',{scheduleId:attendanceIntent.scheduleId,action:attendanceIntent.action,occurredAt:new Date().toISOString(),managerPin:digits($('offline-attendance-pin').value)});$('offline-attendance-dialog').close();attendanceIntent=null;notify('درخواست حضور روی همین دستگاه ذخیره شد؛ پس از اتصال برای تأیید مدیر ارسال می‌شود.');await loadWorkspaceShifts();await refresh();}catch(error){$('offline-attendance-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('inventory-list').onclick=e=>{const movement=e.target.closest('[data-inventory-movement]'),waste=e.target.closest('[data-inventory-waste]');if(movement&&!movement.disabled)openInventoryMovement(Number(movement.dataset.itemId),movement.dataset.inventoryMovement);else if(waste&&!waste.disabled)openInventoryWaste(Number(waste.dataset.inventoryWaste));};
  $('inventory-transfer-open').onclick=openInventoryTransfer;
  $('inventory-transfer-add-line').onclick=()=>addInventoryTransferLine();
  $('inventory-transfer-lines').addEventListener('change',event=>{const sourceSelect=event.target.closest('[data-transfer-source]');if(!sourceSelect)return;const row=sourceSelect.closest('.inventory-transfer-row'),destinationSelect=row.querySelector('[data-transfer-destination]'),quantityInput=row.querySelector('[data-transfer-quantity]'),source=(workspaceInventory?.payload?.items||[]).find(item=>item.id===Number(sourceSelect.value)),destinations=inventoryTransferDestinations(Number(sourceSelect.value)),selected=destinations.find(item=>item.id===Number(destinationSelect.value))||destinations[0];destinationSelect.innerHTML=destinations.map(item=>`<option value="${item.id}" ${item.id===selected?.id?'selected':''}>${esc((workspaceInventory?.payload?.warehouses||[]).find(warehouse=>warehouse.id===item.warehouseId)?.name||'انبار')} · موجودی ${money(inventoryProjectedState(item).stock)} ${esc(item.unit)}</option>`).join('');quantityInput.max=String(inventoryProjectedState(source).stock);});
  $('inventory-transfer-lines').onclick=event=>{if(!event.target.closest('[data-transfer-remove]'))return;if($('inventory-transfer-lines').children.length<=1){notify('انتقال باید دست‌کم یک قلم داشته باشد.',true);return;}event.target.closest('.inventory-transfer-row').remove();};
  $('inventory-transfers').onclick=event=>{const button=event.target.closest('[data-transfer-decision]');if(button&&!button.disabled)openInventoryTransferDecision(Number(button.dataset.transferId),button.dataset.transferDecision);};
  $('inventory-transfer-form').onsubmit=async event=>{event.preventDefault();const submit=$('inventory-transfer-submit'),rows=[...$('inventory-transfer-lines').querySelectorAll('.inventory-transfer-row')],lines=rows.map(row=>({sourceItemId:Number(row.querySelector('[data-transfer-source]').value),destinationItemId:Number(row.querySelector('[data-transfer-destination]').value),quantity:Number(digits(row.querySelector('[data-transfer-quantity]').value))}));submit.disabled=true;$('inventory-transfer-error').textContent='';try{if(!lines.length||lines.some(line=>!line.sourceItemId||!line.destinationItemId||!Number.isFinite(line.quantity)||line.quantity<=0))throw new Error('همهٔ اقلام و مقدار انتقال را کامل کنید.');await call('offline_workspace_request_inventory_transfer',{lines,note:$('inventory-transfer-note').value,managerPin:digits($('inventory-transfer-pin').value)});$('inventory-transfer-dialog').close();notify('درخواست انتقال در صف رمز‌شده ذخیره شد؛ موجودی پس از تأیید سرور جابه‌جا می‌شود.');await refresh();}catch(error){$('inventory-transfer-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('inventory-transfer-decision-form').onsubmit=async event=>{event.preventDefault();if(!activeInventoryTransferDecision)return;const submit=$('inventory-transfer-decision-submit');submit.disabled=true;$('inventory-transfer-decision-error').textContent='';try{await call('offline_workspace_decide_inventory_transfer',{transferId:activeInventoryTransferDecision.transferId,decision:activeInventoryTransferDecision.decision,note:$('inventory-transfer-decision-note').value,managerPin:digits($('inventory-transfer-decision-pin').value)});$('inventory-transfer-decision-dialog').close();activeInventoryTransferDecision=null;notify('تصمیم در صف رمز‌شده ثبت شد؛ وضعیت نهایی پس از بررسی سرور اعمال می‌شود.');await refresh();}catch(error){$('inventory-transfer-decision-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('inventory-waste-form').onsubmit=async e=>{e.preventDefault();if(!activeInventoryWasteItem)return;const submit=$('inventory-waste-submit'),quantity=Number(digits($('inventory-waste-quantity').value));submit.disabled=true;$('inventory-waste-error').textContent='';try{await call('offline_workspace_record_inventory_waste',{itemId:activeInventoryWaste.id,quantity,wasteReason:$('inventory-waste-reason').value,note:$('inventory-waste-note').value,managerPin:digits($('inventory-waste-pin').value)});$('inventory-waste-dialog').close();activeInventoryWasteItem=null;notify('درخواست ضایعات در پایگاه رمز‌شدهٔ همین دستگاه ذخیره شد؛ ثبت رسمی پس از همگام‌سازی انجام می‌شود.');await refresh();}catch(error){$('inventory-waste-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('inventory-movement-type').onchange=()=>{if(!activeInventoryMovement)return;activeInventoryMovement.movementType=$('inventory-movement-type').value;const isOut=activeInventoryMovement.movementType==='out',projected=inventoryProjectedState(activeInventoryMovement.item);$('inventory-movement-title').textContent=`${isOut?'ثبت خروج':'ثبت شمارش موجودی'} · ${activeInventoryMovement.item.name}`;$('inventory-movement-label').textContent=isOut?'مقدار خروج':'موجودی شمارش‌شده';$('inventory-movement-quantity').min=isOut?'0.000001':'0';$('inventory-movement-quantity').max=String(isOut?projected.stock:1_000_000_000);$('inventory-movement-quantity').value='';};
  $('inventory-movement-form').onsubmit=async e=>{e.preventDefault();if(!activeInventoryMovement)return;const submit=$('inventory-movement-submit'),quantity=Number(digits($('inventory-movement-quantity').value)),movementType=$('inventory-movement-type').value;submit.disabled=true;$('inventory-movement-error').textContent='';try{await call('offline_workspace_record_inventory_movement',{itemId:activeInventoryMovement.item.id,movementType,quantity,note:$('inventory-movement-note').value,managerPin:digits($('inventory-movement-pin').value)});$('inventory-movement-dialog').close();activeInventoryMovement=null;notify(movementType==='out'?'درخواست خروج در صف رمز‌شده ذخیره شد؛ موجودی رسمی پس از تأیید سرور تغییر می‌کند.':'شمارش موجودی در صف رمز‌شده ذخیره شد؛ اصلاح رسمی پس از تأیید سرور انجام می‌شود.');await refresh();}catch(error){$('inventory-movement-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('inventory-create-item-open').onclick=openInventoryCreateItem;
  $('inventory-create-item-unit').onchange=updateInventoryCreateItemFactor;$('inventory-create-item-recipe-unit').onchange=updateInventoryCreateItemFactor;
  $('inventory-create-item-form').onsubmit=async event=>{
    event.preventDefault();const submit=$('inventory-create-item-submit'),error=$('inventory-create-item-error');error.textContent='';
    try{
      const expiryDate=inventoryCreateExpiryDate();if(expiryDate===undefined)throw new Error('تاریخ انقضای شمسی معتبر نیست.');
      const openingStock=Number(digits($('inventory-create-item-opening-stock').value)),minStock=Number(digits($('inventory-create-item-min-stock').value)),reorderPoint=Number(digits($('inventory-create-item-reorder-point').value)),openingUnitCost=Number(digits($('inventory-create-item-opening-cost').value)),lastPurchaseCost=Number(digits($('inventory-create-item-last-cost').value));
      const factor=inventoryCreateItemFactor($('inventory-create-item-unit').value,$('inventory-create-item-recipe-unit').value),customFactor=Number(digits($('inventory-create-item-factor').value));
      if([openingStock,minStock,reorderPoint].some(value=>!Number.isFinite(value)||value<0||value>1_000_000_000)||[openingUnitCost,lastPurchaseCost].some(value=>!Number.isSafeInteger(value)||value<0||value>1_000_000_000))throw new Error('موجودی، حداقل، نقطه سفارش یا بهای کالا معتبر نیست.');
      if(!Number.isSafeInteger(Math.round(openingStock*openingUnitCost))||Math.round(openingStock*openingUnitCost)>1_000_000_000_000)throw new Error('ارزش موجودی آغازین بیش از حد مجاز است.');
      if(factor===null&&(!Number.isFinite(customFactor)||customFactor<=0||customFactor>1_000_000_000))throw new Error('ضریب تبدیل واحد دستور تهیه را وارد کنید.');
      const payload={occurredAt:new Date().toISOString(),name:$('inventory-create-item-name').value.trim(),sku:$('inventory-create-item-sku').value.trim().toUpperCase(),unit:$('inventory-create-item-unit').value,recipeUnit:$('inventory-create-item-recipe-unit').value,recipeToStockFactor:factor??customFactor,warehouseId:$('inventory-create-item-warehouse').value?Number($('inventory-create-item-warehouse').value):null,categoryId:$('inventory-create-item-category').value?Number($('inventory-create-item-category').value):null,openingStock,minStock,reorderPoint,openingUnitCost,lastPurchaseCost,expiryDate,trackStock:$('inventory-create-item-track').checked,isActive:$('inventory-create-item-active').checked,openingNote:$('inventory-create-item-note').value.trim()};
      if(payload.name.length<2||payload.name.length>80)throw new Error('نام کالا باید بین ۲ تا ۸۰ نویسه باشد.');
      submit.disabled=true;await call('offline_workspace_create_inventory_item',{payload,managerPin:digits($('inventory-create-item-pin').value)});
      $('inventory-create-item-dialog').close();$('inventory-create-item-form').reset();notify('تعریف کالا در صف رمز‌شدهٔ دستگاه ذخیره شد؛ تا تأیید سرور برای فاکتور و رسپی قابل انتخاب نیست.');await refresh();
    }catch(exception){error.textContent=String(exception);}finally{submit.disabled=false;}
  };
  $('inventory-receipt-open').onclick=openInventoryReceipt;
  $('inventory-receipt-add-line').onclick=()=>addInventoryReceiptLine();
  $('inventory-receipt-lines').addEventListener('click',event=>{const remove=event.target.closest('[data-receipt-remove]');if(remove){if($('inventory-receipt-lines').children.length<=1){notify('فاکتور باید دست‌کم یک قلم داشته باشد.',true);return;}remove.closest('.inventory-receipt-row').remove();inventoryReceiptRecalculate();}});
  $('inventory-receipt-lines').addEventListener('change',event=>{if(event.target.matches('[data-receipt-item]')){const item=(workspaceInventory?.payload?.items||[]).find(row=>row.id===Number(event.target.value));const price=event.target.closest('.inventory-receipt-row').querySelector('[data-receipt-unit-cost]');price.value=money(item?.lastPurchaseCost||item?.costPerUnit||0);}inventoryReceiptRecalculate();});
  $('inventory-receipt-lines').addEventListener('input',inventoryReceiptRecalculate);
  for(const id of ['inventory-receipt-discount','inventory-receipt-extra','inventory-receipt-shipping','inventory-receipt-tax'])$(id).addEventListener('input',inventoryReceiptRecalculate);
  $('inventory-receipt-paid').addEventListener('input',()=>{inventoryPaidEdited=true;});
  $('inventory-receipt-pay-from').addEventListener('change',()=>{inventoryPaidEdited=false;inventoryReceiptRecalculate();});
  $('inventory-receipt-form').onsubmit=async event=>{
    event.preventDefault();const submit=$('inventory-receipt-submit'),calculation=inventoryReceiptRecalculate();$('inventory-receipt-error').textContent='';
    try{
      if(!calculation.valid)throw new Error('مقادیر اقلام و جمع فاکتور را بررسی کنید.');
      const occurredAt=inventoryReceiptDate();if(!occurredAt)throw new Error('تاریخ شمسی فاکتور معتبر نیست.');
      const lines=calculation.rows.map(row=>({itemId:Number(row.querySelector('[data-receipt-item]').value),quantity:Number(digits(row.querySelector('[data-receipt-quantity]').value)),unitCost:Number(digits(row.querySelector('[data-receipt-unit-cost]').value))}));
      if(new Set(lines.map(line=>line.itemId)).size!==lines.length)throw new Error('هر کالا باید فقط در یک ردیف فاکتور باشد.');
      const payFrom=$('inventory-receipt-pay-from').value,paidAmount=payFrom==='payable'?0:Number(digits($('inventory-receipt-paid').value));
      if(!Number.isSafeInteger(paidAmount)||paidAmount<0||paidAmount>calculation.total)throw new Error('مبلغ پرداخت‌شده معتبر نیست.');
      submit.disabled=true;
      await call('offline_workspace_receive_inventory',{occurredAt:occurredAt.toISOString(),invoiceNo:$('inventory-receipt-invoice').value.trim(),supplierId:$('inventory-receipt-supplier').value?Number($('inventory-receipt-supplier').value):null,discount:calculation.discount,extraCost:calculation.extra,shippingCost:calculation.shipping,taxAmount:calculation.tax,total:calculation.total,paidAmount,payFrom,note:$('inventory-receipt-note').value.trim(),lines,managerPin:digits($('inventory-receipt-pin').value)});
      $('inventory-receipt-dialog').close();$('inventory-receipt-pin').value='';notify('فاکتور در صف رمز‌شدهٔ دستگاه ثبت شد؛ موجودی و سند حسابداری پس از تأیید سرور قطعی می‌شوند.');await refresh();
    }catch(error){$('inventory-receipt-error').textContent=String(error);}finally{submit.disabled=false;}
  };
  function openMenuCreator(kind){
    const base=workspaceMenu?.payload;
    if(!base||!canEditLocalMenu())return;
    const isProduct=kind==='product';
    editingMenu={kind,creating:true,original:null};
    $('workspace-edit-error').textContent='';$('workspace-edit-title').textContent=isProduct?'ایجاد محصول آفلاین':'ایجاد دسته‌بندی آفلاین';
    $('workspace-edit-name').value='';$('workspace-edit-name').maxLength=isProduct?100:60;$('workspace-edit-description').value='';$('workspace-edit-description').maxLength=isProduct?400:500;
    $('workspace-edit-price-wrap').hidden=!isProduct;$('workspace-edit-price').required=isProduct;$('workspace-edit-price').value='';
    $('workspace-edit-category-wrap').hidden=!isProduct;
    $('workspace-edit-category').innerHTML='<option value="">بدون دسته‌بندی</option>'+base.categories.filter(row=>row.isActive).map(row=>'<option value="'+row.id+'">'+esc(row.name)+'</option>').join('');
    $('workspace-edit-sort-wrap').hidden=isProduct;$('workspace-edit-sort').required=!isProduct;$('workspace-edit-sort').value=isProduct?'':String(base.categories.length);
    $('workspace-edit-enabled-wrap').hidden=isProduct;$('workspace-edit-enabled').checked=true;$('workspace-edit-enabled-label').textContent='دسته‌بندی فعال';
    $('workspace-edit-submit').textContent='ثبت در صف همگام‌سازی';$('workspace-edit-pin').value='';$('workspace-edit-dialog').showModal();
  }
  function openMenuEditor(kind,id){
    const view=workspaceMenuView(),base=workspaceMenu?.payload;
    if(!view||!base||!canEditLocalMenu())return;
    const isProduct=kind==='product',row=(isProduct?view.products:view.categories).find(item=>item.id===id),original=(isProduct?base.products:base.categories).find(item=>item.id===id);
    if(!row||!original||row.localChange){notify('برای این قلم تغییر در صف وجود دارد؛ پس از همگام‌سازی دوباره ویرایش کنید.',true);return;}
    editingMenu={kind,id,original};$('workspace-edit-error').textContent='';$('workspace-edit-title').textContent=isProduct?'ویرایش محصول آفلاین':'ویرایش دسته‌بندی آفلاین';
    $('workspace-edit-name').value=row.name||'';$('workspace-edit-name').maxLength=isProduct?100:60;$('workspace-edit-description').value=row.description||'';$('workspace-edit-description').maxLength=isProduct?400:500;
    $('workspace-edit-price-wrap').hidden=!isProduct;$('workspace-edit-sort-wrap').hidden=isProduct;$('workspace-edit-price').required=isProduct;$('workspace-edit-sort').required=!isProduct;$('workspace-edit-price').value=isProduct?String(row.price):'';$('workspace-edit-sort').value=isProduct?'':String(row.sortOrder||0);
    $('workspace-edit-enabled-wrap').hidden=false;$('workspace-edit-enabled').checked=isProduct?!!row.isAvailable:!!row.isActive;$('workspace-edit-enabled-label').textContent=isProduct?'در دسترس برای سفارش':'دسته‌بندی فعال';$('workspace-edit-category-wrap').hidden=true;$('workspace-edit-submit').textContent='ذخیره روی این دستگاه';$('workspace-edit-pin').value='';$('workspace-edit-dialog').showModal();
  }
  $('workspace-menu-product-create').onclick=()=>openMenuCreator('product');
  $('workspace-menu-category-create').onclick=()=>openMenuCreator('category');
  $('workspace-menu-products').onclick=e=>{const button=e.target.closest('[data-edit-menu="product"]');if(button&&!button.disabled)openMenuEditor('product',Number(button.dataset.id));};
  $('workspace-menu-categories').onclick=e=>{const button=e.target.closest('[data-edit-menu="category"]');if(button&&!button.disabled)openMenuEditor('category',Number(button.dataset.id));};
  $('workspace-edit-form').onsubmit=async e=>{
    e.preventDefault();if(!editingMenu)return;
    const isProduct=editingMenu.kind==='product',name=$('workspace-edit-name').value.trim(),description=$('workspace-edit-description').value;
    if(editingMenu.creating){
      const payload=isProduct?{product:{name,description,price:Number(digits($('workspace-edit-price').value)),categoryId:$('workspace-edit-category').value?Number($('workspace-edit-category').value):null}}:{category:{name,description,isActive:$('workspace-edit-enabled').checked,sortOrder:Number($('workspace-edit-sort').value)}};
      if(isProduct&&(!Number.isSafeInteger(payload.product.price)||payload.product.price<1||payload.product.price>100_000_000)){$('workspace-edit-error').textContent='قیمت محصول باید بیشتر از صفر و حداکثر ۱۰۰ میلیون تومان باشد.';return;}
      if(!isProduct&&(!Number.isSafeInteger(payload.category.sortOrder)||payload.category.sortOrder<0||payload.category.sortOrder>10_000)){$('workspace-edit-error').textContent='ترتیب نمایش باید عدد صحیح بین صفر تا ۱۰٬۰۰۰ باشد.';return;}
      $('workspace-edit-submit').disabled=true;$('workspace-edit-error').textContent='';
      try{await call('offline_workspace_create_menu',{action:isProduct?'create_product':'create_category',payload,managerPin:digits($('workspace-edit-pin').value)});$('workspace-edit-dialog').close();notify('درخواست ایجاد «'+name+'» روی این دستگاه ذخیره شد؛ پس از همگام‌سازی در منو ظاهر می‌شود.');await refresh();}
      catch(error){$('workspace-edit-error').textContent=String(error);}
      finally{$('workspace-edit-submit').disabled=false;}
      return;
    }
    const original=editingMenu.original;
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
      if(!workspaceMenu){$('workspace-menu-name').textContent='منوی آفلاین';$('workspace-menu-revision').textContent='داده‌ای دریافت نشده';$('workspace-menu-revision').className='pos-status';const sync=state?.workspaceSync;$('workspace-menu-state').textContent=sync?.message||'پس از اتصال صندوق و دریافت اولیهٔ منو، اطلاعات اینجا در دسترس خواهد بود.';$('workspace-menu-products').innerHTML='';$('workspace-menu-categories').innerHTML='';$('workspace-menu-product-create').disabled=true;$('workspace-menu-category-create').disabled=true;return;}
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
  $('server-orders-more').onclick=async()=>{if(!workspaceOrders?.hasMore)return;await loadWorkspaceOrders(workspaceOrders.payload.orders.length,100,true);};
  $('server-reservations-list').onclick=e=>{const change=e.target.closest('[data-reservation-status-change]');if(change){openReservationStatusChange(Number(change.dataset.reservationStatusChange),change.dataset.status);return;}const button=e.target.closest('[data-reservation-detail]');if(button)showReservationDetails(Number(button.dataset.reservationDetail));};
  $('reservation-status-form').onsubmit=async e=>{e.preventDefault();if(!activeReservationStatus)return;const submit=$('reservation-status-submit');submit.disabled=true;$('reservation-status-error').textContent='';try{await call('offline_workspace_update_reservation_status',{reservationId:activeReservationStatus.id,status:activeReservationStatus.status,managerPin:digits($('reservation-status-pin').value)});$('reservation-status-dialog').close();activeReservationStatus=null;notify('درخواست تغییر وضعیت روی دستگاه ذخیره شد؛ وضعیت نهایی پس از بررسی سرور ثبت می‌شود.');await refresh();await loadWorkspaceReservations();}catch(error){$('reservation-status-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('server-reservations-refresh').onclick=async()=>{try{await call('offline_refresh');$('server-reservations-state').textContent='درخواست دریافت نسخهٔ تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق قابل مشاهده می‌ماند.';}catch(error){notify(error,true);}};
  $('shifts-search').oninput=renderWorkspaceShifts;
  $('staff-shift-create-open').onclick=openOfflineShiftCreate;
  $('staff-shift-create-form').onsubmit=async event=>{event.preventDefault();const submit=$('staff-shift-create-submit');submit.disabled=true;$('staff-shift-create-error').textContent='';try{const starts=parseTehranJalaliDateTime($('staff-shift-start-date').value,$('staff-shift-start-time').value),ends=parseTehranJalaliDateTime($('staff-shift-end-date').value,$('staff-shift-end-time').value);if(!starts||!ends||ends<=starts||ends-starts>24*60*60_000)throw new Error('تاریخ شمسی یا بازهٔ شیفت معتبر نیست؛ مدت باید حداکثر ۲۴ ساعت باشد.');await call('offline_workspace_create_shift',{staffId:Number($('staff-shift-create-member').value),startsAt:starts.toISOString(),endsAt:ends.toISOString(),location:$('staff-shift-create-location').value.trim(),managerPin:digits($('staff-shift-create-pin').value)});$('staff-shift-create-dialog').close();$('staff-shift-create-pin').value='';notify('شیفت در صف رمز‌شدهٔ همین دستگاه ثبت شد؛ پس از اتصال، تداخل آن بررسی می‌شود.');await loadWorkspaceShifts();await refresh();}catch(error){$('staff-shift-create-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('shifts-refresh').onclick=async()=>{try{await call('offline_refresh');$('shifts-state').textContent='درخواست دریافت نسخهٔ تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق قابل مشاهده می‌ماند.';}catch(error){notify(error,true);}};
  $('server-orders-refresh').onclick=async()=>{try{await call('offline_refresh');$('server-orders-state').textContent='درخواست دریافت سفارش‌های تازه و ادامهٔ آرشیو کامل ثبت شد؛ نسخهٔ محلی تا دریافت موفق قابل مشاهده می‌ماند.';}catch(error){notify(error,true);}};
  $('accounting-refresh').onclick=async()=>{try{await call('offline_refresh');$('accounting-state').textContent='درخواست دریافت حساب‌ها و اسناد تازه ثبت شد؛ نسخهٔ محلی تا دریافت موفق قابل مشاهده می‌ماند.';}catch(error){notify(error,true);}};
  $('accounting-add-line').onclick=()=>appendAccountingLine();
  $('accounting-lines').addEventListener('input',event=>{const input=event.target.closest('[data-debit],[data-credit]');if(input)input.value=digits(input.value).replace(/\D/g,'');renderAccountingTotals();});
  $('accounting-lines').addEventListener('change',()=>renderAccountingTotals());
  $('accounting-lines').addEventListener('click',event=>{if(!event.target.closest('[data-remove-accounting-line]'))return;if($('accounting-lines').querySelectorAll('tr').length<=2){notify('سند باید دست‌کم دو ردیف داشته باشد.',true);return;}event.target.closest('tr').remove();renderAccountingTotals();});
  $('accounting-form').onsubmit=async event=>{
    event.preventDefault();$('accounting-error').textContent='';$('accounting-submit').disabled=true;
    try{
      const jalali=jalaliToGregorian($('accounting-date').value);if(!jalali)throw new Error('تاریخ شمسی معتبر نیست.');
      const date=new Date(jalali.year,jalali.month-1,jalali.day,12,0,0,0);if(!Number.isFinite(date.getTime()))throw new Error('تاریخ سند معتبر نیست.');
      const lines=accountingLineAmounts();if(lines.length<2||lines.some(line=>!Number.isSafeInteger(line.accountId)||line.accountId<1||!Number.isSafeInteger(line.debit)||!Number.isSafeInteger(line.credit)||line.debit<0||line.credit<0||(line.debit>0&&line.credit>0)))throw new Error('حساب و مبلغ هر ردیف را بررسی کنید.');
      const debit=lines.reduce((sum,line)=>sum+line.debit,0),credit=lines.reduce((sum,line)=>sum+line.credit,0);if(debit<=0||debit!==credit)throw new Error('جمع بدهکار و بستانکار باید برابر و غیرصفر باشد.');
      await call('offline_workspace_create_accounting_document',{date:date.toISOString(),description:$('accounting-description').value.trim(),lines,managerPin:digits($('accounting-pin').value)});
      $('accounting-pin').value='';$('accounting-description').value='';$('accounting-error').textContent='';notify('سند متوازن روی دستگاه ذخیره شد و در صف همگام‌سازی است.');await refresh();
    }catch(error){$('accounting-error').textContent=String(error);}
    finally{renderAccountingTotals();}
  };
  $('pos-prints').onclick=async e=>{const b=e.target.closest('[data-print]');if(b&&confirm('ممکن است فیش قبلاً چاپ شده باشد. پس از بررسی خروج کاغذ، دوباره ارسال شود؟')){try{await call('offline_retry_print',{id:Number(b.dataset.print)});await refresh();}catch(error){notify(error,true);}}};
  $('pos-search').oninput=renderProducts;$('pos-category').onchange=renderProducts;$('pos-method').onchange=paymentFields;$('pos-cash').oninput=()=>{const n=digits($('pos-cash').value);$('pos-cash').value=/^\d*$/.test(n)?Number(n||0).toLocaleString('en-US'):n;paymentFields();};$('pos-checkout').onclick=()=>checkout();
  const jalaliFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
  const jalaliLocalFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'});
  const jalaliTehranFormatter=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'});
  const tehranClockFormatter=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Tehran'});
  function tehranJalaliDateTime(date){const parts={};for(const part of jalaliTehranFormatter.formatToParts(date))if(part.type==='year'||part.type==='month'||part.type==='day')parts[part.type]=part.value;return {date:`${parts.year}/${parts.month}/${parts.day}`,time:tehranClockFormatter.format(date)};}
  function parseTehranJalaliDateTime(dateValue,timeValue){const jalali=jalaliToGregorian(dateValue),normalizedTime=String(timeValue).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim(),match=normalizedTime.match(/^(\d{1,2}):(\d{2})$/);if(!jalali||!match)return null;const hour=Number(match[1]),minute=Number(match[2]);if(hour>23||minute>59)return null;const pad=value=>String(value).padStart(2,'0'),value=`${jalali.year}-${pad(jalali.month)}-${pad(jalali.day)}T${pad(hour)}:${pad(minute)}:00+03:30`,date=new Date(value);return Number.isFinite(date.getTime())?date:null;}
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
  function setAccountingDefaultDate(){const parts={};for(const part of jalaliLocalFormatter.formatToParts(new Date()))if(part.type==='year'||part.type==='month'||part.type==='day')parts[part.type]=part.value;$('accounting-date').value=parts.year+'/'+String(parts.month).padStart(2,'0')+'/'+String(parts.day).padStart(2,'0');}
  setReservationDefaults();
  setAccountingDefaultDate();
  $('cheque-issue-date').value=defaultChequeDate();$('cheque-due-date').value=defaultChequeDate();
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
  $('receivables-search').oninput=renderWorkspaceReceivables;
  $('receivables-refresh').onclick=async()=>{try{await call('offline_refresh');$('receivables-state').textContent='درخواست دریافت نسخهٔ تازهٔ مطالبات ثبت شد؛ نسخهٔ محلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};
  $('cash-shifts-refresh').onclick=async()=>{try{await call('offline_refresh');$('cash-shifts-state').textContent='درخواست دریافت نسخهٔ تازهٔ شیفت صندوق ثبت شد؛ نسخهٔ محلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};
  $('reports-refresh').onclick=async()=>{try{await call('offline_refresh');$('reports-state').textContent='درخواست دریافت نسخهٔ تازهٔ گزارش ثبت شد؛ نسخهٔ محلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};
  $('cheques-refresh').onclick=async()=>{try{await call('offline_refresh');$('cheques-state').textContent='درخواست دریافت دفتر چک ثبت شد؛ نسخهٔ محلی تا دریافت موفق برای مشاهده در دسترس می‌ماند.';}catch(error){notify(error,true);}};
  ['cheques-search','cheques-filter-direction','cheques-filter-status'].forEach(id=>$(id).addEventListener(id==='cheques-search'?'input':'change',renderWorkspaceCheques));
  $('cheque-beneficiary').onchange=()=>{const item=(workspaceCheques?.payload?.beneficiaries||[]).find(row=>String(row.id)===$('cheque-beneficiary').value);$('cheque-new-beneficiary-fields').hidden=!!item;if(item){$('cheque-partner').value=item.fullName;$('cheque-national-id').value=item.nationalId||'';$('cheque-phone').value=item.phone||'';$('cheque-partner').readOnly=true;$('cheque-national-id').readOnly=true;$('cheque-phone').readOnly=true;}else{$('cheque-partner').value='';$('cheque-national-id').value='';$('cheque-phone').value='';$('cheque-partner').readOnly=false;$('cheque-national-id').readOnly=false;$('cheque-phone').readOnly=false;}};
  $('cheque-bank').onchange=()=>{$('cheque-bank-custom-wrap').hidden=$('cheque-bank').value!=='سایر';};$('cheque-purpose').onchange=()=>{$('cheque-purpose-custom-wrap').hidden=$('cheque-purpose').value!=='سایر';};
  $('cheque-amount').addEventListener('input',event=>{const raw=digits(event.target.value).replace(/\D/g,'');event.target.value=raw?money(Number(raw)):'';});
  $('cheque-next-status').onchange=()=>{$('cheque-status-account-wrap').hidden=activeChequeStatus?.direction!=='receivable'||$('cheque-next-status').value!=='assigned';};
  $('cheque-register-form').onsubmit=async event=>{
    event.preventDefault();const submit=$('cheque-register-submit');submit.disabled=true;$('cheque-register-error').textContent='';
    try{
      const selected=$('cheque-beneficiary').value,person=(workspaceCheques?.payload?.beneficiaries||[]).find(row=>String(row.id)===selected),amount=Number(digits($('cheque-amount').value)),issueDate=jalaliInputIso($('cheque-issue-date').value),dueDate=jalaliInputIso($('cheque-due-date').value),partnerName=$('cheque-partner').value.trim();
      if(!Number.isSafeInteger(amount)||amount<1||!issueDate||!dueDate||new Date(issueDate)>new Date(dueDate)||!partnerName)throw new Error('مبلغ، نام طرف چک و تاریخ‌های شمسی معتبر را وارد کنید.');
      const bank=$('cheque-bank').value==='سایر'?$('cheque-bank-custom').value.trim():$('cheque-bank').value,purpose=$('cheque-purpose').value==='سایر'?$('cheque-purpose-custom').value.trim():$('cheque-purpose').value;if(!bank)throw new Error('بانک چک را انتخاب کنید یا نام بانک دیگر را وارد کنید.');if(!$('cheque-account').value)throw new Error('حساب معین/تفصیلی طرف سند را انتخاب کنید.');
      const newBeneficiary=person?null:{fullName:partnerName,nationalId:digits($('cheque-national-id').value).replace(/\D/g,''),phone:digits($('cheque-phone').value).replace(/\D/g,'')};
      await call('offline_workspace_register_cheque',{payload:{direction:$('cheque-direction').value,beneficiaryId:person?.id??null,partnerName,amount,issueDate,dueDate,chequeNumber:digits($('cheque-number').value).trim(),serialNumber:digits($('cheque-serial').value).trim(),bank,branch:$('cheque-branch').value.trim(),expensePurpose:purpose,sayadIdentifier:digits($('cheque-sayad').value).trim(),note:$('cheque-note').value.trim(),accountingAccountId:Number($('cheque-account').value),newBeneficiary},managerPin:digits($('cheque-register-pin').value)});
      $('cheque-register-form').reset();$('cheque-issue-date').value=defaultChequeDate();$('cheque-due-date').value=defaultChequeDate();$('cheque-register-pin').value='';notify('چک در صف رمز‌شده ذخیره شد؛ سند حسابداری پس از بازبینی سرور ثبت می‌شود.');await refresh();await loadWorkspaceCheques();
    }catch(error){$('cheque-register-error').textContent=String(error);}finally{submit.disabled=false;renderWorkspaceCheques();}
  };
  $('cheques-list').onclick=event=>{const detail=event.target.closest('[data-cheque-detail]'),status=event.target.closest('[data-cheque-status]');if(detail)showChequeDetails(Number(detail.dataset.chequeDetail));if(status)openChequeStatus(Number(status.dataset.chequeStatus));};
  $('cheque-status-form').onsubmit=async event=>{event.preventDefault();if(!activeChequeStatus)return;const submit=$('cheque-status-submit');submit.disabled=true;$('cheque-status-error').textContent='';try{const status=$('cheque-next-status').value,statusAccountId=status==='assigned'?Number($('cheque-status-account').value):0;if(status==='assigned'&&!statusAccountId)throw new Error('برای واگذاری چک حساب مقصد را انتخاب کنید.');await call('offline_workspace_set_cheque_status',{chequeId:Number(activeChequeStatus.id),status,note:$('cheque-status-note').value.trim(),statusAccountId,managerPin:digits($('cheque-status-pin').value)});$('cheque-status-dialog').close();activeChequeStatus=null;notify('تغییر وضعیت چک در صف رمز‌شده ذخیره شد؛ سندهای مرتبط پس از تأیید سرور ثبت می‌شوند.');await refresh();await loadWorkspaceCheques();}catch(error){$('cheque-status-error').textContent=String(error);}finally{submit.disabled=false;}};
  $('receivables-list').onclick=event=>{const detail=event.target.closest('[data-receivable-detail]'),pay=event.target.closest('[data-receivable-pay]');if(detail)showReceivableStatement(Number(detail.dataset.receivableDetail));if(pay)openReceivablePayment(Number(pay.dataset.receivablePay));};
  $('receivable-payment-amount').addEventListener('input',event=>{const input=event.target,raw=digits(input.value).replace(/\D/g,'');input.value=raw?money(Number(raw)):'';});
  $('receivable-payment-form').onsubmit=async event=>{event.preventDefault();if(!activeReceivablePayment)return;const submit=$('receivable-payment-submit');submit.disabled=true;$('receivable-payment-error').textContent='';try{const amount=Number(digits($('receivable-payment-amount').value)),balance=Number(activeReceivablePayment.balance);if(!Number.isSafeInteger(amount)||amount<1||amount>balance)throw new Error('مبلغ دریافت باید عدد صحیح مثبت و حداکثر برابر ماندهٔ طلب باشد.');await call('offline_workspace_record_receivable_cash',{receivableId:Number(activeReceivablePayment.id),amount,note:$('receivable-payment-note').value.trim(),managerPin:digits($('receivable-payment-pin').value)});$('receivable-payment-dialog').close();activeReceivablePayment=null;notify('درخواست دریافت نقدی روی دستگاه ذخیره شد؛ ثبت قطعی پس از تأیید سرور انجام می‌شود.');await refresh();await loadWorkspaceReceivables();}catch(error){$('receivable-payment-error').textContent=String(error);}finally{submit.disabled=false;}};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  function selectDesktopTab(tab){
    const selected={pos:'pos-app',menu:'workspace-menu-app',customers:'customers-app',inventory:'inventory-app',reservations:'reservations-app',shifts:'shifts-app','cash-shifts':'cash-shifts-app',reports:'reports-app',accounting:'accounting-app',receivables:'receivables-app',cheques:'cheques-app',hardware:'hardware-app'};
    Object.entries(selected).forEach(([key,id])=>{$(id).hidden=key!==tab;$(`tab-${key}`).classList.toggle('selected',key===tab);});
    if(tab==='pos'){void routes();void loadWorkspaceOrders();}if(tab==='menu')void loadWorkspaceMenu();if(tab==='customers')void loadWorkspaceCustomers();if(tab==='inventory')void loadWorkspaceInventory();if(tab==='reservations'){renderReservationTables();renderWorkspaceReservations();void loadWorkspaceReservations();}if(tab==='shifts')void loadWorkspaceShifts();if(tab==='cash-shifts')void loadWorkspaceCashShifts();if(tab==='reports')void loadWorkspaceReports();if(tab==='accounting')void loadWorkspaceAccounting();if(tab==='receivables')void loadWorkspaceReceivables();if(tab==='cheques')void loadWorkspaceCheques();
  }
  $('tab-pos').onclick=()=>selectDesktopTab('pos');$('tab-menu').onclick=()=>selectDesktopTab('menu');$('tab-customers').onclick=()=>selectDesktopTab('customers');$('tab-inventory').onclick=()=>selectDesktopTab('inventory');$('tab-reservations').onclick=()=>selectDesktopTab('reservations');$('tab-shifts').onclick=()=>selectDesktopTab('shifts');$('tab-cash-shifts').onclick=()=>selectDesktopTab('cash-shifts');$('tab-reports').onclick=()=>selectDesktopTab('reports');$('tab-accounting').onclick=()=>selectDesktopTab('accounting');$('tab-receivables').onclick=()=>selectDesktopTab('receivables');$('tab-cheques').onclick=()=>selectDesktopTab('cheques');$('tab-hardware').onclick=()=>selectDesktopTab('hardware');
  $('workspace-menu-refresh').onclick=async()=>{try{await call('offline_refresh');$('workspace-menu-state').textContent='درخواست دریافت snapshot تازه ثبت شد؛ نسخهٔ قبلی تا دریافت موفق در دسترس می‌ماند.';}catch(error){notify(error,true);}};$('workspace-menu-search').oninput=renderWorkspaceMenu;$('workspace-menu-category').onchange=renderWorkspaceMenu;
  void refresh();setInterval(()=>void refresh(),5000);
})();
