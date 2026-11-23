require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const walletRoutes = require('./routes/wallets');
const contactRoutes = require('./routes/contacts');
const transactionRoutes = require('./routes/transactions');
const storeRoutes = require('./routes/store');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', database: 'connected' });
});

app.use('/api/wallets', walletRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/store', storeRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HisabPro Full Backend cholche: http://localhost:${PORT}`);
});
