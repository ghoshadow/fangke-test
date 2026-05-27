import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app, { initDatabase } from '../../src/backend/app';

// ============================================================
// FK-29: 【测试】暂存与草稿管理
//
// 测试目标：验证暂存功能不校验必填项、草稿持久化存储、
//          再次进入时自动加载、提交后草稿被消费。
//
// 关联用户故事：US008
// ============================================================

describe('FK-29: 暂存与草稿管理', () => {
  let deptId: string;

  beforeAll(async () => {
    await initDatabase();
    const res = await request(app).get('/api/departments');
    deptId = res.body.data[0].id;
  });

  // ============================================================
  // 场景 #1：部分填写后点击暂存
  // 预期：保存成功，保留当前页可继续编辑
  // ============================================================
  describe('场景 #1：部分填写后点击暂存', () => {
    const SESSION = 'fk29-s1-partial-save';

    it('保存成功，返回草稿数据', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: {
            visitor_name: '张三',
            phone: '138',
            // 其余字段均未填写
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.session_id).toBe(SESSION);
      // 草稿的 form_data 可以是字符串或已解析的对象
      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;
      expect(formData.visitor_name).toBe('张三');
      expect(formData.phone).toBe('138');
    });

    it('暂存后仍可继续编辑（草稿可再次读取）', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).not.toBeNull();
    });
  });

  // ============================================================
  // 场景 #2：暂存时所有必填项为空
  // 预期：正常保存，不触发必填项校验
  // ============================================================
  describe('场景 #2：暂存时所有必填项为空', () => {
    const SESSION = 'fk29-s2-empty-save';

    it('空表单也能正常暂存，不触发校验', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: {
            visitor_name: '',
            phone: '',
            id_card: '',
            visitor_unit: '',
            visitor_count: undefined,
            has_vehicle: false,
            vehicle_plate: '',
            contact_person: '',
            department: '',
            visit_start: '',
            visit_end: '',
            visit_purpose: '',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.session_id).toBe(SESSION);
    });

    it('空表单草稿可正常加载回来', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();
      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;
      expect(formData.visitor_name).toBe('');
      expect(formData.phone).toBe('');
    });
  });

  // ============================================================
  // 场景 #3：暂存后关闭页面重新进入
  // 预期：自动加载草稿内容，字段完整恢复
  // ============================================================
  describe('场景 #3：暂存后关闭页面重新进入', () => {
    const SESSION = 'fk29-s3-reload-restore';

    const fullDraftData = {
      visitor_name: '李四',
      phone: '13900139000',
      id_card: '110101199001011234',
      visitor_unit: '测试科技有限公司',
      visitor_count: 3,
      has_vehicle: true,
      vehicle_plate: '京A88888',
      contact_person: '王五',
      department: '教务处',
      visit_start: '2024-06-01T09:00:00.000Z',
      visit_end: '2024-06-01T17:00:00.000Z',
      visit_purpose: '商务洽谈合作事宜',
    };

    it('先保存一份完整草稿', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: fullDraftData,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('模拟重新进入页面，GET 加载草稿，字段完整恢复', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.session_id).toBe(SESSION);
      expect(res.body.data.application_id).toBeNull();

      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;

      // 逐字段验证完整恢复
      expect(formData.visitor_name).toBe('李四');
      expect(formData.phone).toBe('13900139000');
      expect(formData.id_card).toBe('110101199001011234');
      expect(formData.visitor_unit).toBe('测试科技有限公司');
      expect(formData.visitor_count).toBe(3);
      expect(formData.has_vehicle).toBe(true);
      expect(formData.vehicle_plate).toBe('京A88888');
      expect(formData.contact_person).toBe('王五');
      expect(formData.department).toBe('教务处');
      expect(formData.visit_start).toBe('2024-06-01T09:00:00.000Z');
      expect(formData.visit_end).toBe('2024-06-01T17:00:00.000Z');
      expect(formData.visit_purpose).toBe('商务洽谈合作事宜');
    });
  });

  // ============================================================
  // 场景 #4：加载草稿后继续填写并提交
  // 预期：全量校验通过 → 提交成功 → 待审批
  // ============================================================
  describe('场景 #4：加载草稿后继续填写并提交', () => {
    const SESSION = 'fk29-s4-load-and-submit';

    it('先保存一份部分草稿', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: {
            visitor_name: '赵六',
            phone: '13700137000',
            // 其余字段暂存时未填
          },
        });
      expect(res.status).toBe(200);
    });

    it('加载草稿确认数据存在', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();
      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;
      expect(formData.visitor_name).toBe('赵六');
    });

    it('补齐字段后提交，全量校验通过 → 待审批', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          session_id: SESSION,
          visitor_name: '赵六',
          phone: '13700137000',
          id_card: null,
          company: null,
          visitor_count: 2,
          is_driving: false,
          license_plate: null,
          contact_person: '内部对接人',
          department_id: deptId,
          visit_start_time: '2024-07-01T09:00:00.000Z',
          visit_end_time: '2024-07-01T17:00:00.000Z',
          visit_purpose: '项目验收',
          attachment_url: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.approval_status).toBe('pending');
      expect(res.body.data.visitor_name).toBe('赵六');
    });
  });

  // ============================================================
  // 场景 #5：暂存 → 再次暂存覆盖
  // 预期：新草稿覆盖旧草稿，内容正确更新
  // ============================================================
  describe('场景 #5：暂存 → 再次暂存覆盖', () => {
    const SESSION = 'fk29-s5-overwrite';

    it('第一次暂存', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: { visitor_name: '原始名字', phone: '11111111111' },
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('第二次暂存覆盖旧草稿', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: {
            visitor_name: '覆盖后的名字',
            phone: '22222222222',
            contact_person: '新增对接人',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('加载后内容为最新覆盖的数据', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();

      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;

      // 新数据已覆盖
      expect(formData.visitor_name).toBe('覆盖后的名字');
      expect(formData.phone).toBe('22222222222');
      expect(formData.contact_person).toBe('新增对接人');
    });

    it('同一 session_id 只保留一条新建草稿（无重复）', async () => {
      // 再次覆盖
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: { visitor_name: '第三次覆盖' },
        });

      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;
      expect(formData.visitor_name).toBe('第三次覆盖');
    });
  });

  // ============================================================
  // 场景 #6：草稿提交成功后再次进入
  // 预期：不再加载草稿（已被消费），显示空表单
  // ============================================================
  describe('场景 #6：草稿提交成功后再次进入', () => {
    const SESSION = 'fk29-s6-consume-after-submit';

    it('先保存一份草稿', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: { visitor_name: '将被消费的草稿' },
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('提交申请（后端自动清理该 session 的新建草稿）', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          session_id: SESSION,
          visitor_name: '正式提交',
          phone: '13600136000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2024-08-01T09:00:00.000Z',
          visit_end_time: '2024-08-01T17:00:00.000Z',
          visit_purpose: '测试草稿消费',
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('再次进入时草稿已被消费，返回 null', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      // 草稿已删除，data 为 null（前端收到 null 后显示空表单）
      expect(res.body.data).toBeNull();
    });
  });

  // ============================================================
  // 补充场景：草稿 API 入参校验
  // ============================================================
  describe('补充：草稿 API 入参校验', () => {
    it('POST /api/drafts 缺少 session_id 返回错误', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({ form_data: { visitor_name: '无 session' } });

      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    it('POST /api/drafts 缺少 form_data 返回错误', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({ session_id: 'fk29-validation-test' });

      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    it('GET /api/drafts 缺少 session_id 返回错误', async () => {
      const res = await request(app).get('/api/drafts');

      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    it('GET /api/drafts 不存在的 session 返回 null（非 404）', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: 'nonexistent-session-fk29' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toBeNull();
    });
  });

  // ============================================================
  // 补充场景：退回重提草稿的隔离性
  // ============================================================
  describe('补充：退回重提草稿与新建草稿隔离', () => {
    const SESSION = 'fk29-isolation';
    let appId: string;

    it('保存新建场景草稿', async () => {
      const res = await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          form_data: { visitor_name: '新建草稿' },
        });
      expect(res.status).toBe(200);
    });

    it('创建一个申请并退回', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          session_id: SESSION,
          visitor_name: '隔离测试申请人',
          phone: '13500135000',
          visitor_count: 1,
          is_driving: false,
          contact_person: '对接人',
          department_id: deptId,
          visit_start_time: '2024-09-01T09:00:00.000Z',
          visit_end_time: '2024-09-01T17:00:00.000Z',
          visit_purpose: '隔离测试',
        });
      appId = createRes.body.data.id;

      // 注意：POST /api/applications 会清理新建草稿
      // 所以这里先保存退回草稿
      await request(app)
        .post('/api/drafts')
        .send({
          session_id: SESSION,
          application_id: appId,
          form_data: { visitor_name: '退回修改草稿' },
        });
    });

    it('退回草稿带 application_id，与新建草稿隔离', async () => {
      const res = await request(app)
        .get('/api/drafts')
        .query({ session_id: SESSION, application_id: appId });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.application_id).toBe(appId);

      const formData =
        typeof res.body.data.form_data === 'string'
          ? JSON.parse(res.body.data.form_data)
          : res.body.data.form_data;
      expect(formData.visitor_name).toBe('退回修改草稿');
    });
  });
});
