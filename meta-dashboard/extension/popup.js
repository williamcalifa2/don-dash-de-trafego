const $ = id => document.getElementById(id)
const st = (t, cls) => { $('st').textContent = t; $('st').className = cls || '' }

chrome.storage.local.get({ token: '', enabled: true }, v => { $('on').checked = v.enabled !== false; $('tk').value = v.token })
$('on').addEventListener('change', () => chrome.storage.local.set({ enabled: $('on').checked }, () => st($('on').checked ? 'Ligada.' : 'Desligada: nada é enviado.', $('on').checked ? 'ok' : '')))
$('save').addEventListener('click', () => {
  const token = $('tk').value.trim()
  chrome.storage.local.set({ token }, () => {
    if (!token) return st('Cole o token do painel.', 'bad')
    st('Testando…')
    chrome.runtime.sendMessage({ type: 'ping' }, res => {
      if (res && res.reason === 'token') st('Token inválido. Copie de novo no painel.', 'bad')
      else if (res && res.reason === 'net') st('Sem conexão com o painel.', 'bad')
      else { chrome.action.setBadgeText({ text: '' }); st('Conectado.', 'ok') }
    })
  })
})
