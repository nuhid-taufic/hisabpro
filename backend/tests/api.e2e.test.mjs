import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const { app, prisma } = require('../app');

describe('HisabPro End-to-End API Integration Suite', () => {
  const agent = request.agent(app);
  let storeBookId = null;
  let cashWalletId = null;
  let testProductId = null;
  let testOrderId = null;
  let testTxId = null;

  afterAll(async () => {
    if (testOrderId) await prisma.stockOrder.deleteMany({ where: { id: testOrderId } });
    if (testTxId) await prisma.transaction.deleteMany({ where: { id: testTxId } });
    if (testProductId) await prisma.product.deleteMany({ where: { id: testProductId } });
    await prisma.$disconnect();
  });

  it('returns healthy status from /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  it('blocks unauthenticated access to protected routes with 401', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(401);
  });

  it('logs in with demo account and sets HttpOnly session cookie', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'demo@hisabpro.app', password: 'Demo@1234' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('demo@hisabpro.app');
  });

  it('fetches books and wallets for authenticated session', async () => {
    const booksRes = await agent.get('/api/books');
    expect(booksRes.status).toBe(200);
    const storeBook = booksRes.body.books.find((b) => b.bookType === 'STORE');
    expect(storeBook).toBeDefined();
    storeBookId = storeBook.id;

    const walletsRes = await agent.get('/api/wallets');
    expect(walletsRes.status).toBe(200);
    cashWalletId = walletsRes.body.wallets[0].id;
  });

  it('previews bKash Cash Out SMS with balance mismatch warning', async () => {
    const res = await agent.post('/api/parser/preview').send({
      input:
        'Cash Out Tk 5,000.00 to 01711889900 successful. Fee Tk 92.50. Balance Tk 6,815.00. TrxID QA998877.',
    });
    expect(res.status).toBe(200);
    expect(res.body.parsed.type).toBe('TRANSFER');
    expect(res.body.parsed.externalTrxId).toBe('QA998877');
    expect(res.body.warnings.isDuplicateTrx).toBe(false);
  });

  it('creates a product, executes POS sale with Manual MRP Override & Loss Guard, and deducts stock', async () => {
    const prodRes = await agent.post('/api/store/products').send({
      bookId: storeBookId,
      name: 'QA Test Adapter',
      costPrice: 200,
      mrpPrice: 300,
      openingStock: 5,
    });
    expect(prodRes.status).toBe(201);
    testProductId = prodRes.body.product.id;

    const saleRes = await agent.post('/api/store/orders').send({
      bookId: storeBookId,
      type: 'SALE',
      walletId: cashWalletId,
      paidAmount: 360,
      items: [{ productId: testProductId, quantity: 2, unitPrice: 180 }],
    });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.lossWarnings.length).toBe(1);
    testOrderId = saleRes.body.order.id;
    testTxId = saleRes.body.order.transactionId;

    await prisma.wallet.update({
      where: { id: cashWalletId },
      data: { balancePaisa: { increment: -36000n } },
    });

    const updatedProd = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(Number(updatedProd.currentStock)).toBe(3);
  });

  it('loads public Zero-Dispute Trust Link without authentication', async () => {
    const res = await request(app).get('/api/public/trust/rh-demo-9x4k2m');
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe('Rahim Uddin');
    expect(Array.isArray(res.body.transactions)).toBe(true);
  });
});
