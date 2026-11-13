import {
  DOCUMENT_TYPES,
  DocumentInput,
  type DocumentType,
  isCommercial,
  type VehicleDocument,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { FileTrigger, Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { documentsQuery, useDocumentAction } from '../../../api/fleet';
import { vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { FormDialog } from '../../../components/ui/FormDialog';
import { SelectField, TextAreaField, TextField } from '../../../components/ui/fields';
import { QueryState } from '../../../components/ui/QueryState';
import { DocumentItem } from '../../../components/vehicles/DocumentItem';
import { fieldErrors } from '../../../lib/validation';

export const Route = createFileRoute('/vehicles/$vehicleId/documents')({
  component: DocumentsTab,
});

const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function DocumentsTab() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const query = useQuery(documentsQuery(id));
  const action = useDocumentAction(id);
  const [editing, setEditing] = useState<VehicleDocument | 'new' | null>(null);
  const [removing, setRemoving] = useState<VehicleDocument | null>(null);
  if (!v) return null;
  const canEdit = v.access !== 'view';
  // The DOT inspection only means something for trucks and trailers.
  const types = DOCUMENT_TYPES.filter((d) => d !== 'dot_inspection' || isCommercial(v.category));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-ink-muted">{t('documents.intro')}</p>
        {canEdit && (
          <Button variant="primary" onPress={() => setEditing('new')}>
            <Icon name="add" size={16} />
            {t('documents.add')}
          </Button>
        )}
      </div>
      <ErrorNote error={action.error} />
      <QueryState query={query}>
        {(list) =>
          list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
              {t('documents.empty')}
            </p>
          ) : (
            <section className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6">
              <ul>
                {list.map((d) => (
                  <DocumentItem
                    key={d.id}
                    document={d}
                    actions={
                      canEdit && (
                        <>
                          <FileTrigger
                            acceptedFileTypes={ACCEPT}
                            defaultCamera="environment"
                            onSelect={(files) => {
                              const file = files?.[0];
                              if (file) action.mutate({ id: d.id, file });
                            }}
                          >
                            <Button isDisabled={action.isPending}>
                              <Icon name="attachment" size={16} />
                              {d.file ? t('documents.replaceFile') : t('documents.addFile')}
                            </Button>
                          </FileTrigger>
                          <Button variant="ghost" onPress={() => setEditing(d)}>
                            {t('actions.edit')}
                          </Button>
                          <Button variant="ghost" onPress={() => setRemoving(d)}>
                            {t('actions.delete')}
                          </Button>
                        </>
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          )
        }
      </QueryState>

      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('documents.add') : t('documents.edit')}
      >
        {editing !== null && (
          <DocumentForm
            vehicleId={id}
            types={types}
            document={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('documents.deleteTitle')}
        confirmLabel={t('actions.delete')}
        isPending={action.isPending}
        onConfirm={() =>
          removing &&
          action.mutate({ id: removing.id, remove: true }, { onSuccess: () => setRemoving(null) })
        }
      >
        {t('documents.deleteBody', { title: removing?.title ?? '' })}
      </ConfirmDialog>
    </div>
  );
}

function DocumentForm({
  vehicleId,
  types,
  document: doc,
  onDone,
}: {
  vehicleId: number;
  types: DocumentType[];
  document?: VehicleDocument;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const action = useDocumentAction(vehicleId);
  const [type, setType] = useState<DocumentType>(doc?.type ?? 'registration');
  const [title, setTitle] = useState(doc?.title ?? '');
  const [number, setNumber] = useState(doc?.number ?? '');
  const [expiresOn, setExpiresOn] = useState(doc?.expiresOn ?? '');
  const [notes, setNotes] = useState(doc?.notes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = {
      type,
      // A blank title takes the name of its type: "Insurance", "Registration".
      title: title.trim() || t(`documents.types.${type}`),
      number,
      expiresOn: expiresOn || null,
      notes,
    };
    const parsed = DocumentInput.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error.issues, t));
    action.mutate({ id: doc?.id, data, file: file ?? undefined }, { onSuccess: onDone });
  };

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={action.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('documents.fields.type')}
          value={type}
          onChange={setType}
          options={types.map((d) => ({ value: d, label: t(`documents.types.${d}`) }))}
        />
        <TextField
          label={t('documents.fields.title')}
          description={t('documents.titleHint')}
          value={title}
          onChange={setTitle}
          error={errors.title}
          maxLength={120}
        />
        <TextField
          label={t('documents.fields.number')}
          value={number}
          onChange={setNumber}
          error={errors.number}
          inputClassName="font-mono"
          maxLength={80}
          autoComplete="off"
        />
        <TextField
          label={t('documents.fields.expiresOn')}
          description={t('documents.expiryHint')}
          type="date"
          value={expiresOn}
          onChange={setExpiresOn}
          error={errors.expiresOn}
          inputClassName="font-mono"
        />
      </div>
      <TextAreaField label={t('documents.fields.notes')} value={notes} onChange={setNotes} />
      <div className="flex flex-wrap items-center gap-3">
        <FileTrigger
          acceptedFileTypes={ACCEPT}
          defaultCamera="environment"
          onSelect={(files) => setFile(files?.[0] ?? null)}
        >
          <Button>
            <Icon name="attachment" size={16} />
            {doc?.file ? t('documents.replaceFile') : t('documents.addFile')}
          </Button>
        </FileTrigger>
        <span className="text-caption text-ink-muted">
          {file?.name ?? doc?.file?.name ?? t('documents.fileHint')}
        </span>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={action.isPending}>
          {action.isPending ? t('actions.saving') : t('actions.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
      </div>
    </Form>
  );
}
