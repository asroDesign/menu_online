// Client-safe metadata for the platform administration panel.
export const ADMIN_DEPTS: Record<string, { label: string; emoji: string }> = {
  super: { label: "مدیر کل", emoji: "" },
  support: { label: "پشتیبانی", emoji: "" },
  tech: { label: "فنی", emoji: "" },
  finance: { label: "مالی", emoji: "" },
  sales: { label: "فروش", emoji: "" },
};

/** departments tickets can be routed to */
export const TICKET_DEPTS: Record<string, { label: string; emoji: string }> = {
  support: { label: "پشتیبانی عمومی", emoji: "" },
  tech: { label: "فنی", emoji: "" },
  finance: { label: "مالی و حسابداری", emoji: "" },
  sales: { label: "فروش و قرارداد", emoji: "" },
  management: { label: "مدیریت", emoji: "" },
};
/** admin team department → ticket departments it is responsible for */
export const DEPT_TICKETS: Record<string, string[]> = {
  super: Object.keys(TICKET_DEPTS), support: ["support"], tech: ["tech"], finance: ["finance"], sales: ["sales"],
};

export type AdminPerm = "overview" | "businesses" | "businesses_write" | "impersonate" | "plans" | "accounting" | "tickets" | "users" | "announcements" | "settings" | "audit" | "content" | "affiliates";
export const ALL_PERMS: AdminPerm[] = ["overview", "businesses", "businesses_write", "impersonate", "plans", "accounting", "tickets", "users", "announcements", "settings", "audit", "content", "affiliates"];
export const ADMIN_PERMS: Record<string, AdminPerm[]> = {
  super: ALL_PERMS,
  support: ["overview", "businesses", "impersonate", "tickets", "announcements", "content"],
  tech: ["overview", "businesses", "impersonate", "tickets"],
  finance: ["overview", "businesses", "accounting", "tickets", "affiliates"],
  sales: ["overview", "businesses", "businesses_write", "plans", "accounting", "tickets", "content", "affiliates"],
};
export const permsOf = (dept: string | null | undefined) => ADMIN_PERMS[dept ?? "super"] ?? [];

export const TICKET_STATUS: Record<string, [string, string]> = { open: ["باز", "amber"], answered: ["پاسخ داده شد", "emerald"], closed: ["بسته", "stone"] };
export const PRIORITY: Record<string, [string, string]> = { low: ["کم", "stone"], normal: ["عادی", "blue"], high: ["بالا", "rose"] };

export const DELIVERY_STATUS: Record<string, [string, string]> = {
  none: ["بدون پیک", "stone"],
  assigned: ["تخصیص به پیک", "blue"],
  picked_up: ["در مسیر", "amber"],
  delivered: ["تحویل داده شد", "emerald"],
  not_home: ["عدم حضور مشتری", "rose"],
  failed: ["عدم تحویل", "rose"],
};
