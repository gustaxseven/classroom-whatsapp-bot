const { connectToWhatsApp } = require('./modules/whatsapp');
const { authorize } = require('./modules/googleAuth');
const { checkNewActivities } = require('./modules/classroom');
const { formatActivityMessage } = require('./utils/formatter');
require('dotenv').config();

async function start() {
    console.log('🚀 Iniciando Classroom WhatsApp Bot...');

    try {
        // 1. Autenticar no Google
        const auth = await authorize();
        console.log('✅ Autenticação Google Classroom OK!');

        // 2. Conectar ao WhatsApp
        const sock = await connectToWhatsApp();

        // 3. Configurar Monitoramento
        const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5;
        const notificationNumber = process.env.NOTIFICATION_NUMBER;

        if (!notificationNumber) {
            console.warn('⚠️ NOTIFICATION_NUMBER não definido. O bot não saberá para onde enviar as notificações automáticas.');
        }

        console.log(`🕒 Monitoramento iniciado. Verificando a cada ${intervalMinutes} minutos.`);

        // Loop de verificação
        setInterval(async () => {
            try {
                console.log('🔍 Verificando novas atividades...');
                const newActivities = await checkNewActivities(auth);

                if (newActivities.length > 0) {
                    console.log(`📢 ${newActivities.length} novas atividades encontradas!`);
                    
                    for (const activity of newActivities) {
                        const message = formatActivityMessage(activity);
                        
                        if (notificationNumber) {
                            await sock.sendMessage(notificationNumber, { 
                                text: message,
                                contextInfo: {
                                    externalAdReply: {
                                        title: activity.courseName,
                                        body: `Prof: ${activity.teacherName}`,
                                        mediaType: 1,
                                        thumbnailUrl: activity.teacherPhoto || 'https://www.gstatic.com/images/branding/product/2x/classroom_48dp.png',
                                        sourceUrl: activity.link
                                    }
                                }
                            });
                        }
                    }
                } else {
                    console.log('✅ Nenhuma atividade nova.');
                }
            } catch (err) {
                console.error('❌ Erro durante a verificação de atividades:', err.message);
            }
        }, intervalMinutes * 60 * 1000);

        // Lidar com comandos recebidos
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const from = msg.key.remoteJid;

            if (text === '!ping') {
                await sock.sendMessage(from, { text: '🏓 Pong! O bot está online e monitorando o Classroom.' });
            }
            
            if (text === '!help') {
                await sock.sendMessage(from, { text: '*Comandos Disponíveis:*\n\n!ping - Verifica se o bot está online\n!check - Força uma verificação imediata' });
            }

            if (text === '!check') {
                await sock.sendMessage(from, { text: '🔍 Verificando atividades agora...' });
                const activities = await checkNewActivities(auth);
                if (activities.length === 0) {
                    await sock.sendMessage(from, { text: '✅ Nenhuma atividade nova detectada no momento.' });
                } else {
                    await sock.sendMessage(from, { text: `📢 Encontradas ${activities.length} novas atividades! Enviando...` });
                    for (const activity of activities) {
                        await sock.sendMessage(from, { text: formatActivityMessage(activity) });
                    }
                }
            }
        });

    } catch (err) {
        console.error('💥 Erro fatal ao iniciar o bot:', err);
    }
}

start();
