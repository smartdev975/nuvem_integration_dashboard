const fetch = require('node-fetch');

class NuvemshopService {
  constructor() {
    this.baseUrl = `https://api.nuvemshop.com.br/v1/${process.env.STORE_ID}`;
    this.accessToken = process.env.NUVEMSHOP_TOKEN;
    this.cache = new Map();
    this.cacheExpiry = new Map();
  }

  /**
   * Get headers for Nuvemshop API requests
   */
  getHeaders() {
    return {
      'Authentication': `bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry) return false;
    return Date.now() < expiry;
  }

  /**
   * Set cache with expiry time
   */
  setCache(key, data, durationMinutes = 15) {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + (durationMinutes * 60 * 1000));
  }

  /**
   * Get cached data if valid
   */
  getCache(key) {
    if (this.isCacheValid(key)) {
      return this.cache.get(key);
    }
    return null;
  }

  /**
   * Fetch orders from Nuvemshop API (currently using mock data)
   */
  async fetchOrders(status = null) {
    const cacheKey = `orders_${status || 'all'}`;
    
    try {
      const cachedData = this.getCache(cacheKey);
      
      if (cachedData) {
        console.log(`Returning cached orders for status: ${status || 'all'}`);
        return cachedData;
      }

      // Use real Nuvemshop API
      const url = `${this.baseUrl}/orders`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      // if (!response.ok) {
      //   if (response.status === 404) {
      //     console.warn(`Nuvemshop API returned 404 for store ${process.env.STORE_ID}. This might indicate:`);
      //     console.warn('- Invalid Store ID');
      //     console.warn('- Missing or invalid Nuvemshop Token');
      //     console.warn('- Store is inactive or doesn\'t exist');
      //     console.warn('- API endpoint structure has changed');
      //   }
      //   throw new Error(`Nuvemshop API error: ${response.status} ${response.statusText}`);
      // }

      const orders = await response.json();
      // Process orders to add computed fields
      const processedOrders = orders.map(order => {
        const processed = this.processOrder(order);
        return processed;
      });
      // Filter by status if specified (since Nuvemshop API doesn't support status filtering)
      let filteredOrders = processedOrders;
      if (status) {
        filteredOrders = processedOrders.filter(order => order.status === status);
        console.log(`Filtered ${filteredOrders.length} orders with status: ${status}`);
        console.log('Available statuses in processed orders:', [...new Set(processedOrders.map(o => o.status))]);
      }
      
      // Cache the results
      this.setCache(cacheKey, filteredOrders);
      
      return filteredOrders;

    } catch (error) {
      console.error('Error fetching orders from Nuvemshop:', error.message);
      
      // Return empty array when API fails (no mock data fallback)
      console.warn('API failed, returning empty orders array');
      const emptyOrders = [];
      
      // Cache empty result for shorter duration
      this.setCache(cacheKey, emptyOrders, 5); // 5 minutes cache for empty result
      return emptyOrders;
    }
  }

  /**
   * Fetch a single order by ID (currently using mock data)
   */
  async fetchOrderById(orderId) {
    const cacheKey = `order_${orderId}`;
    
    try {
      const cachedData = this.getCache(cacheKey);
      
      if (cachedData) {
        console.log(`Returning cached order: ${orderId}`);
        return cachedData;
      }

      // Use real Nuvemshop API
      console.log(`Fetching order ${orderId} from Nuvemshop API...`);
      const url = `${this.baseUrl}/orders/${orderId}`;
      console.log(`Fetching order ${orderId} from Nuvemshop API: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Order ${orderId} not found`);
        }
        throw new Error(`Nuvemshop API error: ${response.status} ${response.statusText}`);
      }

      const order = await response.json();
      const processedOrder = this.processOrder(order);
      
      // Cache the result
      this.setCache(cacheKey, processedOrder);
      
      console.log(`Successfully fetched order: ${orderId} from Nuvemshop API`);
      return processedOrder;

    } catch (error) {
      console.error(`Error fetching order ${orderId}:`, error.message);
      
      // Return null when order not found or API fails
      console.warn(`Order ${orderId} not found or API failed`);
      return null;
    }
  }

  /**
   * Process order data to add computed fields
   */
  processOrder(order) {
    // Map Nuvemshop API status to our expected status
    const mappedStatus = this.mapOrderStatus(order);
    
    const processedOrder = {
      id: order.id,
      customer_name: this.getCustomerName(order),
      order_date: order.created_at,
      status: mappedStatus,
      days_in_ready_to_pack: 0,
      is_delayed: false,
      // Include all original order data
      ...order
    };

    // Calculate days in ready_to_pack status
    if (mappedStatus === 'ready_to_pack' && order.created_at) {
      const orderDate = new Date(order.created_at);
      const now = new Date();
      const daysDiff = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
      
      processedOrder.days_in_ready_to_pack = daysDiff;
      processedOrder.is_delayed = daysDiff > 3;
    }

    return processedOrder;
  }

  /**
   * Map Nuvemshop API status to our expected status
   */
  mapOrderStatus(order) {
    // Nuvemshop API uses different status fields
    const mainStatus = order.status; // "open", "closed", "cancelled"
    const shippingStatus = order.shipping_status; // "unpacked", "packed", "shipped", "delivered"
    const nextAction = order.next_action; // "waiting_packing", "waiting_shipment", etc.

    // Map to our expected statuses
    if (mainStatus === 'open') {
      if (shippingStatus === 'unpacked' || nextAction === 'waiting_packing') {
        return 'ready_to_pack';
      } else if (shippingStatus === 'packed' || nextAction === 'waiting_shipment') {
        return 'sent';
      } else if (shippingStatus === 'shipped') {
        return 'sent';
      }
    }

    // Default fallback
    return mainStatus;
  }

  /**
   * Extract customer name from order data
   */
  getCustomerName(order) {
    if (order.customer) {
      // Nuvemshop API has customer.name directly
      if (order.customer.name) {
        return order.customer.name;
      }
      // Fallback to first_name and last_name if available
      if (order.customer.first_name && order.customer.last_name) {
        return `${order.customer.first_name} ${order.customer.last_name}`;
      }
      return order.customer.first_name || order.customer.last_name || 'Unknown Customer';
    }
    return 'Unknown Customer';
  }

  /**
   * Clear cache for specific key or all cache
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      console.log(`Cleared cache for key: ${key}`);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
      console.log('Cleared all cache');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      expiryTimes: Array.from(this.cacheExpiry.entries())
    };
  }
}

module.exports = new NuvemshopService();
