const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path,mocks={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id]},Response,Date});
  return mod.exports;
}
const {parseCashierDebt}=load('src/lib/cashier-debt-input.ts');
const person={name:'مشتری',phone:'۰۹۱۲۳۴۵۶۷۸۹',type:'person'};
test('debt input normalizes mobile and requires customer identity',()=>{
 assert.equal(parseCashierDebt(person).phone,'09123456789');
 assert.throws(()=>parseCashierDebt({...person,name:''}));
 assert.throws(()=>parseCashierDebt({...person,phone:'123'}));
 assert.throws(()=>parseCashierDebt({...person,type:'company'}));
 assert.equal(parseCashierDebt({...person,type:'company',companyName:'شرکت'}).companyName,'شرکت');
 assert.throws(()=>parseCashierDebt({...person,dueAt:'2026-02-31'}));
});
function harness({tenant=1,paid=false,fail=false}={}) {
 const tables=Object.fromEntries(['orders','customers','orderStatusEvents','receivables'].map(name=>[name,new Proxy({name},{get:(t,k)=> k==='name'?t.name:{table:name,key:k}})]));
 let state={orders:[{id:1,businessId:tenant,status:'pending',paymentStatus:paid?'paid':'unpaid',total:100}],customers:[],orderStatusEvents:[],receivables:[]};
 let serial=Promise.resolve(); let policy;
 const eq=(field,value)=>row=>row[field.key]===value; const and=(...preds)=>row=>preds.every(p=>p(row));
 const db={transaction:fn=>{const run=serial.then(async()=>{const draft=structuredClone(state);const tx={
 select:()=>({from:table=>{let predicate=()=>true;const q={where:p=>(predicate=p,q),for:()=>q,limit:()=>q,then:(resolve,reject)=>Promise.resolve(draft[table.name].filter(predicate)).then(resolve,reject)};return q;}}),
 insert:table=>({values:value=>{let applied=false; const run=()=>{if(!applied){draft[table.name].push({id:draft[table.name].length+1,...value});applied=true;}return [draft[table.name].at(-1)]};const q={onConflictDoNothing:()=>q,returning:()=>Promise.resolve(run()),then:(resolve,reject)=>Promise.resolve(run()).then(resolve,reject)};return q;}}),
 update:table=>({set:values=>({where:async predicate=>{for(const row of draft[table.name])if(predicate(row))Object.assign(row,values);}})})};await fn(tx);state=draft;});serial=run.catch(()=>{});return run;}};
 const route=load('src/app/api/orders/[id]/cashier/route.ts',{
 'drizzle-orm':{eq,and},'@/db':{db},'@/db/schema':tables,
 '@/lib/auth':{withAuth:(fn,p)=>(policy=p,fn),readJson:async value=>value,HttpError:class extends Error{}},
 '@/lib/accounting':{ensureAccounting:async()=>{}},'@/lib/rate-limit':{enforceRateLimit:async()=>{}},
 '@/lib/cashier-debt-input':{parseCashierDebt},'@/lib/orders':{settleOrder:async(_biz,_features,id,_method,_status,opts)=>{assert.ok(opts.executor);if(fail)throw Error('ledger failure');await opts.executor.insert(tables.receivables).values({orderId:id,businessId:1,details:opts.creditDetails});}},
 });
 return {run:body=>route.POST(body,{business:{id:1},user:{id:9},role:'cashier',features:{}},{id:'1'}),state:()=>state,policy};
}
test('cashier confirmation retry records one event and does not start preparation',async()=>{
 const h=harness();await Promise.all([h.run({action:'confirm'}),h.run({action:'confirm'})]);
 assert.equal(h.state().orderStatusEvents.length,1);assert.equal(h.state().orders[0].status,'pending');
 assert.deepEqual(Array.from(h.policy.roles),['cashier']);
});
test('another tenant cannot confirm or register debt',async()=>{
 const h=harness({tenant:2});await assert.rejects(h.run({action:'confirm'}));await assert.rejects(h.run({action:'debt',details:person}));assert.equal(h.state().receivables.length,0);
});
test('debt retry creates one customer and one debt with due date and company',async()=>{
 const h=harness();const details={...person,type:'company',companyName:'شرکت',dueAt:'2026-11-01',description:'تسویه ماهانه'};
 await Promise.all([h.run({action:'debt',details}),h.run({action:'debt',details})]);
 assert.equal(h.state().customers.length,1);assert.equal(h.state().receivables.length,1);assert.equal(h.state().receivables[0].details.dueAt,details.dueAt);
});
test('ledger failure rolls back customer identity changes and debt; paid orders rejected',async()=>{
 const h=harness({fail:true});await assert.rejects(h.run({action:'debt',details:person}),/ledger failure/);assert.equal(h.state().customers.length,0);assert.equal(h.state().orders[0].customerId,undefined);
 await assert.rejects(harness({paid:true}).run({action:'debt',details:person}));
});
