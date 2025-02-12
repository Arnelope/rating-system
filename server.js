require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// In-Memory Cache für Rate Limiting
const ratingAttempts = new Map();

// Rate Limiting Funktion
function isRateLimited(userId, productId) {
  const key = `${userId}_${productId}`;
  const now = Date.now();
  const attemptData = ratingAttempts.get(key);

  if (attemptData) {
    const timeSinceLastAttempt = now - attemptData.timestamp;
    // 24 Stunden in Millisekunden
    if (timeSinceLastAttempt < 24 * 60 * 60 * 1000) {
      return true;
    }
  }
  return false;
}

// Middleware und Basis-Setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Bewertungs-Route mit verbessertem Rate Limiting
app.post('/rate-product', async (req, res) => {
  try {
    const { productId, rating, userId } = req.body;
    
    if (!productId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'ProductId und rating sind erforderlich'
      });
    }

    // Generiere eine eindeutige ID basierend auf IP oder Session wenn keine userId vorhanden
    const uniqueId = userId || req.ip;
    
    // Prüfe Rate Limiting
    if (isRateLimited(uniqueId, productId)) {
      return res.status(429).json({
        success: false,
        error: 'Bitte warten Sie 24 Stunden bis zur nächsten Bewertung'
      });
    }

    // Hole aktuelle Metafields
    const metafieldsResponse = await axios.get(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const metafields = metafieldsResponse.data.metafields;
    const totalRatingsField = metafields.find(m => m.key === 'total_ratings' && m.namespace === 'custom');
    const averageRatingField = metafields.find(m => m.key === 'average_rating' && m.namespace === 'custom');

    const currentTotal = parseInt(totalRatingsField?.value || '0');
    const currentAverage = parseFloat(averageRatingField?.value || '0');

    // Berechne neue Werte
    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;

    // Aktualisiere Metafields
    await Promise.all([
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
    ]);

    // Speichere Rate Limiting Information
    ratingAttempts.set(`${uniqueId}_${productId}`, {
      timestamp: Date.now()
    });

    res.json({
      success: true,
      newAverage: parseFloat(newAverage.toFixed(2)),
      newTotal,
      message: 'Bewertung erfolgreich gespeichert'
    });

  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung'
    });
  }
});

// Reset-Route (nur für autorisierte Admins)
app.post('/reset-ratings', async (req, res) => {
  try {
    const { productId, adminKey } = req.body;

    // Überprüfe Admin-Berechtigung
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Nicht autorisiert'
      });
    }

    // Setze Metafields zurück
    await Promise.all([
      axios.post(
        `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'average_rating',
            value: '0',
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
            value: '0',
            type: 'number_integer'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      )
    ]);

    // Lösche alle Rate-Limiting-Einträge für dieses Produkt
    for (const [key, value] of ratingAttempts.entries()) {
      if (key.includes(productId)) {
        ratingAttempts.delete(key);
      }
    }

    res.json({
      success: true,
      message: 'Bewertungen erfolgreich zurückgesetzt'
    });

  } catch (error) {
    console.error('Reset-Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Zurücksetzen der Bewertungen'
    });
  }
});
app.get('/internal-reset', async (req, res) => {
  try {
    await axios.post(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/9037639614813/metafields.json`,
      {
        metafield: {
          namespace: 'custom',
          key: 'average_rating',
          value: '0',
          type: 'number_decimal'
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    await axios.post(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/9037639614813/metafields.json`,
      {
        metafield: {
          namespace: 'custom',
          key: 'total_ratings',
          value: '0',
          type: 'number_integer'
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    res.json({ success: true, message: 'Ratings reset successful' });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// Cleanup-Job für alte Rate-Limiting-Einträge
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of ratingAttempts.entries()) {
    if (now - value.timestamp > 24 * 60 * 60 * 1000) {
      ratingAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000); // Führe jede Stunde aus

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});