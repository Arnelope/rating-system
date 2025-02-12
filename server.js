require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

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

// Füge diese neue Funktion hinzu
function getPreviousRating(userId, productId) {
  const key = `${userId}_${productId}`;
  const attemptData = ratingAttempts.get(key);
  return attemptData ? attemptData.rating : null;
}

app.post('/rate-product', async (req, res) => {
  try {
    const { productId, rating, userId } = req.body;
    
    if (!productId || !rating || !userId) {
      return res.status(400).json({
        success: false,
        error: 'ProductId, rating und userId sind erforderlich'
      });
    }

    const key = `${userId}_${productId}`;
    const previousRating = getPreviousRating(userId, productId);
    const now = Date.now();
    const attemptData = ratingAttempts.get(key);

    // Prüfe ob 24 Stunden vergangen sind für Update
    if (attemptData) {
      const timeSinceLastAttempt = now - attemptData.timestamp;
      if (timeSinceLastAttempt < 24 * 60 * 60 * 1000) {
        return res.status(429).json({
          success: false,
          error: 'Sie können dieses Produkt erst in 24 Stunden wieder bewerten'
        });
      }
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

    let newTotal, newAverage;

    if (previousRating) {
      // Update existierende Bewertung
      const totalWithoutPrevious = currentTotal * currentAverage - previousRating;
      newTotal = currentTotal; // Gesamtzahl bleibt gleich
      newAverage = (totalWithoutPrevious + parseFloat(rating)) / currentTotal;
    } else {
      // Neue Bewertung
      newTotal = currentTotal + 1;
      newAverage = ((currentAverage * currentTotal) + parseFloat(rating)) / newTotal;
    }

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

    // Speichere neue Bewertung und Timestamp
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

// Interne Reset-Route
app.get('/internal-reset', async (req, res) => {
  try {
    // Setze Metafields zurück
    await Promise.all([
      axios.post(
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
      ),
      axios.post(
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
      )
    ]);

    // Lösche alle Rate-Limiting-Einträge
    ratingAttempts.clear();

    res.json({ 
      success: true, 
      message: 'Ratings und Rate-Limiting-Cache zurückgesetzt' 
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});