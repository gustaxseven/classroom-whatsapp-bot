const { connectToWhatsApp } = require('./modules/whatsapp');
const { authorize } = require('./modules/googleAuth');
const { checkNewActivities, listCourses, getCourseWork } = require('./modules/classroom');
const { formatActivityMessage, formatReminderMessage } = require('./utils/formatter');
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
        const notificationNumber = process.env.NOTIFICATION_NUMBER;

        if (!notificationNumber) {
            console.warn('⚠️ NOTIFICATION_NUMBER não definido. O bot não saberá para onde enviar as notificações automáticas.');
        }

        console.log(`🕒 Monitoramento automático ativado. Verificando a cada 1 minuto.`);

        // Função de verificação
        const performCheck = async () => {
            try {
                console.log(`🔍 [${new Date().toLocaleTimeString()}] Verificando novas atividades...`);
                const newActivities = await checkNewActivities(auth);

                if (newActivities.length > 0) {
                    console.log(`📢 ${newActivities.length} novas atividades encontradas!`);
                    
                    for (const activity of newActivities) {
                        const message = formatActivityMessage(activity);
                        
                        if (notificationNumber) {
                            const groupMetadata = notificationNumber.endsWith('@g.us') ? await sock.groupMetadata(notificationNumber) : null;
                            const participants = groupMetadata ? groupMetadata.participants.map(p => p.id) : [];

                            await sock.sendMessage(notificationNumber, { 
                                text: `@todos\n\n${message}`,
                                mentions: participants,
                                contextInfo: {
                                    externalAdReply: {
                                        title: activity.courseName,
                                        body: `Professor(a): ${activity.teacherName}`,
                                        mediaType: 1,
                                        renderLargerThumbnail: true,
                                        thumbnailUrl: activity.teacherPhoto,
                                        sourceUrl: activity.link
                                    }
                                }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Erro durante a verificação de atividades:', err.message);
            }
        };

        // Verificação imediata ao iniciar
        performCheck();

        // Loop de verificação (Intervalo de 1 minuto)
        const checkInterval = 60 * 1000; 
        setInterval(performCheck, checkInterval);

        // Loop de Lembretes (Verifica a cada 1 hora)
        const reminderCache = new Set();
        setInterval(async () => {
            try {
                console.log('⏰ Verificando prazos de entrega (Lembretes 24h)...');
                const courses = await listCourses(auth);
                const now = new Date();

                for (const course of courses) {
                    const activities = await getCourseWork(auth, course.id);
                    for (const activity of activities) {
                        if (activity.dueDate) {
                            const dueDate = new Date(activity.dueDate.year, activity.dueDate.month - 1, activity.dueDate.day);
                            const diffHours = (dueDate - now) / (1000 * 60 * 60);

                            // Se faltar entre 0 e 24 horas e ainda não avisou
                            if (diffHours > 0 && diffHours <= 24 && !reminderCache.has(activity.id)) {
                                const message = formatReminderMessage({
                                    title: activity.title,
                                    courseName: course.name,
                                    dueDate: `${activity.dueDate.day}/${activity.dueDate.month}/${activity.dueDate.year}`,
                                    link: activity.alternateLink
                                });

                                if (notificationNumber) {
                                    const groupMetadata = notificationNumber.endsWith('@g.us') ? await sock.groupMetadata(notificationNumber) : null;
                                    const participants = groupMetadata ? groupMetadata.participants.map(p => p.id) : [];

                                    await sock.sendMessage(notificationNumber, { 
                                        text: `@todos\n\n${message}`,
                                        mentions: participants
                                    });
                                    reminderCache.add(activity.id);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Erro no loop de lembretes:', err.message);
            }
        }, 60 * 60 * 1000);

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

            // Comando /id para obter JID e LID
            if (text === '/id') {
                console.log(`[Comando] /id solicitado por ${from}`);
                const isGroup = from.endsWith('@g.us');
                const response = `*🆔 INFORMAÇÕES DE IDENTIFICAÇÃO*\n\n` +
                                 `*Seu ID/LID:* \`${msg.key.participant || from}\`\n` +
                                 `*ID do Chat:* \`${from}\`\n` +
                                 `*Tipo:* ${isGroup ? 'Grupo' : 'Privado'}\n\n` +
                                 `_Mande o ID do Chat para o desenvolvedor configurar as notificações._`;
                await sock.sendMessage(from, { text: response });
                return;
            }

            if (text === '!ping') {
                console.log(`[Comando] !ping recebido de ${from}`);
                await sock.sendMessage(from, { text: '🏓 *Pong!*\n\nO bot está online e monitorando o Google Classroom com sucesso.' });
            }
            
            else if (text === '!help' || text === '!ajuda' || text === '!menu' || text === '/menu') {
                console.log(`[Comando] Menu solicitado por ${from}`);
                
                const menuText = `*╔══════════════════╗*
*║      🤖 CLASSROOM BOT      ║*
*╚══════════════════╝*

*👋 Olá! Eu sou o seu assistente do Google Classroom.*

*📂 COMANDOS DISPONÍVEIS:*

*🚀 GERAL*
> */menu* - Abre este menu
> *!ping* - Verifica o status do bot
> */id* - Mostra o ID deste chat/grupo

*📚 CLASSROOM*
> *!check* - Força verificação de atividades
> *!atividades* - Lista atividades pendentes

*📢 ADMINISTRAÇÃO*
> *!bc [mensagem]* - Envia um aviso para todos

*⏰ LEMBRETES*
> O bot avisa automaticamente *24h antes* do prazo de entrega de cada atividade!

*════════════════════*
_Desenvolvido por Manus AI_`;

                const menuImageUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663618494595/fSWSrzmMEkGGRkqE.png';

                await sock.sendMessage(from, { 
                    image: { url: menuImageUrl },
                    caption: menuText,
                    contextInfo: {
                        externalAdReply: {
                            title: 'CLASSROOM BOT SYSTEM',
                            body: 'Monitoramento em Tempo Real',
                            mediaType: 1,
                            thumbnailUrl: menuImageUrl,
                            sourceUrl: 'https://github.com/gustaxseven/classroom-whatsapp-bot'
                        }
                    }
                });
            }

            else if (text.startsWith('!bc ')) {
                const broadcastMsg = text.replace('!bc ', '').trim();
                if (!broadcastMsg) return;
                
                console.log(`[Broadcast] Enviando mensagem: ${broadcastMsg}`);
                await sock.sendMessage(from, { text: '📢 *Enviando Broadcast...*' });
                
                // Envia para o grupo de notificações configurado
                if (notificationNumber) {
                    await sock.sendMessage(notificationNumber, { 
                        text: `*📢 AVISO IMPORTANTE*\n\n${broadcastMsg}\n\n_Enviado por: @${msg.key.participant?.split('@')[0] || from.split('@')[0]}_`,
                        mentions: [msg.key.participant || from]
                    });
                    await sock.sendMessage(from, { text: '✅ *Broadcast enviado para o grupo com sucesso!*' });
                }
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
