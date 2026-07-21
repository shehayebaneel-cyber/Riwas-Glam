export interface StaffLite {
  id: number;
  name: string;
  role: string;
}
export interface Service {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  staff?: StaffLite[];
}
export interface AddOn {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  durationMin: number;
  isActive: boolean;
  sortOrder: number;
}
export interface Category {
  id: number;
  name: string;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
  services: Service[];
  addOns: AddOn[];
}
export interface Staff {
  id: number;
  name: string;
  role: string;
  bio?: string;
  avatar: string | null;
}

export interface DaySchedule {
  off: boolean;
  open: string;
  close: string;
  breakStart: string;
  breakEnd: string;
}
export interface StaffFull {
  id: number;
  name: string;
  role: string;
  avatar: string | null;
  isActive: boolean;
  commissionPct: number;
  schedule: DaySchedule[];
  blockedDates: string[];
  serviceIds: number[];
  loginEmail?: string | null;
  hasLogin?: boolean;
  accessRole?: string;
  permissions?: string[];
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
}
export interface Review {
  id: number;
  authorName: string;
  rating: number;
  comment: string;
  featured?: boolean;
  status?: string;
  reply?: string;
  createdAt: string;
}
export interface GiftCard {
  id?: number;
  code: string;
  balance: number;
  initialValue?: number;
  status: string;
  expiresAt: string | null;
  recipientName?: string;
  purchaserName?: string;
  createdAt?: string;
}
export interface FavService {
  id: number;
  name: string;
  price: number;
  durationMin: number;
  categoryId: number;
}

export interface Appointment {
  id: number;
  serviceName: string;
  staffName: string;
  staffId?: number | null;
  date: string;
  time: string;
  durationMin: number;
  actualMinutes?: number;
  price: number;
  commissionPct?: number;
  commissionAmount?: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
  status: string;
  paymentId?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  addOns?: { name: string; price: number }[];
  groupId?: string;
  createdAt: string;
}
