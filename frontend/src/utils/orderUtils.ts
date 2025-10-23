import { Order } from "@/types/order";

export const calculateDaysInDelay = (orderDate: string, status: string): number => {
  if (status !== "ready_to_pack") return 0;
  
  const today = new Date();
  const order = new Date(orderDate);
  const diffTime = Math.abs(today.getTime() - order.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays - 3);
};

export const isOrderDelayed = (order: Order): boolean => {
  return order.is_delayed || (order.status === "ready_to_pack" && order.days_in_ready_to_pack > 3);
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
