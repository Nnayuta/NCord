# 💜 NCord - Streaming P2P, Voz, Vídeo e Compartilhamento de Tela

Um aplicativo moderno, privado e leve para streaming de tela, chamadas de voz e vídeo ponto a ponto (P2P), desenvolvido com **Electron**, **Node.js**, **Express** e **WebRTC**.

Projetado especialmente para casais, amigos ou duplas que desejam um espaço íntimo e seguro para conversar, assistir a filmes e jogar juntos com transmissão em alta resolução e 60 FPS.

---

## ✨ Principais Recursos

- 🚀 **Conexão Direta P2P (WebRTC)**: Conexão direta entre os participantes, sem servidores de terceiros espionando sua chamada ou gravando seus dados.
- 🖥️ **Transmissão de Janelas ou Telas (até 60 FPS)**: Suporte para transmitir uma janela de aplicativo específica (Google Chrome, jogos, reprodutores de mídia) ou a área de trabalho inteira, com captura de áudio do sistema (loopback).
- 👤 **Identidade & Perfis Personalizáveis**:
  - Seletor de perfil no início com persistência automática no computador.
  - Edição de apelidos e upload de fotos de perfil em tempo real com sincronização instantânea.
- 📝 **Quadro de Notas Compartilhado**: Crie recados, listas de desejos e desafios interativos salvos automaticamente no banco de dados local.
- 📦 **Executável Único Portátil**: Não requer instalação de Node.js nem instaladores pesados — basta abrir o `.exe` e usar.
- 🌐 **Hospedagem Híbrida**: Um usuário pode atuar como servidor local ou ambos podem se conectar através de redes virtuais privadas (como **ZeroTier**, **Tailscale** ou **Radmin VPN**).

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5, Vanilla CSS3 (Design inspirado no Discord/LoveChat), JavaScript ES6+, [Lucide Icons](https://lucide.dev/)
- **Processo Principal / Desktop**: [Electron](https://www.electronjs.org/)
- **Backend / Sinalização**: Node.js, Express, [PeerJS Server](https://peerjs.com/)
- **Comunicação em Tempo Real**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`, `getDisplayMedia`)

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior
- Gerenciador de pacotes `npm`

### 1. Clonar o Repositório
```bash
git clone https://github.com/SEU_USUARIO/NCord.git
cd NCord
```

### 2. Instalar as Dependências
```bash
npm install
```

### 3. Executar em Modo de Desenvolvimento
Para iniciar a aplicação com a interface desktop do Electron:
```bash
npm run electron
```
Ou para iniciar apenas o servidor web (acessível pelo navegador em `http://localhost:3000`):
```bash
npm start
```

---

## 📦 Como Compilar o Executável Portátil (.exe)

Para gerar o arquivo único portátil do Windows (`NCord.exe`):

```bash
npm run dist
```

O executável final será gerado dentro da pasta `dist/NCord.exe`. Ele é 100% autônomo e pode ser enviado diretamente para o seu parceiro sem necessidade de instalar dependências.

---

## 🌐 Como Conectar à Distância (Entre Casas Diferentes)

Para conectar dois computadores que não estão na mesma rede Wi-Fi/cabeada, recomenda-se o uso de uma rede P2P virtual gratuita:

1. **ZeroTier** ou **Tailscale**:
   - Ambos os computadores entram na mesma rede privada.
   - Quem clicar em **"Hospedar Sala"** copia seu IP atribuído pela VPN.
   - Quem estiver no outro computador escolhe a aba **"Conectar Remoto"**, insere o IP do parceiro e clica em **"Conectar"**.
2. **Rede Local (LAN)**:
   - Se ambos estiverem na mesma casa, basta usar o endereço IP local (ex: `192.168.1.X`).

---

## 💾 Banco de Dados Local (`database.json`)

- O aplicativo utiliza um arquivo local chamado `database.json` para armazenar os perfis dos usuários, fotos em cache e notas do quadro.
- **Privacidade Total**: O `database.json` está incluído no `.gitignore` e não é enviado ao GitHub. Ao abrir o aplicativo pela primeira vez, o sistema cria automaticamente esse arquivo na hora com perfis padrão que você pode personalizar livremente.

---

## 📄 Licença

Este projeto é de código aberto sob a licença [MIT](LICENSE). Sinta-se livre para usar, modificar e compartilhar!
