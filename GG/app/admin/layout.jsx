import AdminNavigation from './AdminNavigation';
import { getCurrentAdminUser } from '@/lib/admin-session';

export const metadata = {
  title: 'Admin',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function AdminLayout({ children }) {
  const user = await getCurrentAdminUser();

  return (
    <div className={`admin-shell min-h-screen bg-[#f4f6fb] text-[#172033]${user ? '' : ' admin-auth-shell'}`}>
      {user ? <AdminNavigation user={user} /> : null}
      {children}
    </div>
  );
}
