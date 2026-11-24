require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, publicTrustLimiter, csrfOriginGuard } = require('./middleware/security');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const announcementRoutes = require('./routes/announcements');
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

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(
  cors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', apiLimiter, csrfOriginGuard);

app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', version: '2.3-hardened', database: 'connected' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/parser', parserRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/public/trust', publicTrustLimiter, trustRoutes);

app.use(errorHandler);

module.exports = { app, prisma };
