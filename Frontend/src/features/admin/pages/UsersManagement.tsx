import { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Modal,
  Popconfirm,
  Table,
  Tag,
  Typography,
  message,
  Space,
} from 'antd';
import { PlusOutlined, UserOutlined, ShopOutlined, AppstoreOutlined, EditOutlined, DownloadOutlined, UploadOutlined, SearchOutlined } from '@ant-design/icons';
import { createUser, updateUser, deactivateUser, getUsers, getDepartments, type AdminUser } from '../../../services/adminApi';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const { Title, Text } = Typography;
const { Option } = Select;

const parseSubDivisionList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
};

const normalizeDivisionKey = (value: unknown): string => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';

  if (raw === 'MEN' || raw === 'MENS') return 'MEN';
  if (raw === 'KID' || raw === 'KIDS') return 'KIDS';
  if (raw === 'LADY' || raw === 'LADIES') return 'LADIES';

  return raw;
};

const resolveDivisionForSelect = (division: unknown, options: string[]): string | null => {
  const normalizedTarget = normalizeDivisionKey(division);
  if (!normalizedTarget) return null;

  const exact = options.find((opt) => String(opt).trim().toUpperCase() === String(division ?? '').trim().toUpperCase());
  if (exact) return exact;

  const normalizedMatch = options.find((opt) => normalizeDivisionKey(opt) === normalizedTarget);
  return normalizedMatch ?? String(division).trim().toUpperCase();
};

export default function UsersManagement() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('CREATOR');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form] = Form.useForm();

  const user = localStorage.getItem('user');
  const userData = user ? JSON.parse(user) : null;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getUsers,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () => getDepartments(true), // include sub-depts
  });

  const availableSubDepts = useMemo(() => {
    if (!selectedDeptId) return [];
    const selectedKey = normalizeDivisionKey(selectedDeptId);
    const dept = departments.find((d) => {
      const byName = normalizeDivisionKey(d.name);
      const byCode = normalizeDivisionKey(d.code);
      return byName === selectedKey || byCode === selectedKey;
    });
    const fromDept: { id: number; code: string; name: string }[] = dept?.subDepartments || [];

    // Always include the currently-assigned sub-divisions so they remain selectable
    const existingCodes = parseSubDivisionList(form.getFieldValue('subDivision'));
    const extra = existingCodes
      .filter(code => !fromDept.some(s => s.code === code))
      .map((code, index) => ({ id: -1000 - index, code, name: code }));

    return [...fromDept, ...extra];
  }, [selectedDeptId, departments, form]);

  // Filter users based on search term
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) {
      return users.filter((u) => u.isActive);
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    return users.filter((u) => 
      u.isActive && (
        u.name.toLowerCase().includes(lowerSearchTerm) ||
        u.email.toLowerCase().includes(lowerSearchTerm) ||
        (u.division && u.division.toLowerCase().includes(lowerSearchTerm)) ||
        (u.subDivision && u.subDivision.toLowerCase().includes(lowerSearchTerm)) ||
        u.role.toLowerCase().includes(lowerSearchTerm)
      )
    );
  }, [users, searchTerm]);

  const divisionNames = useMemo(() => {
    const base = ['MEN', 'LADIES', 'KIDS'];
    const fromDepartments = departments.map((d) => String(d.name || '').trim()).filter(Boolean);
    const all = new Set<string>([...base, ...fromDepartments]);
    return Array.from(all);
  }, [departments]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    form.resetFields();
    setSelectedDeptId(null);
    setSelectedRole('CREATOR');
  };

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success('User created successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      closeModal();
    },
    onError: (error: any) => {
      handleMutationError(error, 'Failed to create user');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: any) => updateUser(selectedUser!.id, data),
    onSuccess: () => {
      message.success('User updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      closeModal();
    },
    onError: (error: any) => {
      handleMutationError(error, 'Failed to update user');
    },
  });

  const handleMutationError = (error: any, defaultMsg: string) => {
    let errorMessage = defaultMsg;
    const apiError = error?.response?.data?.error;

    if (typeof apiError === 'string') {
      errorMessage = apiError;
    } else if (Array.isArray(apiError)) {
      errorMessage = apiError.map((e: any) => e.message || JSON.stringify(e)).join(', ');
    } else if (typeof apiError === 'object' && apiError !== null) {
      errorMessage = apiError.message || JSON.stringify(apiError);
    }

    message.error(errorMessage);
  };

  const deactivateUserMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      message.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.error || 'Failed to deactivate user');
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const divisionName = values.departmentId as string;

      const payload = {
        email: values.email,
        password: values.password, // Optional for update
        name: values.name,
        role: values.role,
        division: divisionName,
        subDivision: values.subDivision,
      };

      if (selectedUser) {
        // Update mode
        // Remove password if empty (it's optional in edit)
        if (!payload.password) {
          delete payload.password;
        }
        updateUserMutation.mutate(payload);
      } else {
        // Create mode
        createUserMutation.mutate(payload);
      }
    } catch (error) {
      console.error('Validation failed', error);
    }
  };

  const handleEditUser = (user: AdminUser) => {
    setSelectedUser(user);
    setSelectedRole(user.role);

    const divisionValue = resolveDivisionForSelect(user.division, divisionNames);
    setSelectedDeptId(divisionValue);

    form.setFieldsValue({
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: divisionValue,
      subDivision: parseSubDivisionList(user.subDivision),
      password: '', // Clear password field
    });

    setIsModalOpen(true);
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
  };

  const handleDeptChange = (divName: string) => {
    setSelectedDeptId(divName);
    form.setFieldValue('subDivision', []);
  };

  const downloadBulkTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AI Fashion Extractor';
      workbook.created = new Date();

      const usersSheet = workbook.addWorksheet('Users');
      const listSheet = workbook.addWorksheet('Lists');
      listSheet.state = 'hidden';

      const headers = ['name', 'email', 'password', 'role', 'division', 'subDivision'];
      usersSheet.columns = headers.map((h) => ({ header: h, key: h, width: 24 }));
      usersSheet.getRow(1).font = { bold: true };
      usersSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Example rows
      usersSheet.addRow(['John Creator', 'john.creator@company.com', 'Temp@123', 'CREATOR', 'MEN', 'ML']);
      usersSheet.addRow(['Rita CategoryHead', 'rita.head@company.com', 'Temp@123', 'CATEGORY_HEAD', 'LADIES', '']);

      // Lists for dropdowns
      const roleOptions = ['CREATOR', 'PO_COMMITTEE', 'APPROVER', 'CATEGORY_HEAD', 'ADMIN'];
      const divisionOptions = divisionNames;
      const subDivisionOptions = Array.from(new Set(
        departments.flatMap((d) => (d.subDepartments || []).map((s) => s.code).filter(Boolean))
      ));

      listSheet.getColumn(1).values = [undefined, ...roleOptions];
      listSheet.getColumn(2).values = [undefined, ...divisionOptions];
      listSheet.getColumn(3).values = [undefined, ...subDivisionOptions];

      const roleRange = `Lists!$A$2:$A$${Math.max(roleOptions.length + 1, 2)}`;
      const divisionRange = `Lists!$B$2:$B$${Math.max(divisionOptions.length + 1, 2)}`;
      const subDivisionRange = `Lists!$C$2:$C$${Math.max(subDivisionOptions.length + 1, 2)}`;

      // Add validation for first 500 rows
      for (let row = 2; row <= 500; row += 1) {
        usersSheet.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [roleRange],
          showErrorMessage: true,
          errorStyle: 'warning'
        };
        usersSheet.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [divisionRange],
          showErrorMessage: true,
          errorStyle: 'warning'
        };
        usersSheet.getCell(`F${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [subDivisionRange],
          showErrorMessage: true,
          errorStyle: 'warning'
        };
      }

      usersSheet.getCell('H1').value = 'Notes';
      usersSheet.getCell('H2').value = 'CREATOR/APPROVER: division + subDivision required';
      usersSheet.getCell('H3').value = 'CATEGORY_HEAD: division required, subDivision optional';
      usersSheet.getCell('H4').value = 'ADMIN: division/subDivision optional';
      usersSheet.getCell('H5').value = 'PO_COMMITTEE: division/subDivision not required (free selection at extraction)';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `user-bulk-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to generate template', error);
      message.error('Failed to download template');
    }
  };

  const parseCell = (value: unknown): string => String(value ?? '').trim();

  const handleBulkFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.Sheets['Users'] ? 'Users' : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (!rows.length) {
        message.warning('No rows found in uploaded file');
        return;
      }

      const toRole = (roleRaw: string): AdminUser['role'] | null => {
        const role = roleRaw.toUpperCase();
        if (role === 'CREATOR' || role === 'PO_COMMITTEE' || role === 'APPROVER' || role === 'CATEGORY_HEAD' || role === 'ADMIN') return role;
        return null;
      };

      const divisionToSubDivision = new Map<string, Set<string>>();
      departments.forEach((dept) => {
        const key = String(dept.name || '').trim().toUpperCase();
        const set = new Set((dept.subDepartments || []).map((s) => String(s.code || '').trim().toUpperCase()).filter(Boolean));
        if (key) divisionToSubDivision.set(key, set);
      });

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const line = index + 2;

        const name = parseCell(row.name);
        const email = parseCell(row.email).toLowerCase();
        const password = parseCell(row.password);
        const role = toRole(parseCell(row.role));
        const division = parseCell(row.division) || undefined;
        const subDivisionValues = parseSubDivisionList(parseCell(row.subDivision));
        const subDivision = subDivisionValues.length ? subDivisionValues : undefined;

        if (!name || !email || !password || !role) {
          failed += 1;
          errors.push(`Row ${line}: name/email/password/role are required`);
          continue;
        }

        if ((role === 'CREATOR' || role === 'APPROVER') && (!division || !subDivision)) {
          failed += 1;
          errors.push(`Row ${line}: division + subDivision required for ${role}`);
          continue;
        }

        if (role === 'CATEGORY_HEAD' && !division) {
          failed += 1;
          errors.push(`Row ${line}: division required for ${role}`);
          continue;
        }

        if ((role === 'CREATOR' || role === 'APPROVER') && division && subDivisionValues.length > 0) {
          const allowed = divisionToSubDivision.get(division.toUpperCase());
          const invalidValues = subDivisionValues.filter((sd) => !allowed?.has(sd.toUpperCase()));
          if (allowed && allowed.size > 0 && invalidValues.length > 0) {
            failed += 1;
            errors.push(`Row ${line}: subDivision ${invalidValues.join(', ')} is not valid for division ${division}`);
            continue;
          }
        }

        try {
          await createUser({
            name,
            email,
            password,
            role,
            division: role === 'PO_COMMITTEE' ? undefined : division,
            subDivision: (role === 'CATEGORY_HEAD' || role === 'PO_COMMITTEE') ? undefined : subDivision,
          });
          success += 1;
        } catch (error: any) {
          failed += 1;
          const reason = error?.response?.data?.error || error?.message || 'Unknown error';
          errors.push(`Row ${line}: ${reason}`);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });

      if (success > 0) {
        message.success(`Bulk upload completed: ${success} created, ${failed} failed`);
      } else {
        message.error(`Bulk upload failed for all rows (${failed})`);
      }

      if (errors.length > 0) {
        console.warn('Bulk upload errors:', errors);
        message.warning(`Some rows failed. Check console for details (${errors.length} errors).`);
      }
    } catch (error) {
      console.error('Bulk upload parse failed', error);
      message.error('Invalid file. Please upload the provided Excel template.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: AdminUser['role']) => (
        <Tag color={role === 'ADMIN' ? 'geekblue' : 'default'}>{role}</Tag>
      ),
    },
    {
      title: 'Scope',
      key: 'scope',
      render: (_: any, record: AdminUser) => {
        if (record.role === 'ADMIN') return <Text type="secondary">—</Text>;
        return (
          <Space direction="vertical" size={0}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.division || 'No Division'}
            </Text>
            <Text strong style={{ fontSize: 12 }}>
              {record.subDivision || 'No Sub-Division'}
            </Text>
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'ACTIVE' : 'INACTIVE'}</Tag>
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: AdminUser) => {
        const isSelf = userData?.id === record.id;
        return (
          <Space>
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEditUser(record)}
            >
              Edit
            </Button>
            <Popconfirm
              title="Deactivate user"
              description="This will prevent the user from logging in. Continue?"
              onConfirm={() => deactivateUserMutation.mutate(record.id)}
              okButtonProps={{ danger: true }}
              disabled={!record.isActive || isSelf}
            >
              <Button danger size="small" disabled={!record.isActive || isSelf}>
                Deactivate
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>User Management</Title>
            <Text type="secondary">Add users and manage access roles.</Text>
          </div>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={downloadBulkTemplate}>
              Download Bulk Template
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
              Upload Filled Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
              Add User
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleBulkFileSelected}
            />
          </Space>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search by name, email, division, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: 400 }}
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          />
          {searchTerm && (
            <Text type="secondary" style={{ marginLeft: 12 }}>
              Found {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
            </Text>
          )}
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredUsers}
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No users found' }}
        />
      </Card>

      <Modal
        title={selectedUser ? "Edit User" : "Create User"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createUserMutation.isPending || updateUserMutation.isPending}
        width={500}
        okText={selectedUser ? "Update" : "Create"}
      >
        <Form form={form} layout="vertical" initialValues={{ role: 'CREATOR' }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input placeholder="Full name" prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="name@company.com" disabled={!!selectedUser} />
          </Form.Item>
          <Form.Item
            name="password"
            label={selectedUser ? "Password (leave blank to keep current)" : "Password"}
            rules={[
              { required: !selectedUser, message: 'Please enter password' },
              { min: 6, message: 'Minimum 6 characters' },
            ]}
          >
            <Input.Password placeholder={selectedUser ? "New password (optional)" : "Temporary password"} />
          </Form.Item>
          <Form.Item
            name="role"
            label="Role"
            rules={[{ required: true }]}
          >
            <Select
              onChange={handleRoleChange}
              options={[
                { value: 'CREATOR', label: 'CREATOR' },
                { value: 'PO_COMMITTEE', label: 'PO_COMMITTEE' },
                { value: 'APPROVER', label: 'APPROVER' },
                { value: 'CATEGORY_HEAD', label: 'CATEGORY_HEAD' },
                { value: 'ADMIN', label: 'ADMIN' },
              ]}
            />
          </Form.Item>

          {(selectedRole === 'CREATOR' || selectedRole === 'APPROVER' || selectedRole === 'CATEGORY_HEAD') && (
            <>
              <Form.Item
                name="departmentId"
                label="Division"
                rules={[{ required: true, message: 'Please select division' }]}
              >
                <Select
                  placeholder="Select Division"
                  onChange={handleDeptChange}
                  suffixIcon={<ShopOutlined />}
                >
                  {divisionNames.map(name => (
                    <Option key={name} value={name}>{name}</Option>
                  ))}
                </Select>
              </Form.Item>

              {(selectedRole === 'CREATOR' || selectedRole === 'APPROVER') && (
                <Form.Item
                  name="subDivision"
                  label="Sub-Division"
                  rules={[{ required: true, message: 'Please select sub-division' }]}
                >
                  <Select
                    mode="multiple"
                    placeholder="Select Sub-Division"
                    disabled={!selectedDeptId}
                    suffixIcon={<AppstoreOutlined />}
                    maxTagCount="responsive"
                  >
                    {availableSubDepts.map(sub => (
                      <Option key={sub.code} value={sub.code}>{sub.name} ({sub.code})</Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
