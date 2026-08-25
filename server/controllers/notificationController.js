import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService.js'

export async function notifications(request, response) {
  response.json({ success: true, data: await listNotifications(request.user._id, request.query) })
}
export async function markRead(request, response) {
  response.json({
    success: true,
    data: {
      notification: await markNotificationRead(request.user._id, request.params.notificationId),
    },
  })
}
export async function markAllRead(request, response) {
  await markAllNotificationsRead(request.user._id)
  response.status(204).send()
}
