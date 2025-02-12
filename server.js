require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Shopify } = require('@shopify/shopify-api');
const app = express();
const PORT = process.env.PORT || 3000;

// Erweiterte CORS-Konfiguration
app.use(cors({
  origin: '*', // Später auf deine Shopify-Domain einschränken
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Shopify Admin API konfigurieren
const shopify = new Shopify.Clients.Rest(
  process.env.SHOPIFY_SHOP_URL,
  process.env.SHOPIFY_ACCESS_TOKEN
);

// Debug-Route
app.get('/debug', (req, res) => {
  res.json({
    status: 'online',
    environment: process.env.NODE_ENV,
    shopUrl: process.env.SHOPIFY_SHOP_URL
  });
});

// Hauptroute für Bewertungen
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
    const metafieldsResponse = await shopify.get({
      path: `products/${productId}/metafields`
    });

    console.log('Aktuelle Metafields:', metafieldsResponse.body);

    // Aktuelle Werte extrahieren
    const metafields = metafieldsResponse.body.metafields;
    const currentTotal = parseInt(metafields.find(m => m.key === 'total_ratings')?.value || '0');
    const currentAverage = parseFloat(metafields.find(m => m.key === 'average_rating')?.value || '0');

    // Neue Werte berechnen
    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;

    console.log('Neue Werte berechnet:', { newTotal, newAverage });

    // Metafields aktualisieren
    const updatePromises = [
      shopify.post({
        path: `products/${productId}/metafields`,
        data: {
          metafield: {
            namespace: 'custom',
            key: 'average_rating',
            value: newAverage.toFixed(2),
            type: 'decimal'
          }
        }
      }),
      shopify.post({
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
    console.error('Fehler bei der Verarbeitung der Bewertung:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung',
      details: error.message
    });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log('Umgebungsvariablen geladen:', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    shopUrl: process.env.SHOPIFY_SHOP_URL
  });
});