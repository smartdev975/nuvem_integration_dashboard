const express = require('express');
const router = express.Router();
const nuvemshopService = require('../services/nuvemshop');
const firestoreService = require('../services/firestore');

/**
 * GET /api/orders
 * Returns all orders from Nuvemshop with computed fields
 */
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all orders...');
    
    // Fetch all orders from Nuvemshop in a single call
    const allOrders = await nuvemshopService.fetchOrders();
    
    // Get notes for all orders to merge with order data
    const ordersWithNotes = await Promise.all(
      allOrders.map(async (order) => {
        try {
          const noteData = await firestoreService.getOrderNote(order.id);
          console.log(`Order ${order.id} - Note data:`, {
            note: noteData.note,
            attention: noteData.attention,
            success: noteData.success,
            exists: noteData.exists
          });
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

    res.json({
      success: true,
      data: ordersWithNotes,
      count: ordersWithNotes.length,
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
