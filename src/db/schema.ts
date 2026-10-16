import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  customType,
  doublePrecision,
  bigint,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"), // owner | staff | admin
  businessId: integer("business_id"), // for staff accounts
  staffRole: text("staff_role"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("cafe"),
  description: text("description").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  accentColor: text("accent_color").notNull().default("#f97316"),
  logoEmoji: text("logo_emoji").notNull().default(""),
  taxPercent: integer("tax_percent").notNull().default(10),
  servicePercent: integer("service_percent").notNull().default(0),
  acceptOrders: boolean("accept_orders").notNull().default(true),
  plan: text("plan").notNull().default("basic"),
  featureOverrides: jsonb("feature_overrides").$type<Record<string, boolean>>().notNull().default({}),
  upgradeRequest: text("upgrade_request"),
  customDomain: text("custom_domain").unique(),
  domainStatus: text("domain_status").notNull().default("none"), // none | pending | verified
  isSuspended: boolean("is_suspended").notNull().default(false),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  adminNote: text("admin_note").notNull().default(""),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_business_idx").on(t.businessId)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    price: integer("price").notNull().default(0),
    oldPrice: integer("old_price"),
    emoji: text("emoji").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    prepMinutes: integer("prep_minutes").notNull().default(10),
    isAvailable: boolean("is_available").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
  arModelUrl: text("ar_model_url").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_business_idx").on(t.businessId)],
);

export const diningTables = pgTable(
  "dining_tables",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    zone: text("zone").notNull().default("سالن اصلی"),
    capacity: integer("capacity").notNull().default(4),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tables_business_idx").on(t.businessId)],
);

export const staff = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("waiter"), // waiter | cashier | chef | manager
    phone: text("phone").notNull().default(""),
    userId: integer("user_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_business_idx").on(t.businessId)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    tableId: integer("table_id").references(() => diningTables.id, {
      onDelete: "set null",
    }),
    waiterId: integer("waiter_id").references(() => staff.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull().default(""),
    source: text("source").notNull().default("waiter"), // waiter | customer | cashier
    type: text("type").notNull().default("dine_in"), // dine_in | takeaway
    status: text("status").notNull().default("pending"), // pending | preparing | ready | served | paid | canceled
    note: text("note").notNull().default(""),
    subtotal: integer("subtotal").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    service: integer("service").notNull().default(0),
    total: integer("total").notNull().default(0),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerPhone: text("customer_phone").notNull().default(""),
  address: text("address").notNull().default(""),
  zoneId: integer("zone_id"),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  courierId: integer("courier_id").references(() => couriers.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  discountCode: text("discount_code").notNull().default(""),
  discountAmount: integer("discount_amount").notNull().default(0),
  cashbackUsed: integer("cashback_used").notNull().default(0),
  cashbackEarned: integer("cashback_earned").notNull().default(0),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  cogs: integer("cogs").notNull().default(0),
  deliveryStatus: text("delivery_status").notNull().default("none"), // none | assigned | picked_up | delivered | not_home | failed
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  deliveryFinishedAt: timestamp("delivery_finished_at", { withTimezone: true }),
  courierNote: text("courier_note").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_business_idx").on(t.businessId, t.createdAt),
    uniqueIndex("orders_business_number_idx").on(t.businessId, t.number),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default(""),
    price: integer("price").notNull(),
    quantity: integer("quantity").notNull().default(1),
    note: text("note").notNull().default(""),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

const bizId = () =>
  integer("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" });
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    note: text("note").notNull().default(""),
    points: integer("points").notNull().default(0),
    walletBalance: integer("wallet_balance").notNull().default(0),
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    smsOptIn: boolean("sms_opt_in").notNull().default(true),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    totalSpent: integer("total_spent").notNull().default(0),
    ordersCount: integer("orders_count").notNull().default(0),
    createdAt: created(),
  },
  (t) => [uniqueIndex("customers_biz_phone_idx").on(t.businessId, t.phone)],
);

export const walletEntries = pgTable("wallet_entries", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  kind: text("kind").notNull(), // earn | spend | refund | adjust
  amount: integer("amount").notNull(),
  note: text("note").notNull().default(""),
  createdAt: created(),
});

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    code: text("code").notNull(),
    type: text("type").notNull().default("percent"), // percent | fixed
    value: integer("value").notNull().default(10),
    minOrder: integer("min_order").notNull().default(0),
    maxUses: integer("max_uses").notNull().default(0),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("discount_biz_code_idx").on(t.businessId, t.code)],
);

export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  questions: jsonb("questions").$type<unknown[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const surveyResponses = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id")
    .notNull()
    .references(() => surveys.id, { onDelete: "cascade" }),
  businessId: bizId(),
  customerName: text("customer_name").notNull().default(""),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"), // open | answered | closed
  priority: text("priority").notNull().default("normal"),
  department: text("department").notNull().default("support"),
  assignedTo: integer("assigned_to"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull(), // user | support
  authorName: text("author_name").notNull().default(""),
  internal: boolean("internal").notNull().default(false),
  body: text("body").notNull(),
  createdAt: created(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  channel: text("channel").notNull(), // sms | bale
  kind: text("kind").notNull().default("promo"), // service | promo
  audience: text("audience").notNull().default("all"),
  body: text("body").notNull(),
  recipients: integer("recipients").notNull().default(0),
  status: text("status").notNull().default("sent"), // scheduled | sending | sent | failed
  title: text("title").notNull().default(""),
  templateId: integer("template_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  extras: jsonb("extras").$type<Record<string, string>>().notNull().default({}),
  createdAt: created(),
});

export const translations = pgTable(
  "translations",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    entityType: text("entity_type").notNull(), // product | category
    entityId: integer("entity_id").notNull(),
    lang: text("lang").notNull(),
    name: text("name").notNull().default(""),
    description: text("description").notNull().default(""),
  },
  (t) => [uniqueIndex("translations_uq").on(t.businessId, t.entityType, t.entityId, t.lang)],
);

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  createdAt: created(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("عدد"),
  stock: doublePrecision("stock").notNull().default(0),
  minStock: doublePrecision("min_stock").notNull().default(0),
  costPerUnit: integer("cost_per_unit").notNull().default(0),
  createdAt: created(),
});

export const stockReceipts = pgTable("stock_receipts", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  requestKey: text("request_key").notNull(),
  type: text("type").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  invoiceNo: text("invoice_no").notNull().default(""),
  supplierId: integer("supplier_id"),
  subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
  discount: bigint("discount", { mode: "number" }).notNull().default(0),
  extraCost: bigint("extra_cost", { mode: "number" }).notNull().default(0),
  total: bigint("total", { mode: "number" }).notNull().default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
  payFrom: text("pay_from").notNull().default("cash"),
  documentId: integer("document_id"),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: created(),
}, (t) => [uniqueIndex("stock_receipts_request_idx").on(t.businessId, t.requestKey)]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // in | out | waste | adjust | sale
    delta: doublePrecision("delta").notNull(),
    balanceAfter: doublePrecision("balance_after").notNull().default(0),
    note: text("note").notNull().default(""),
    orderId: integer("order_id"),
    supplierId: integer("supplier_id"),
    unitCost: integer("unit_cost").notNull().default(0),
    invoiceNo: text("invoice_no").notNull().default(""),
    receiptId: integer("receipt_id").references(() => stockReceipts.id),
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("stock_mov_biz_idx").on(t.businessId, t.createdAt)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: doublePrecision("quantity").notNull(),
  },
  (t) => [uniqueIndex("recipes_uq").on(t.productId, t.itemId)],
);

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  bank: text("bank").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  openingBalance: integer("opening_balance").notNull().default(0),
  createdAt: created(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    kind: text("kind").notNull(), // income | expense
    source: text("source").notNull().default("manual"), // sale | manual
    category: text("category").notNull().default(""),
    amount: integer("amount").notNull(),
    bankAccountId: integer("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    orderId: integer("order_id"),
    description: text("description").notNull().default(""),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    createdAt: created(),
  },
  (t) => [index("transactions_biz_idx").on(t.businessId, t.date)],
);

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull().defaultNow(),
  cost: integer("cost").notNull().default(0),
  salvage: integer("salvage").notNull().default(0),
  lifeMonths: integer("life_months").notNull().default(60),
  note: text("note").notNull().default(""),
  createdAt: created(),
});

export const couriers = pgTable("couriers", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  vehicle: text("vehicle").notNull().default("موتور"),
  status: text("status").notNull().default("available"), // available | busy | off
  userId: integer("user_id"),
  createdAt: created(),
});

export const deliveryZones = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  fee: integer("fee").notNull().default(0),
  minOrder: integer("min_order").notNull().default(0),
  etaMinutes: integer("eta_minutes").notNull().default(30),
  radiusKm: integer("radius_km").notNull().default(0),
  areas: text("areas").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  kind: text("kind").notNull(), // tablet | pos | printer | scale | caller_id
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  printerCategoryIds: jsonb("printer_category_ids").$type<number[]>().notNull().default([]),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastValue: doublePrecision("last_value").notNull().default(0),
  createdAt: created(),
});

export const pagers = pgTable(
  "pagers",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    number: integer("number").notNull(),
    status: text("status").notNull().default("free"), // free | busy | ringing
    orderId: integer("order_id"),
    ringRequestedAt: timestamp("ring_requested_at", { withTimezone: true }),
    ringSentAt: timestamp("ring_sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("pagers_biz_number_idx").on(t.businessId, t.number)],
);

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  phone: text("phone").notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: created(),
});

export const printJobs = pgTable("print_jobs", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  orderId: integer("order_id"),
  deviceId: integer("device_id").references(() => devices.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | printing | printed | failed
  content: text("content").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: created(),
  printedAt: timestamp("printed_at", { withTimezone: true }),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // ipg | snappay | digipay
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  authority: text("authority").notNull().unique(),
  refId: text("ref_id").notNull().default(""),
  createdAt: created(),
});

export const crossSellRules = pgTable(
  "cross_sell_rules",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    suggestedId: integer("suggested_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("cross_sell_uq").on(t.productId, t.suggestedId)],
);

export const planFeatures = pgTable(
  "plan_features",
  {
    id: serial("id").primaryKey(),
    plan: text("plan").notNull(),
    feature: text("feature").notNull(),
    level: text("level").notNull(),
  },
  (t) => [uniqueIndex("plan_feature_uq").on(t.plan, t.feature)],
);

/* ---------------- advanced accounting ---------------- */
export const accAccounts = pgTable(
  "acc_accounts",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: text("level").notNull(), // kol | moein | tafsili
    parentId: integer("parent_id"),
    type: text("type").notNull(), // asset | liability | equity | revenue | expense
    nature: text("nature").notNull().default("debit"), // debit | credit
    refType: text("ref_type"), // bank
    refId: integer("ref_id"),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("acc_accounts_code_idx").on(t.businessId, t.code)],
);

export const accFiscalYears = pgTable("acc_fiscal_years", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  title: text("title").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: created(),
});

export const accDocuments = pgTable(
  "acc_documents",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    fiscalYearId: integer("fiscal_year_id")
      .notNull()
      .references(() => accFiscalYears.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    kind: text("kind").notNull().default("general"), // general | opening | closing
    source: text("source").notNull().default("manual"), // manual | order | inventory | expense | reversal | system
    sourceRef: text("source_ref"),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("posted"), // draft | posted
    reversedOf: integer("reversed_of"),
    reversed: boolean("reversed").notNull().default(false),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
    createdBy: text("created_by").notNull().default(""),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("acc_docs_number_idx").on(t.businessId, t.fiscalYearId, t.number),
    uniqueIndex("acc_docs_ref_idx").on(t.businessId, t.sourceRef),
    index("acc_docs_date_idx").on(t.businessId, t.date),
  ],
);

export const accLines = pgTable(
  "acc_lines",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => accDocuments.id, { onDelete: "cascade" }),
    businessId: bizId(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accAccounts.id),
    debit: bigint("debit", { mode: "number" }).notNull().default(0),
    credit: bigint("credit", { mode: "number" }).notNull().default(0),
    description: text("description").notNull().default(""),
  },
  (t) => [index("acc_lines_doc_idx").on(t.documentId), index("acc_lines_acc_idx").on(t.accountId)],
);

/* ---------------- SMS (pattern based) ---------------- */
export const smsTemplates = pgTable("sms_templates", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  purpose: text("purpose").notNull().default("promo"), // birthday | occasion | promo | service
  title: text("title").notNull(),
  templateId: text("template_id").notNull(), // kavenegar: template name; sms.ir: numeric id
  params: jsonb("params").$type<{ name: string; var: string }[]>().notNull().default([]),
  sampleText: text("sample_text").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const smsLogs = pgTable(
  "sms_logs",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    campaignId: integer("campaign_id"),
    customerId: integer("customer_id"),
    kind: text("kind").notNull().default("campaign"), // campaign | birthday | test
    phone: text("phone").notNull(),
    provider: text("provider").notNull().default(""),
    status: text("status").notNull(), // sent | failed | simulated
    detail: text("detail").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("sms_logs_biz_idx").on(t.businessId, t.createdAt)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    name: text("name").notNull(),
    contactPerson: text("contact_person").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    taxId: text("tax_id").notNull().default(""), // شناسه ملی / کد اقتصادی
    bankInfo: text("bank_info").notNull().default(""), // شبا / شماره کارت
    note: text("note").notNull().default(""),
    accountId: integer("account_id"), // tafsili account under 2101
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [index("suppliers_biz_idx").on(t.businessId)],
);

export const posRequests = pgTable(
  "pos_requests",
  {
    id: serial("id").primaryKey(),
    businessId: bizId(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    deviceId: integer("device_id"),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | failed | canceled
    refNo: text("ref_no").notNull().default(""),
    token: text("token").notNull().default(""),
    detail: text("detail").notNull().default(""),
    pickedAt: timestamp("picked_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pos_requests_biz_idx").on(t.businessId, t.status)],
);

const bytea = customType<{ data: Buffer; default: false }>({ dataType: () => "bytea" });

export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    businessId: bizId(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: created(),
  },
  (t) => [index("uploads_biz_idx").on(t.businessId)],
);

/* ---------------- platform administration ---------------- */
export const subscriptionInvoices = pgTable(
  "subscription_invoices",
  {
    id: serial("id").primaryKey(),
    number: integer("number").notNull(),
    businessId: bizId(),
    plan: text("plan").notNull(),
    months: integer("months").notNull().default(12),
    amount: bigint("amount", { mode: "number" }).notNull().default(0), // toman, after discount
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("unpaid"), // unpaid | paid | void
    method: text("method").notNull().default(""), // transfer | card | cash | online
    refNo: text("ref_no").notNull().default(""),
    note: text("note").notNull().default(""),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: text("created_by").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("sub_inv_biz_idx").on(t.businessId), index("sub_inv_status_idx").on(t.status)],
);

export const platformExpenses = pgTable("platform_expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("سایر"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  description: text("description").notNull().default(""),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default(""),
  createdAt: created(),
});

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  level: text("level").notNull().default("info"), // info | warning | success
  audience: text("audience").notNull().default("all"), // all | plan:basic | plan:premium | plan:premium_plus
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: created(),
});

export const adminAudit = pgTable(
  "admin_audit",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").notNull(),
    adminName: text("admin_name").notNull().default(""),
    action: text("action").notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    detail: text("detail").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("admin_audit_idx").on(t.createdAt)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
});

export const reservations = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    tableId: integer("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    guestCount: integer("guest_count").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    status: text("status").notNull().default("requested"), // requested | confirmed | cancelled | completed | no_show
    depositAmount: integer("deposit_amount").notNull().default(0),
    depositStatus: text("deposit_status").notNull().default("not_required"), // not_required | pending | paid | waived
    depositMethod: text("deposit_method").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservations_business_start_idx").on(t.businessId, t.startsAt), index("reservations_table_start_idx").on(t.tableId, t.startsAt)],
);

export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  windowStarted: timestamp("window_started", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
