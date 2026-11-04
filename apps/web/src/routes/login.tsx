import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { authStatusQuery, useLogin } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { Button, buttonClass } from '../components/ui/Button';
import { ErrorNote } from '../components/ui/ErrorNote';
import { TextField } from '../components/ui/fields';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ error: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { error: urlError } = Route.useSearch();
  const status = useQuery(authStatusQuery).data;
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <AuthLayout title={t('auth.signInTitle')}>
      {urlError === 'oidc_failed' && !login.error && (
        <p role="alert" className="mb-4 rounded-md bg-red-soft px-3 py-2 text-red">
          {t('errors.oidc_failed')}
        </p>
      )}
      <ErrorNote error={login.error} className="mb-4" />
      {status?.localLogin !== false && (
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label={t('auth.username')}
            value={username}
            onChange={setUsername}
            autoComplete="username"
            autoFocus
            isRequired
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            isRequired
          />
          <Button type="submit" variant="primary" isDisabled={login.isPending}>
            {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </Form>
      )}
      {status?.oidc.enabled && (
        <>
          {status.localLogin && (
            <p className="my-4 text-center text-caption text-ink-muted">{t('auth.or')}</p>
          )}
          <a href="/api/v1/auth/oidc/start" className={buttonClass('secondary', 'w-full')}>
            {t('auth.sso', { label: status.oidc.label })}
          </a>
        </>
      )}
    </AuthLayout>
  );
}
