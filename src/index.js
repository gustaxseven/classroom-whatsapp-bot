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

            // Extração robusta de texto
            const text = (
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.imageMessage?.caption || 
                msg.message.videoMessage?.caption || 
                ""
            ).trim().toLowerCase();

            const from = msg.key.remoteJid;

            if (text === '!ping') {
                console.log(`[Comando] !ping recebido de ${from}`);
                await sock.sendMessage(from, { text: '🏓 *Pong!*\n\nO bot está online e monitorando o Google Classroom com sucesso.' });
            }
            
            else if (text === '!help' || text === '!ajuda') {
                console.log(`[Comando] !help recebido de ${from}`);
                await sock.sendMessage(from, { 
                    text: '*🤖 Classroom Bot - Comandos*\n\n' +
                          '*!ping* - Verifica se o bot está online\n' +
                          '*!check* - Força uma verificação de atividades agora\n' +
                          '*!help* - Mostra esta lista de comandos' 
                });
            }

            else if (text === '!check' || text === '!verificar') {
                console.log(`[Comando] !check recebido de ${from}`);
                await sock.sendMessage(from, { text: '🔍 *Iniciando verificação manual...*' });
                
                try {
                    const activities = await checkNewActivities(auth);
                    if (activities.length === 0) {
                        await sock.sendMessage(from, { text: '✅ Nenhuma atividade nova detectada no momento.' });
                    } else {
                        await sock.sendMessage(from, { text: `📢 *Encontradas ${activities.length} novas atividades!* Enviando detalhes...` });
                        for (const activity of activities) {
                            await sock.sendMessage(from, { text: formatActivityMessage(activity) });
                        }
                    }
                } catch (err) {
                    await sock.sendMessage(from, { text: '❌ Erro ao verificar atividades. Tente novamente em instantes.' });
                }
            }
        });

    } catch (err) {
        console.error('💥 Erro fatal ao iniciar o bot:', err);
    }
}

start();
