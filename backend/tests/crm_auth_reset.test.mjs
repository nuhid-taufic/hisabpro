import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const { app, prisma } = require('../app');

describe('Phone/Email Validation, Admin-Approved Reset, Broadcasts & Impersonation', () => {
  const adminAgent = request.agent(app);
  const userAgent = request.agent(app);
  const testPhone = '01799112233';
  const normalizedPhone = '+8801799112233';
  let createdUserId = null;
  let resetRequestId = null;
  let announcementId = null;

  afterAll(async () => {
    if (announcementId) await prisma.announcement.deleteMany({ where: { id: announcementId } });
    if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId } });
    await prisma.$disconnect();
  });

  it('rejects invalid email and invalid BD phone on registration', async () => {
    const badEmail = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad User', email: 'not-an-email@bad', password: 'Password123' });
    expect(badEmail.status).toBe(400);

    const badPhone = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad Phone', phone: '01100000000', password: 'Password123' });
    expect(badPhone.status).toBe(400);
  });

  it('registers and logs in a user with a valid Bangladesh phone number', async () => {
    const reg = await userAgent
      .post('/api/auth/register')
      .send({ name: 'Phone Test User', phone: testPhone, password: 'OldPassword123' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.phone).toBe(normalizedPhone);
    createdUserId = reg.body.user.id;

    const login = await userAgent
      .post('/api/auth/login')
      .send({ identifier: testPhone, password: 'OldPassword123' });
    expect(login.status).toBe(200);
  });

  it('runs full Admin-Approved Password Reset flow end-to-end', async () => {
    const reqRes = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ identifier: testPhone, reason: 'Forgot my password' });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.request.status).toBe('PENDING');
    resetRequestId = reqRes.body.request.id;

    // Cannot complete before admin approves
    const blocked = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ identifier: testPhone, newPassword: 'NewPassword456' });
    expect(blocked.status).toBe(403);

    // Admin logs in & approves
    await adminAgent
      .post('/api/auth/login')
      .send({ identifier: 'nuhidtaufic.z@gmail.com', password: 'hishab.123' });
    const approveRes = await adminAgent.post(`/api/admin/reset-requests/${resetRequestId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.request.status).toBe('APPROVED');

    // User completes reset & logs in with new password
    const doneRes = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ identifier: testPhone, newPassword: 'NewPassword456' });
    expect(doneRes.status).toBe(200);

    const newLogin = await userAgent
      .post('/api/auth/login')
      .send({ identifier: testPhone, password: 'NewPassword456' });
    expect(newLogin.status).toBe(200);
  });

  it('publishes an Admin Broadcast and delivers it to active users', async () => {
    const createAnn = await adminAgent.post('/api/admin/announcements').send({
      title: 'QA Broadcast',
      message: 'Maintenance tonight at 2 AM',
      type: 'INFO',
      targetPlan: 'ALL',
      expiresInHours: 12,
    });
    expect(createAnn.status).toBe(201);
    announcementId = createAnn.body.announcement.id;

    const feed = await userAgent.get('/api/announcements/active');
    expect(feed.status).toBe(200);
    expect(feed.body.announcements.some((a) => a.id === announcementId)).toBe(true);
  });

  it('impersonates user as Admin and cleanly returns to Admin session', async () => {
    const imp = await adminAgent.post(`/api/admin/users/${createdUserId}/impersonate`);
    expect(imp.status).toBe(200);
    expect(imp.body.user.id).toBe(createdUserId);
    expect(imp.body.impersonation.active).toBe(true);

    const meAsUser = await adminAgent.get('/api/auth/me');
    expect(meAsUser.body.user.id).toBe(createdUserId);
    expect(meAsUser.body.impersonation.active).toBe(true);

    const back = await adminAgent.post('/api/auth/stop-impersonation');
    expect(back.status).toBe(200);
    expect(back.body.user.email).toBe('nuhidtaufic.z@gmail.com');
  });
});
