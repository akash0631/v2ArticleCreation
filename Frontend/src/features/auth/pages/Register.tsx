import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, message, Select } from 'antd';
import { UserOutlined, LockOutlined, TeamOutlined, ShopOutlined, AppstoreOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { BackendApiService } from '../../../services/api/backendApi';
import { getDepartments, getSubDepartments } from '../../../services/hierarchyService';
import type { Department, SubDepartment } from '../../../services/hierarchyService';

const { Title, Text } = Typography;
const { Option } = Select;
const api = new BackendApiService();

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('CREATOR');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data.filter(d => d.isActive));
    } catch (error) {
      console.error('Failed to load departments', error);
    }
  };

  const handleDepartmentChange = async (deptId: number) => {
    setSelectedDepartmentId(deptId);
    try {
      const data = await getSubDepartments(deptId);
      setSubDepartments(data.filter(sd => sd.isActive));
    } catch (error) {
      console.error('Failed to load sub-departments', error);
    }
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
  };

  const onFinish = async (values: any) => {
    if (values.password !== values.confirmPassword) {
      message.error('Passwords do not match!');
      return;
    }

    setLoading(true);
    try {
      // Find department name from ID
      const divisionName = departments.find(d => d.id === values.departmentId)?.name;

      const registerData = {
        email: values.email,
        password: values.password,
        name: values.email.split('@')[0], // Use email prefix as name for now
        role: values.role,
        division: divisionName,
        subDivision: values.subDivision // This is the code
      };

      const result = await api.register(registerData.email, registerData.password, registerData.name, registerData.role, registerData.division, registerData.subDivision);

      localStorage.setItem('authToken', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      message.success('Registration successful!');
      navigate('/dashboard');
    } catch (error) {
      message.error('Registration failed. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #FF6F61 0%, #FFA62B 100%)'
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ color: '#FF6F61' }}>Join Us</Title>
          <Text type="secondary">Create your AI Fashion Extractor account</Text>
        </div>

        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>

          <Form.Item name="role" initialValue="CREATOR" rules={[{ required: true }]}>
            <Select
              placeholder="Select Role"
              onChange={handleRoleChange}
              suffixIcon={<TeamOutlined />}
            >
              <Option value="CREATOR">Creator</Option>
              <Option value="APPROVER">Approver</Option>
              <Option value="CATEGORY_HEAD">Category Head</Option>
              <Option value="ADMIN">Admin</Option>
            </Select>
          </Form.Item>

          {(selectedRole === 'CREATOR' || selectedRole === 'APPROVER' || selectedRole === 'CATEGORY_HEAD') && (
            <>
              <Form.Item
                name="departmentId"
                rules={[{ required: true, message: 'Please select a Division!' }]}
              >
                <Select
                  placeholder="Select Division"
                  onChange={handleDepartmentChange}
                  suffixIcon={<ShopOutlined />}
                  loading={departments.length === 0}
                >
                  {departments.map(dept => (
                    <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedRole !== 'CATEGORY_HEAD' && (
                <Form.Item
                  name="subDivision"
                  rules={[{ required: true, message: 'Please select a Sub-Division!' }]}
                >
                  <Select
                    placeholder="Select Sub-Division"
                    suffixIcon={<AppstoreOutlined />}
                    disabled={!selectedDepartmentId}
                    loading={selectedDepartmentId !== null && subDepartments.length === 0}
                  >
                    {subDepartments.map(sub => (
                      <Option key={sub.id} value={sub.code}>{sub.name} ({sub.code})</Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
            </>
          )}

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please input your password!' },
              { min: 6, message: 'Password must be at least 6 characters!' }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            rules={[{ required: true, message: 'Please confirm your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Confirm Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Sign Up
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Text>Already have an account? <Link to="/login">Sign in</Link></Text>
        </div>
      </Card>
    </div>
  );
}