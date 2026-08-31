import { useCallback, useState } from 'react'
import { ErrorState } from '../../components/ErrorState.jsx'
import { LoadingState } from '../../components/LoadingState.jsx'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { notificationApi } from '../../services/api.js'

export function SellerNotificationsPage() {
  const load = useCallback(() => notificationApi.list(), [])
  const { data, status, error, reload } = useApiQuery(load, null)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState(null)

  async function run(action) {
    setPending(true)
    setActionError(null)
    try {
      await action()
      await reload()
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  if (status === 'loading' || status === 'idle')
    return <LoadingState label="Loading notifications" />
  if (status === 'error') return <ErrorState message={error} onRetry={reload} />

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0

  return (
    <section>
      <p className="eyebrow">Notifications</p>
      <h2>Your alerts</h2>
      <div className="seller-toolbar">
        <span className="seller-subtle">{unreadCount} unread</span>
        {unreadCount > 0 && (
          <button
            type="button"
            className="text-button"
            disabled={pending}
            onClick={() => run(() => notificationApi.markAllRead())}
          >
            Mark all read
          </button>
        )}
      </div>
      {actionError && <ErrorState message={actionError} />}

      {items.length === 0 ? (
        <p className="seller-subtle">No notifications yet.</p>
      ) : (
        <ul className="notification-list">
          {items.map((item) => (
            <li
              key={item._id}
              className={item.status === 'unread' ? 'notification unread' : 'notification'}
            >
              <div className="notification-body">
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
              {item.status === 'unread' && (
                <button
                  type="button"
                  className="text-button"
                  disabled={pending}
                  onClick={() => run(() => notificationApi.markRead(item._id))}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
