import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Users, Store, LayoutGrid, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputPassword,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { BackendApiService } from '../../../services/api/backendApi';
import { getDepartments, getSubDepartments } from '../../../services/hierarchyService';
import type { Department, SubDepartment } from '../../../services/hierarchyService';

const api = new BackendApiService();

const registerSchema = z
  .object({
    email: z.string().email('Please enter a valid email!').min(1, 'Please input your email!'),
    role: z.string().min(1, 'Please select a role!'),
    departmentId: z.string().optional(),
    subDivision: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters!'),
    confirmPassword: z.string().min(1, 'Please confirm your password!'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match!',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);

  const navigate = useNavigate();

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      role: 'CREATOR',
      departmentId: '',
      subDivision: '',
      password: '',
      confirmPassword: '',
    },
  });

  const selectedRole = form.watch('role');
  const selectedDepartmentId = form.watch('departmentId');
  const needsDivision = ['CREATOR', 'APPROVER', 'CATEGORY_HEAD'].includes(selectedRole);
  const needsSubDivision = ['CREATOR', 'APPROVER'].includes(selectedRole);

  useEffect(() => {
    (async () => {
      try {
        const data = await getDepartments();
        setDepartments(data.filter((d) => d.isActive));
      } catch (e) {
        console.error('Failed to load departments', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDepartmentId) {
      setSubDepartments([]);
      return;
    }
    (async () => {
      try {
        const data = await getSubDepartments(Number(selectedDepartmentId));
        setSubDepartments(data.filter((sd) => sd.isActive));
      } catch (e) {
        console.error('Failed to load sub-departments', e);
      }
    })();
  }, [selectedDepartmentId]);

  const onSubmit = async (values: RegisterValues) => {
    setLoading(true);
    try {
      const divisionName = departments.find((d) => String(d.id) === values.departmentId)?.name;
      const result = await api.register(
        values.email,
        values.password,
        values.email.split('@')[0],
        values.role,
        divisionName,
        values.subDivision,
      );
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
    <div
      className="flex min-h-screen items-center justify-center p-5 relative overflow-hidden"
    >
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/90 via-[#FFA62B]/80 to-primary/90"></div>
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white/20 blur-3xl mix-blend-overlay"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-white/20 blur-3xl mix-blend-overlay"></div>
      
      <Card className="w-full max-w-[440px] shadow-2xl glass card-3d z-10 relative">
        <CardContent className="p-8">
          <div className="mb-6 text-center">
            <h1 className="mb-1 text-3xl font-semibold text-primary">Join Us</h1>
            <p className="text-sm text-muted-foreground">Create your AI Fashion Extractor account</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input prefix={<User className="h-4 w-4" />} placeholder="Email" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-11">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Select Role" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CREATOR">Creator</SelectItem>
                          <SelectItem value="PO_COMMITTEE">PO Committee</SelectItem>
                          <SelectItem value="APPROVER">Approver</SelectItem>
                          <SelectItem value="CATEGORY_HEAD">Category Head</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {needsDivision && (
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="h-11">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              <SelectValue placeholder="Select Division" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={String(dept.id)}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needsSubDivision && (
                <FormField
                  control={form.control}
                  name="subDivision"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedDepartmentId}>
                          <SelectTrigger className="h-11">
                            <div className="flex items-center gap-2">
                              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                              <SelectValue placeholder="Select Sub-Division" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {subDepartments.map((sub) => (
                              <SelectItem key={sub.id} value={sub.code}>
                                {sub.name} ({sub.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <InputPassword prefix={<Lock className="h-4 w-4" />} placeholder="Password" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <InputPassword prefix={<Lock className="h-4 w-4" />} placeholder="Confirm Password" className="h-11" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="animate-spin" />}
                Sign Up
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
