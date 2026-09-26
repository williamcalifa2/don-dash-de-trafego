// Fala com o painel. Fica aqui (e não na página) porque a página da Meta não pode chamar outro site.
const API = 'https://dashboard.dondigital.com.br'

async function beat({ act, visit, sec }) {
  const { token, enabled } = await chrome.storage.local.get({ token: '', enabled: true })
  if (!enabled) return { tracked: false, reason: 'off' }
  if (!token) { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#d97706' }); return { tracked: false, reason: 'token' } }
  try {
    const r = await fetch(`${API}/api/ext/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ act, visit, sec }) })
    if (r.status === 401) { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); return { tracked: false, reason: 'token' } }
    chrome.action.setBadgeText({ text: '' })
    const j = await r.json().catch(() => ({}))
    return { tracked: !!j.tracked, client: j.client || null }
  } catch { return { tracked: false, reason: 'net' } }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'beat') { beat(msg).then(reply); return true }
  if (msg && msg.type === 'linked') { chrome.action.setBadgeText({ text: '' }); return }
  if (msg && msg.type === 'ping') { beat({ act: '10000', visit: 'ping-' + Date.now(), sec: 0 }).then(reply); return true }
})
