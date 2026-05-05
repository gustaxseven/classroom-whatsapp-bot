# 🤖 Classroom WhatsApp Bot

Este bot de WhatsApp, desenvolvido em Node.js com a biblioteca Baileys, integra-se ao Google Classroom para monitorar automaticamente novas atividades e enviar notificações personalizadas via WhatsApp. Ele é projetado para rodar no Termux (Android), utilizando conexão por código de pareamento, garantindo compatibilidade com dispositivos móveis.

## ✨ Funcionalidades

- **Autenticação Segura**: Utiliza OAuth 2.0 para autenticação com a API do Google Classroom.
- **Monitoramento Contínuo**: Verifica novas atividades (courseWork) no Google Classroom em intervalos configuráveis.
- **Notificações Detalhadas**: Envia mensagens formatadas no WhatsApp com:
  - Nome da atividade
  - Nome da matéria (curso)
  - Nome do professor responsável
  - Foto do professor (se disponível)
  - Data de entrega
  - Descrição da atividade
  - Link direto para a atividade
- **Formatação Rica**: Mensagens com emojis, espaçamento e organização visual clara.
- **Cache Inteligente**: Evita notificações duplicadas de atividades já reportadas.
- **Reconexão Automática**: Garante que o bot permaneça online mesmo após quedas de conexão.
- **Sessão Persistente**: Armazena a sessão do WhatsApp localmente, eliminando a necessidade de parear a cada reinício.
- **Comandos Interativos**: Responde a comandos simples no WhatsApp (`!ping`, `!check`, `!help`).

## ⚙️ Requisitos Técnicos

- Node.js (versão 16 ou superior)
- Termux (Android)
- Uma conta Google com acesso ao Google Classroom
- Um número de telefone WhatsApp ativo para o bot

## 🚀 Instalação e Configuração no Termux

Siga os passos abaixo para configurar e rodar o bot no seu dispositivo Android via Termux.

### 1. Instalar Termux

Baixe e instale o aplicativo Termux na Google Play Store ou F-Droid.

### 2. Configurar Termux

Abra o Termux e execute os seguintes comandos para atualizar os pacotes e instalar as dependências essenciais:

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y
pkg install git -y
pkg install ffmpeg -y # Necessário para algumas funcionalidades do Baileys, embora não diretamente usado neste bot
```

### 3. Clonar o Repositório do Bot

```bash
git clone https://github.com/seu-usuario/classroom-whatsapp-bot.git # Substitua pelo seu repositório ou crie a pasta manualmente
cd classroom-whatsapp-bot
```

Se você não clonou de um repositório, crie a pasta `classroom-whatsapp-bot` e os arquivos dentro dela conforme a estrutura de pastas.

### 4. Instalar Dependências do Node.js

Dentro da pasta `classroom-whatsapp-bot`, instale as dependências:

```bash
npm install
```

### 5. Configurar Credenciais do Google Cloud

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um novo projeto (ou use um existente).
3.  Vá para 
`APIs e Serviços > Biblioteca` e habilite as seguintes APIs:
    - `Google Classroom API`
    - `Google People API` (para informações do professor)
4.  Vá para `APIs e Serviços > Credenciais`.
5.  Clique em `Criar Credenciais > ID do cliente OAuth`.
6.  Selecione `Aplicativo da Web` como tipo de aplicativo.
7.  Adicione `http://localhost:3000` (ou o valor de `GOOGLE_REDIRECT_URI` que você usará) como `URIs de redirecionamento autorizados`.
8.  Após criar, você receberá seu `ID do Cliente` e `Segredo do Cliente`. Guarde-os.

### 6. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (`classroom-whatsapp-bot`) com base no `.env.example`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais e configurações:

```ini
# Configurações do Google Cloud Console
GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000 # Deve ser o mesmo configurado no Google Cloud Console

# Configurações do Bot
WHATSAPP_PHONE_NUMBER=5511999999999 # Seu número de telefone com código do país, sem + ou outros caracteres
CHECK_INTERVAL_MINUTES=5 # Intervalo de verificação de novas atividades em minutos
NOTIFICATION_NUMBER=5511999999999@s.whatsapp.net # Número para onde as notificações serão enviadas (com @s.whatsapp.net)
```

**Importante**: O `WHATSAPP_PHONE_NUMBER` deve ser o número do telefone que você usará para parear o bot, no formato `DDICODIGO` (ex: `5511999999999`). O `NOTIFICATION_NUMBER` é o JID (Jabber ID) do contato ou grupo para onde as mensagens serão enviadas. Para um contato, é `5511999999999@s.whatsapp.net`.

### 7. Executar o Bot

```bash
npm start
```

Na primeira execução, o bot solicitará a autenticação do Google Classroom. Siga as instruções no terminal:

1.  Um link será exibido no terminal. Copie e cole-o em um navegador.
2.  Faça login com sua conta Google e conceda as permissões necessárias.
3.  Você será redirecionado para uma página (provavelmente `localhost`). Copie a URL completa da página para a qual você foi redirecionado ou apenas o código de autorização (o valor do parâmetro `code` na URL).
4.  Cole a URL completa ou o código de autorização de volta no terminal do Termux e pressione Enter.

Em seguida, o bot solicitará o pareamento do WhatsApp:

1.  Um **código de pareamento** será exibido no terminal.
2.  No seu celular, abra o WhatsApp, vá em `Configurações > Aparelhos Conectados > Conectar um aparelho`.
3.  Em vez de escanear o QR Code, escolha a opção `Conectar com número de telefone`.
4.  Insira o código de pareamento fornecido pelo bot no Termux.

Após a autenticação e pareamento, o bot estará online e começará a monitorar o Google Classroom.

## 📁 Estrutura de Pastas

```
classroom-bot/
├── src/
│   ├── index.js
│   ├── modules/
│   │   ├── classroom.js
│   │   ├── googleAuth.js
│   │   └── whatsapp.js
│   └── utils/
│       └── formatter.js
├── config/
│   ├── auth_info/ # Gerado pelo Baileys para sessão do WhatsApp
│   ├── cache.json # Gerado pelo bot para cache de atividades
│   └── token.json # Gerado pelo bot para token do Google
├── .env.example
├── .env
├── package.json
├── package-lock.json
└── README.md
```

## 📚 Bibliotecas Utilizadas

-   `@whiskeysockets/baileys`: Para conexão com a API do WhatsApp.
-   `googleapis`: Cliente oficial do Google para interagir com as APIs do Google (Classroom, People).
-   `pino`: Logger eficiente para Node.js.
-   `dotenv`: Para carregar variáveis de ambiente de um arquivo `.env`.
-   `node-cache`: Para cache de dados em memória (usado para evitar notificações duplicadas).
-   `readline`: Módulo nativo do Node.js para interação via terminal.

## ⚠️ Tratamento de Erros e Reconexão

O bot inclui tratamento básico de erros para falhas de API e perda de conexão do WhatsApp, com lógica de reconexão automática para o WhatsApp. Erros no Google Classroom são logados no console.

## 📝 Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

_Desenvolvido por Manus AI_ 🤖
