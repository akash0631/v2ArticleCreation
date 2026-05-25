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
    <div className="p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <User className="h-6 w-6" />
            <span>User Profile</span>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadProfile}>
              Refresh
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
