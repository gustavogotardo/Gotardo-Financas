'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type NotificationPreferences as NotificationPreferencesType } from '@/lib/api';
import { notificationTypeLabel } from '@/lib/format';
import { Button, ErrorBox, Spinner } from '@/components/ui';

const NOTIFICATION_TYPES = [
  'BUDGET_EXCEEDED',
  'ANOMALY_DETECTED',
  'GOAL_AT_RISK',
  'DUPLICATE_DETECTED',
  'DOCUMENT_PENDING',
  'ACCOUNT_DUE',
  'RECURRING_GENERATED',
];

export function NotificationPreferences() {
  const [muted, setMuted] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<NotificationPreferencesType>('/api/v1/notifications/preferences')
      .then((result) => {
        if (!cancelled) setMuted(result.mutedNotificationTypes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar preferências.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(type: string) {
    setMuted((current) => {
      const list = current ?? [];
      return list.includes(type) ? list.filter((t) => t !== type) : [...list, type];
    });
  }

  async function save() {
    if (!muted) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<NotificationPreferencesType>(
        '/api/v1/notifications/preferences',
        {
          method: 'PATCH',
          body: JSON.stringify({ mutedNotificationTypes: muted }),
        },
      );
      setMuted(result.mutedNotificationTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar preferências.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notification-preferences">
      <h3>Preferências de notificação</h3>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {loading || !muted ? (
        <Spinner />
      ) : (
        <>
          {NOTIFICATION_TYPES.map((type) => (
            <label key={type} className="notification-preferences-item">
              <input
                type="checkbox"
                checked={!muted.includes(type)}
                onChange={() => toggle(type)}
              />
              {notificationTypeLabel(type)}
            </label>
          ))}
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar preferências'}
          </Button>
        </>
      )}
    </div>
  );
}
