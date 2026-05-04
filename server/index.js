const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Allows us to read JSON EDI payloads

// Test Route
app.get('/api/status', (req, res) => {
  res.json({ message: "Logistics EDI Server is running!", status: "STAT-RCVD" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is routing payloads on port ${PORT}`);
});