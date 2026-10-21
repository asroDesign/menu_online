import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { DEMO_ENABLED, DEMO_SLUG } from "@/lib/demo-mode";
import {
  businesses,
  categories,
  diningTables,
  orderItems,
  orders,
  products,
  staff,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";

export const DEMO_EMAIL = "demo@menudigital.ir";
export { DEMO_SLUG };

type P = [string, string, number, string, number, { f?: boolean; old?: number; off?: boolean }?];

export const CATALOG: { name: string; emoji: string; img: string; items: P[] }[] = [
  {
    name: "صبحانه",
    emoji: "",
    img: "breakfast",
    items: [
      ["املت گوجه‌فرنگی", "املت خانگی با گوجه‌فرنگی تازه، نان سنگک و چای", 120000, "", 12],
      ["نیمرو اسپانیایی", "تخم‌مرغ، سیب‌زمینی، پیاز کاراملی و پنیر گودا", 145000, "", 15],
      ["صبحانه ایرانی کامل", "پنیر، گردو، کره، مربا، عسل، خامه، تخم‌مرغ و چای دبش", 230000, "", 15, { f: true }],
      ["پنکیک نوتلا", "پنکیک نرم با نوتلا، موز و خرده فندق", 165000, "", 14],
    ],
  },
  {
    name: "قهوه و اسپرسو",
    emoji: "",
    img: "coffee",
    items: [
      ["اسپرسو", "دبل شات اسپرسو ۱۰۰٪ عربیکا", 75000, "", 4],
      ["کاپوچینو", "اسپرسو، شیر بخارداده و فوم مخملی", 115000, "", 5, { f: true }],
      ["لاته", "اسپرسو با شیر فراوان و لته‌آرت", 125000, "", 5],
      ["موکا", "اسپرسو، شکلات بلژیکی و شیر", 140000, "", 6],
      ["قهوه ترک", "قهوه ترک اصیل در قهوه‌جوش مسی", 90000, "", 7],
    ],
  },
  {
    name: "نوشیدنی سرد",
    emoji: "",
    img: "cold",
    items: [
      ["آیس لاته", "اسپرسو و شیر سرد روی یخ", 145000, "", 4, { f: true }],
      ["لیموناد نعنا", "لیمو تازه، نعنا و سودا", 95000, "", 4],
      ["موهیتو", "لیمو، نعنا تازه، سودا و شاخه نیشکر", 110000, "", 5],
      ["اسموتی توت‌فرنگی", "توت‌فرنگی، موز و ماست یونانی", 135000, "", 6, { off: true }],
    ],
  },
  {
    name: "پیتزا",
    emoji: "",
    img: "pizza",
    items: [
      ["پیتزا مارگاریتا", "سس گوجه، موزارلا و ریحان تازه", 245000, "", 18],
      ["پیتزا پپرونی", "پپرونی دودی، موزارلا و سس مخصوص", 295000, "", 18, { f: true }],
      ["پیتزا مخصوص نیلوفر", "ژامبون، قارچ، فلفل دلمه، زیتون و پنیر", 320000, "", 20],
      ["پیتزا قارچ و پنیر", "قارچ تازه، پنیر پارمزان و موزارلا", 275000, "", 18],
    ],
  },
  {
    name: "برگر",
    emoji: "",
    img: "burger",
    items: [
      ["کلاسیک برگر", "۱۵۰ گرم گوشت گوساله، کاهو، گوجه و سس مخصوص", 265000, "", 15, { f: true }],
      ["چیزبرگر دوبل", "دو لایه گوشت، چدار ذوب‌شده و خیارشور", 345000, "", 18, { old: 380000 }],
      ["چیکن برگر", "فیله مرغ سوخاری ترد با سس رانچ", 235000, "", 14],
      ["سیب‌زمینی سرخ‌کرده", "سیب‌زمینی ویژه با چاشنی مخصوص", 85000, "", 8],
    ],
  },
  {
    name: "غذاهای ایرانی",
    emoji: "",
    img: "persian",
    items: [
      ["چلوکباب کوبیده", "دو سیخ کوبیده، برنج ایرانی، گوجه و کره", 320000, "", 20, { f: true }],
      ["جوجه‌کباب زعفرانی", "سینه مرغ ترش‌شده در زعفران با برنج", 300000, "", 20],
      ["قرمه‌سبزی", "خورشت سنتی با گوشت گوسفندی و لوبیا قرمز", 280000, "", 12],
      ["زرشک‌پلو با مرغ", "مرغ زعفرانی، زرشک و پسته", 265000, "", 15],
    ],
  },
  {
    name: "سالاد",
    emoji: "",
    img: "salad",
    items: [
      ["سالاد سزار با مرغ", "کاهو رومی، مرغ گریل، پارمزان و کروتون", 195000, "", 8],
      ["سالاد یونانی", "خیار، گوجه، زیتون، پنیر فتا و اورگانو", 160000, "", 6],
      ["سالاد فصل", "سبزیجات تازه با سس لیمو و زیتون", 90000, "", 5],
    ],
  },
  {
    name: "دسر و کیک",
    emoji: "",
    img: "dessert",
    items: [
      ["چیزکیک نیویورکی", "چیزکیک کرمی با سس توت‌فرنگی", 155000, "", 3, { f: true }],
      ["براونی با بستنی", "براونی گرم شکلاتی، بستنی وانیلی و سس کارامل", 140000, "", 6],
      ["تیرامیسو", "دسر ایتالیایی با قهوه و ماسکارپونه", 165000, "", 3],
      ["بستنی سنتی زعفرانی", "بستنی سنتی با زعفران و پسته", 95000, "", 3],
    ],
  },
];

export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedDemo() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) return;

  const [user] = await db
    .insert(users)
    .values({ name: "سارا نیلوفری", email: DEMO_EMAIL, passwordHash: hashPassword(randomBytes(32).toString("hex")) })
    .onConflictDoNothing()
    .returning();
  if (!user) return;

  const [biz] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: "کافه رستوران نیلوفر",
      slug: DEMO_SLUG,
      plan: "premium_plus",
      type: "cafe",
      description: "قهوه‌ی تازه، غذای خانگی و فضایی آرام در قلب تهران؛ از ۸ صبح تا ۱۲ شب میزبان شما هستیم.",
      phone: "۰۲۱-۸۸۱۲۳۴۵۶",
      address: "تهران، خیابان ولیعصر، بالاتر از پارک ساعی، پلاک ۱۲۴",
      instagram: "niloofar.cafe",
      accentColor: "#2563eb",
      logoEmoji: "",
      taxPercent: 10,
      servicePercent: 5,
    })
    .returning();

  const cats = await db
    .insert(categories)
    .values(
      CATALOG.map((c, i) => ({
        businessId: biz.id,
        name: c.name,
        emoji: c.emoji,
        sortOrder: i,
      })),
    )
    .returning();

  const prodRows = await db
    .insert(products)
    .values(
      CATALOG.flatMap((c, ci) =>
        c.items.map((p) => ({
          businessId: biz.id,
          categoryId: cats[ci].id,
          name: p[0],
          description: p[1],
          price: p[2],
          emoji: p[3],
          prepMinutes: p[4],
          imageUrl: `/food/${c.img}.jpg`,
          isFeatured: !!p[5]?.f,
          oldPrice: p[5]?.old ?? null,
          isAvailable: !p[5]?.off,
        })),
      ),
    )
    .returning();

  const zones = ["سالن اصلی", "سالن اصلی", "سالن اصلی", "سالن اصلی", "سالن اصلی", "سالن اصلی", "تراس", "تراس", "تراس", "تراس", "VIP", "VIP"];
  const caps = [2, 2, 4, 4, 4, 6, 4, 4, 2, 6, 8, 10];
  const tbls = await db
    .insert(diningTables)
    .values(
      zones.map((z, i) => ({
        businessId: biz.id,
        name: `میز ${i + 1}`,
        zone: z,
        capacity: caps[i],
      })),
    )
    .returning();

  const staffRows = await db
    .insert(staff)
    .values([
      { businessId: biz.id, name: "علی رضایی", role: "waiter", phone: "۰۹۱۲۱۲۳۴۵۶۷" },
      { businessId: biz.id, name: "مریم حسینی", role: "waiter", phone: "۰۹۱۹۳۴۵۶۷۸۹" },
      { businessId: biz.id, name: "سجاد کریمی", role: "waiter", phone: "۰۹۳۵۵۶۷۸۹۰۱" },
      { businessId: biz.id, name: "نگار احمدی", role: "cashier", phone: "۰۹۱۲۷۷۸۸۹۹۰" },
      { businessId: biz.id, name: "حسین موسوی", role: "chef", phone: "۰۹۱۰۱۱۲۲۳۳۴" },
      { businessId: biz.id, name: "الهام صادقی", role: "manager", phone: "۰۹۱۲۹۹۸۸۷۷۶", isActive: false },
    ])
    .returning();
  const waiters = staffRows.filter((s) => s.role === "waiter");

  // ---- demo orders for the last 14 days ----
  const rand = rng(20240607);
  const now = Date.now();
  const weights = prodRows.map((_, i) => (CATALOG.flatMap((c) => c.items)[i][5]?.f ? 3 : 1) + rand() * 2);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let r = rand() * wsum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return prodRows[i];
    }
    return prodRows[0];
  };
  const names = ["", "", "", "رضا", "نیلوفر", "محمد", "ترانه", "کیان", "سمیرا", ""];

  type Draft = { at: number; items: { p: (typeof prodRows)[number]; q: number }[] };
  const drafts: Draft[] = [];
  for (let d = 13; d >= 0; d--) {
    const count = d === 0 ? 11 : 9 + Math.floor(rand() * 10) + (d % 7 === 5 ? 6 : 0);
    for (let k = 0; k < count; k++) {
      const at =
        d === 0
          ? now - Math.floor(rand() * 9 * 3600_000) - 6 * 60_000
          : now - d * 86400_000 - Math.floor(rand() * 13 * 3600_000);
      const n = 1 + Math.floor(rand() * 4);
      const items: Draft["items"] = [];
      for (let j = 0; j < n; j++) {
        const p = pick();
        if (!p.isAvailable || items.some((x) => x.p.id === p.id)) continue;
        items.push({ p, q: 1 + Math.floor(rand() * 2) });
      }
      if (items.length) drafts.push({ at, items });
    }
  }
  drafts.sort((a, b) => a.at - b.at);

  const orderValues = drafts.map((dr, i) => {
    const subtotal = dr.items.reduce((s, x) => s + x.p.price * x.q, 0);
    const tax = Math.round(subtotal * 0.1);
    const service = Math.round(subtotal * 0.05);
    const ageMin = (now - dr.at) / 60000;
    let status = "paid";
    if (ageMin < 12) status = "pending";
    else if (ageMin < 25) status = "preparing";
    else if (ageMin < 40) status = "ready";
    else if (ageMin < 60) status = "served";
    else if (rand() < 0.06) status = "canceled";
    const takeaway = rand() < 0.15;
    const src = rand() < 0.3 ? "customer" : "waiter";
    return {
      businessId: biz.id,
      number: 1001 + i,
      tableId: takeaway ? null : tbls[Math.floor(rand() * tbls.length)].id,
      waiterId: src === "waiter" ? waiters[Math.floor(rand() * waiters.length)].id : null,
      customerName: names[Math.floor(rand() * names.length)],
      source: src,
      type: takeaway ? "takeaway" : "dine_in",
      status,
      note: rand() < 0.12 ? "بدون پیاز، لطفاً" : "",
      subtotal,
      tax,
      service,
      total: subtotal + tax + service,
      createdAt: new Date(dr.at),
      updatedAt: new Date(Math.min(now, dr.at + 20 * 60_000)),
    };
  });

  const inserted: { id: number }[] = [];
  for (let i = 0; i < orderValues.length; i += 100) {
    inserted.push(...(await db.insert(orders).values(orderValues.slice(i, i + 100)).returning({ id: orders.id })));
  }
  const itemValues = inserted.flatMap((o, i) =>
    drafts[i].items.map((x) => ({
      orderId: o.id,
      productId: x.p.id,
      name: x.p.name,
      emoji: x.p.emoji,
      price: x.p.price,
      quantity: x.q,
      lineTotal: x.p.price * x.q,
    })),
  );
  for (let i = 0; i < itemValues.length; i += 300) {
    await db.insert(orderItems).values(itemValues.slice(i, i + 300));
  }
}

let running: Promise<void> | null = null;
export function ensureDemoData() {
  if (!DEMO_ENABLED) return Promise.resolve();
  if (!running) {
    running = (async () => {
      await seedDemo();
      const { seedExtras, seedAccounts, seedPhase3, seedPhase4, seedPhase5 } = await import("@/lib/seed-extra");
      await seedExtras();
      await seedAccounts();
      await seedPhase3();
      await seedPhase4();
      await seedPhase5();
    })().catch((e) => {
      console.error("seed failed", e);
      running = null;
    });
  }
  return running;
}
