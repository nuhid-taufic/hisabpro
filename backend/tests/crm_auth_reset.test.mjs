import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const { app, prisma } = require('../app');

describe('Phone/Email Validation, High-Security Reset, Lockout, Broadcasts & Impersonation', () => {
  const adminAgent = request.agent(app);
  const userAgent = request.agent(app);
  const testPhone = '01799112233';
  const normalizedPhone = '+8801799112233';
  let createdUserId = null;
  let resetRequestId = null;
  let approvalCode = null;
  let announcementId = null;

  afterAll(async () => {
    if (announcementId) await prisma.announcement.deleteMany({ where: { id: announcementId } });
    if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId } });
    await prisma.$disconnect();
  });

  it('rejects invalid email, invalid BD phone, weak password, and forged CSRF origin', async () => {
    const badEmail = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad User', email: 'not-an-email@bad', password: 'Password123' });
    expect(badEmail.status).toBe(400);

    const badPhone = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad Phone', phone: '01100000000', password: 'Password123' });
    expect(badPhone.status).toBe(400);

    const weakPass = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak Pass', phone: testPhone, password: '123456' });
    expect(weakPass.status).toBe(400);

    const csrfAttack = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil-attacker.com')
      .send({ identifier: testPhone, password: 'Password123' });
    expect(csrfAttack.status).toBe(403);
  });

  it('registers and logs in a user with a valid Bangladesh phone number', async () => {
    await prisma.user.deleteMany({ where: { phone: normalizedPhone } });
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

  it('locks account after 5 failed logins (423) and unlocks via Admin CRM', async () => {
    for (let i = 0; i < 4; i++) {
      const fail = await request(app)
        .post('/api/auth/login')
        .send({ identifier: testPhone, password: 'WrongPassword99' });
      expect(fail.status).toBe(401);
    }
    const fifthFail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: testPhone, password: 'WrongPassword99' });
    expect(fifthFail.status).toBe(423);

    const adminLogin = await adminAgent
      .post('/api/auth/login')
      .send({ identifier: 'nuhidtaufic.z@gmail.com', password: 'hishab.123' });
    expect(adminLogin.status).toBe(200);

    const unlockRes = await adminAgent.post(`/api/admin/users/${createdUserId}/unlock`);
    expect(unlockRes.status).toBe(200);

    const relogin = await userAgent
      .post('/api/auth/login')
      .send({ identifier: testPhone, password: 'OldPassword123' });
    expect(relogin.status).toBe(200);
  });

  it('runs full Admin-Approved Password Reset with mandatory 6-digit Approval Code', async () => {
    const reqRes = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ identifier: testPhone, reason: 'Forgot my password' });
    expect(reqRes.status).toBe(201);
    resetRequestId = reqRes.body.request.id;

    const approveRes = await adminAgent.post(`/api/admin/reset-requests/${resetRequestId}/approve`);
    expect(approveRes.status).toBe(200);
    approvalCode = approveRes.body.request.approvalCode;
    expect(approvalCode).toHaveLength(6);

    // Wrong approval code must be rejected
    const wrongCode = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ identifier: testPhone, approvalCode: 'WRONG1', newPassword: 'NewPassword456' });
    expect(wrongCode.status).toBe(403);

    // Valid approval code succeeds
    const doneRes = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ identifier: testPhone, approvalCode, newPassword: 'NewPassword456' });
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

  it('impersonates user as Admin and cleanly returns to Dedicated CRM session', async () => {
    const imp = await adminAgent.post(`/api/admin/users/${createdUserId}/impersonate`);
    expect(imp.status).toBe(200);
    expect(imp.body.user.id).toBe(createdUserId);
    expect(imp.body.impersonation.active).toBe(true);

    const back = await adminAgent.post('/api/auth/stop-impersonation');
    expect(back.status).toBe(200);
    expect(back.body.user.email).toBe('nuhidtaufic.z@gmail.com');
  });
});
