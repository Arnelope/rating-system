require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS-Konfiguration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Debug-Route
app.get('/debug', async (req, res) => {
  try {
    // Test Shopify-Verbindung
    const shopifyResponse = await axios.get(`https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
      }
    });
    
    res.json({
      status: 'online',
      shopify_connection: 'successful',
      shop_info: shopifyResponse.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      shopify_url: process.env.SHOPIFY_SHOP_URL
    });
  }
});

// Rating-Route
app.post('/rate-product', async (req, res) => {
  console.log('Bewertungsanfrage erhalten:', req.body);
  
  try {
    const { productId, rating } = req.body;
    
    if (!productId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'Produkt-ID und Bewertung sind erforderlich'
      });
    }

    // Aktuelle Metafields abrufen
    const metafieldsResponse = await axios.get(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const metafields = metafieldsResponse.data.metafields;
    const currentTotal = parseInt(metafields.find(m => m.key === 'total_ratings')?.value || '0');
    const currentAverage = parseFloat(metafields.find(m => m.key === 'average_rating')?.value || '0');

    // Neue Werte berechnen
    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;

    // Metafields aktualisieren
    const updatePromises = [
      axios.post(
        `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'average_rating',
            value: newAverage.toFixed(2),
            type: 'decimal'
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
            type: 'integer'
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

    res.json({
      success: true,
      newAverage: parseFloat(newAverage.toFixed(2)),
      newTotal,
      message: 'Bewertung erfolgreich gespeichert'
    });

  } catch (error) {
    console.error('Fehler bei der Verarbeitung der Bewertung:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});