/*
 * Reading King Kulbik's Kick chat from the admin's browser (ported from
 * Fugroo). Kick's chat runs on public Pusher: subscribing to
 * `chatrooms.<id>.v2` needs no token. It lives in the browser because a
 * serverless function can't hold a socket open; the trade is that entries
 * only arrive while the admin panel is open. Who may enter and who wins is
 * still decided on the server.
 */

const PUSHER_URL = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false'

export type ChatMessage = { kickId: string; name: string; text: string }
export type ChatStatus = 'off' | 'connecting' | 'on'

export function readChat(chatroomId: number, onMessage: (m: ChatMessage) => void, onStatus: (s: ChatStatus) => void) {
  let socket: WebSocket | null = null
  let ping = 0
  let retry = 0
  let closed = false

  const open = () => {
    if (closed) return
    onStatus('connecting')
    const ws = new WebSocket(PUSHER_URL)
    socket = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: `chatrooms.${chatroomId}.v2` } }))
      ping = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }))
      }, 30_000)
      onStatus('on')
    }
    ws.onmessage = (event) => {
      let frame: { event?: string; data?: unknown }
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (frame.event === 'pusher:ping') {
        ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
        return
      }
      if (frame.event !== 'App\\Events\\ChatMessageEvent') return
      try {
        // Pusher double-encodes: a JSON string inside JSON
        const body = (typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data) as {
          content?: string
          sender?: { id?: number; username?: string }
        }
        if (!body.sender?.username || typeof body.content !== 'string') return
        onMessage({ kickId: String(body.sender.id ?? body.sender.username), name: body.sender.username, text: body.content })
      } catch {
        /* a malformed frame isn't worth dropping the connection for */
      }
    }
    const dropped = () => {
      window.clearInterval(ping)
      if (closed) return
      onStatus('connecting')
      retry = window.setTimeout(open, 4000)
    }
    ws.onclose = dropped
    ws.onerror = dropped
  }

  open()

  return () => {
    closed = true
    window.clearInterval(ping)
    window.clearTimeout(retry)
    try {
      socket?.close()
    } catch {
      /* already closed */
    }
    onStatus('off')
  }
}
