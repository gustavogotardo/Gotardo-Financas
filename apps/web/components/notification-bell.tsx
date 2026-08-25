'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type NotificationRecord } from '@/lib/api';
import { formatDate, notificationTypeLabel } from '@/lib/format';
import { Badge, Button, Card, ErrorBox } from '@/components/ui';
import { NotificationPreferences } from '@/components/notification-preferences';

const POLL_INTERVAL_MS = 60_000;
const VISIBLE_LIMIT = 10;

function severityTone(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'danger';
    case 'WARNING':
      return 'warning';
    default:
      return 'info';
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiFetch<NotificationRecord[]>('/api/v1/notifications')
      .then((result) => setNotifications(result))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Falha ao carregar notificações.');
      });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visible = notifications.slice(0, VISIBLE_LIMIT);

  async function handleSelect(notification: NotificationRecord) {
    if (!notification.isRead) {
      try {
        const updated = await apiFetch<NotificationRecord>(
          `/api/v1/notifications/${notification.id}/read`,
          { method: 'PATCH' },
        );
        setNotifications((current) =>
          current.map((n) => (n.id === updated.id ? updated : n)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao marcar como lida.');
      }
    }
    if (notification.actionUrl) {
      setOpen(false);
      router.push(notification.actionUrl);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await apiFetch<void>('/api/v1/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar todas como lidas.');
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="notification-anchor" ref={panelRef}>
      <Button type="button" variant="ghost" onClick={() => setOpen((value) => !value)}>
        Notificações
        {unreadCount > 0 ? (
          <span className="notification-badge">
            <Badge tone="danger">{unreadCount}</Badge>
          </span>
        ) : null}
      </Button>

      {open ? (
        <Card className="notification-panel">
          <div className="notification-panel-head">
            <h3>Notificações</h3>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPreferences((value) => !value)}
            >
              {showPreferences ? 'Fechar preferências' : 'Preferências'}
            </Button>
          </div>

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          {!showPreferences ? (
            <>
              {notifications.some((n) => !n.isRead) ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleMarkAllRead()}
                  disabled={markingAll}
                >
                  {markingAll ? 'Marcando…' : 'Marcar todas como lidas'}
                </Button>
              ) : null}

              {visible.length === 0 ? (
                <p className="empty">Nenhuma notificação</p>
              ) : (
                <div className="notification-list">
                  {visible.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className="notification-item"
                      style={{ opacity: notification.isRead ? 0.6 : 1 }}
                      onClick={() => void handleSelect(notification)}
                    >
                      <div className="notification-item-head">
                        <span className="notification-item-title">{notification.title}</span>
                        <Badge tone={severityTone(notification.severity)}>
                          {notificationTypeLabel(notification.type)}
                        </Badge>
                      </div>
                      <span className="notification-item-message">{notification.message}</span>
                      <span className="muted">{formatDate(notification.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <NotificationPreferences />
          )}
        </Card>
      ) : null}
    </div>
  );
}
