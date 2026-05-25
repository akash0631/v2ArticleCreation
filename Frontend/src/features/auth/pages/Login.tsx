import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Loader2 } from 'lucide-react';
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
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { BackendApiService } from '../../../services/api/backendApi';
import { clearLoginRedirectFlag } from '../../../shared/utils/auth/navigation';

const api = new BackendApiService();

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email!').min(1, 'Please enter your email!'),
  password: z.string().min(1, 'Please enter your password!'),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    clearLoginRedirectFlag();
  }, []);

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    try {
      const result = await api.login(values.email, values.password);
      localStorage.setItem('authToken', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      message.success(`Welcome back, ${result.user.name}!`);
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Failed to fetch' || (error.message ?? '').includes('NetworkError')) {
        message.error('Unable to connect to server. Please check your network connection.');
      } else {
        message.error(error.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-start p-5"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.05) 100%), url("/Centric-Page2.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center right',
        backgroundRepeat: 'no-repeat',
        paddingLeft: '15vw',
      }}
    >
      <Card
        className="w-full max-w-[440px] rounded-xl border-white/45 bg-white/85 shadow-2xl backdrop-blur"
      >
        <CardContent className="p-8">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-semibold text-primary">Automatic Article Creation</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage your fashion catalog</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        prefix={<User className="h-4 w-4" />}
                        placeholder="Enter your email address"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <InputPassword
                        prefix={<Lock className="h-4 w-4" />}
                        placeholder="Enter your password"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={loading} className="mt-6 h-12 w-full text-base font-medium">
                {loading && <Loader2 className="animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
