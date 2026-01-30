const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CARTS_TABLE_NAME = process.env.CARTS_TABLE_NAME;
const ORDERS_TABLE_NAME = process.env.ORDERS_TABLE_NAME;
const LOCATIONS_TABLE_NAME = process.env.LOCATIONS_TABLE_NAME;

exports.handler = async (event) => {
  console.log('PlaceOrder event:', JSON.stringify(event));

  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, locationId } = body;

    if (!customerId || !locationId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Missing required parameters: customerId, locationId' 
        })
      };
    }

    // Get cart using PK structure
    const cart = await docClient.send(new GetCommand({
      TableName: CARTS_TABLE_NAME,
      Key: {
        PK: `CUSTOMER#${customerId}`
      }
    }));

    if (!cart.Item || !cart.Item.items || cart.Item.items.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Cart is empty',
          message: 'No items in cart. Please add items before placing an order.'
        })
      };
    }

    // Get location for tax rate using PK structure
    const location = await docClient.send(new GetCommand({
      TableName: LOCATIONS_TABLE_NAME,
      Key: {
        PK: `LOCATION#${locationId}`
      }
    }));

    if (!location.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Location not found',
          message: `Location ${locationId} not found. Please populate the Locations table with data.`
        })
      };
    }

    const taxRate = location.Item.taxRate || 0;

    // Calculate totals
    const subtotal = cart.Item.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // Create order using PK/SK structure
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    const order = {
      PK: `CUSTOMER#${customerId}`,
      SK: `ORDER#${orderId}#${timestamp}`,
      GSI1PK: `LOCATION#${locationId}`,
      GSI1SK: `ORDER#${timestamp}`,
      customerId,
      orderId,
      locationId,
      items: cart.Item.items,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      status: 'confirmed',
      timestamp,
      createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: ORDERS_TABLE_NAME,
      Item: order
    }));

    // Clear cart using PK structure
    await docClient.send(new DeleteCommand({
      TableName: CARTS_TABLE_NAME,
      Key: {
        PK: `CUSTOMER#${customerId}`
      }
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        order,
        message: 'Order placed successfully'
      })
    };
  } catch (error) {
    console.error('Error placing order:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: 'Failed to place order',
        message: error.message
      })
    };
  }
};
