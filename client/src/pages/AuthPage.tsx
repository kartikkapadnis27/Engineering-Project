import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useAuth } from '../context/AuthContext';

export default function AuthPage({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'BUYER' as 'BUYER' | 'SELLER',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        const user = await register({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });

        if (user.role === 'ADMIN') {
          navigate('/owner/dashboard');
          return;
        }

        if (user.role === 'SELLER') {
          navigate('/seller/dashboard');
          return;
        }

        navigate('/projects');
        return;
      }

      const user = await login({ email: form.email, password: form.password });
      if (user.role === 'ADMIN') {
        navigate('/owner/dashboard');
        return;
      }

      if (user.role === 'SELLER') {
        navigate('/seller/dashboard');
        return;
      }

      navigate('/projects');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="container py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-2 text-slate-600">{isRegister ? 'Start selling or buying projects today.' : 'Sign in to continue to your dashboard.'}</p>
          </div>

          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Full name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    placeholder="Your full name"
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Account type
                  <select
                    value={form.role}
                    onChange={(event) => setForm((previous) => ({ ...previous, role: event.target.value as 'BUYER' | 'SELLER' }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <option value="BUYER">Buyer</option>
                    <option value="SELLER">Seller</option>
                  </select>
                </label>
              </>
            )}

            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                placeholder="Enter password"
                required
                minLength={8}
              />
            </label>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Login'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? 'Already have an account?' : 'Need an account?'}{' '}
            <Link to={isRegister ? '/login' : '/register'} className="font-semibold text-brand-600">
              {isRegister ? 'Login now' : 'Register now'}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
