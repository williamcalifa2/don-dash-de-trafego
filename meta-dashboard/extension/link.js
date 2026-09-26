// Roda só no painel da Grupo Don. Recebe da página o token de quem está logado e guarda na extensão: sem copiar nada à mão.
(() => {
  const ORIGIN = location.origin
  const hello = () => window.postMessage({ source: 'don-ext', type: 'hello' }, ORIGIN)

  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== ORIGIN) return
    const d = e.data
    if (!d || d.source !== 'don-app' || d.type !== 'token') return
    if (typeof d.token !== 'string' || d.token.length > 400 || !d.token.includes('.')) return
    chrome.storage.local.set({ token: d.token, email: typeof d.email === 'string' ? d.email.slice(0, 120) : '' }, () => {
      chrome.runtime.sendMessage({ type: 'linked' }, () => void chrome.runtime.lastError)
      window.postMessage({ source: 'don-ext', type: 'linked' }, ORIGIN)
    })
  })

  // A página do painel pode carregar antes ou depois: avisa algumas vezes.
  hello(); setTimeout(hello, 1500); setTimeout(hello, 5000)
})()
