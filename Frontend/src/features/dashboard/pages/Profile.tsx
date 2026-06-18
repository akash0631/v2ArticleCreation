import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Descriptions,
  Spinner,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { BackendApiService } from '../../../services/api/backendApi';
import { clearAuthSession, redirectToLoginOnce } from '../../../shared/utils/auth/navigation';

const api = new BackendApiService();

export default function Profile() {
  const [user, setUser] = useState<{ id: string; email: string; role: string; createdAt: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch (error) {
      message.error('Failed to load profile');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    redirectToLoginOnce();
  };

  if (!user && !loading) {
    return (
      <div className="p-6 text-center">
        <Card>
          <CardContent className="pt-6">
            <p>Please log in to view your profile.</p>
            <Button asChild className="mt-4">
              <a href="/login">Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center p-6">
      <Card className="glass card-3d w-full max-w-xl overflow-hidden rounded-2xl border border-white/60">
        {/* Gradient header strip */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: 'linear-gradient(135deg, #FF6F61 0%, #FFA62B 100%)' }}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 shadow-lg ring-2 ring-white/40 backdrop-blur">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="m-0 text-lg font-bold text-white">User Profile</h2>
              <p className="m-0 text-xs text-white/70">Manage your account details</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadProfile}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="shadow-md"
            >
              Logout
            </Button>
          </div>
        </div>
        <CardContent className="p-6">
          <Spinner spinning={loading}>
            {user && (
              <Descriptions bordered column={1}>
                <Descriptions.Item label="User ID">{user.id}</Descriptions.Item>
                <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
                <Descriptions.Item label="Role">{user.role}</Descriptions.Item>
                <Descriptions.Item label="Member Since">
                  {new Date(user.createdAt).toLocaleDateString()}
                </Descriptions.Item>
              </Descriptions>
            )}
          </Spinner>
        </CardContent>
      </Card>
    </div>
  );
}
