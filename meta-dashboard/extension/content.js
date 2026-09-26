// Roda nas páginas do Gerenciador de Anúncios. Lê só o endereço (a conta) e se a pessoa está mexendo; não lê o conteúdo da página.
(() => {
  const ACT_HOST = /^(business|adsmanager)\.facebook\.com$/
  const BEAT_MS = 30_000
  const IDLE_MS = 60_000

  function actFromUrl() {
    if (!ACT_HOST.test(location.hostname)) return null
    const q = new URLSearchParams(location.search)
    const id = q.get('act') || (/billing_hub|adsmanager|ads\//.test(location.pathname) ? q.get('payment_account_id') || q.get('asset_id') : null)
    return id && /^\d{5,25}$/.test(id) ? id : null
  }

  let enabled = true
  let act = null, visit = null, tracked = false, client = null
  let lastActive = Date.now(), lastBeat = 0

  ;['mousemove', 'keydown', 'scroll', 'click', 'wheel'].forEach(ev => window.addEventListener(ev, () => { lastActive = Date.now() }, { passive: true, capture: true }))

  // ── Brilho nas bordas: aparece só em conta de cliente da agência, com o Gerenciador aberto e a extensão ligada ──
  let host = null
  function glow(on, name) {
    if (!on) { if (host) { host.remove(); host = null } return }
    if (!host) {
      host = document.createElement('div')
      host.setAttribute('data-don', '')
      host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647'
      const root = host.attachShadow({ mode: 'closed' })
      root.innerHTML = `<style>
        .g{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 2px rgba(143,163,255,.55),inset 0 0 70px 6px rgba(143,163,255,.22),inset 0 0 160px 20px rgba(143,163,255,.10);animation:p 5s ease-in-out infinite}
        .t{position:fixed;left:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;background:rgba(143,163,255,.92);box-shadow:0 4px 18px rgba(80,100,220,.35);backdrop-filter:blur(4px)}
        .d{width:8px;height:8px;border-radius:50%;background:#1d4ed8}
        @keyframes p{0%,100%{opacity:.75}50%{opacity:1}}
        @media (prefers-reduced-motion:reduce){.g{animation:none}}
      </style><div class="g"></div><div class="t"><span class="d"></span><span id="n"></span></div>`
      document.documentElement.appendChild(host)
      host._n = root.getElementById('n')
    }
    if (host._n) host._n.textContent = name ? `Grupo Don · ${name}` : 'Grupo Don'
  }

  function send(sec) {
    if (!act || !visit) return
    lastBeat = Date.now()
    try {
      chrome.runtime.sendMessage({ type: 'beat', act, visit, sec }, res => {
        if (chrome.runtime.lastError || !res) return
        tracked = !!res.tracked; client = res.client || null
        glow(enabled && tracked, client)
      })
    } catch { /* extensão recarregada: a próxima página pega de novo */ }
  }

  function tick() {
    const now = actFromUrl()
    if (now !== act) {
      act = now
      visit = now ? (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) : null
      tracked = false; client = null; glow(false)
      if (act && enabled) send(0)
      return
    }
    if (!act || !enabled) return
    if (Date.now() - lastBeat >= BEAT_MS) {
      const active = document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastActive < IDLE_MS
      send(active ? Math.min(45, Math.round((Date.now() - lastBeat) / 1000)) : 0)
    }
  }

  chrome.storage.local.get({ enabled: true }, v => { enabled = v.enabled !== false; tick() })
  chrome.storage.onChanged.addListener(ch => {
    if (!ch.enabled) return
    enabled = ch.enabled.newValue !== false
    if (!enabled) glow(false)
    else if (act) send(0)
  })
  setInterval(tick, 1000)
})()
