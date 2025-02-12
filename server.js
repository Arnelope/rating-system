require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test-Route
app.get('/', (req, res) => {
  res.send('Rating System Backend is running!');
});

// Rating-Route
app.post('/rate-product', async (req, res) => {
  const { productId, rating } = req.body;
  
  // Hier kommt später die Shopify-Integration
  res.json({
    success: true,
    message: `Rating ${rating} received for product ${productId}`
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});