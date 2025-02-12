require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS und JSON Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Health Check Route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Rating System is running'
  });
});

// Debug Route
app.get('/debug', async (req, res) => {
  try {
    if (!process.env.SHOPIFY_SHOP_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Missing required environment variables');
    }

    const shopifyResponse = await axios.get(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    res.json({
      status: 'success',
      shopify_connection: 'successful',
      environment: {
        shopUrl: process.env.SHOPIFY_SHOP_URL,
        hasToken: !!process.env.SHOPIFY_ACCESS_TOKEN
      }
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      environment: {
        shopUrl: process.env.SHOPIFY_SHOP_URL,
        hasToken: !!process.env.SHOPIFY_ACCESS_TOKEN
      }
    });
  }
});

// Hauptroute für Bewertungen
app.post('/rate-product', async (req, res) => {
  console.log('Bewertungsanfrage erhalten:', req.body);
  
  try {
    const { productId, rating } = req.body;
    
    if (!productId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'ProductId und rating sind erforderlich'
      });
    }

    // Metafields abrufen
    const metafieldsResponse = await axios.get(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    console.log('Metafields Response:', metafieldsResponse.data);

    const metafields = metafieldsResponse.data.metafields;
    const totalRatingsField = metafields.find(m => m.key === 'total_ratings' && m.namespace === 'custom');
    const averageRatingField = metafields.find(m => m.key === 'average_rating' && m.namespace === 'custom');

    const currentTotal = parseInt(totalRatingsField?.value || '0');
    const currentAverage = parseFloat(averageRatingField?.value || '0');

    // Neue Werte berechnen
    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;

    console.log('Neue Werte:', { newTotal, newAverage });

    // Metafields aktualisieren
    const updatePromises = [
      axios.post(
        `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'average_rating',
            value: newAverage.toFixed(2),
            type: 'number_decimal'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      ),
      axios.post(
        `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'total_ratings',
            value: newTotal.toString(),
            type: 'number_integer'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      )
    ];

    await Promise.all(updatePromises);
    console.log('Metafields erfolgreich aktualisiert');

    res.json({
      success: true,
      newAverage: parseFloat(newAverage.toFixed(2)),
      newTotal,
      message: 'Bewertung erfolgreich gespeichert'
    });

  } catch (error) {
    console.error('Detaillierter Fehler:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung',
      details: error.message
    });
  }
});

// Error Handler für unerwartete Fehler
app.use((err, req, res, next) => {
  console.error('Unerwarteter Fehler:', err);
  res.status(500).json({
    success: false,
    error: 'Ein unerwarteter Fehler ist aufgetreten'
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log('Environment:', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    shopUrl: process.env.SHOPIFY_SHOP_URL
  });
});