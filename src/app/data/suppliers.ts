import type { Supplier } from "../types";

export const SUPPLIERS: Supplier[] = [
  { id: 1, name: "Bosch Philippines", categories: "Engine, Brakes, Electrical", phone: "+63 2 8818 8000", email: "sales@bosch.ph", leadTimeDays: 14, rating: 4.8, activePOs: 3, status: "Active" },
  { id: 2, name: "Denso Philippines", categories: "Electrical, Filters", phone: "+63 2 8830 0000", email: "orders@denso.com.ph", leadTimeDays: 10, rating: 4.7, activePOs: 2, status: "Active" },
  { id: 3, name: "Motolite Distribution", categories: "Batteries, Electrical", phone: "+63 2 8857 8888", email: "trade@motolite.com.ph", leadTimeDays: 7, rating: 4.5, activePOs: 1, status: "Active" },
  { id: 4, name: "Gates Philippines", categories: "Engine, Drivetrain", phone: "+63 2 8889 9000", email: "ph@gates.com", leadTimeDays: 18, rating: 4.3, activePOs: 1, status: "Active" },
  { id: 5, name: "NGK Spark Plugs PH", categories: "Electrical, Ignition", phone: "+63 2 8892 3456", email: "sales@ngk.com.ph", leadTimeDays: 12, rating: 4.6, activePOs: 1, status: "Active" },
  { id: 6, name: "KYB Philippines", categories: "Suspension", phone: "+63 2 8877 1234", email: "inquiries@kyb.com.ph", leadTimeDays: 21, rating: 4.4, activePOs: 1, status: "Active" },
  { id: 7, name: "Brembo Auth. Dealer", categories: "Brakes", phone: "+63 2 8901 5678", email: "brembo@autoph.com", leadTimeDays: 25, rating: 4.9, activePOs: 1, status: "Active" },
  { id: 8, name: "Mann-Filter PH", categories: "Filters", phone: "+63 2 8856 7890", email: "ph@mann-filter.com", leadTimeDays: 15, rating: 4.2, activePOs: 1, status: "Active" },
  { id: 9, name: "Exedy Clutch PH", categories: "Drivetrain", phone: "+63 2 8845 2211", email: "sales@exedy.com.ph", leadTimeDays: 20, rating: 4.1, activePOs: 0, status: "Inactive" },
];

export const AVG_LEAD_TIME =
  SUPPLIERS.reduce((sum, s) => sum + s.leadTimeDays, 0) / SUPPLIERS.length;

export const AVG_RATING = SUPPLIERS.reduce((sum, s) => sum + s.rating, 0) / SUPPLIERS.length;
