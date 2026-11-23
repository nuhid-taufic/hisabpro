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
const storeRoutes = require('./routes/store');
const reportsRoutes = require('./routes/reports');
const trustRoutes = require('./routes/trust');

const prisma = new PrismaClient();
const app = express();

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
  res.json({ status: 'ok', version: '2.0-complete', database: 'connected' });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/public/trust', trustRoutes);

app.use(errorHandler);

module.exports = { app, prisma };
