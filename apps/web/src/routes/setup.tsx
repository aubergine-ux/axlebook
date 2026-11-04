import { Username } from '@axlebook/shared';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { useSetup } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { ErrorNote } from '../components/ui/ErrorNote';
import { TextField } from '../components/ui/fields';

export const Route = createFileRoute('/setup')({ component: SetupPage });

function SetupPage() {
  const { t } = useTranslation();
  const setup = useSetup();
  const [f, setF] = useState({ username: '', displayName: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors(({ [k]: _, ...rest }) => rest);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!Username.safeParse(f.username).success)
      errs.username =
        f.username.trim().length < 2 ? t('validation.required') : t('validation.username');
    if (f.password.length < 10) errs.password = t('validation.passwordLength');
    else if (f.password !== f.confirm) errs.confirm = t('auth.passwordsDiffer');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setup.mutate({
      username: f.username,
      password: f.password,
      displayName: f.displayName || undefined,
    });
  };

  return (
    <AuthLayout title={t('auth.setupTitle')} intro={t('auth.setupIntro')}>
      <ErrorNote error={setup.error} className="mb-4" />
      <Form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.displayName')}
          value={f.displayName}
          onChange={set('displayName')}
          autoComplete="name"
          autoFocus
        />
        <TextField
          label={t('auth.username')}
          value={f.username}
          onChange={set('username')}
          autoComplete="username"
          error={errors.username}
          isRequired
        />
        <TextField
          label={t('auth.password')}
          description={t('auth.passwordHint')}
          type="password"
          value={f.password}
          onChange={set('password')}
          autoComplete="new-password"
          error={errors.password}
          isRequired
        />
        <TextField
          label={t('auth.confirmPassword')}
          type="password"
          value={f.confirm}
          onChange={set('confirm')}
          autoComplete="new-password"
          error={errors.confirm}
          isRequired
        />
        <Button type="submit" variant="primary" isDisabled={setup.isPending}>
          {t('auth.createAccount')}
        </Button>
      </Form>
    </AuthLayout>
  );
}
