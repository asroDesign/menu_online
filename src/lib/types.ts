export type Category = {
  id: number;
  name: string;
  emoji: string;
  sortOrder: number;
  isActive: boolean;
};

export type Product = {
  id: number;
  categoryId: number | null;
  name: string;
  description: string;
  price: number;
  oldPrice: number | null;
  emoji: string;
  imageUrl: string;
  prepMinutes: number;
  isAvailable: boolean;
  isFeatured: boolean;
  arModelUrl: string;
  createdAt: string;
};

export type DiningTable = {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  openOrder: { id: number; number: number; status: string; total: number } | null;
};

export type StaffMember = {
  id: number;
  name: string;
  role: string;
  phone: string;
  isActive: boolean;
};

export type OrderItem = {
  id: number;
  productId: number | null;
  name: string;
  emoji: string;
  price: number;
  quantity: number;
  note: string;
};

export type Order = {
  id: number;
  number: number;
  tableId: number | null;
  tableName: string | null;
  waiterId: number | null;
  waiterName: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  courierId: number | null;
  courierName: string | null;
  deliveryStatus: string;
  courierNote: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveryFinishedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deliveryFee: number;
  discountAmount: number;
  discountCode: string;
  cashbackUsed: number;
  scheduledFor: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  lat: number | null;
  lng: number | null;
  cogs: number;
  source: string;
  type: string;
  status: string;
  note: string;
  subtotal: number;
  tax: number;
  service: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};
