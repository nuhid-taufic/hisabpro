require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const walletRoutes = require('./routes/wallets');
const categoryRoutes = require('./routes/categories');
const contactRoutes = require('./routes/contacts');
const transactionRoutes = require('./routes/transactions');
const parserRoutes = require('./routes/parser');
const trustRoutes = require('./routes/trust');

const app = express();
const prisma = new PrismaClient();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', version: '2.0-sprint2', database: 'connected' });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/public/trust', trustRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`HisabPro v2.0 (Sprint 2) Backend running on http://localhost:${PORT}`);
});
