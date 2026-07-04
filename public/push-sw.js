// Web Push handlers, pulled into the generated service worker via workbox
// importScripts. Payload shape (JSON): { title, body, tag?, url? }
self.addEventListener('push', (event) => {
  let data = { title: 'LifeFlow', body: '' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: data.tag || 'lifeflow',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && url !== '/') client.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
