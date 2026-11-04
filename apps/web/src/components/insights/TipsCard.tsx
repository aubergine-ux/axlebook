import type { Tip, Vehicle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { aiStatusQuery, tipsQuery, useAiTips } from '../../api/extras';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';

const SEVERITY_CLASS: Record<Tip['severity'], string> = {
  warning: 'bg-yellow-soft text-yellow',
  suggestion: 'bg-surface-sunken text-ink',
  info: 'bg-surface-sunken text-ink-muted',
};

/** Tips worked out from the vehicle's own data, plus make- and model-specific ones from the local AI. */
export function TipsCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const tips = useQuery(tipsQuery(vehicle.id));
  const ai = useQuery(aiStatusQuery).data;
  const ask = useAiTips(vehicle.id);
  const list = tips.data?.tips ?? [];
  if (tips.isPending || (list.length === 0 && !ai?.enabled)) return null;
  const hasAi = list.some((x) => x.source === 'ai');

  return (
    <section
      aria-labelledby="tips-h"
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
    >
      <h2 id="tips-h" className="mb-3 text-heading font-semibold">
        {t('tips.title')}
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {list.map((tip) => {
          // Data tips are translated from their code; AI tips bring their own text.
          const title = tip.code
            ? t(`tips.codes.${tip.code}.title` as 'tips.codes.tire_pressure.title', tip.params)
            : tip.title;
          const body = tip.code
            ? t(`tips.codes.${tip.code}.body` as 'tips.codes.tire_pressure.body', tip.params)
            : tip.body;
          return (
            <li key={tip.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-caption font-semibold ${SEVERITY_CLASS[tip.severity]}`}
                >
                  {t(`tips.severity.${tip.severity}`)}
                </span>
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="mt-1 text-ink-muted">{body}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-line pt-4">
        {ai?.enabled ? (
          <div className="flex flex-col gap-2">
            {hasAi && tips.data?.model && (
              <p className="text-caption text-ink-muted">
                {t('tips.fromAi', { model: tips.data.model })}
              </p>
            )}
            {vehicle.access !== 'view' && (
              <Button
                onPress={() => ask.mutate()}
                isDisabled={ask.isPending}
                className="self-start"
              >
                {ask.isPending ? t('tips.asking') : hasAi ? t('tips.askAgain') : t('tips.ask')}
              </Button>
            )}
            <ErrorNote error={ask.error} />
          </div>
        ) : (
          <p className="text-caption text-ink-muted">{t('tips.aiOff')}</p>
        )}
      </div>
    </section>
  );
}
