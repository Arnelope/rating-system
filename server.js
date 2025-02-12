require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Shopify } = require('@shopify/shopify-api');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS-Konfiguration
app.use(cors({
  origin: process.env.SHOPIFY_SHOP_URL,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Shopify-Konfiguration
const client = new Shopify.Clients.Rest(
  process.env.SHOPIFY_SHOP_URL,
  process.env.SHOPIFY_ACCESS_TOKEN
);

// Test-Route
app.get('/', (req, res) => {
  res.send('Rating System Backend is running!');
});

// Rating-Route
app.post('/rate-product', async (req, res) => {
  console.log('Received rating request:', req.body);
  
  try {
    const { productId, rating } = req.body;
    
    if (!productId || !rating) {
      return res.status(400).json({ 
        success: false, 
        error: 'ProductId and rating are required' 
      });
    }

    // Produkt-Metafields abrufen
    const productResponse = await client.get({
      path: `products/${productId}/metafields`
    });

    const metafields = productResponse.body.metafields;
    const currentTotal = parseInt(metafields.find(m => m.key === 'total_ratings')?.value || '0');
    const currentAverage = parseFloat(metafields.find(m => m.key === 'average_rating')?.value || '0');
    
    // Neue Werte berechnen
    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + rating) / newTotal;

    // Metafields aktualisieren
    await Promise.all([
      client.post({
        path: `products/${productId}/metafields`,
        data: {
          metafield: {
            namespace: 'custom',
            key: 'average_rating',
            value: newAverage.toString(),
            type: 'decimal'
          }
        }
      }),
      client.post({
        path: `products/${productId}/metafields`,
        data: {
          metafield: {
            namespace: 'custom',
            key: 'total_ratings',
            value: newTotal.toString(),
            type: 'integer'
          }
        }
      })
    ]);

    res.json({ 
      success: true, 
      newAverage, 
      newTotal 
    });
  } catch (error) {
    console.error('Error processing rating:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
