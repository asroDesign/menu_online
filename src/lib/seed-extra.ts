/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { receiptText, listOrders } from "@/lib/orders";
import { CATALOG, DEMO_EMAIL, rng } from "@/lib/seed";

type Biz = typeof S.businesses.$inferSelect;
const DAY = 86400_000;
const now = () => Date.now();
const ago = (d: number, h = 0) => new Date(now() - d * DAY - h * 3600_000);

type Spec = {
  at: number; items: { p: typeof S.products.$inferSelect; q: number }[]; status: string; type?: string;
  tableId?: number | null; waiterId?: number | null; customerName?: string; source?: string; address?: string;
  zoneId?: number | null; deliveryFee?: number; courierId?: number | null; scheduledFor?: Date | null; phone?: string;
};

async function insertOrders(biz: Biz, specs: Spec[]) {
  const [m] = await db.select({ n: max(S.orders.number) }).from(S.orders).where(eq(S.orders.businessId, biz.id));
  let num = (m?.n ?? 1000) + 1;
  const ids: number[] = [];
  for (const sp of specs) {
    const type = sp.type ?? "dine_in";
    const subtotal = sp.items.reduce((s, x) => s + x.p.price * x.q, 0);
    const tax = Math.round((subtotal * biz.taxPercent) / 100);
    const service = type === "delivery" ? 0 : Math.round((subtotal * biz.servicePercent) / 100);
    const fee = sp.deliveryFee ?? 0;
    const [o] = await db.insert(S.orders).values({
      businessId: biz.id, number: num++, tableId: type === "dine_in" ? (sp.tableId ?? null) : null, waiterId: sp.waiterId ?? null,
      customerName: sp.customerName ?? "", customerPhone: sp.phone ?? "", source: sp.source ?? "waiter", type, status: sp.status,
      address: sp.address ?? "", zoneId: sp.zoneId ?? null, deliveryFee: fee, courierId: sp.courierId ?? null, scheduledFor: sp.scheduledFor ?? null,
      subtotal, tax, service, total: subtotal + tax + service + fee, createdAt: new Date(sp.at), updatedAt: new Date(Math.min(now(), sp.at + 20 * 60_000)),
    }).returning({ id: S.orders.id });
    await db.insert(S.orderItems).values(sp.items.map((x) => ({ orderId: o.id, productId: x.p.id, name: x.p.name, emoji: x.p.emoji, price: x.p.price, quantity: x.q })));
    ids.push(o.id);
  }
  return ids;
}

/** Give historic paid orders a payment method + a ledger entry. */
async function settleHistoric(bizId: number, bankIds: number[], rand: () => number) {
  const paid = await db.select().from(S.orders).where(and(eq(S.orders.businessId, bizId), eq(S.orders.status, "paid"), eq(S.orders.paymentStatus, "unpaid")));
  const groups: Record<string, number[]> = { cash: [], pos: [], ipg: [] };
  const method = new Map<number, string>();
  for (const o of paid) {
    const r = rand();
    const m = r < 0.4 || !bankIds.length ? "cash" : r < 0.75 ? "pos" : "ipg";
    groups[m].push(o.id); method.set(o.id, m);
  }
  for (const [m, ids] of Object.entries(groups)) if (ids.length) await db.update(S.orders).set({ paymentStatus: "paid", paymentMethod: m }).where(inArray(S.orders.id, ids));
  const bank = (m: string) => (m === "cash" || !bankIds.length ? null : m === "pos" ? (bankIds[1] ?? bankIds[0]) : bankIds[0]);
  const rows = paid.filter((o) => o.total > 0).map((o) => ({ businessId: bizId, kind: "income", source: "sale", category: "فروش", amount: o.total, bankAccountId: bank(method.get(o.id)!), orderId: o.id, description: `سفارش #${o.number}`, date: o.createdAt }));
  for (let i = 0; i < rows.length; i += 100) await db.insert(S.transactions).values(rows.slice(i, i + 100));
}

export async function seedExtras() {
  const [u] = await db.select().from(S.users).where(eq(S.users.email, DEMO_EMAIL));
  if (!u) return;
  const [biz] = await db.select().from(S.businesses).where(eq(S.businesses.userId, u.id));
  const [{ n }] = await db.select({ n: db.$count(S.customers, eq(S.customers.businessId, biz.id)) }).from(S.businesses).where(eq(S.businesses.id, biz.id));
  if (n > 0) return;
  const rand = rng(777);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

  await db.update(S.businesses).set({
    plan: "premium_plus",
    settings: {
      miniSite: { heroTitle: "کافه رستوران نیلوفر", heroSubtitle: "قهوه‌ی تازه، غذای خانگی و فضایی آرام", about: "از سال ۱۳۹۸ در قلب تهران میزبان دوستداران قهوه و غذای خانگی هستیم. منوی ما هر فصل با مواد تازه و دستورهای خانگی به‌روز می‌شود.", hours: "همه روزه ۸ صبح تا ۱۲ شب", showMenuButton: true, gallery: ["/food/coffee.jpg", "/food/dessert.jpg", "/food/pizza.jpg", "/food/breakfast.jpg"], heroImage: "/food/coffee.jpg", sections: [{ title: "رویدادها", text: "هر پنجشنبه شب: موسیقی زنده و منوی ویژه‌ی دسر." }, { title: "رزرو مجالس", text: "برای جشن تولد و جلسات کاری با ما تماس بگیرید." }] },
      languages: ["fa", "en", "ar"], pointsPerToman: 10000, cashbackPercent: 5,
      ipg: { provider: "zarinpal", merchantId: "", sandbox: true }, installment: { snappay: true, digipay: true },
      smsSender: "3000 1234", baleBot: "@niloofar_cafe_bot", crossSellAuto: true,
    },
  }).where(eq(S.businesses.id, biz.id));

  const prods = await db.select().from(S.products).where(eq(S.products.businessId, biz.id)).orderBy(asc(S.products.id));
  const cats = await db.select().from(S.categories).where(eq(S.categories.businessId, biz.id)).orderBy(asc(S.categories.sortOrder));
  const P = (n: string) => prods.find((p) => p.name === n)!;
  const bid = biz.id;

  // AR sample
  for (const n of ["پیتزا پپرونی", "کلاسیک برگر"])
    await db.update(S.products).set({ arModelUrl: "https://modelviewer.dev/shared-assets/models/Astronaut.glb" }).where(eq(S.products.id, P(n).id));

  // bank accounts
  const banks = await db.insert(S.bankAccounts).values([
    { businessId: bid, name: "بانک ملی - حساب جاری", bank: "ملی", accountNumber: "0123456789012", openingBalance: 60_000_000 },
    { businessId: bid, name: "بانک ملت - حساب پوز", bank: "ملت", accountNumber: "9876543210987", openingBalance: 5_000_000 },
  ]).returning();
  const bankIds = banks.map((b) => b.id);

  // customers
  const first = ["رضا", "نیلوفر", "محمد", "ترانه", "کیان", "سمیرا", "امیر", "الناز", "بهزاد", "مهسا", "پویا", "شیما", "آرش", "نگین", "حامد", "سحر", "فرهاد", "مینا", "کامران", "ندا", "یاسر", "هستی", "سینا", "پگاه"];
  const last = ["احمدی", "کریمی", "رضایی", "حسینی", "موسوی", "صادقی", "نوروزی", "رحیمی", "قاسمی", "شریفی"];
  const custs = await db.insert(S.customers).values(first.map((f, i) => ({ businessId: bid, name: `${f} ${last[i % last.length]}`, phone: `0912${String(1000000 + Math.floor(rand() * 8999999))}`, note: i % 7 === 0 ? "ترجیح می‌دهد کنار پنجره بنشیند" : "" }))).returning();
  const stat = custs.map(() => ({ ids: [] as number[], count: 0, spent: 0 }));
  const paidOrders = await db.select().from(S.orders).where(and(eq(S.orders.businessId, bid), eq(S.orders.status, "paid")));
  for (const o of paidOrders) {
    if (rand() > 0.4) continue;
    const ci = Math.floor(Math.pow(rand(), 1.7) * custs.length);
    stat[ci].ids.push(o.id); stat[ci].count++; stat[ci].spent += o.total;
  }
  for (let i = 0; i < custs.length; i++) {
    const st = stat[i];
    if (st.ids.length) await db.update(S.orders).set({ customerId: custs[i].id, customerPhone: custs[i].phone, customerName: custs[i].name }).where(inArray(S.orders.id, st.ids));
    const wallet = Math.floor(st.spent * 0.05 / 1000) * 1000;
    await db.update(S.customers).set({ ordersCount: st.count, totalSpent: st.spent, points: Math.floor(st.spent / 10000), walletBalance: Math.min(wallet, 400_000) }).where(eq(S.customers.id, custs[i].id));
  }
  const withWallet = await db.select().from(S.customers).where(and(eq(S.customers.businessId, bid)));
  const wl = withWallet.filter((c) => c.walletBalance > 0).slice(0, 8);
  if (wl.length) await db.insert(S.walletEntries).values(wl.map((c) => ({ businessId: bid, customerId: c.id, kind: "earn", amount: c.walletBalance, note: "کش‌بک خریدهای اخیر", createdAt: ago(Math.floor(rand() * 10)) })));

  await settleHistoric(bid, bankIds, rand);

  // discount codes
  await db.insert(S.discountCodes).values([
    { businessId: bid, code: "WELCOME10", type: "percent", value: 10, minOrder: 0, maxUses: 0, usedCount: 31 },
    { businessId: bid, code: "YALDA25", type: "fixed", value: 50_000, minOrder: 300_000, maxUses: 100, usedCount: 18, expiresAt: new Date(now() + 20 * DAY) },
    { businessId: bid, code: "VIP20", type: "percent", value: 20, minOrder: 200_000, maxUses: 50, usedCount: 50 },
    { businessId: bid, code: "SUMMER15", type: "percent", value: 15, expiresAt: ago(10), usedCount: 9, isActive: true },
  ]);

  // zones, couriers
  const zones = await db.insert(S.deliveryZones).values([
    { businessId: bid, name: "محدوده ۱ — تا ۳ کیلومتر", fee: 25_000, minOrder: 150_000, etaMinutes: 25, areas: "ولیعصر، زرتشت، فاطمی" },
    { businessId: bid, name: "محدوده ۲ — ۳ تا ۷ کیلومتر", fee: 45_000, minOrder: 250_000, etaMinutes: 40, areas: "تجریش، سعادت‌آباد، ونک" },
    { businessId: bid, name: "محدوده ۳ — خارج از شهر", fee: 80_000, minOrder: 400_000, etaMinutes: 60, areas: "کرج، شهریار", isActive: false },
  ]).returning();
  const crs = await db.insert(S.couriers).values([
    { businessId: bid, name: "مهدی سلیمانی", phone: "09121110011", vehicle: "موتور", status: "available" },
    { businessId: bid, name: "وحید عباسی", phone: "09122220022", vehicle: "موتور", status: "busy" },
    { businessId: bid, name: "کاوه جلالی", phone: "09123330033", vehicle: "ماشین", status: "off" },
  ]).returning();

  // delivery + pre-orders
  const mk = (n: string, q = 1) => ({ p: P(n), q });
  const addr = ["ولیعصر، نرسیده به پارک ساعی، پلاک ۸۶، واحد ۴", "سعادت‌آباد، میدان کاج، خیابان ۱۸، پلاک ۱۲", "تجریش، خیابان شریعتی، کوچه گلستان، پلاک ۵", "فاطمی، خیابان گمنام، پلاک ۲۱، طبقه ۲"];
  const dsp: Spec[] = [];
  const dstat = ["pending", "preparing", "ready", "served", "paid", "paid", "paid", "canceled"];
  dstat.forEach((st, i) => {
    const c = custs[i];
    const z = zones[i % 2];
    dsp.push({ at: now() - (i < 4 ? i * 14 + 6 : 26 + i * 90) * 60_000, items: [mk(pick(["پیتزا پپرونی", "کلاسیک برگر", "چلوکباب کوبیده", "جوجه‌کباب زعفرانی"])), mk(pick(["لیموناد نعنا", "سیب‌زمینی سرخ‌کرده", "چیزکیک نیویورکی"]), 2)], status: st, type: "delivery", address: addr[i % addr.length], zoneId: z.id, deliveryFee: z.fee, courierId: i % 3 === 0 ? crs[0].id : i % 3 === 1 ? crs[1].id : null, customerName: c.name, phone: c.phone, source: i % 2 ? "customer" : "waiter" });
  });
  for (let i = 0; i < 3; i++) dsp.push({ at: now() - (i + 1) * 40 * 60_000, items: [mk("پیتزا مارگاریتا", 2), mk("سالاد سزار با مرغ")], status: "pending", type: "takeaway", customerName: custs[8 + i].name, phone: custs[8 + i].phone, scheduledFor: new Date(now() + (20 + i * 5) * 3600_000), source: "customer" });
  const dids = await insertOrders(biz, dsp);
  await settleHistoric(bid, bankIds, rand);

  // pagers (food court)
  const active = await db.select().from(S.orders).where(and(eq(S.orders.businessId, bid), inArray(S.orders.status, ["pending", "preparing", "ready"])));
  await db.insert(S.pagers).values(Array.from({ length: 12 }, (_, i) => {
    const o = active[i];
    return { businessId: bid, number: i + 1, status: o ? (o.status === "ready" ? "ringing" : "busy") : "free", orderId: o?.id ?? null };
  }).slice(0, 12));

  // devices
  const devs = await db.insert(S.devices).values([
    { businessId: bid, kind: "tablet", name: "تبلت آشپزخانه", code: "kitchen01", lastSeenAt: new Date(), lastValue: 0 },
    { businessId: bid, kind: "pos", name: "پوز بانک ملت", code: "posmellat", lastSeenAt: ago(0, 0.05), lastValue: 0 },
    { businessId: bid, kind: "printer", name: "پرینتر ابری آشپزخانه", code: "printer01", lastSeenAt: new Date(), lastValue: 0 },
    { businessId: bid, kind: "printer", name: "پرینتر ابری صندوق", code: "printer02", lastSeenAt: ago(0, 0.02), lastValue: 0 },
    { businessId: bid, kind: "scale", name: "ترازوی دیجیتال بخش گوشت", code: "scale001", lastSeenAt: new Date(), lastValue: 0.45 },
    { businessId: bid, kind: "caller_id", name: "دستگاه کالر آیدی", code: "callerid1", lastSeenAt: new Date(), lastValue: 0 },
  ]).returning();
  const printers = devs.filter((d) => d.kind === "printer");
  const recent = (await listOrders(bid, { limit: 4 }));
  await db.insert(S.printJobs).values(recent.flatMap((o) => printers.map((p, k) => ({ businessId: bid, orderId: o.id, deviceId: p.id, status: k === 0 || o.status !== "pending" ? "printed" : "pending", content: receiptText(biz, o), printedAt: new Date() }))));
  await db.insert(S.calls).values([
    { businessId: bid, phone: custs[0].phone, createdAt: new Date(now() - 4 * 60_000) },
    { businessId: bid, phone: "09351234567", createdAt: new Date(now() - 38 * 60_000) },
    { businessId: bid, phone: custs[3].phone, handled: true, createdAt: ago(0, 3) },
    { businessId: bid, phone: custs[5].phone, handled: true, createdAt: ago(1, 2) },
  ]);

  // inventory
  const wh = await db.insert(S.warehouses).values([{ businessId: bid, name: "انبار مرکزی", location: "زیرزمین" }, { businessId: bid, name: "یخچال آشپزخانه", location: "آشپزخانه" }]).returning();
  const itemDefs: [string, string, number, number, number, number][] = [
    ["دانه قهوه عربیکا", "کیلوگرم", 3.2, 4, 1_450_000, 0], ["شیر", "لیتر", 32, 15, 55_000, 1], ["شکر", "کیلوگرم", 12, 5, 42_000, 0], ["آرد", "کیلوگرم", 40, 20, 38_000, 0],
    ["پنیر موزارلا", "کیلوگرم", 7.5, 4, 380_000, 1], ["گوشت چرخ‌کرده گوساله", "کیلوگرم", 6, 8, 650_000, 1], ["گوشت کوبیده", "کیلوگرم", 14, 6, 620_000, 1], ["سینه مرغ", "کیلوگرم", 9, 5, 190_000, 1],
    ["برنج ایرانی", "کیلوگرم", 35, 15, 160_000, 0], ["تخم‌مرغ", "عدد", 120, 40, 7_500, 1], ["گوجه‌فرنگی", "کیلوگرم", 11, 6, 45_000, 1], ["نان همبرگر", "عدد", 18, 25, 12_000, 0],
    ["خامه", "لیتر", 5, 3, 210_000, 1], ["سیب‌زمینی", "کیلوگرم", 30, 12, 32_000, 0], ["لیمو ترش", "کیلوگرم", 4, 3, 90_000, 1], ["شکلات تلخ", "کیلوگرم", 2.5, 1.5, 480_000, 0],
  ];
  const items = await db.insert(S.inventoryItems).values(itemDefs.map(([name, unit, stock, minStock, cost, w]) => ({ businessId: bid, name, unit, stock, minStock, costPerUnit: cost, warehouseId: wh[w].id }))).returning();
  const I = (n: string) => items.find((i) => i.name === n)!;
  const rec: [string, [string, number][]][] = [
    ["اسپرسو", [["دانه قهوه عربیکا", 0.018]]], ["کاپوچینو", [["دانه قهوه عربیکا", 0.018], ["شیر", 0.15]]], ["لاته", [["دانه قهوه عربیکا", 0.018], ["شیر", 0.25]]], ["آیس لاته", [["دانه قهوه عربیکا", 0.018], ["شیر", 0.2]]],
    ["پیتزا مارگاریتا", [["آرد", 0.25], ["پنیر موزارلا", 0.15], ["گوجه‌فرنگی", 0.1]]], ["پیتزا پپرونی", [["آرد", 0.25], ["پنیر موزارلا", 0.18], ["گوشت چرخ‌کرده گوساله", 0.06]]],
    ["کلاسیک برگر", [["گوشت چرخ‌کرده گوساله", 0.15], ["نان همبرگر", 1], ["گوجه‌فرنگی", 0.05]]], ["چیزبرگر دوبل", [["گوشت چرخ‌کرده گوساله", 0.3], ["نان همبرگر", 1], ["پنیر موزارلا", 0.04]]],
    ["سیب‌زمینی سرخ‌کرده", [["سیب‌زمینی", 0.25]]], ["چلوکباب کوبیده", [["گوشت کوبیده", 0.2], ["برنج ایرانی", 0.2]]], ["جوجه‌کباب زعفرانی", [["سینه مرغ", 0.25], ["برنج ایرانی", 0.2]]],
    ["املت گوجه‌فرنگی", [["تخم‌مرغ", 3], ["گوجه‌فرنگی", 0.15]]], ["چیزکیک نیویورکی", [["خامه", 0.1], ["شکر", 0.03]]], ["لیموناد نعنا", [["لیمو ترش", 0.1], ["شکر", 0.02]]], ["براونی با بستنی", [["شکلات تلخ", 0.05], ["شکر", 0.03]]],
  ];
  await db.insert(S.recipes).values(rec.flatMap(([pn, ls]) => ls.map(([iname, q]) => ({ businessId: bid, productId: P(pn).id, itemId: I(iname).id, quantity: q }))));
  const mv: any[] = [];
  for (const it of items) {
    let bal = it.stock;
    for (let k = 0; k < 2; k++) {
      const q = Math.round(it.minStock * (1.5 + rand()) * 10) / 10;
      mv.push({ businessId: bid, itemId: it.id, type: "in", delta: q, balanceAfter: bal + q, note: "خرید از تأمین‌کننده", createdAt: ago(3 + k * 6 + Math.floor(rand() * 3)) });
    }
    mv.push({ businessId: bid, itemId: it.id, type: "sale", delta: -Math.round(it.minStock * 0.8 * 10) / 10, balanceAfter: bal, note: "مصرف روزانه", createdAt: ago(1) });
    if (rand() < 0.3) mv.push({ businessId: bid, itemId: it.id, type: "waste", delta: -Math.round(it.minStock * 0.1 * 10) / 10, balanceAfter: bal, note: "ضایعات / فاسد شده", createdAt: ago(2) });
  }
  await db.insert(S.stockMovements).values(mv);

  // accounting: expenses
  const exp: [string, number, string, number, boolean][] = [
    ["اجاره", 45_000_000, "اجاره ماهانه مغازه", 3, true], ["اجاره", 45_000_000, "اجاره ماه قبل", 33, true], ["حقوق و دستمزد", 38_000_000, "حقوق پرسنل", 5, true], ["حقوق و دستمزد", 36_000_000, "حقوق ماه قبل", 35, true],
    ["قبوض", 6_500_000, "برق، آب و گاز", 9, false], ["قبوض", 5_900_000, "قبوض ماه قبل", 39, false], ["اینترنت و نرم‌افزار", 1_200_000, "اشتراک اینترنت و سامانه", 11, true], ["بازاریابی", 3_000_000, "تبلیغات اینستاگرام", 12, true],
    ["خرید مواد اولیه", 14_000_000, "خرید هفتگی مواد اولیه", 2, false], ["خرید مواد اولیه", 17_500_000, "خرید مواد اولیه", 9, false], ["خرید مواد اولیه", 12_800_000, "خرید مواد اولیه", 16, false], ["خرید مواد اولیه", 15_200_000, "خرید مواد اولیه", 23, false],
    ["تعمیرات", 2_400_000, "تعمیر دستگاه اسپرسو", 7, false],
  ];
  await db.insert(S.transactions).values([
    ...exp.map(([category, amount, description, d, viaBank]) => ({ businessId: bid, kind: "expense", source: "manual", category, amount, description, bankAccountId: viaBank ? bankIds[0] : null, date: ago(d) })),
    { businessId: bid, kind: "income", source: "manual", category: "درآمد متفرقه", amount: 4_000_000, description: "برگزاری مجلس تولد", bankAccountId: bankIds[0], date: ago(6) },
  ]);

  await db.insert(S.assets).values([
    { businessId: bid, name: "دستگاه اسپرسو ۲ گروپ", category: "تجهیزات", purchaseDate: ago(420), cost: 185_000_000, salvage: 20_000_000, lifeMonths: 60 },
    { businessId: bid, name: "یخچال ویترینی", category: "تجهیزات", purchaseDate: ago(600), cost: 62_000_000, salvage: 6_000_000, lifeMonths: 84 },
    { businessId: bid, name: "کوره پیتزا", category: "تجهیزات", purchaseDate: ago(300), cost: 38_000_000, salvage: 4_000_000, lifeMonths: 72 },
    { businessId: bid, name: "میز و صندلی سالن", category: "اثاثیه", purchaseDate: ago(900), cost: 120_000_000, salvage: 10_000_000, lifeMonths: 96 },
    { businessId: bid, name: "سیستم صوتی", category: "اثاثیه", purchaseDate: ago(200), cost: 14_000_000, salvage: 1_000_000, lifeMonths: 48 },
  ]);

  // cross sell
  await db.insert(S.crossSellRules).values([["کلاسیک برگر", "سیب‌زمینی سرخ‌کرده"], ["پیتزا مارگاریتا", "لیموناد نعنا"], ["کاپوچینو", "چیزکیک نیویورکی"], ["چلوکباب کوبیده", "سالاد فصل"], ["چیزبرگر دوبل", "سیب‌زمینی سرخ‌کرده"]].map(([a, b]) => ({ businessId: bid, productId: P(a).id, suggestedId: P(b).id })));

  // surveys
  const [sv1, sv2] = await db.insert(S.surveys).values([
    { businessId: bid, title: "نظرسنجی رضایت از خدمات", description: "نظر شما به ما کمک می‌کند بهتر شویم. کمتر از یک دقیقه وقت می‌گیرد.", questions: [{ id: "q1", text: "کیفیت غذا و نوشیدنی را چگونه ارزیابی می‌کنید؟", type: "rating" }, { id: "q2", text: "برخورد و سرعت پرسنل چگونه بود؟", type: "rating" }, { id: "q3", text: "چطور با کافه ما آشنا شدید؟", type: "choice", options: ["اینستاگرام", "دوستان", "جستجوی گوگل", "عبور از مقابل کافه"] }, { id: "q4", text: "پیشنهاد یا انتقاد شما", type: "text" }] },
    { businessId: bid, title: "نظرسنجی منوی جدید زمستانی", description: "کدام آیتم‌ها را دوست دارید به منو اضافه کنیم؟", questions: [{ id: "q1", text: "کدام دسته را بیشتر دوست دارید؟", type: "choice", options: ["نوشیدنی گرم", "سوپ و آش", "دسرهای زمستانی"] }, { id: "q2", text: "پیشنهاد شما", type: "text" }] },
  ]).returning();
  const comments = ["قهوه‌تان عالیه، فقط موسیقی کمی بلند بود", "سرویس‌دهی سریع و محترمانه", "لطفاً منوی گیاهخواری هم اضافه کنید", "چیزکیک بی‌نظیر بود", "قیمت‌ها کمی بالاست ولی کیفیت می‌ارزد"];
  await db.insert(S.surveyResponses).values([
    ...Array.from({ length: 22 }, (_, i) => ({ surveyId: sv1.id, businessId: bid, customerName: i % 3 ? "" : first[i], answers: { q1: 3 + Math.floor(rand() * 3), q2: 3 + Math.floor(rand() * 3), q3: pick(["اینستاگرام", "دوستان", "جستجوی گوگل", "عبور از مقابل کافه"]), ...(rand() < 0.5 ? { q4: pick(comments) } : {}) }, createdAt: ago(Math.floor(rand() * 13)) })),
    ...Array.from({ length: 7 }, () => ({ surveyId: sv2.id, businessId: bid, customerName: "", answers: { q1: pick(["نوشیدنی گرم", "سوپ و آش", "دسرهای زمستانی"]) }, createdAt: ago(Math.floor(rand() * 5)) })),
  ]);

  // tickets, campaigns
  const [t1, t2] = await db.insert(S.tickets).values([
    { businessId: bid, subject: "راهنمایی برای اتصال پرینتر ابری", status: "answered", priority: "normal", createdAt: ago(3), updatedAt: ago(2, 20) },
    { businessId: bid, subject: "سوال درباره تنظیم دامنه اختصاصی", status: "open", priority: "high", createdAt: ago(0, 2), updatedAt: ago(0, 2) },
  ]).returning();
  await db.insert(S.ticketMessages).values([
    { ticketId: t1.id, authorRole: "user", authorName: "سارا نیلوفری", body: "سلام، پرینتر ابری را اضافه کردم ولی سفارش‌ها چاپ نمی‌شود.", createdAt: ago(3) },
    { ticketId: t1.id, authorRole: "support", authorName: "پشتیبانی", body: "سلام و وقت بخیر. کد دستگاه را در تنظیمات پرینتر وارد کنید و آدرس /api/device/<کد>/jobs را برای دریافت کارها فراخوانی کنید. اگر مشکل ادامه داشت اطلاع دهید.", createdAt: ago(2, 20) },
    { ticketId: t2.id, authorRole: "user", authorName: "سارا نیلوفری", body: "سلام، دامنه menu.niloofar.ir را ثبت کردم. چه رکوردی باید تنظیم کنم؟", createdAt: ago(0, 2) },
  ]);
  await db.insert(S.campaigns).values([
    { businessId: bid, channel: "sms", kind: "promo", audience: "all", body: "شب یلدا با ما! با کد YALDA25 پنجاه هزار تومان تخفیف بگیرید. کافه نیلوفر", recipients: 24, createdAt: ago(4) },
    { businessId: bid, channel: "sms", kind: "service", audience: "manual", body: "سفارش شما آماده تحویل است. نوش جان!", recipients: 3, createdAt: ago(1) },
    { businessId: bid, channel: "bale", kind: "promo", audience: "vip", body: "مشتری ویژه‌ی عزیز؛ این هفته دسر رایگان همراه هر سفارش ", recipients: 9, createdAt: ago(2) },
  ]);

  // translations
  const catEn: Record<string, string> = { "صبحانه": "Breakfast", "قهوه و اسپرسو": "Coffee & Espresso", "نوشیدنی سرد": "Cold Drinks", "پیتزا": "Pizza", "برگر": "Burgers", "غذاهای ایرانی": "Persian Dishes", "سالاد": "Salads", "دسر و کیک": "Desserts & Cakes" };
  const catAr: Record<string, string> = { "صبحانه": "الإفطار", "قهوه و اسپرسو": "القهوة والإسبريسو", "پیتزا": "بيتزا", "دسر و کیک": "الحلويات والكيك" };
  const prodEn: Record<string, [string, string]> = {
    "کاپوچینو": ["Cappuccino", "Espresso, steamed milk and velvety foam"], "لاته": ["Latte", "Espresso with plenty of milk and latte art"], "اسپرسو": ["Espresso", "Double shot of 100% Arabica"],
    "پیتزا مارگاریتا": ["Margherita Pizza", "Tomato sauce, mozzarella and fresh basil"], "پیتزا پپرونی": ["Pepperoni Pizza", "Smoked pepperoni, mozzarella and house sauce"],
    "کلاسیک برگر": ["Classic Burger", "150g beef patty, lettuce, tomato and house sauce"], "چیزبرگر دوبل": ["Double Cheeseburger", "Two patties, melted cheddar and pickles"],
    "چلوکباب کوبیده": ["Chelo Kabab Koobideh", "Two skewers of minced lamb with Persian rice"], "جوجه‌کباب زعفرانی": ["Saffron Chicken Kabab", "Saffron-marinated chicken breast with rice"],
    "سالاد سزار با مرغ": ["Chicken Caesar Salad", "Romaine, grilled chicken, parmesan and croutons"], "چیزکیک نیویورکی": ["New York Cheesecake", "Creamy cheesecake with strawberry sauce"], "تیرامیسو": ["Tiramisu", "Italian dessert with coffee and mascarpone"],
    "لیموناد نعنا": ["Mint Lemonade", "Fresh lemon, mint and soda"], "آیس لاته": ["Iced Latte", "Espresso and cold milk over ice"], "املت گوجه‌فرنگی": ["Tomato Omelette", "Homemade omelette with fresh tomatoes"],
  };
  await db.insert(S.translations).values([
    ...cats.filter((c) => catEn[c.name]).map((c) => ({ businessId: bid, entityType: "category", entityId: c.id, lang: "en", name: catEn[c.name], description: "" })),
    ...cats.filter((c) => catAr[c.name]).map((c) => ({ businessId: bid, entityType: "category", entityId: c.id, lang: "ar", name: catAr[c.name], description: "" })),
    ...Object.entries(prodEn).filter(([k]) => prods.some((p) => p.name === k)).map(([k, v]) => ({ businessId: bid, entityType: "product", entityId: P(k).id, lang: "en", name: v[0], description: v[1] })),
  ]);
  void dids;
}

async function lite(email: string, name: string, bizName: string, slug: string, plan: string, logo: string, color: string, catIdx: number[], withOrders: boolean) {
  const [exists] = await db.select({ id: S.users.id }).from(S.users).where(eq(S.users.email, email));
  if (exists) return;
  const [user] = await db.insert(S.users).values({ name, email, passwordHash: hashPassword(email.startsWith("admin") ? "admin1234" : "demo1234"), role: email.startsWith("admin") ? "admin" : "owner" }).onConflictDoNothing().returning();
  if (!user) return;
  const [biz] = await db.insert(S.businesses).values({ userId: user.id, name: bizName, slug, plan, logoEmoji: logo, accentColor: color, description: "منوی دیجیتال " + bizName, phone: "۰۲۱-۲۲۳۳۴۴۵۵", address: "تهران، خیابان انقلاب", taxPercent: 10, servicePercent: 0 }).returning();
  if (!catIdx.length) return;
  const cats = await db.insert(S.categories).values(catIdx.map((ci, i) => ({ businessId: biz.id, name: CATALOG[ci].name, emoji: CATALOG[ci].emoji, sortOrder: i }))).returning();
  const prods = await db.insert(S.products).values(catIdx.flatMap((ci, i) => CATALOG[ci].items.map((p) => ({ businessId: biz.id, categoryId: cats[i].id, name: p[0], description: p[1], price: p[2], emoji: p[3], prepMinutes: p[4], imageUrl: `/food/${CATALOG[ci].img}.jpg`, isFeatured: !!p[5]?.f, oldPrice: p[5]?.old ?? null, isAvailable: !p[5]?.off })))).returning();
  if (!withOrders) return;
  const rand = rng(plan.length * 31 + 5);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const tbls = await db.insert(S.diningTables).values(Array.from({ length: 6 }, (_, i) => ({ businessId: biz.id, name: `میز ${i + 1}`, zone: i < 4 ? "سالن" : "تراس", capacity: i % 2 ? 4 : 2 }))).returning();
  const sf = await db.insert(S.staff).values([{ businessId: biz.id, name: "پدرام نظری", role: "waiter" }, { businessId: biz.id, name: "لیلا شمس", role: "waiter" }, { businessId: biz.id, name: "داریوش کمالی", role: "cashier" }]).returning();
  await db.insert(S.bankAccounts).values({ businessId: biz.id, name: "حساب بانکی اصلی", bank: "ملت", openingBalance: 12_000_000 });
  const specs: Spec[] = [];
  for (let d = 6; d >= 0; d--) for (let k = 0; k < 7 + Math.floor(rand() * 6); k++) {
    const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ p: prods[Math.floor(rand() * prods.length)], q: 1 + Math.floor(rand() * 2) })).filter((x, i, a) => x.p.isAvailable && a.findIndex((y) => y.p.id === x.p.id) === i);
    if (!items.length) continue;
    specs.push({ at: now() - d * DAY - Math.floor(rand() * 11 * 3600_000) - (d === 0 ? 70 * 60_000 : 0), items, status: "paid", tableId: pick(tbls).id, waiterId: pick(sf.slice(0, 2)).id });
  }
  specs.push({ at: now() - 5 * 60_000, items: [{ p: prods[0], q: 2 }], status: "pending", tableId: tbls[0].id, waiterId: sf[0].id }, { at: now() - 18 * 60_000, items: [{ p: prods[3], q: 1 }, { p: prods[5], q: 1 }], status: "preparing", tableId: tbls[2].id, waiterId: sf[1].id });
  await insertOrders(biz, specs);
  const [b1] = await db.select().from(S.bankAccounts).where(eq(S.bankAccounts.businessId, biz.id));
  await settleHistoric(biz.id, [b1.id], rand);
}

export async function seedAccounts() {
  await lite("basic@menudigital.ir", "آرش پارسایی", "کافه کتاب پارسه", "parse", "basic", "", "#0d9488", [1, 2, 8], false);
  await lite("premium@menudigital.ir", "نسرین فلاحی", "ساندویچ‌لند", "sandwichland", "premium", "", "#ef4444", [3, 4, 6], true);
  await lite("admin@menudigital.ir", "مدیر سامانه", "مدیریت سامانه منوی دیجیتال", "admin-panel", "premium_plus", "", "#44403c", [], false);
}

/* ------------------------------------------------------------------ phase 3 */
export async function seedPhase3() {
  const { sql } = await import("drizzle-orm");
  const { ensureAccounting, postDocument, loadAccounts, C } = await import("@/lib/accounting");
  const { toJ, fromJ } = await import("@/lib/jalali");
  const [u] = await db.select().from(S.users).where(eq(S.users.email, DEMO_EMAIL));
  if (!u) return;
  const [biz] = await db.select().from(S.businesses).where(eq(S.businesses.userId, u.id));
  if (((biz.settings ?? {}) as Record<string, unknown>).sms) return; // already seeded
  const bid = biz.id;
  const rand = rng(4242);

  // 1) employees with their own logins
  const stf = await db.select().from(S.staff).where(eq(S.staff.businessId, bid));
  const link = async (email: string, name: string, role: string, existing?: string) => {
    const [ex] = await db.select({ id: S.users.id }).from(S.users).where(eq(S.users.email, email));
    if (ex) return;
    const [usr] = await db.insert(S.users).values({ name, email, passwordHash: hashPassword("demo1234"), role: "staff", businessId: bid, staffRole: role }).returning({ id: S.users.id });
    const row = existing ? stf.find((s) => s.name === existing) : undefined;
    if (row) await db.update(S.staff).set({ userId: usr.id, role, isActive: true }).where(eq(S.staff.id, row.id));
    else await db.insert(S.staff).values({ businessId: bid, name, role, userId: usr.id });
  };
  await link("waiter@menudigital.ir", "علی رضایی", "waiter", "علی رضایی");
  await link("cashier@menudigital.ir", "نگار احمدی", "cashier", "نگار احمدی");
  await link("kitchen@menudigital.ir", "حسین موسوی", "chef", "حسین موسوی");
  await link("accountant@menudigital.ir", "ژیلا امینی", "accountant");
  await link("warehouse@menudigital.ir", "بهروز انصاری", "warehouse");

  // 2) map: restaurant location, radius zones, delivery coordinates
  await db.update(S.businesses).set({ lat: 35.7546, lng: 51.4105 }).where(eq(S.businesses.id, bid));
  const zs = await db.select().from(S.deliveryZones).where(eq(S.deliveryZones.businessId, bid)).orderBy(asc(S.deliveryZones.id));
  for (const [i, r] of [3, 7, 15].entries()) if (zs[i]) await db.update(S.deliveryZones).set({ radiusKm: r }).where(eq(S.deliveryZones.id, zs[i].id));
  const dels = await db.select({ id: S.orders.id }).from(S.orders).where(and(eq(S.orders.businessId, bid), eq(S.orders.type, "delivery")));
  for (const d of dels) await db.update(S.orders).set({ lat: 35.7546 + (rand() - 0.5) * 0.06, lng: 51.4105 + (rand() - 0.5) * 0.08 }).where(eq(S.orders.id, d.id));

  // 3) customer birthdays (two of them are today's, to demonstrate the automation)
  const { jm, jd } = toJ(new Date());
  const cs = await db.select().from(S.customers).where(eq(S.customers.businessId, bid)).orderBy(asc(S.customers.id));
  for (const [i, c] of cs.entries()) {
    const today = i === 1 || i === 4;
    await db.update(S.customers).set({ birthMonth: today ? jm : 1 + Math.floor(rand() * 12), birthDay: today ? jd : 1 + Math.floor(rand() * 28), smsOptIn: i !== 7 }).where(eq(S.customers.id, c.id));
  }

  // 4) SMS panel (simulated mode: no API key) + pattern templates
  const [tb, ty, tp, ts] = await db.insert(S.smsTemplates).values([
    { businessId: bid, purpose: "birthday", title: "تبریک تولد", templateId: "birthday", params: [{ name: "token", var: "customer_name" }, { name: "token2", var: "code" }, { name: "token3", var: "discount" }], sampleText: "%token عزیز، تولدت مبارک!  با کد %token2 از %token3 تخفیف هدیه‌ی ما را در سفارش بعدی بگیر. کافه نیلوفر" },
    { businessId: bid, purpose: "occasion", title: "تبریک شب یلدا", templateId: "yalda", params: [{ name: "token", var: "customer_name" }, { name: "token2", var: "restaurant" }], sampleText: "%token عزیز، شب یلدا مبارک!  میزبان شما در %token2 هستیم." },
    { businessId: bid, purpose: "promo", title: "تخفیف ویژه", templateId: "promo", params: [{ name: "token", var: "customer_name" }, { name: "token2", var: "code" }, { name: "token3", var: "discount" }], sampleText: "%token عزیز، با کد %token2 تا %token3 تخفیف بگیرید. کافه نیلوفر" },
    { businessId: bid, purpose: "service", title: "آماده‌شدن سفارش", templateId: "order-ready", params: [{ name: "token", var: "customer_name" }], sampleText: "%token عزیز، سفارش شما آماده تحویل است. نوش جان!" },
  ]).returning();
  const yalda = fromJ(toJ(new Date()).jm > 9 || (toJ(new Date()).jm === 9 && toJ(new Date()).jd > 30) ? toJ(new Date()).jy + 1 : toJ(new Date()).jy, 9, 30, 10);
    await db.insert(S.campaigns).values([
    { businessId: bid, channel: "sms", kind: "promo", audience: "all", title: "کمپین شب یلدا", body: ty.sampleText, templateId: ty.id, recipients: cs.length, status: "scheduled", scheduledAt: yalda, extras: {} },
  ]);
  void ts;

  // 5) restaurant-level cashback switch + SMS settings
  const patch = { sms: { provider: "kavenegar", apiKey: "", sender: "", origin: "", birthdayAuto: true, birthdayTemplateId: tb.id, birthdayCode: "BDAY20", birthdayDiscount: "۲۰٪" }, cashbackEnabled: true, cashbackPercent: 5, cashbackMinOrder: 100000, cashbackMaxRedeemPercent: 50 };
  await db.update(S.businesses).set({ settings: sql`${S.businesses.settings} || ${JSON.stringify(patch)}::jsonb` }).where(eq(S.businesses.id, bid));

  // 6) accounting: chart + automatic documents for the history, then a few manual documents
  const fresh = (await db.select().from(S.businesses).where(eq(S.businesses.id, bid)))[0];
  await ensureAccounting(fresh);
  for (const slug of ["sandwichland", "parse"]) {
    const [b] = await db.select().from(S.businesses).where(eq(S.businesses.slug, slug));
    if (b) await ensureAccounting(b);
  }
  const accs = await loadAccounts(bid);
  const ap = accs.find((a) => a.code === C.AP)!;
  const [sup] = await db.insert(S.accAccounts).values({ businessId: bid, code: `${C.AP}01`, name: "تأمین‌کننده گوشت — آقای رضایی", level: "tafsili", parentId: ap.id, type: "liability", nature: "credit" }).onConflictDoNothing().returning();
  const supId = sup?.id ?? accs.find((a) => a.code === `${C.AP}01`)?.id;
  if (supId) {
    await postDocument(fresh, { date: new Date(Date.now() - 4 * 86400_000), source: "manual", sourceRef: "seed:purchase", createdBy: "ژیلا امینی", description: "خرید نسیه گوشت از آقای رضایی (فاکتور ۱۲۴)", lines: [{ code: C.INV, debit: 8_000_000, description: "گوشت گوساله و گوسفندی" }, { accountId: supId, credit: 8_000_000, description: "بدهی به تأمین‌کننده" }] });
    await postDocument(fresh, { date: new Date(Date.now() - 1 * 86400_000), source: "manual", sourceRef: "seed:payment", createdBy: "ژیلا امینی", description: "تسویه بخشی از بدهی آقای رضایی (واریز بانکی)", lines: [{ accountId: supId, debit: 3_000_000, description: "تسویه" }, { code: C.BANK, credit: 3_000_000, description: "برداشت از بانک" }] }).catch(() => undefined);
    await postDocument(fresh, { date: new Date(), source: "manual", status: "draft", createdBy: "ژیلا امینی", description: "پیش‌نویس: پرداخت پیش‌پرداخت اجاره ماه آینده", lines: [{ code: C.RENT, debit: 45_000_000 }, { code: C.BANK, credit: 45_000_000 }] }, { enforce: false });
  }
}


/* ------------------------------------------------------------------ phase 4 (idempotent data upgrades) */
export async function seedPhase4() {
  const { sql } = await import("drizzle-orm");
  // customers: derive last purchase time from real paid orders
  await db.execute(sql`update customers c set last_order_at = (select max(o.created_at) from orders o where o.customer_id = c.id and o.payment_status = 'paid') where c.last_order_at is null`);
  // remove history that was only illustrative (no real provider ever sent it)
  await db.execute(sql`delete from sms_logs where status = 'simulated'`);
  await db.execute(sql`delete from campaigns where channel = 'sms' and status = 'sent' and title = 'تخفیف زمستانی' and sent_count > 0 and not exists (select 1 from sms_logs l where l.campaign_id = campaigns.id)`);
  // supplier directory for the demo restaurant (the payable account already exists from the credit purchase)
  const [u] = await db.select().from(S.users).where(eq(S.users.email, DEMO_EMAIL));
  if (!u) return;
  const [biz] = await db.select().from(S.businesses).where(eq(S.businesses.userId, u.id));
  const [has] = await db.select({ id: S.suppliers.id }).from(S.suppliers).where(eq(S.suppliers.businessId, biz.id)).limit(1);
  if (has) return;
  const { ensureAccounting, ensureSupplierAccount } = await import("@/lib/accounting");
  await ensureAccounting(biz);
  const old = (await db.select().from(S.accAccounts).where(and(eq(S.accAccounts.businessId, biz.id), eq(S.accAccounts.name, "تأمین‌کننده گوشت — آقای رضایی"))))[0];
  if (old) await db.insert(S.suppliers).values({ businessId: biz.id, name: "آقای رضایی (گوشت)", contactPerson: "حسین رضایی", phone: "09123456780", address: "تهران، میدان بهارستان، بازار گوشت", taxId: "0012345678", bankInfo: "IR120170000000100324200001", accountId: old.id });
  const acc2 = await ensureSupplierAccount(biz, "شرکت لبنیات نیلگون");
  await db.insert(S.suppliers).values({ businessId: biz.id, name: "شرکت لبنیات نیلگون", contactPerson: "مهندس کاظمی", phone: "02188776655", address: "تهران، شهرک صنعتی شمس‌آباد", taxId: "10320987654", accountId: acc2.id });
}

/* ------------------------------------------------------------------ phase 5 (admin panel + couriers) */
export async function seedPhase5() {
  const { sql } = await import("drizzle-orm");
  const [done] = await db.select({ id: S.users.id }).from(S.users).where(eq(S.users.email, "support@menudigital.ir"));
  if (done) return;
  const [adm] = await db.select().from(S.users).where(eq(S.users.email, "admin@menudigital.ir"));
  const [demoOwner] = await db.select().from(S.users).where(eq(S.users.email, DEMO_EMAIL));
  if (!adm || !demoOwner) return;
  const [admBiz] = await db.select().from(S.businesses).where(eq(S.businesses.userId, adm.id));
  const [biz] = await db.select().from(S.businesses).where(eq(S.businesses.userId, demoOwner.id));
  const pw = hashPassword("demo1234");

  // admin team (each department sees only what it needs)
  const [sup, fin] = await db.insert(S.users).values([
    { name: "مریم پشتیبان", email: "support@menudigital.ir", passwordHash: pw, role: "admin", staffRole: "support", businessId: admBiz.id },
    { name: "رضا حسابدار", email: "finance@menudigital.ir", passwordHash: pw, role: "admin", staffRole: "finance", businessId: admBiz.id },
  ]).returning();

  // courier account for the demo restaurant
  const crs = await db.select().from(S.couriers).where(eq(S.couriers.businessId, biz.id)).orderBy(asc(S.couriers.id));
  if (crs[0]) {
    const [cu] = await db.insert(S.users).values({ name: crs[0].name, email: "courier@menudigital.ir", passwordHash: pw, role: "courier", businessId: biz.id }).returning();
    await db.update(S.couriers).set({ userId: cu.id, status: "available" }).where(eq(S.couriers.id, crs[0].id));
    // a ready order for the courier to pick up right away
    await db.execute(sql`update orders set courier_id = ${crs[0].id} where business_id = ${biz.id} and type = 'delivery' and status = 'ready' and courier_id is null`);
  }
  await db.execute(sql`update orders set delivery_status = case when status = 'paid' then 'delivered' when status = 'served' then 'picked_up' when status in ('pending','preparing','ready') then 'assigned' else 'none' end,
    assigned_at = created_at, picked_up_at = case when status in ('paid','served') then created_at + interval '12 minutes' end,
    delivery_finished_at = case when status = 'paid' then updated_at end where type = 'delivery' and courier_id is not null and delivery_status = 'none'`);

  // extra demo tenants so the platform numbers look alive
  const mk = async (name: string, owner: string, email: string, plan: string, slug: string, months: number | null, daysAgo: number) => {
    const [u] = await db.insert(S.users).values({ name: owner, email, passwordHash: pw }).returning();
    const [b] = await db.insert(S.businesses).values({ userId: u.id, name, slug, plan, description: `منوی دیجیتال ${name}`, logoEmoji: "", createdAt: ago(daysAgo), subscriptionEndsAt: months ? new Date(Date.now() + months * DAY) : null }).returning();
    return b;
  };
  const t1 = await mk("کافه باغ", "امیر کاظمی", "baagh@example.ir", "premium", "cafe-baagh", 200, 130);
  const t2 = await mk("رستوران ساحل", "نیلوفر فرهادی", "sahel@example.ir", "premium_plus", "sahel-rest", -12, 300);
  const t3 = await mk("قنادی شیرین", "حسین نوری", "shirin@example.ir", "basic", "shirin-sweets", null, 40);
  const [sand] = await db.select().from(S.businesses).where(eq(S.businesses.slug, "sandwichland"));
  const [parse] = await db.select().from(S.businesses).where(eq(S.businesses.slug, "parse"));
  if (sand) await db.update(S.businesses).set({ subscriptionEndsAt: new Date(Date.now() + 9 * DAY) }).where(eq(S.businesses.id, sand.id));
  await db.update(S.businesses).set({ subscriptionEndsAt: new Date(Date.now() + 240 * DAY) }).where(eq(S.businesses.id, biz.id));
  if (parse) await db.update(S.businesses).set({ upgradeRequest: "premium" }).where(eq(S.businesses.id, parse.id));

  // subscription invoices (paid in the last months + one waiting for payment)
  const P: Record<string, number> = { premium: 11_990_000, premium_plus: 19_990_000 };
  let no = 1000;
  const inv = (b: typeof biz, plan: string, daysAgo: number, status: "paid" | "unpaid", method = "transfer") => ({ number: ++no, businessId: b.id, plan, months: 12, amount: P[plan], status, method: status === "paid" ? method : "", refNo: status === "paid" ? String(100000 + Math.floor(rand() * 899999)) : "", paidAt: status === "paid" ? ago(daysAgo) : null, periodStart: status === "paid" ? ago(daysAgo) : null, periodEnd: status === "paid" ? new Date(ago(daysAgo).getTime() + 365 * DAY) : null, createdBy: "رضا حسابدار", createdAt: ago(daysAgo + 1) });
  const rand = rng(909);
  await db.insert(S.subscriptionInvoices).values([
    inv(biz, "premium_plus", 125, "paid", "online"), inv(t1, "premium", 165, "paid", "card"), inv(t2, "premium_plus", 95, "paid", "transfer"),
    ...(sand ? [inv(sand, "premium", 356, "paid", "transfer")] : []), inv(t2, "premium_plus", 40, "paid", "transfer"), inv(t1, "premium", 62, "paid", "cash"),
    ...(parse ? [inv(parse, "premium", 2, "unpaid")] : []),
  ]);
  await db.insert(S.platformExpenses).values([
    { category: "سرور و زیرساخت", amount: 9_500_000, description: "اجاره‌ی سرور ابری", date: ago(20), createdBy: "رضا حسابدار" },
    { category: "پیامک و ارتباطات", amount: 3_200_000, description: "شارژ پنل پیامک", date: ago(34), createdBy: "رضا حسابدار" },
    { category: "حقوق و دستمزد", amount: 24_000_000, description: "حقوق تیم پشتیبانی", date: ago(10), createdBy: "رضا حسابدار" },
    { category: "دامنه و گواهی", amount: 1_800_000, description: "تمدید دامنه و SSL", date: ago(75), createdBy: "رضا حسابدار" },
    { category: "بازاریابی و تبلیغات", amount: 6_000_000, description: "تبلیغات اینستاگرام", date: ago(48), createdBy: "رضا حسابدار" },
  ]);

  // tickets: departments, assignment, a transferred conversation
  await db.execute(sql`update tickets set department = 'tech', assigned_to = ${sup.id} where subject like '%پرینتر%'`);
  await db.execute(sql`update tickets set department = 'tech' where subject like '%دامنه%'`);
  if (sand) {
    const [a] = await db.insert(S.tickets).values({ businessId: sand.id, subject: "درخواست فاکتور تمدید اشتراک", status: "open", priority: "normal", department: "finance", createdAt: ago(1), updatedAt: ago(0, 5) }).returning();
    await db.insert(S.ticketMessages).values({ ticketId: a.id, authorRole: "user", authorName: "نسرین فلاحی", body: "سلام، اشتراک ما رو به پایان است. لطفاً فاکتور تمدید یک‌ساله را برایمان صادر کنید.", createdAt: ago(1) });
    const [b] = await db.insert(S.tickets).values({ businessId: t1.id, subject: "استرداد وجه اشتراک اشتباه", status: "open", priority: "high", department: "finance", createdAt: ago(2), updatedAt: ago(0, 9) }).returning();
    await db.insert(S.ticketMessages).values([
      { ticketId: b.id, authorRole: "user", authorName: "امیر کاظمی", body: "مبلغ اشتراک دو بار از حساب من کسر شده است.", createdAt: ago(2) },
      { ticketId: b.id, authorRole: "support", authorName: "مریم پشتیبان", body: "سلام؛ موضوع را بررسی می‌کنیم. برای بررسی دقیق‌تر، تیکت را به بخش مالی ارجاع می‌دهم.", createdAt: ago(1, 3) },
      { ticketId: b.id, authorRole: "system", authorName: "مریم پشتیبان", body: "تیکت از «پشتیبانی عمومی» به «مالی و حسابداری» ارجاع شد (توسط مریم پشتیبان) — مشتری ادعای کسر مضاعف دارد", createdAt: ago(1, 2) },
      { ticketId: b.id, authorRole: "note", authorName: "مریم پشتیبان", internal: true, body: "رسید دوم بانکی را از مشتری دیدم؛ شماره پیگیری ۸۴۳۲۱۰ تکراری است.", createdAt: ago(1, 2) },
    ]);
  }
  if (parse) {
    const [c] = await db.insert(S.tickets).values({ businessId: parse.id, subject: "سوال درباره ارتقا به پلن پرمیوم", status: "answered", priority: "low", department: "sales", assignedTo: sup.id, createdAt: ago(3), updatedAt: ago(2) }).returning();
    await db.insert(S.ticketMessages).values([
      { ticketId: c.id, authorRole: "user", authorName: "آرش پارسایی", body: "پلن پرمیوم چه امکاناتی نسبت به پایه دارد؟ آیا می‌توانم ماهانه پرداخت کنم؟", createdAt: ago(3) },
      { ticketId: c.id, authorRole: "support", authorName: "مریم پشتیبان", body: "سلام؛ پلن‌ها سالانه هستند و پرمیوم شامل سفارش‌گیر، حسابداری و انبارداری است. فاکتور آن را برایتان صادر کرده‌ایم.", createdAt: ago(2) },
    ]);
  }
  await db.insert(S.announcements).values([
    { title: "به‌روزرسانی جدید: پنل پیک و آپلود تصویر محصول", body: "اکنون پیک‌ها پنل اختصاصی دارند و می‌توانید تصویر محصولات را مستقیم از دستگاه بارگذاری کنید.", level: "success", audience: "all", createdBy: "مدیر سامانه" },
    { title: "تعمیرات شبانه", body: "جمعه ساعت ۳ تا ۴ بامداد ممکن است سرویس برای چند دقیقه در دسترس نباشد.", level: "warning", audience: "all", expiresAt: new Date(Date.now() + 6 * DAY), createdBy: "مدیر سامانه" },
  ]);
  await db.insert(S.appSettings).values({ key: "support", value: { phone: "", email: "support@menudigital.ir", hours: "همه روزه ۸ تا ۲۴" } }).onConflictDoNothing();
  void fin; void t3;
}
