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
  date,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ProductOptionGroup, ProductOptionSnapshot } from "@/lib/product-options";
import type { MembershipOrderSnapshot } from "@/lib/membership-core";
import type { PaymentBreakdown, SettlementPlan } from "@/lib/order-settlement-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"), // owner | staff | admin
  businessId: integer("business_id"), // for staff accounts
  staffRole: text("staff_role"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliates = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("pending"), // pending | active | rejected | suspended
  referralCode: text("referral_code").notNull().unique(),
  channel: text("channel").notNull().default(""),
  website: text("website").notNull().default(""),
  introduction: text("introduction").notNull().default(""),
  commissionPercent: integer("commission_percent").notNull().default(10),
  attributionDays: integer("attribution_days").notNull().default(30),
  minimumWithdrawal: bigint("minimum_withdrawal", { mode: "number" }).notNull().default(0),
  bankName: text("bank_name").notNull().default(""),
  accountHolder: text("account_holder").notNull().default(""),
  cardNumber: text("card_number").notNull().default(""),
  sheba: text("sheba").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const affiliateSessions = pgTable("affiliate_sessions", {
  id: text("id").primaryKey(), // SHA-256 of the HTTP-only cookie token
  affiliateId: integer("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("cafe"),
  description: text("description").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  accentColor: text("accent_color").notNull().default("#2563eb"),
  logoEmoji: text("logo_emoji").notNull().default(""),
  taxPercent: integer("tax_percent").notNull().default(10),
  servicePercent: integer("service_percent").notNull().default(0),
  acceptOrders: boolean("accept_orders").notNull().default(true),
  plan: text("plan").notNull().default("pending"),
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
  setupTourCompletedAt: timestamp("setup_tour_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("businesses_affiliate_idx").on(t.affiliateId)]);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    parentCategoryId: integer("parent_category_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    emoji: text("emoji").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_business_idx").on(t.businessId), index("categories_parent_idx").on(t.businessId, t.parentCategoryId)],
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
    videoUrl: text("video_url").notNull().default(""),
    price: integer("price").notNull().default(0),
    sellingMode: text("selling_mode").notNull().default("count"), // count | weight; weight price is per kg
    yieldRatio: doublePrecision("yield_ratio").notNull().default(1), // raw grams needed per cooked gram
    oldPrice: integer("old_price"),
    emoji: text("emoji").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    prepMinutes: integer("prep_minutes").notNull().default(10),
    isAvailable: boolean("is_available").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    externalId: text("external_id"),
    modifierGroups: jsonb("modifier_groups").$type<ProductOptionGroup[]>().notNull().default([]),
    dietaryTags: jsonb("dietary_tags").$type<string[]>().notNull().default([]),
    allergenTags: jsonb("allergen_tags").$type<string[]>().notNull().default([]),
    arModelUrl: text("ar_model_url").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_business_idx").on(t.businessId), uniqueIndex("products_business_external_idx").on(t.businessId, t.externalId)],
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
    operationalStatus: text("operational_status").notNull().default("available"), // available | cleaning | out_of_service
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tables_business_idx").on(t.businessId)],
);

export const tableStatusEvents = pgTable("table_status_events", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  tableId: integer("table_id").references(() => diningTables.id, { onDelete: "set null" }),
  tableName: text("table_name").notNull().default(""),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reason: text("reason").notNull().default(""),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("table_status_events_business_table_time_idx").on(t.businessId, t.tableId, t.createdAt)]);

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

export const staffShiftTemplates = pgTable("staff_shift_templates", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weekdays: text("weekdays").notNull(), // comma-separated ISO weekdays: Sunday=0 through Saturday=6
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  location: text("location").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_shift_templates_business_idx").on(t.businessId, t.staffId)]);

export const staffSchedules = pgTable("staff_schedules", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => staffShiftTemplates.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  location: text("location").notNull().default(""),
  status: text("status").notNull().default("scheduled"), // scheduled | canceled | absent
  absenceNote: text("absence_note").notNull().default(""),
  absenceRecordedBy: integer("absence_recorded_by").references(() => users.id),
  absenceRecordedAt: timestamp("absence_recorded_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by").notNull().references(() => users.id),
  updatedBy: integer("updated_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_schedules_business_time_idx").on(t.businessId, t.startsAt), index("staff_schedules_staff_time_idx").on(t.staffId, t.startsAt)]);

export const staffAttendanceRecords = pgTable("staff_attendance_records", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  scheduleId: integer("schedule_id").notNull().unique().references(() => staffSchedules.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  checkInAt: timestamp("check_in_at", { withTimezone: true }),
  checkOutAt: timestamp("check_out_at", { withTimezone: true }),
  checkInBy: integer("check_in_by").references(() => users.id),
  checkOutBy: integer("check_out_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_attendance_business_time_idx").on(t.businessId, t.checkInAt), index("staff_attendance_staff_time_idx").on(t.staffId, t.checkInAt)]);

export const staffAttendanceEvents = pgTable("staff_attendance_events", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  recordId: integer("record_id").notNull().references(() => staffAttendanceRecords.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // check_in | check_out | adjust_check_in | adjust_check_out
  previousAt: timestamp("previous_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull().default(""),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_attendance_events_record_idx").on(t.recordId, t.createdAt)]);

export const staffShiftSwapRequests = pgTable("staff_shift_swap_requests", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  scheduleId: integer("schedule_id").notNull().references(() => staffSchedules.id, { onDelete: "cascade" }),
  fromStaffId: integer("from_staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  toStaffId: integer("to_staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  status: text("status").notNull().default("pending_target"), // pending_target | pending_manager | approved | rejected
  reason: text("reason").notNull().default(""),
  decisionNote: text("decision_note").notNull().default(""),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("staff_shift_swaps_business_status_idx").on(t.businessId, t.status, t.createdAt),
  uniqueIndex("staff_shift_swaps_one_pending_per_schedule_idx").on(t.scheduleId).where(sql`${t.status} in ('pending_target', 'pending_manager')`),
]);

export const staffLeaveRequests = pgTable("staff_leave_requests", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  kind: text("kind").notNull().default("personal"),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_leave_business_time_idx").on(t.businessId, t.startsAt), index("staff_leave_staff_time_idx").on(t.staffId, t.startsAt)]);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    trackingTokenHash: text("tracking_token_hash"),
    trackingExpiresAt: timestamp("tracking_expires_at", { withTimezone: true }),
    trackingRevokedAt: timestamp("tracking_revoked_at", { withTimezone: true }),
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
  membershipDiscount: integer("membership_discount").notNull().default(0),
  membershipSnapshot: jsonb("membership_snapshot").$type<MembershipOrderSnapshot | null>(),
  membershipAppliedBy: integer("membership_applied_by").references(() => users.id, { onDelete: "set null" }),
  cashbackUsed: integer("cashback_used").notNull().default(0),
  cashbackEarned: integer("cashback_earned").notNull().default(0),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentBreakdown: jsonb("payment_breakdown").$type<PaymentBreakdown | null>(),
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
    index("orders_customer_paid_analytics_idx").on(t.businessId, t.customerId, t.createdAt).where(sql`${t.status} = 'paid' AND ${t.paymentStatus} = 'paid' AND ${t.deletedAt} IS NULL AND ${t.customerId} IS NOT NULL`),
    uniqueIndex("orders_tracking_token_hash_idx").on(t.trackingTokenHash),
    uniqueIndex("orders_business_number_idx").on(t.businessId, t.number),
  ],
);

export const orderStatusEvents = pgTable("order_status_events", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // order | payment | delivery
  fromValue: text("from_value"),
  toValue: text("to_value").notNull(),
  actorType: text("actor_type").notNull().default("system"),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("order_status_events_business_order_time_idx").on(t.businessId, t.orderId, t.createdAt)]);

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
    weightGrams: integer("weight_grams"), // net cooked/sold grams per unit, null for count products
    tareGrams: integer("tare_grams").notNull().default(0),
    yieldRatioSnapshot: doublePrecision("yield_ratio_snapshot").notNull().default(1),
    lineTotal: integer("line_total").notNull().default(0),
    note: text("note").notNull().default(""),
    optionSnapshot: jsonb("option_snapshot").$type<ProductOptionSnapshot[]>().notNull().default([]),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const menuEvents = pgTable("menu_events", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  eventName: text("event_name").notNull(),
  categoryId: integer("category_id"),
  productId: integer("product_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("menu_events_business_event_idx").on(t.businessId, t.eventId),
  index("menu_events_business_created_idx").on(t.businessId, t.createdAt),
]);

export type MenuImportRow = {
  externalId: string;
  category: string;
  name: string;
  description: string;
  priceToman: number;
  available: boolean;
  errors: string[];
  duplicate: boolean;
};

export const menuImportJobs = pgTable("menu_import_jobs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(),
  sourceHash: text("source_hash").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  status: text("status").notNull().default("preview"), // preview | committed
  rows: jsonb("rows").$type<MenuImportRow[]>().notNull().default([]),
  result: jsonb("result").$type<{ created: number; skipped: number; productIds: number[]; categoryIds: number[] } | null>(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("menu_import_jobs_business_request_idx").on(t.businessId, t.requestKey), index("menu_import_jobs_business_created_idx").on(t.businessId, t.createdAt)]);

export const platformEvents = pgTable("platform_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  eventName: text("event_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("platform_events_event_id_idx").on(t.eventId),
  index("platform_events_created_idx").on(t.createdAt),
]);

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
    referralCode: text("referral_code").notNull().default(sql`upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10))`),
    referredByCustomerId: integer("referred_by_customer_id").references((): AnyPgColumn => customers.id, { onDelete: "set null" }),
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    smsOptIn: boolean("sms_opt_in").notNull().default(true),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    totalSpent: integer("total_spent").notNull().default(0),
    ordersCount: integer("orders_count").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("customers_biz_phone_idx").on(t.businessId, t.phone),
    uniqueIndex("customers_business_referral_code_idx").on(t.businessId, t.referralCode),
    index("customers_business_referrer_idx").on(t.businessId, t.referredByCustomerId).where(sql`${t.referredByCustomerId} IS NOT NULL`),
  ],
);

/** Debtor accounts are tenant-scoped and may optionally link to a verified customer record. */
export const receivableAccounts = pgTable("receivable_accounts", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  type: text("type").notNull().default("person"), // person | company
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  phone: text("phone").notNull().default(""),
  note: text("note").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

/** Receivables hold the invoice face value; the balance is derived from immutable receipts/reversals. */
export const receivables = pgTable("receivables", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  accountId: integer("account_id").notNull().references(() => receivableAccounts.id, { onDelete: "restrict" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "restrict" }),
  source: text("source").notNull().default("manual"), // manual | order
  amount: bigint("amount", { mode: "number" }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  description: text("description").notNull().default(""),
  accountingDocumentId: integer("accounting_document_id"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const receivablePayments = pgTable("receivable_payments", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  receivableId: integer("receivable_id").notNull().references(() => receivables.id, { onDelete: "restrict" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  method: text("method").notNull(), // cash | bank | pos | transfer
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  shiftId: integer("shift_id").references(() => cashShifts.id, { onDelete: "set null" }),
  accountingDocumentId: integer("accounting_document_id"),
  transactionId: integer("transaction_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const receivablePaymentReversals = pgTable("receivable_payment_reversals", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  paymentId: integer("payment_id").notNull().references(() => receivablePayments.id, { onDelete: "restrict" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  method: text("method").notNull(),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  shiftId: integer("shift_id").references(() => cashShifts.id, { onDelete: "set null" }),
  accountingDocumentId: integer("accounting_document_id"),
  transactionId: integer("transaction_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  reason: text("reason").notNull(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const receivableEvents = pgTable("receivable_events", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  receivableId: integer("receivable_id").notNull().references(() => receivables.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(), // created | payment | payment_reversed
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  note: text("note").notNull().default(""),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const walletEntries = pgTable("wallet_entries", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  kind: text("kind").notNull(), // earn | spend | refund | adjust
  amount: integer("amount").notNull(),
  idempotencyKey: text("idempotency_key").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: created(),
}, (t) => [uniqueIndex("wallet_entries_biz_idempotency_idx").on(t.businessId, t.idempotencyKey).where(sql`${t.idempotencyKey} <> ''`)]);

export const productReviews = pgTable("product_reviews", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  moderatedBy: integer("moderated_by").references(() => users.id, { onDelete: "set null" }),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  awardedPoints: integer("awarded_points").notNull().default(0),
  createdAt: created(),
}, (t) => [
  uniqueIndex("product_reviews_business_product_customer_uq").on(t.businessId, t.productId, t.customerId),
  index("product_reviews_business_status_created_idx").on(t.businessId, t.status, t.createdAt),
  index("product_reviews_product_status_created_idx").on(t.businessId, t.productId, t.status, t.createdAt),
]);

export const customerFeedback = pgTable("customer_feedback", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // suggestion | complaint
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | in_progress | resolved
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customer_feedback_business_status_created_idx").on(t.businessId, t.status, t.createdAt),
  index("customer_feedback_customer_created_idx").on(t.businessId, t.customerId, t.createdAt),
]);

export const customerPointEntries = pgTable("customer_point_entries", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  reviewId: integer("review_id").references(() => productReviews.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // opening | purchase | referral | review | redeem | adjustment
  amount: integer("amount").notNull(), // signed points
  idempotencyKey: text("idempotency_key").notNull(),
  note: text("note").notNull().default(""),
  createdAt: created(),
}, (t) => [
  uniqueIndex("customer_point_entries_business_idempotency_uq").on(t.businessId, t.idempotencyKey),
  index("customer_point_entries_customer_created_idx").on(t.businessId, t.customerId, t.createdAt),
]);

export const customerRewardCampaigns = pgTable("customer_reward_campaigns", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  token: text("token").notNull(),
  rewardType: text("reward_type").notNull(), // discount_percent | free_item
  discountPercent: integer("discount_percent").notNull().default(0),
  productId: integer("product_id"), // verified against this business on create, claim and order
  productName: text("product_name").notNull().default(""),
  expiresAfterDays: integer("expires_after_days").notNull().default(7),
  maxClaims: integer("max_claims").notNull().default(0), // 0 means unlimited
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
}, (t) => [
  uniqueIndex("customer_reward_campaigns_business_token_uq").on(t.businessId, t.token),
  index("customer_reward_campaigns_business_created_idx").on(t.businessId, t.createdAt),
]);

export const customerRewardClaims = pgTable("customer_reward_claims", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  campaignId: integer("campaign_id").notNull().references(() => customerRewardCampaigns.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  rewardType: text("reward_type").notNull(), // snapshot: discount_percent | free_item
  discountPercent: integer("discount_percent").notNull().default(0),
  productId: integer("product_id"), // reward snapshot; missing products are rejected at claim/order time
  productName: text("product_name").notNull().default(""),
  campaignName: text("campaign_name").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"), // active | redeemed | expired
  consumedOrderId: integer("consumed_order_id").references(() => orders.id, { onDelete: "set null" }),
  createdAt: created(),
}, (t) => [
  uniqueIndex("customer_reward_claims_campaign_customer_uq").on(t.businessId, t.campaignId, t.customerId),
  uniqueIndex("customer_reward_claims_one_active_customer_uq").on(t.businessId, t.customerId).where(sql`${t.status} = 'active'`),
  index("customer_reward_claims_customer_status_idx").on(t.businessId, t.customerId, t.status, t.expiresAt),
]);

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

export const loyaltyWheelSettings = pgTable("loyalty_wheel_settings", {
  businessId: integer("business_id").primaryKey().references(() => businesses.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").notNull().default(false),
  cooldownHours: integer("cooldown_hours").notNull().default(24),
  rewardExpiresAfterDays: integer("reward_expires_after_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyWheelPrizes = pgTable("loyalty_wheel_prizes", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  prizeType: text("prize_type").notNull(), // fixed_amount | discount_code | free_items | no_prize | message
  amount: integer("amount").notNull().default(0),
  discountCodeId: integer("discount_code_id").references(() => discountCodes.id, { onDelete: "restrict" }),
  productIds: jsonb("product_ids").$type<number[]>().notNull().default([]),
  message: text("message").notNull().default(""),
  weight: integer("weight").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("loyalty_wheel_prizes_business_idx").on(t.businessId, t.isActive, t.id),
]);

export type LoyaltyWheelRewardSnapshot = {
  amount?: number;
  discountCodeId?: number;
  discountCode?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  minOrder?: number;
  products?: { id: number; name: string; price: number }[];
  message?: string;
};

export const loyaltyWheelSpins = pgTable("loyalty_wheel_spins", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  prizeId: integer("prize_id").references(() => loyaltyWheelPrizes.id, { onDelete: "set null" }),
  requestKey: text("request_key").notNull(),
  prizeType: text("prize_type").notNull(),
  prizeTitle: text("prize_title").notNull(),
  rewardSnapshot: jsonb("reward_snapshot").$type<LoyaltyWheelRewardSnapshot>().notNull().default({}),
  status: text("status").notNull().default("active"), // active | redeemed | expired | no_prize | message
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  consumedOrderId: integer("consumed_order_id").references(() => orders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("loyalty_wheel_spins_request_uq").on(t.businessId, t.customerId, t.requestKey),
  uniqueIndex("loyalty_wheel_spins_one_active_customer_uq").on(t.businessId, t.customerId).where(sql`${t.status} = 'active'`),
  index("loyalty_wheel_spins_customer_time_idx").on(t.businessId, t.customerId, t.createdAt),
]);

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

export const inventoryCategories = pgTable("inventory_categories", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("inventory_categories_business_name_uq").on(t.businessId, sql`lower(${t.name})`)]);

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => inventoryCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sku: text("sku"),
  unit: text("unit").notNull().default("عدد"),
  recipeUnit: text("recipe_unit").notNull().default("عدد"),
  recipeToStockFactor: doublePrecision("recipe_to_stock_factor").notNull().default(1),
  stock: doublePrecision("stock").notNull().default(0),
  minStock: doublePrecision("min_stock").notNull().default(0),
  reorderPoint: doublePrecision("reorder_point").notNull().default(0),
  trackStock: boolean("track_stock").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  expiryDate: date("expiry_date", { mode: "string" }),
  costPerUnit: integer("cost_per_unit").notNull().default(0),
  lastPurchaseCost: integer("last_purchase_cost").notNull().default(0),
  createdAt: created(),
}, (t) => [uniqueIndex("inventory_items_business_sku_uq").on(t.businessId, sql`lower(${t.sku})`).where(sql`${t.sku} IS NOT NULL AND ${t.sku} <> ''`)]);

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
  shippingCost: bigint("shipping_cost", { mode: "number" }).notNull().default(0),
  taxAmount: bigint("tax_amount", { mode: "number" }).notNull().default(0),
  total: bigint("total", { mode: "number" }).notNull().default(0),
  paidAmount: bigint("paid_amount", { mode: "number" }).notNull().default(0),
  payFrom: text("pay_from").notNull().default("cash"),
  documentId: integer("document_id"),
  wasteReason: text("waste_reason").notNull().default(""),
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

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  requestKey: text("request_key").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => users.id),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [uniqueIndex("stock_transfers_request_idx").on(t.businessId, t.requestKey), index("stock_transfers_business_status_idx").on(t.businessId, t.status, t.createdAt)]);

export const stockTransferLines = pgTable("stock_transfer_lines", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  sourceItemId: integer("source_item_id").notNull().references(() => inventoryItems.id),
  destinationItemId: integer("destination_item_id").notNull().references(() => inventoryItems.id),
  quantity: doublePrecision("quantity").notNull(),
  unitCost: integer("unit_cost").notNull().default(0),
});

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
    wastePercent: doublePrecision("waste_percent").notNull().default(0),
  },
  (t) => [uniqueIndex("recipes_uq").on(t.productId, t.itemId)],
);

export const productPriceAudits = pgTable("product_price_audits", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  previousPrice: integer("previous_price").notNull(),
  newPrice: integer("new_price").notNull(),
  unitCost: bigint("unit_cost", { mode: "number" }).notNull(),
  targetType: text("target_type").notNull(), // food_cost | gross_margin
  targetPercent: integer("target_percent").notNull(),
  yieldRatio: doublePrecision("yield_ratio").notNull(),
  sourceSnapshotHash: text("source_snapshot_hash").notNull(),
  costSnapshot: jsonb("cost_snapshot").$type<{ itemId: number; name: string; quantity: number; unit: string; costPerUnit: number; extendedCost: number }[]>().notNull(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
}, (t) => [index("product_price_audits_business_product_time_idx").on(t.businessId, t.productId, t.createdAt)]);

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  name: text("name").notNull(),
  bank: text("bank").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  openingBalance: integer("opening_balance").notNull().default(0),
  createdAt: created(),
});

export const cashShifts = pgTable("cash_shifts", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  openedBy: integer("opened_by").notNull().references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openingCash: integer("opening_cash").notNull().default(0),
  closedBy: integer("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closingCash: integer("closing_cash"),
  expectedCash: integer("expected_cash"),
  cashDifference: integer("cash_difference"),
  note: text("note").notNull().default(""),
}, (t) => [
  index("cash_shifts_business_opened_idx").on(t.businessId, t.openedAt),
  uniqueIndex("cash_shifts_business_open_idx").on(t.businessId).where(sql`${t.closedAt} IS NULL`),
]);

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
    accountMoeinId: integer("account_moein_id"),
    accountTafsiliId: integer("account_tafsili_id"),
    orderId: integer("order_id"),
    shiftId: integer("shift_id").references(() => cashShifts.id, { onDelete: "set null" }),
    settlementMethod: text("settlement_method"),
    posDeviceId: integer("pos_device_id").references(() => devices.id, { onDelete: "set null" }),
    sourceRef: text("source_ref"),
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

export const courierLocations = pgTable("courier_locations", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  courierId: integer("courier_id").notNull().references(() => couriers.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracyMeters: doublePrecision("accuracy_meters").notNull(),
  updatedAt: created(),
}, (t) => [uniqueIndex("courier_locations_business_courier_idx").on(t.businessId, t.courierId), index("courier_locations_updated_idx").on(t.businessId, t.updatedAt)]);

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
  terminalNumber: text("terminal_number").notNull().default(""),
  settlementBankAccountId: integer("settlement_bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  cashierEnabled: boolean("cashier_enabled").notNull().default(false),
  kioskEnabled: boolean("kiosk_enabled").notNull().default(false),
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

export const waiterServiceRequests = pgTable("waiter_service_requests", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  tableId: integer("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("call"), // call | message
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("open"), // open | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("waiter_service_requests_business_status_idx").on(t.businessId, t.status, t.createdAt),
  index("waiter_service_requests_table_time_idx").on(t.tableId, t.createdAt),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("push_subscriptions_business_user_idx").on(t.businessId, t.userId),
]);

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
  settlementError: text("settlement_error").notNull().default(""),
  settlementAttempts: integer("settlement_attempts").notNull().default(0),
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
    source: text("source").notNull().default("manual"), // manual | order | inventory | expense | reversal | system | cheque
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

/** Re-engagement campaign rules reuse SMS templates/provider configuration. */
export const smsRetentionRules = pgTable("sms_retention_rules", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  title: text("title").notNull(),
  triggerType: text("trigger_type").notNull(), // inactive_days | segment_enter | segment_exit
  inactiveDays: integer("inactive_days"),
  segmentKey: text("segment_key"),
  templateId: integer("template_id").notNull().references(() => smsTemplates.id, { onDelete: "restrict" }),
  cooldownDays: integer("cooldown_days").notNull().default(30),
  maxMarketingSms30Days: integer("max_marketing_sms_30_days").notNull().default(4),
  sendHourTehran: integer("send_hour_tehran").notNull().default(10),
  attributionDays: integer("attribution_days").notNull().default(7),
  discountCode: text("discount_code").notNull().default(""),
  discountLabel: text("discount_label").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  scanCursorCustomerId: integer("scan_cursor_customer_id").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: created(),
}, (t) => [index("sms_retention_rules_business_active_idx").on(t.businessId, t.isActive, t.id)]);

/** Last observed segment for transition triggers; contains no phone or message content. */
export const smsRetentionMembers = pgTable("sms_retention_members", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  ruleId: integer("rule_id").notNull().references(() => smsRetentionRules.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  currentSegment: text("current_segment").notNull(),
  updatedAt: created(),
}, (t) => [
  uniqueIndex("sms_retention_members_rule_customer_idx").on(t.businessId, t.ruleId, t.customerId),
  index("sms_retention_members_customer_idx").on(t.businessId, t.customerId),
]);

/** Durable queue and status history for one rule/customer/trigger event. */
export const smsRetentionDeliveries = pgTable("sms_retention_deliveries", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  ruleId: integer("rule_id").notNull().references(() => smsRetentionRules.id, { onDelete: "restrict" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  triggerKey: text("trigger_key").notNull(),
  triggerType: text("trigger_type").notNull(),
  anchorOrderAt: timestamp("anchor_order_at", { withTimezone: true }),
  expectedSegment: text("expected_segment"),
  status: text("status").notNull().default("queued"), // queued | sending | sent | skipped | failed | uncertain
  attempts: integer("attempts").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  detail: text("detail").notNull().default(""),
  createdAt: created(),
}, (t) => [
  uniqueIndex("sms_retention_delivery_trigger_idx").on(t.businessId, t.ruleId, t.customerId, t.triggerKey),
  index("sms_retention_delivery_due_idx").on(t.businessId, t.status, t.scheduledAt),
  index("sms_retention_delivery_customer_sent_idx").on(t.businessId, t.customerId, t.sentAt),
]);

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
    settlementPlan: jsonb("settlement_plan").$type<SettlementPlan | null>(),
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
    businessId: integer("business_id").references(() => businesses.id, { onDelete: "cascade" }),
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
    couponCode: text("coupon_code").notNull().default(""),
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

export const promoCoupons = pgTable("promo_coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull().default("percent"), // percent | fixed
  value: bigint("value", { mode: "number" }).notNull(),
  planKeys: jsonb("plan_keys").$type<string[]>().notNull().default([]), // empty = all plans
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  maxRedemptions: integer("max_redemptions"),
  redemptions: integer("redemptions").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: created(),
}, (t) => [index("promo_coupons_active_idx").on(t.isActive)]);

export const subscriptionPayments = pgTable("subscription_payments", {
  id: text("id").primaryKey(), // opaque callback identifier
  invoiceId: integer("invoice_id").notNull().references(() => subscriptionInvoices.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // zarinpal | zibal
  amount: bigint("amount", { mode: "number" }).notNull(), // Toman
  token: text("token").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  refNo: text("ref_no").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: created(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => [index("subscription_payments_invoice_idx").on(t.invoiceId), index("subscription_payments_token_idx").on(t.provider, t.token), uniqueIndex("subscription_payments_one_pending_idx").on(t.invoiceId).where(sql`${t.status} = 'pending'`)]);

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => promoCoupons.id),
  invoiceId: integer("invoice_id").notNull().unique().references(() => subscriptionInvoices.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  discount: bigint("discount", { mode: "number" }).notNull(),
  status: text("status").notNull().default("reserved"), // reserved | redeemed | released
  createdAt: created(),
});

export const otpChallenges = pgTable("otp_challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose").notNull().default("login"),
  name: text("name").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("otp_challenges_phone_idx").on(t.phone, t.createdAt)]);

export const platformSmsCampaigns = pgTable("platform_sms_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  occasion: text("occasion").notNull().default("campaign"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"), // scheduled | sending | sent | failed
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdBy: text("created_by").notNull().default(""),
  createdAt: created(),
});

export const platformSmsLogs = pgTable("platform_sms_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businesses.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  kind: text("kind").notNull(),
  periodKey: text("period_key").notNull().default(""),
  provider: text("provider").notNull().default(""),
  status: text("status").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: created(),
}, (t) => [index("platform_sms_logs_created_idx").on(t.createdAt), uniqueIndex("platform_sms_logs_dedupe_idx").on(t.businessId, t.kind, t.periodKey).where(sql`${t.businessId} is not null`)]);

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

export const trialGrants = pgTable("trial_grants", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().unique().references(() => businesses.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  featureSetVersion: text("feature_set_version").notNull(),
  featureSnapshot: jsonb("feature_snapshot").notNull(),
  status: text("status").notNull().default("active"), // active | expired | converted | revoked
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("trial_grants_status_end_idx").on(t.status, t.endsAt)]);

export const chequeBeneficiaries = pgTable("cheque_beneficiaries", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  fullName: text("full_name").notNull(),
  nationalId: text("national_id").notNull().default(""),
  phone: text("phone").notNull().default(""),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cheque_beneficiaries_business_name_idx").on(t.businessId, t.fullName),
  uniqueIndex("cheque_beneficiaries_business_national_id_idx").on(t.businessId, t.nationalId).where(sql`${t.nationalId} <> ''`),
]);

export const cheques = pgTable("cheques", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  beneficiaryId: integer("beneficiary_id").references(() => chequeBeneficiaries.id, { onDelete: "set null" }),
  direction: text("direction").notNull(), // payable | receivable
  status: text("status").notNull(), // registered | passed | bounced | returned | assigned | voided
  partnerName: text("partner_name").notNull().default(""),
  amount: bigint("amount", { mode: "number" }).notNull(),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  chequeNumber: text("cheque_number").notNull().default(""),
  serialNumber: text("serial_number").notNull().default(""),
  bank: text("bank").notNull().default(""),
  branch: text("branch").notNull().default(""),
  expensePurpose: text("expense_purpose").notNull().default(""),
  sayadIdentifier: text("sayad_identifier").notNull().default(""),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => users.id),
  accountingAccountId: integer("accounting_account_id").references(() => accAccounts.id),
  accountingDocumentId: integer("accounting_document_id").references(() => accDocuments.id),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cheques_business_due_idx").on(t.businessId, t.dueDate),
  index("cheques_business_status_idx").on(t.businessId, t.status),
  uniqueIndex("cheques_business_serial_number_idx").on(t.businessId, t.serialNumber, t.chequeNumber).where(sql`${t.serialNumber} <> '' AND ${t.chequeNumber} <> ''`),
]);

export const chequeReminders = pgTable("cheque_reminders", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  chequeId: integer("cheque_id").notNull().references(() => cheques.id, { onDelete: "cascade" }),
  reminderDate: date("reminder_date").notNull(),
  leadDays: integer("lead_days").notNull(),
  status: text("status").notNull().default("processing"), // processing | sent | failed
  phone: text("phone").notNull().default(""),
  provider: text("provider").notNull().default(""),
  detail: text("detail").notNull().default(""),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("cheque_reminders_once_idx").on(t.businessId, t.chequeId, t.reminderDate),
  index("cheque_reminders_status_idx").on(t.businessId, t.status, t.reminderDate),
]);

export const chequeEvents = pgTable("cheque_events", {
  id: serial("id").primaryKey(),
  businessId: bizId(),
  chequeId: integer("cheque_id").notNull().references(() => cheques.id, { onDelete: "cascade" }),
  requestKey: text("request_key").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text("note").notNull().default(""),
  actorId: integer("actor_id").notNull().references(() => users.id),
  accountingAccountId: integer("accounting_account_id").references(() => accAccounts.id),
  reversalDocumentId: integer("reversal_document_id").references(() => accDocuments.id),
  accountingDocumentId: integer("accounting_document_id").references(() => accDocuments.id),
  createdAt: created(),
}, (t) => [uniqueIndex("cheque_events_request_idx").on(t.businessId, t.requestKey), index("cheque_events_cheque_time_idx").on(t.chequeId, t.createdAt)]);

/* ---------------- platform marketing content ---------------- */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content").notNull().default(""),
  category: text("category").notNull().default("عمومی"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  coverImage: text("cover_image").notNull().default(""),
  author: text("author").notNull().default("تیم منوی دیجیتال"),
  status: text("status").notNull().default("draft"), // draft | published
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  noIndex: boolean("no_index").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("blog_posts_status_published_idx").on(t.status, t.publishedAt)]);

export const tutorials = pgTable("tutorials", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull().default(""),
  category: text("category").notNull().default("راهنمای شروع"),
  coverImage: text("cover_image").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  status: text("status").notNull().default("draft"),
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  noIndex: boolean("no_index").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tutorials_status_order_idx").on(t.status, t.sortOrder)]);

export const faqs = pgTable("faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("عمومی"),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  body: text("body").notNull(),
  rating: integer("rating").notNull().default(5),
  imageUrl: text("image_url").notNull().default(""),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadRequests = pgTable("lead_requests", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // contact | consultation | demo
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  subject: text("subject").notNull().default(""),
  message: text("message").notNull().default(""),
  preferredAt: timestamp("preferred_at", { withTimezone: true }),
  status: text("status").notNull().default("new"), // new | contacted | qualified | closed
  assignedTo: integer("assigned_to"),
  source: text("source").notNull().default("website"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("lead_requests_status_created_idx").on(t.status, t.createdAt)]);

/* ---------------- affiliate sales, wallet and platform accounting ---------------- */
export const affiliateCommissions = pgTable("affiliate_commissions", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliates.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  invoiceId: integer("invoice_id").notNull().references(() => subscriptionInvoices.id),
  saleAmount: bigint("sale_amount", { mode: "number" }).notNull(),
  commissionPercent: integer("commission_percent").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("affiliate_commissions_invoice_idx").on(t.invoiceId), index("affiliate_commissions_affiliate_idx").on(t.affiliateId, t.createdAt)]);

export const affiliateWalletEntries = pgTable("affiliate_wallet_entries", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // commission | withdrawal_hold | withdrawal_release
  amount: bigint("amount", { mode: "number" }).notNull(), // signed, in toman
  referenceType: text("reference_type").notNull(),
  referenceId: integer("reference_id").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("affiliate_wallet_ref_idx").on(t.affiliateId, t.kind, t.referenceType, t.referenceId), index("affiliate_wallet_date_idx").on(t.affiliateId, t.createdAt)]);

export const affiliateWithdrawals = pgTable("affiliate_withdrawals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliates.id),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | rejected
  bankName: text("bank_name").notNull().default(""),
  accountHolder: text("account_holder").notNull().default(""),
  cardNumber: text("card_number").notNull().default(""),
  sheba: text("sheba").notNull().default(""),
  payoutReference: text("payout_reference").notNull().default(""),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => [index("affiliate_withdrawals_affiliate_idx").on(t.affiliateId, t.createdAt), index("affiliate_withdrawals_status_idx").on(t.status, t.createdAt)]);

export const platformAccountingDocuments = pgTable("platform_accounting_documents", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // affiliate_commission | affiliate_payout
  sourceId: integer("source_id").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  description: text("description").notNull(),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdBy: text("created_by").notNull().default("سیستم"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("platform_accounting_source_idx").on(t.sourceType, t.sourceId), index("platform_accounting_date_idx").on(t.date)]);

export const reservations = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    tableId: integer("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    guestCount: integer("guest_count").notNull(),
    reservationType: text("reservation_type").notNull().default("normal"),
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
