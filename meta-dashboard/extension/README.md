# Extensão Grupo Don · Contas de anúncios

Avisa o painel quando um gestor abre uma conta de anúncios de cliente no Gerenciador da Meta.

- Lê **só o endereço** da aba em `business.facebook.com` e `adsmanager.facebook.com` (a conta em `?act=`). Não lê o conteúdo da página.
- Só registra conta que é de cliente da agência. Outras contas não geram nada.
- Envia a conta, o horário e o tempo com a aba ativa (a cada ~30 s), com o token pessoal de cada pessoa.
- Enquanto está ligada numa conta de cliente, a tela ganha um brilho suave nas bordas e um selo "Grupo Don · cliente" no canto: o aviso de que o acesso está sendo registrado.

## Instalar (teste)
1. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor**.
2. **Carregar sem compactação** e escolha esta pasta.
3. Abra o painel (`dashboard.dondigital.com.br`) com o seu login. A extensão se conecta sozinha em alguns segundos (o ícone mostra "Conectada como …"). Só se isso falhar, copie o token em **Extensão** (menu do perfil) e cole no ícone.

## Para toda a equipe
Publicar como "não listada" na Chrome Web Store ou instalar por política do Google Workspace (Console de administração → Dispositivos → Chrome → Apps e extensões), o que força a instalação e impede desligar.
