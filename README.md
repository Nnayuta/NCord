# 💕 LoveChat (NCord) — Streaming P2P, Voz, Vídeo e Compartilhamento de Tela Ultra HD

<div align="center">
  <img src="public/icon-512.png" width="128" height="128" alt="LoveChat Logo" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(244, 63, 142, 0.4);" />

  ### Nosso cantinho privado de áudio, vídeo, tela e memórias 💕
  
  [![Release](https://img.shields.io/github/v/release/Nnayuta/NCord?color=f43f8e&label=Vers%C3%A3o&style=for-the-badge)](https://github.com/Nnayuta/NCord/releases)
  [![Build & Auto Release](https://img.shields.io/github/actions/workflow/status/Nnayuta/NCord/release.yml?branch=main&label=CI%2FCD%20Releases&style=for-the-badge)](https://github.com/Nnayuta/NCord/actions)
  [![Electron](https://img.shields.io/badge/Electron-44.x-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org/)
  [![React](https://img.shields.io/badge/React-19.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
  [![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

  <p align="center">
    Um aplicativo desktop moderno, seguro e ultrarrápido para casais e amigos transmitirem telas em <b>Ultra HD 60 FPS</b>, conversarem com áudio de alta fidelidade cristalino, compartilharem webcams simultâneas, fotos e recados.
  </p>
</div>

---

## ✨ Recursos Exclusivos & Tecnologias

### 🖥️ Transmissão de Tela Dupla Simultânea (Dual Screen Share)
- **Tudo ao mesmo tempo**: Ambos os participantes podem transmitir suas telas, ligar suas câmeras e conversar por voz simultaneamente, sem interrupções ou telas pretas.
- **Transmissão Ultra HD até 4K 60 FPS (35 Mbps)**: Motor WebRTC otimizado que desativa compressões agressivas de vídeo (`b=AS:35000`), garantindo nitidez impecável para animes, filmes e jogos rápidos.
- **Presets de Qualidade em Tempo Real**:
  - 🚀 **Ultra HD**: 35 Mbps • Até 4K 60 FPS • Foco total em nitidez absoluta.
  - 🎬 **Modo Cinema**: 20 Mbps • 1080p • Otimizado para filmes e streaming de vídeo.
  - 🎮 **Modo Gamer**: 25 Mbps • 60 FPS fluido • Baixíssima latência para jogos.
  - ⚖️ **Equilibrado**: 8 Mbps • 1080p 30 FPS • Ideal para conexões instáveis.

### 🎙️ Mixer de Áudio de Processos (WASAPI Loopback Nativo)
- **Captura Seletiva de Janelas**: Capture apenas o áudio do jogo ou aplicativo que você está transmitindo (ex: Google Chrome, Spotify, Discord, Games) sem transmitir o som de outros programas do Windows.
- **Processador AudioWorklet com Ring Buffer**: Áudio estéreo limpo a 48.000 Hz, sem ruídos, estalos ou distorções.
- **Mixer Multi-Processos**: Adicione e controle o volume de múltiplos programas individualmente na transmissão.

### 📷 Câmera e Voz com Gerenciamento Inteligente de Hardware
- **Liberação Instantânea de Hardware (`track.stop()`)**: Ao desligar a câmera no app, o dispositivo físico é liberado imediatamente no Windows (o LED da webcam apaga e outros programas como OBS podem usá-la).
- **Fallback Inteligente de Constraints**: Suporte automático para webcams 30 FPS, 60 FPS ou virtuais.
- **Detecção de Fala e Indicadores Luminosos**: Bordas verdes e animações em tempo real quando você ou seu parceiro estão falando.

### 🔄 Sistema de Auto-Update Completo (GitHub Releases)
- **Atualização Automática sem Instaladores**: O aplicativo verifica periodicamente a existência de novas versões no repositório GitHub.
- **Download com Progresso em Tempo Real**: Exibe velocidade de download (MB/s), total baixado e notas de atualização (Changelog).
- **Substituição com 1 Clique**: Ao clicar em reiniciar, o aplicativo substitui o executável antigo e reabre a nova versão em menos de 1 segundo.

### 🖼️ Álbum de Memórias & Quadro de Notas
- **Álbum de Fotos Compartilhado**: O anfitrião pode selecionar uma pasta de fotos para navegar juntos em tempo real, com modo Lightbox em tela cheia e zoom.
- **Quadro de Recados**: Crie notas, listas de compras e recados carinhosos sincronizados instantaneamente.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
|---|---|
| **Interface (Frontend)** | React 19, Vite 8, Vanilla CSS Glassmorphism, Lucide Icons |
| **Desktop Runtime** | Electron 44 (Node.js 20, Chromium Integrado) |
| **Comunicação em Tempo Real** | WebRTC Nativo, PeerJS, WebSockets, RTCDataChannel |
| **Captura de Áudio Windows** | WASAPI Loopback (`loopback-capture`), `koffi` (Win32 API), Web Audio API AudioWorklet |
| **CI/CD & Builds** | GitHub Actions (`windows-latest`), `electron-builder` |

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior instalado.
- Git instalado.

### 1. Clonar o Repositório
```bash
git clone https://github.com/Nnayuta/NCord.git
cd NCord
```

### 2. Instalar as Dependências
```bash
npm install
```

### 3. Executar em Modo de Desenvolvimento
Inicia o servidor de sinalização local, o compilador Vite e a janela do Electron simultaneamente com Hot Reload:
```bash
npm run dev:desktop
```

Ou se preferir rodar apenas o servidor e abrir no navegador (`http://localhost:3000`):
```bash
npm run dev
```

---

## 📦 Como Compilar o Executável Portátil (.exe)

Para gerar o arquivo único executável do Windows (`LoveChat.exe`) de forma manual:

```bash
npm run dist
```

O arquivo final será gerado em `dist/LoveChat.exe`. Ele é 100% autônomo, não precisa de instalação e pode ser copiado para qualquer computador.

---

## 🤖 Automação de Releases (GitHub Actions)

O projeto conta com uma pipeline de CI/CD totalmente automatizada em [.github/workflows/release.yml](.github/workflows/release.yml):

### 1. Lançar uma nova versão pelo terminal (1 comando):
```bash
npm run release:patch   # Sobe de 1.0.1 para 1.0.2 e dispara o build no GitHub
npm run release:minor   # Sobe para 1.1.0
npm run release:major   # Sobe para 2.0.0
```

### 2. Lançar uma nova versão pelo GitHub Actions:
1. Acesse a aba **[Actions](https://github.com/Nnayuta/NCord/actions)** no GitHub.
2. Selecione **Build & Auto Release LoveChat** ➔ **Run workflow**.
3. Escolha o incremento (`patch`, `minor` ou `major`).
4. O GitHub Actions atualizará o `package.json`, compilará o `.exe` no Windows e criará a Release pública automaticamente.

---

## 🌐 Como Conectar à Distância (Entre Casas Diferentes)

Para conectar dois computadores em locais diferentes com segurança P2P:

1. **Via ZeroTier ou Tailscale (Recomendado)**:
   - Ambos os computadores entram na mesma rede virtual privada.
   - O computador que atua como **Anfitrião** inicia a sala.
   - O outro computador seleciona **"Conectar Remoto"**, digita o IP do anfitrião (ex: `10.147.17.X`) e clica em **Conectar**.
2. **Via Rede Local (LAN)**:
   - Se ambos estiverem na mesma casa/roteador, o app descobre automaticamente os servidores locais ativos na rede.

---

## 🔒 Privacidade e Segurança

- **100% P2P**: Áudio, vídeo e telas transitam diretamente de computador para computador via WebRTC criptografado de ponta a ponta (DTLS/SRTP).
- **Sem Servidores Externos Gravando Dados**: As fotos, configurações e notas ficam salvas exclusivamente no arquivo local `database.json` da sua máquina (`%APPDATA%/LoveChat/database.json`).

---

## 📄 Licença

Este projeto é de código aberto sob a licença [MIT](LICENSE). Desenvolvido com carinho para conectar corações à distância. 💕
