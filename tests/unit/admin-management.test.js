const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Ensure DNS and env are properly initialized
require('../../src/config/env');

const User = require('../../src/modules/users/user.model');
const Station = require('../../src/modules/stations/station.model');
const Voucher = require('../../src/modules/vouchers/voucher.model');
const Reward = require('../../src/modules/vouchers/reward.model');
const Classification = require('../../src/modules/classifications/classification.model');

const voucherService = require('../../src/modules/vouchers/voucher.service');
const rewardAdminService = require('../../src/modules/vouchers/reward-admin.service');
const employeeService = require('../../src/modules/employees/employee.service');
const stationAdminService = require('../../src/modules/stations/station.admin.service');
const dashboardService = require('../../src/modules/statistics/dashboard.service');

describe('Admin Management Suite - Voucher, Reward, Employee, Station & Dashboard', () => {
  let createdVoucherId;
  let createdRewardMongoId;
  let createdEmployeeId;
  let createdStationId;

  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    }
  });

  after(async () => {
    // Clean up test entities
    if (createdVoucherId) await Voucher.findByIdAndDelete(createdVoucherId);
    if (createdRewardMongoId) await Reward.findByIdAndDelete(createdRewardMongoId);
    if (createdEmployeeId) await User.findByIdAndDelete(createdEmployeeId);
    if (createdStationId) await Station.findByIdAndDelete(createdStationId);
    await User.deleteMany({ email: /^test-emp-.*@example\.com$/ });
    await Voucher.deleteMany({ code: /^TEST-VOUCHER-/ });
    await Station.deleteMany({ code: /^test-st-/ });
    await Reward.deleteMany({ id: /^TEST-RWD-/ });
    await mongoose.disconnect();
  });

  // 1. Voucher Management
  test('Voucher CRUD: Create, Read, Update, Usage, and Excel Export', async () => {
    const testCode = `TEST-VOUCHER-${Date.now()}`;
    const voucher = await voucherService.create({
      code: testCode,
      title: 'Giảm giá 50k ngày môi trường',
      discountType: 'fixed',
      discountValue: 50000,
      minOrderValue: 100000,
      minPoints: 20,
      maxUsage: 5,
      validFrom: new Date(Date.now() - 3600000),
      validTo: new Date(Date.now() + 86400000 * 30),
      description: 'Áp dụng cho mọi cửa hàng đối tác Eco',
    });

    assert.ok(voucher.id);
    createdVoucherId = voucher.id;
    assert.equal(voucher.code, testCode);
    assert.equal(voucher.discountValue, 50000);
    assert.equal(voucher.currentUsage, 0);

    // Duplicate rejection
    await assert.rejects(
      voucherService.create({
        code: testCode,
        title: 'Trùng mã',
        discountType: 'fixed',
        discountValue: 10000,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86400000),
      }),
      /đã tồn tại/
    );

    // Update
    const updated = await voucherService.update(voucher.id, {
      title: 'Giảm giá 50k ngày môi trường - Đã cập nhật',
      maxUsage: 10,
    });
    assert.equal(updated.title, 'Giảm giá 50k ngày môi trường - Đã cập nhật');
    assert.equal(updated.maxUsage, 10);

    // Use voucher
    const afterUse = await voucherService.useVoucher({
      code: testCode,
      userId: new mongoose.Types.ObjectId(),
      userEmail: 'tester@example.com',
      orderValue: 150000,
      userPoints: 50,
    });
    assert.equal(afterUse.currentUsage, 1);
    assert.equal(afterUse.usageHistory.length, 1);

    // List
    const list = await voucherService.list({ q: testCode });
    assert.ok(list.items.some((v) => v.code === testCode));

    // Excel Export
    const workbook = await voucherService.exportExcel({ q: testCode });
    const sheet = workbook.getWorksheet('Danh sách Voucher');
    assert.ok(sheet, 'Worksheet Danh sách Voucher should exist');
    assert.ok(sheet.rowCount >= 2, 'Worksheet should have header + data rows');
    assert.equal(sheet.getRow(1).getCell('B').value, 'Mã Voucher');
  });

  // 2. Rewards Management
  test('Reward CRUD: Create, Read, Update, and Excel Export', async () => {
    const rwdId = `TEST-RWD-${Date.now()}`;
    const reward = await rewardAdminService.create({
      id: rwdId,
      name: 'Bình giữ nhiệt Inox ScanWaste',
      category: 'Eco-Products',
      partnerName: 'Eco Vietnam',
      points: 250,
      stock: 15,
      description: 'Bình giữ nhiệt thân thiện môi trường',
      isActive: true,
    });

    assert.ok(reward._id);
    createdRewardMongoId = reward._id;
    assert.equal(reward.id, rwdId);
    assert.equal(reward.points, 250);

    // Update
    const updated = await rewardAdminService.update(reward._id, {
      stock: 20,
    });
    assert.equal(updated.stock, 20);

    // Excel Export
    const workbook = await rewardAdminService.exportExcel({ q: rwdId });
    const sheet = workbook.getWorksheet('Danh sách Phần Quà');
    assert.ok(sheet, 'Worksheet Danh sách Phần Quà should exist');
    assert.ok(sheet.rowCount >= 2);
  });

  // 3. Employee Management & RBAC
  test('Employee Management: Create, Update, Station Assign, Lock Status, and Excel', async () => {
    const email = `test-emp-${Date.now()}@example.com`;
    const employee = await employeeService.create({
      name: 'Nguyễn Văn Thu Gom',
      email,
      phone: '0901234567',
      role: 'staff',
      department: 'Đội xe điều phối',
      password: 'Password123!',
    });

    assert.ok(employee.id);
    createdEmployeeId = employee.id;
    assert.equal(employee.email, email);
    assert.equal(employee.role, 'staff');
    assert.equal(employee.isActive, true);

    // Lock status
    const locked = await employeeService.update(employee.id, {
      isActive: false,
    });
    assert.equal(locked.isActive, false);

    // Unlock status
    const unlocked = await employeeService.update(employee.id, {
      isActive: true,
    });
    assert.equal(unlocked.isActive, true);

    // Excel Export
    const workbook = await employeeService.exportExcel({ role: 'staff' });
    const sheet = workbook.getWorksheet('Danh sách Nhân Viên');
    assert.ok(sheet, 'Worksheet Danh sách Nhân Viên should exist');
    assert.ok(sheet.rowCount >= 2);
  });

  // 4. Station Management
  test('Station Management: Create, Read, Capacity simulation, and Excel Export', async () => {
    const stationCode = `test-st-${Date.now()}`;
    const station = await stationAdminService.createStation({
      code: stationCode,
      name: 'Trạm Thu Gom Thử Nghiệm Thủ Đức',
      address: 'Số 1 Võ Văn Ngân, Thủ Đức, TP.HCM',
      longitude: 106.772,
      latitude: 10.852,
      stationType: 'RVM',
      capacityPercent: 20,
      openTime: '06:30',
      closeTime: '22:00',
      phoneNumber: '0281234567',
    });

    assert.ok(station.id);
    createdStationId = station.id;
    assert.equal(station.code, stationCode);
    assert.equal(station.capacityPercent, 20);

    // Update
    const updated = await stationAdminService.updateStation(station.id, {
      name: 'Trạm Thu Gom Thử Nghiệm Thủ Đức - Nâng cấp',
    });
    assert.equal(updated.name, 'Trạm Thu Gom Thử Nghiệm Thủ Đức - Nâng cấp');

    // Excel Export
    const workbook = await stationAdminService.exportExcel();
    const sheet = workbook.getWorksheet('Danh sách Trạm Thu Gom');
    assert.ok(sheet, 'Worksheet Danh sách Trạm Thu Gom should exist');
    assert.ok(sheet.rowCount >= 2);
  });

  // 5. Dashboard KPIs
  test('Dashboard KPIs: returns aggregated KPIs from live database', async () => {
    const data = await dashboardService.getKpis();
    assert.ok(data.kpis);
    assert.ok(typeof data.kpis.users.total === 'number');
    assert.ok(typeof data.kpis.stations.total === 'number');
    assert.ok(typeof data.kpis.scans.total === 'number');
    assert.ok(typeof data.kpis.vouchers.total === 'number');
    assert.ok(typeof data.kpis.rewards.total === 'number');
    assert.ok(Array.isArray(data.recentScans));
    assert.ok(Array.isArray(data.recentRedemptions));
  });
});
