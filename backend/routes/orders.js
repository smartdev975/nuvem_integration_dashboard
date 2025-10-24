const express = require('express');
const router = express.Router();
const nuvemshopService = require('../services/nuvemshop');
const firestoreService = require('../services/firestore');

// Helper function to calculate business days between two dates
const calculateBusinessDays = (startDate, endDate) => {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0); // Normalize start date to beginning of day
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0); // Normalize end date to beginning of day

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

/**
 * GET /api/orders
 * Returns paginated orders from Nuvemshop with computed fields
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 50;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || 'all';
    const overdueOnly = req.query.overdue_only === 'true';
    const attentionOnly = req.query.attention_only === 'true';
    
    console.log(`Fetching orders - Page: ${page}, Per Page: ${perPage}, Search: "${searchTerm}", Status: ${statusFilter}, Overdue: ${overdueOnly}, Attention: ${attentionOnly}`);
    
    // Fetch paginated orders from Nuvemshop with status filter
    const result = await nuvemshopService.fetchOrders(page, perPage, statusFilter);
    
    // Get notes for all orders to merge with order data
    const ordersWithNotes = await Promise.all(
      result.orders.map(async (order) => {
        try {
          const noteData = await firestoreService.getOrderNote(order.id);
          // console.log(`Order ${order.id} - Note data:`, {
          //   note: noteData.note,
          //   attention: noteData.attention,
          //   success: noteData.success,
          //   exists: noteData.exists
          // });
          return {
            ...order,
            note: noteData.note,
            attention: noteData.attention
          };
        } catch (error) {
          console.warn(`Could not fetch note for order ${order.id}:`, error.message);
          return {
            ...order,
            note: null,
            attention: false
          };
        }
      })
    );

    // Apply client-side filtering and sorting (search, overdue, attention filters)
    let filteredOrders = ordersWithNotes;
    
    // Apply search filter
    if (searchTerm) {
      filteredOrders = filteredOrders.filter(order => 
        String(order.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply overdue filter
    if (overdueOnly) {
      filteredOrders = filteredOrders.filter(order => {
        if (order.status !== "ready_to_pack") return false;
        const orderDate = new Date(order.order_date);
        const today = new Date();
        const businessDaysSinceOrder = calculateBusinessDays(orderDate, today);
        return businessDaysSinceOrder > 2;
      });
    }
    
    // Apply attention filter
    if (attentionOnly) {
      filteredOrders = filteredOrders.filter(order => order.attention);
    }
    
    // Sort orders (overdue first, then attention, then by date)
    filteredOrders.sort((a, b) => {
      // First priority: Overdue orders
      const aOverdue = a.status === "ready_to_pack" && calculateBusinessDays(new Date(a.order_date), new Date()) > 2;
      const bOverdue = b.status === "ready_to_pack" && calculateBusinessDays(new Date(b.order_date), new Date()) > 2;
      
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

    res.json({
      success: true,
      data: filteredOrders,
      count: filteredOrders.length,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: page,
      perPage: perPage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/:id
 * Returns a single order by ID with all available details
 */
router.get('/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    // Fetch order from Nuvemshop
    const order = await nuvemshopService.fetchOrderById(orderId);
    
    // Get note for this order
    const noteData = await firestoreService.getOrderNote(orderId);
    
    const orderWithNote = {
      ...order,
      note: noteData.note,
      attention: noteData.attention
    };

    res.json({
      success: true,
      data: orderWithNote,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error fetching order ${req.params.id}:`, error.message);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Order not found',
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch order',
        message: error.message
      });
    }
  }
});

/**
 * POST /api/orders/:id/note
 * Saves or updates a manual note for the given order
 */
router.post('/:id/note', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { note, attention } = req.body;

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    if (typeof note !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Note must be a string'
      });
    }

    console.log(`Saving note for order ${orderId}...`);
    
    const result = await firestoreService.saveOrderNote(orderId, {
      note: note.trim(),
      attention: Boolean(attention)
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error saving note for order ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to save note',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/:id/note
 * Returns the saved note and attention flag for the given order
 */
router.get('/:id/note', async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    console.log(`Fetching note for order ${orderId}...`);
    
    const result = await firestoreService.getOrderNote(orderId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error fetching note for order ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch note',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/attention
 * Returns a list of orders marked as "needs attention"
 */
router.get('/attention', async (req, res) => {
  try {
    console.log('Fetching orders needing attention...');
    
    const result = await firestoreService.getOrdersNeedingAttention();

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching orders needing attention:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders needing attention',
      message: error.message
    });
  }
});

/**
 * DELETE /api/orders/:id/note
 * Deletes the note for the given order
 */
router.delete('/:id/note', async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    console.log(`Deleting note for order ${orderId}...`);
    
    const result = await firestoreService.deleteOrderNote(orderId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error deleting note for order ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete note',
      message: error.message
    });
  }
});

module.exports = router;
