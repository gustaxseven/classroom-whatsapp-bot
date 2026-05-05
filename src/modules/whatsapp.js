const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const logger = pino({ level: 'silent' });

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '../../config/auth_info'));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false, // Desativado para usar Pairing Code
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    // Lógica de Pairing Code
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER;
        if (!phoneNumber) {
            console.error('ERRO: WHATSAPP_PHONE_NUMBER não definido no .env');
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                // Remove qualquer caractere não numérico para o código de pareamento
                const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNumber);
                console.log('\n' + '='.repeat(30));
                console.log(`CÓDIGO DE PAREAMENTO: ${code}`);
                console.log('='.repeat(30));
                console.log('Abra o WhatsApp > Aparelhos Conectados > Conectar com número de telefone e insira o código acima.\n');
            } catch (err) {
                console.error('Erro ao solicitar código de pareamento:', err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada devido a', lastDisconnect.error, ', reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexão com WhatsApp estabelecida com sucesso!');
            // Enviar mensagem de confirmação apenas para o DONO (Privado)
            const ownerLid = process.env.OWNER_LID;
            if (ownerLid) {
                await sock.sendMessage(ownerLid, { 
                    text: '✅ *Classroom Bot Online!*\n\nO bot foi conectado com sucesso e já está monitorando suas atividades do Google Classroom.' 
                });
            }
        }
    });

    return sock;
}

module.exports = { connectToWhatsApp };
