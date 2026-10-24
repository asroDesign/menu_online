export type CustomerFeedbackType = "suggestion" | "complaint";
export type CustomerFeedbackStatus = "open" | "in_progress" | "resolved";

export function customerFeedbackEnabled(settings: unknown) {
  return !!settings && typeof settings === "object"
    && (settings as Record<string, unknown>).customerFeedbackEnabled === true;
}

export function parseCustomerFeedbackInput(input: Record<string, unknown>) {
  const type = input.type;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (type !== "suggestion" && type !== "complaint") return null;
  if (message.length < 10 || message.length > 1500) return null;
  return { type: type as CustomerFeedbackType, message };
}

export function isCustomerFeedbackStatus(value: unknown): value is CustomerFeedbackStatus {
  return value === "open" || value === "in_progress" || value === "resolved";
}
