import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const { app, prisma } = require('../app');

describe('HisabPro End-to-End API Integration Suite', () => {
  const userAgent = request.agent(app);
  const testEmail = 'qa.e2e.user@hisabpro.test';
  let testUserId = null;
  let storeBookId = null;
  let cashWalletId = null;
  let testProductId = null;
  let trustToken = null;

  afterAll(async () => {
    if (testUserId) await prisma.user.deleteMany({ where: { id: testUserId } });
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

  it('logs in as SUPER_ADMIN nuhidtaufic.z@gmail.com', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nuhidtaufic.z@gmail.com', password: 'hishab.123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('SUPER_ADMIN');
  });

  it('registers a regular user, switches language en <-> bn, and loads books/wallets', async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    const reg = await userAgent
      .post('/api/auth/register')
      .send({ name: 'QA Tester', email: testEmail, password: 'Password123', preferredLanguage: 'en' });
    expect(reg.status).toBe(201);
    testUserId = reg.body.user.id;

    const pref = await userAgent
      .patch('/api/auth/preferences')
      .send({ preferredLanguage: 'bn' });
    expect(pref.status).toBe(200);
    expect(pref.body.user.preferredLanguage).toBe('bn');

    const booksRes = await userAgent.get('/api/books');
    const storeBook = booksRes.body.books.find((b) => b.bookType === 'STORE');
    expect(storeBook).toBeDefined();
    storeBookId = storeBook.id;

    const walletsRes = await userAgent.get('/api/wallets');
    cashWalletId = walletsRes.body.wallets[0].id;
  });

  it('previews bKash Cash Out SMS accurately', async () => {
    const res = await userAgent.post('/api/parser/preview').send({
      input:
        'Cash Out Tk 5,000.00 to 01711889900 successful. Fee Tk 92.50. Balance Tk 6,815.00. TrxID QA998877.',
    });
    expect(res.status).toBe(200);
    expect(res.body.parsed.type).toBe('TRANSFER');
    expect(res.body.parsed.externalTrxId).toBe('QA998877');
  });

  it('creates a product, executes POS sale with Loss Guard, and deducts stock', async () => {
    const prodRes = await userAgent.post('/api/store/products').send({
      bookId: storeBookId,
      name: 'QA Test Adapter',
      costPrice: 200,
      mrpPrice: 300,
      openingStock: 5,
    });
    expect(prodRes.status).toBe(201);
    testProductId = prodRes.body.product.id;

    const saleRes = await userAgent.post('/api/store/orders').send({
      bookId: storeBookId,
      type: 'SALE',
      walletId: cashWalletId,
      paidAmount: 360,
      items: [{ productId: testProductId, quantity: 2, unitPrice: 180 }],
    });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.lossWarnings.length).toBe(1);

    const updatedProd = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(Number(updatedProd.currentStock)).toBe(3);
  });

  it('creates a contact with Trust Link and loads it publicly without auth', async () => {
    const cRes = await userAgent.post('/api/contacts').send({
      name: 'QA Customer',
      phone: '01755667788',
      type: 'CUSTOMER',
      openingBalance: 500,
      enableTrustLink: true,
    });
    expect(cRes.status).toBe(201);
    trustToken = cRes.body.contact.shareToken;

    const pub = await request(app).get(`/api/public/trust/${trustToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body.contact.name).toBe('QA Customer');
  });
});
