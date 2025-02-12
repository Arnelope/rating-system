require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Wichtig: express.json() Middleware VOR den CORS-Einstellungen
app.use(express.json());

// CORS Konfiguration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// In-Memory Cache für Rate Limiting
const ratingAttempts = new Map();

function isRateLimited(userId, productId) {
  if (!userId) return true;
  
  const key = `${userId}_${productId}`;
  const now = Date.now();
  const attemptData = ratingAttempts.get(key);

  if (attemptData) {
    const timeSinceLastAttempt = now - attemptData.timestamp;
    if (timeSinceLastAttempt < 24 * 60 * 60 * 1000) {
      return true;
    }
  }
  return false;
}

function getPreviousRating(userId, productId) {
  const key = `${userId}_${productId}`;
  const attemptData = ratingAttempts.get(key);
  return attemptData ? attemptData.rating : null;
}

// Rating Route
app.post('/rate-product', async (req, res) => {
  try {
    const { productId, rating, userId } = req.body;
    
    if (!productId || !rating || !userId) {
      return res.status(400).json({
        success: false,
        error: 'ProductId, rating und userId sind erforderlich'
      });
    }

    // Hole die aktuellen Metafields
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
    const userRatingsField = metafields.find(m => m.key === 'user_ratings' && m.namespace === 'custom');

    // Parse die existierenden Bewertungen
    const userRatings = userRatingsField ? JSON.parse(userRatingsField.value) : {};
    const previousRating = userRatings[userId];
    
    const currentTotal = parseInt(totalRatingsField?.value || '0');
    const currentAverage = parseFloat(averageRatingField?.value || '0');

    let newTotal, newAverage;

    // Berechne neue Werte basierend darauf, ob es eine vorherige Bewertung gab
    if (previousRating) {
      // Update existierende Bewertung
      const totalWithoutPrevious = currentTotal * currentAverage - previousRating;
      newTotal = currentTotal;
      newAverage = (totalWithoutPrevious + parseFloat(rating)) / currentTotal;
    } else {
      // Neue Bewertung
      newTotal = currentTotal + 1;
      newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;
    }

    // Aktualisiere die User-Bewertungen
    userRatings[userId] = parseFloat(rating);


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

    ratingAttempts.set(key, {
      timestamp: now,
      rating: parseFloat(rating)
    });

    res.json({
      success: true,
      newAverage: parseFloat(newAverage.toFixed(2)),
      newTotal,
      message: previousRating ? 'Bewertung erfolgreich aktualisiert' : 'Bewertung erfolgreich gespeichert'
    });

  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung'
    });
  }
});

// Reset Route
app.get('/internal-reset', async (req, res) => {
  try {
    const productsResponse = await axios.get(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const products = productsResponse.data.products;
    console.log(`Gefundene Produkte zum Zurücksetzen: ${products.length}`);

    for (const product of products) {
      try {
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
      ),
      axios.post(
        `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'user_ratings',
            value: JSON.stringify(userRatings),
            type: 'json'
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        }
      )
    ]);

    res.json({
      success: true,
      newAverage: parseFloat(newAverage.toFixed(2)),
      newTotal,
      message: previousRating ? 'Bewertung erfolgreich aktualisiert' : 'Bewertung erfolgreich gespeichert'
    });

  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Serverfehler bei der Bewertungsverarbeitung'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});