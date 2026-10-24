export type PublicMenuNotificationOrder = {
  number: number;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string | Date;
};

export type PublicMenuNotificationReservation = {
  id: number;
  status: string;
  depositStatus: string;
  startsAt: string | Date;
};

export type PublicMenuNotificationSnapshot = {
  walletBalance: number;
  recentOrders: PublicMenuNotificationOrder[];
  recentReservations: PublicMenuNotificationReservation[];
};

export type PublicMenuNotificationChange =
  | { kind: "wallet"; previous: number; current: number }
  | { kind: "order"; number: number; isNew: boolean; status: string; paymentStatus: string; deliveryStatus: string }
  | { kind: "reservation"; id: number; isNew: boolean; status: string; depositStatus: string; startsAt: string | Date };

/** Returns only changes after the first authenticated profile snapshot. */
export function publicMenuNotificationChanges(
  previous: PublicMenuNotificationSnapshot,
  current: PublicMenuNotificationSnapshot,
): PublicMenuNotificationChange[] {
  const changes: PublicMenuNotificationChange[] = [];
  if (previous.walletBalance !== current.walletBalance)
    changes.push({ kind: "wallet", previous: previous.walletBalance, current: current.walletBalance });

  const oldOrders = new Map(previous.recentOrders.map((order) => [`${order.number}:${new Date(order.createdAt).toISOString()}`, order]));
  for (const order of current.recentOrders) {
    const old = oldOrders.get(`${order.number}:${new Date(order.createdAt).toISOString()}`);
    if (!old || old.status !== order.status || old.paymentStatus !== order.paymentStatus || old.deliveryStatus !== order.deliveryStatus) {
      changes.push({ kind: "order", number: order.number, isNew: !old, status: order.status, paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus });
    }
  }

  const oldReservations = new Map(previous.recentReservations.map((reservation) => [reservation.id, reservation]));
  for (const reservation of current.recentReservations) {
    const old = oldReservations.get(reservation.id);
    if (!old || old.status !== reservation.status || old.depositStatus !== reservation.depositStatus) {
      changes.push({ kind: "reservation", id: reservation.id, isNew: !old, status: reservation.status, depositStatus: reservation.depositStatus, startsAt: reservation.startsAt });
    }
  }
  return changes;
}
