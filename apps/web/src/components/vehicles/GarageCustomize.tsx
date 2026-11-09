import {
  GARAGE_FIELDS,
  type GarageField,
  type GaragePrefs,
  moveInOrder,
  type VehicleSummary,
  vehicleTitle,
} from '@axlebook/shared';
import { useState } from 'react';
import { GridList, GridListItem, useDragAndDrop } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { CheckboxField } from '../records/RecordForm';
import { Button } from '../ui/Button';
import { FormDialog } from '../ui/FormDialog';
import { garageFieldLabel } from './VehicleCard';

/**
 * Pick which figures the garage shows and put vehicles in your own order.
 * `vehicles` arrive in the order currently on screen, so reordering starts from what you see.
 */
export function GarageCustomize({
  isOpen,
  onOpenChange,
  prefs,
  vehicles,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: GaragePrefs;
  vehicles: VehicleSummary[];
  onSave: (patch: Partial<GaragePrefs>) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog isOpen={isOpen} onOpenChange={onOpenChange} title={t('garage.view.customizeTitle')}>
      {isOpen && (
        <Editor
          prefs={prefs}
          vehicles={vehicles}
          onCancel={() => onOpenChange(false)}
          onSave={(patch) => {
            onSave(patch);
            onOpenChange(false);
          }}
        />
      )}
    </FormDialog>
  );
}

function Editor({
  prefs,
  vehicles,
  onCancel,
  onSave,
}: {
  prefs: GaragePrefs;
  vehicles: VehicleSummary[];
  onCancel: () => void;
  onSave: (patch: Partial<GaragePrefs>) => void;
}) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<GarageField[]>(prefs.fields);
  const start = vehicles.map((v) => v.id);
  const [order, setOrder] = useState<number[]>(start);
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const nameOf = (id: number) => {
    const v = byId.get(id);
    return v ? (v.nickname ?? vehicleTitle(v)) : '';
  };

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ 'text/plain': nameOf(Number(k)) })),
    onReorder: (e) => {
      setOrder((current) => {
        const moving = [...e.keys].map(Number);
        const rest = current.filter((id) => !moving.includes(id));
        const target = rest.indexOf(Number(e.target.key));
        const at = e.target.dropPosition === 'before' ? target : target + 1;
        rest.splice(at, 0, ...moving);
        return rest;
      });
    },
  });

  const reordered = order.some((id, i) => id !== start[i]);

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">{t('garage.view.fieldsLabel')}</legend>
        {GARAGE_FIELDS.map((field) => (
          <CheckboxField
            key={field}
            label={garageFieldLabel(t, field)}
            isSelected={fields.includes(field)}
            onChange={(on) =>
              setFields((cur) => GARAGE_FIELDS.filter((x) => (x === field ? on : cur.includes(x))))
            }
          />
        ))}
      </fieldset>

      {order.length > 1 && (
        <div className="flex flex-col gap-2">
          <h3 id="garage-order-h" className="text-label">
            {t('garage.view.orderLabel')}
          </h3>
          <p className="text-caption text-ink-muted">{t('garage.view.orderHint')}</p>
          <GridList
            aria-labelledby="garage-order-h"
            items={order.map((id) => ({ id }))}
            dragAndDropHooks={dragAndDropHooks}
            className="flex flex-col rounded-md border border-line"
          >
            {(item) => {
              const name = nameOf(item.id);
              const i = order.indexOf(item.id);
              return (
                <GridListItem
                  id={item.id}
                  textValue={name}
                  className="flex items-center gap-2 border-b border-line px-2 py-1 outline-none last:border-b-0 data-[dragging]:opacity-50 data-[drop-target]:bg-orange-soft data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus"
                >
                  <Button
                    slot="drag"
                    variant="ghost"
                    aria-label={t('garage.view.drag', { name })}
                    className="cursor-grab px-2"
                  >
                    <Grip />
                  </Button>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <Button
                    variant="ghost"
                    className="px-3"
                    aria-label={t('garage.view.moveUp', { name })}
                    isDisabled={i === 0}
                    onPress={() => setOrder((cur) => moveInOrder(cur, item.id, -1))}
                  >
                    {t('garage.view.up')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3"
                    aria-label={t('garage.view.moveDown', { name })}
                    isDisabled={i === order.length - 1}
                    onPress={() => setOrder((cur) => moveInOrder(cur, item.id, 1))}
                  >
                    {t('garage.view.down')}
                  </Button>
                </GridListItem>
              );
            }}
          </GridList>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onPress={() =>
            onSave({
              fields,
              // Reordering by hand switches the garage to your own order.
              ...(reordered && { order, sort: 'custom' as const }),
            })
          }
        >
          {t('actions.save')}
        </Button>
        <Button onPress={onCancel}>{t('actions.cancel')}</Button>
      </div>
    </div>
  );
}

/** Six-dot drag handle, drawn so it needs no text or icon font. */
function Grip() {
  return (
    <span aria-hidden className="grid grid-cols-2 gap-0.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1 w-1 rounded-full bg-ink-muted" />
      ))}
    </span>
  );
}
