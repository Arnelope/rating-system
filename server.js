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
  console.log('Received rating request:', req.body);
  
  try {
    const { productId, rating } = req.body;
    
    if (!productId || !rating) {
      throw new Error('ProductId and rating are required');
    }

    // Shopify GraphQL Client
    const client = new Shopify.Clients.Graphql(
      process.env.SHOP_URL,
      process.env.SHOPIFY_ACCESS_TOKEN
    );

    // Aktuelle Metafields abrufen
    const { product } = await client.query({
      data: `{
        product(id: "gid://shopify/Product/${productId}") {
          metafields(first: 10) {
            edges {
              node {
                id
                key
                value
              }
            }
          }
        }
      }`
    });

    console.log('Retrieved product data:', product);

    // Berechnung der neuen Werte
    const metafields = product.metafields.edges;
    const currentTotal = parseInt(metafields.find(m => m.node.key === 'total_ratings')?.node.value || '0');
    const currentAverage = parseFloat(metafields.find(m => m.node.key === 'average_rating')?.node.value || '0');

    const newTotal = currentTotal + 1;
    const newAverage = ((currentAverage * currentTotal) + rating) / newTotal;

    console.log('Calculated new values:', { newTotal, newAverage });

    // Metafields aktualisieren
    await client.query({
      data: {
        query: `mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
          }
        }`,
        variables: {
          input: {
            id: `gid://shopify/Product/${productId}`,
            metafields: [
              {
                namespace: "custom",
                key: "average_rating",
                value: newAverage.toString(),
                type: "decimal"
              },
              {
                namespace: "custom",
                key: "total_ratings",
                value: newTotal.toString(),
                type: "integer"
              }
            ]
          }
        }
      }
    });

    console.log('Successfully updated product ratings');

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