import { User, LogOut, Settings } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui-tw';
import { clearAuthSession, redirectToLoginOnce } from '../../utils/auth/navigation';

interface ModernAppHeaderProps {
  title?: string;
  user?: { email: string; role: string } | null;
  onLogout?: () => void;
}

export default function ModernAppHeader({
  title = 'Article Creation',
  user,
  onLogout,
}: ModernAppHeaderProps) {
  const handleLogout = () => {
    clearAuthSession();
    if (onLogout) onLogout();
    redirectToLoginOnce();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <img src="/V2retail.png" alt="V2Retail" className="h-8 object-contain" />
        <h1 className="m-0 text-xl font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span>{user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => (window.location.href = '/profile')}>
                <User className="h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="/login">Login</a>
            </Button>
            <Button asChild>
              <a href="/register">Sign Up</a>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
