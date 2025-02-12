require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Erweiterte CORS-Konfiguration
app.use(cors({
  origin: ['https://sampleverse.io', 'https://www.sampleverse.io'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Rating-Route mit verbessertem Error-Handling
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

    console.log('Abrufen der Metafields für Produkt:', productId);

    // Metafields abrufen
    const metafieldsUrl = `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`;
    console.log('Metafields URL:', metafieldsUrl);

    const metafieldsResponse = await axios.get(metafieldsUrl, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('Metafields Response:', metafieldsResponse.data);

    const metafields = metafieldsResponse.data.metafields;
    const currentTotal = parseInt(metafields.find(m => m.key === 'total_ratings')?.value || '0');
    const currentAverage = parseFloat(metafields.find(m => m.key === 'average_rating')?.value || '0');

    console.log('Aktuelle Werte:', { currentTotal, currentAverage });

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
            type: 'decimal'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
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
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
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
      status: error.response?.status,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });

    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung',
      details: error.message,
      shopifyError: error.response?.data
    });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log('Environment:', {
    shopUrl: process.env.SHOPIFY_SHOP_URL,
    hasToken: !!process.env.SHOPIFY_ACCESS_TOKEN
  });
});