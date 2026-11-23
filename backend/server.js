require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Database Connection Health Check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Get All Wallets
app.get('/api/wallets', async (req, res) => {
  const wallets = await prisma.wallet.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(wallets);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HisabPro Backend + DB cholche: http://localhost:${PORT}`);
});
