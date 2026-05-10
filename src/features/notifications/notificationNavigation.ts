import type { NotificationResponse } from "expo-notifications"
import type { Router } from "expo-router"

export function handleNotificationResponse(
  response: NotificationResponse,
  router: Router,
): void {
  const meetingId =
    response.notification.request.content.data?.meetingId
  if (meetingId) {
    router.push(`/meeting/${meetingId}`)
  }
}
