import { Order } from "@/types/order";

// Calculate business days between two dates (excluding weekends)
export const calculateBusinessDays = (startDate: Date, endDate: Date): number => {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
};

// Check if an order is overdue based on business days
export const isOrderOverdue = (order: Order): boolean => {
  if (order.status !== "ready_to_pack") return false;
  
  const orderDate = new Date(order.order_date);
  const today = new Date();
  
  // Calculate business days since order was placed
  const businessDaysSinceOrder = calculateBusinessDays(orderDate, today);
  
  // Order is overdue if more than 2 business days have passed
  return businessDaysSinceOrder > 2;
};

// Calculate how many business days overdue an order is
export const calculateOverdueDays = (order: Order): number => {
  if (order.status !== "ready_to_pack") return 0;
  
  const orderDate = new Date(order.order_date);
  const today = new Date();
  
  const businessDaysSinceOrder = calculateBusinessDays(orderDate, today);
  
  return Math.max(0, businessDaysSinceOrder - 2);
};

export const calculateDaysInDelay = (orderDate: string, status: string): number => {
  if (status !== "ready_to_pack") return 0;
  
  const order = new Date(orderDate);
  const today = new Date();
  const businessDaysSinceOrder = calculateBusinessDays(order, today);
  
  return Math.max(0, businessDaysSinceOrder - 2);
};

export const isOrderDelayed = (order: Order): boolean => {
  return order.is_delayed || isOrderOverdue(order);
};

// Sort orders with overdue orders first, then by attention, then by date
export const sortOrders = (orders: Order[]): Order[] => {
  return [...orders].sort((a, b) => {
    // First priority: Overdue orders
    const aOverdue = isOrderOverdue(a);
    const bOverdue = isOrderOverdue(b);
    
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    
    // Second priority: Attention orders
    if (aOverdue === bOverdue) {
      if (a.attention && !b.attention) return -1;
      if (!a.attention && b.attention) return 1;
    }
    
    // Third priority: Most recent orders first
    const aDate = new Date(a.order_date);
    const bDate = new Date(b.order_date);
    return bDate.getTime() - aDate.getTime();
  });
};

export const filterOrders = (
  orders: Order[],
  searchTerm: string,
  statusFilter: string,
  overdueOnly: boolean
): Order[] => {
  return orders.filter((order) => {
    const matchesSearch =
      String(order.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || order.status === statusFilter;

    const matchesOverdue = !overdueOnly || isOrderDelayed(order);

    return matchesSearch && matchesStatus && matchesOverdue;
  });
};

export const getOrderStats = (orders: Order[]) => {
  const readyToPackOrders = orders.filter((o) => o.status === "ready_to_pack");
  const sentOrders = orders.filter((o) => o.status === "sent");
  const delayedOrders = orders.filter((o) => isOrderDelayed(o));
  const attentionOrders = orders.filter((o) => o.attention);

  return {
    totalReadyToPack: readyToPackOrders.length,
    totalSent: sentOrders.length,
    totalDelayed: delayedOrders.length,
    totalAttention: attentionOrders.length,
    lastUpdated: new Date().toLocaleTimeString(),
  };
};