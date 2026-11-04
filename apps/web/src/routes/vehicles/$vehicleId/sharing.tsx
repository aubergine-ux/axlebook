import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { directoryQuery, sharesQuery, useShare } from '../../../api/resources';
import { Button } from '../../../components/ui/Button';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { SelectField } from '../../../components/ui/fields';

export const Route = createFileRoute('/vehicles/$vehicleId/sharing')({ component: SharingTab });

function SharingTab() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const shares = useQuery(sharesQuery(id)).data ?? [];
  const people = useQuery(directoryQuery).data ?? [];
  const share = useShare(id);
  const available = people.filter((p) => !shares.some((s) => s.userId === p.id));
  const [who, setWho] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const selected = who || (available[0] ? String(available[0].id) : '');
  const perms = (['view', 'edit'] as const).map((p) => ({
    value: p,
    label: t(`sharing.permissions.${p}`),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6 lg:col-span-2">
        <h2 className="text-heading font-semibold">{t('sharing.title')}</h2>
        <p className="mb-3 text-ink-muted">{t('sharing.intro')}</p>
        <ErrorNote error={share.error} className="mb-3" />
        {shares.length === 0 ? (
          <p className="py-4 text-ink-muted">{t('sharing.empty')}</p>
        ) : (
          <ul>
            {shares.map((s) => (
              <li
                key={s.userId}
                className="flex flex-wrap items-end gap-3 border-b border-line py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 self-center">
                  <span className="block font-semibold">{s.displayName ?? s.username}</span>
                  <span className="font-mono text-caption text-ink-muted">{s.username}</span>
                </span>
                <SelectField
                  label={t('sharing.permission')}
                  value={s.permission}
                  onChange={(p) => share.mutate({ userId: s.userId, permission: p })}
                  options={perms}
                  className="w-40"
                />
                <Button
                  variant="ghost"
                  onPress={() => share.mutate({ userId: s.userId, permission: null })}
                >
                  {t('sharing.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
        {available.length === 0 ? (
          <p className="text-ink-muted">{t('sharing.nobody')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <SelectField
              label={t('sharing.person')}
              value={selected}
              onChange={setWho}
              options={available.map((p) => ({
                value: String(p.id),
                label: p.displayName ? `${p.displayName} (${p.username})` : p.username,
              }))}
            />
            <SelectField
              label={t('sharing.permission')}
              value={permission}
              onChange={setPermission}
              options={perms}
            />
            <Button
              variant="primary"
              isDisabled={!selected || share.isPending}
              onPress={() =>
                share.mutate(
                  { userId: Number(selected), permission },
                  { onSuccess: () => setWho('') },
                )
              }
            >
              {t('sharing.add')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
