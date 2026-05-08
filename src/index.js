const { connectToWhatsApp } = require('./modules/whatsapp');
const { authorize } = require('./modules/googleAuth');
const { checkNewActivities, listCourses, getCourseWork, getCourseMaterials, getStudentSubmissions } = require('./modules/classroom');
const { formatActivityMessage, formatReminderMessage } = require('./utils/formatter');
require('dotenv').config();

// Estado global do bot (ligado/desligado apenas para grupos)
let groupsEnabled = true;

async function start() {
    console.log('🚀 Iniciando Classroom WhatsApp Bot...');

    try {
        const auth = await authorize();
        console.log('✅ Autenticação Google Classroom OK!');

        const sock = await connectToWhatsApp();
        const notificationNumber = process.env.NOTIFICATION_NUMBER;
        const ownerLid = process.env.OWNER_LID;

        // Função de verificação periódica
        const performCheck = async () => {
            try {
                console.log(`🔍 [${new Date().toLocaleTimeString()}] Verificando novas atividades...`);
                const newActivities = await checkNewActivities(auth);

                if (newActivities.length > 0) {
                    console.log(`📢 ${newActivities.length} novas atividades encontradas!`);
                    
                    for (const activity of newActivities) {
                        const message = formatActivityMessage(activity);
                        
                        // 1. Enviar para o Dono (Sempre)
                        if (ownerLid) {
                            await sock.sendMessage(ownerLid, { text: `*🔔 NOTIFICAÇÃO PRIVADA*\n\n${message}` });
                        }

                        // 2. Enviar para o Grupo (Se habilitado)
                        if (notificationNumber && groupsEnabled) {
                            try {
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
                            } catch (sendErr) {
                                console.error(`⚠️ Falha ao enviar para o grupo:`, sendErr.message);
                            }
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

        // Loop de Resumo Semanal (Toda segunda-feira às 08:00)
        setInterval(async () => {
            const now = new Date();
            if (now.getDay() === 1 && now.getHours() === 8) {
                try {
                    console.log('📊 Gerando resumo semanal...');
                    const courses = await listCourses(auth);
                    let summary = `*📊 RESUMO SEMANAL DE ATIVIDADES*\n\n`;
                    let hasActivities = false;

                    for (const course of courses) {
                        const activities = await getCourseWork(auth, course.id);
                        const pending = activities.filter(a => a.dueDate);
                        if (pending.length > 0) {
                            summary += `*📘 ${course.name}*\n`;
                            pending.forEach(a => {
                                summary += `> • ${a.title} (${a.dueDate.day}/${a.dueDate.month})\n`;
                            });
                            summary += `\n`;
                            hasActivities = true;
                        }
                    }

                    if (hasActivities) {
                        if (ownerLid) await sock.sendMessage(ownerLid, { text: summary });
                        if (notificationNumber && groupsEnabled) await sock.sendMessage(notificationNumber, { text: summary });
                    }
                } catch (err) {
                    console.error('❌ Erro no resumo semanal:', err.message);
                }
            }
        }, 60 * 60 * 1000);

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

                            if (diffHours > 0 && diffHours <= 24 && !reminderCache.has(activity.id)) {
                                const message = formatReminderMessage({
                                    title: activity.title,
                                    courseName: course.name,
                                    dueDate: `${activity.dueDate.day}/${activity.dueDate.month}/${activity.dueDate.year}`,
                                    link: activity.alternateLink
                                });

                                if (ownerLid) await sock.sendMessage(ownerLid, { text: `*⏰ LEMBRETE PRIVADO*\n\n${message}` });

                                if (notificationNumber && groupsEnabled) {
                                    const groupMetadata = notificationNumber.endsWith('@g.us') ? await sock.groupMetadata(notificationNumber) : null;
                                    const participants = groupMetadata ? groupMetadata.participants.map(p => p.id) : [];

                                    await sock.sendMessage(notificationNumber, { 
                                        text: `@todos\n\n${message}`,
                                        mentions: participants
                                    });
                                }
                                reminderCache.add(activity.id);
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

            const text = (
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.imageMessage?.caption || 
                msg.message.videoMessage?.caption || 
                ""
            ).trim().toLowerCase();

            const from = msg.key.remoteJid;
            const senderLid = msg.key.participant || from;
            const isOwner = senderLid === ownerLid;

            if (text === '/id') {
                const isGroup = from.endsWith('@g.us');
                const response = `*🆔 INFORMAÇÕES DE IDENTIFICAÇÃO*\n\n` +
                                 `*Seu ID/LID:* \`${msg.key.participant || from}\`\n` +
                                 `*ID do Chat:* \`${from}\`\n` +
                                 `*Tipo:* ${isGroup ? 'Grupo' : 'Privado'}`;
                await sock.sendMessage(from, { text: response });
                return;
            }

            if (text === '!ping') {
                await sock.sendMessage(from, { text: '🏓 *Pong!*\n\nO bot está online e monitorando o Google Classroom.' });
            }
            
            else if (text === '!help' || text === '!ajuda' || text === '!menu' || text === '/menu') {
                if (!isOwner) return;
                
                const menuText = `*─── 「 🤖 CLASSROOM BOT 」 ───*

*👋 Olá, Administrador!*
_O bot continua ativo no seu PV mesmo se os grupos estiverem pausados._

*🚀 COMANDOS DE SISTEMA*
> */menu* - Exibe este painel
> *!ping* - Status de conexão
> */id* - Identificador do chat

*📚 GOOGLE CLASSROOM*
> *!check* - Forçar verificação
> *!notas* - Ver notas recentes

*📢 FERRAMENTAS ADMIN*
> *!on* - Ativar notificações nos GRUPOS
> *!off* - Pausar notificações nos GRUPOS
> *!bc [texto]* - Aviso Geral no Grupo

*📊 STATUS DOS GRUPOS:*
> *Notificações:* ${groupsEnabled ? '🟢 ATIVAS' : '🔴 PAUSADAS'}

*──────────────────────*
_Monitoramento privado sempre ativo_`;

                const menuImageUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663618494595/fSWSrzmMEkGGRkqE.png';

                await sock.sendMessage(from, { 
                    image: { url: menuImageUrl },
                    caption: menuText,
                    contextInfo: {
                        externalAdReply: {
                            title: 'CLASSROOM BOT v2.5',
                            body: 'Painel de Controle Administrativo',
                            mediaType: 1,
                            thumbnailUrl: menuImageUrl,
                            sourceUrl: 'https://github.com/gustaxseven/classroom-whatsapp-bot'
                        }
                    }
                });
            }

            else if (text === '!on') {
                if (!isOwner) return;
                groupsEnabled = true;
                await sock.sendMessage(from, { text: '🟢 *GRUPOS ATIVADOS*\nAs notificações no grupo foram retomadas.' });
            }

            else if (text === '!off') {
                if (!isOwner) return;
                groupsEnabled = false;
                await sock.sendMessage(from, { text: '🔴 *GRUPOS PAUSADOS*\nAs notificações agora serão enviadas apenas no seu PV.' });
            }

            else if (text.startsWith('!bc ')) {
                if (!isOwner) return;
                const broadcastMsg = text.replace('!bc ', '').trim();
                if (!broadcastMsg || !notificationNumber) return;
                
                await sock.sendMessage(notificationNumber, { 
                    text: `*📢 AVISO IMPORTANTE*\n\n${broadcastMsg}\n\n_Enviado por: @${msg.key.participant?.split('@')[0] || from.split('@')[0]}_`,
                    mentions: [msg.key.participant || from]
                });
                await sock.sendMessage(from, { text: '✅ *Broadcast enviado com sucesso!*' });
            }

            else if (text === '!check' || text === '!verificar') {
                if (!isOwner) return;
                await sock.sendMessage(from, { text: '🔍 *Verificando Classroom...*' });
                try {
                    const activities = await checkNewActivities(auth);
                    if (activities.length === 0) await sock.sendMessage(from, { text: '✅ Nenhuma novidade encontrada.' });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ Erro: ${err.message}` });
                }
            }

            else if (text === '!notas') {
                if (!isOwner) return;
                await sock.sendMessage(from, { text: '📊 *Buscando notas...*' });
                try {
                    const courses = await listCourses(auth);
                    let response = `*📊 SUAS NOTAS RECENTES*\n\n`;
                    for (const course of courses) {
                        const activities = await getCourseWork(auth, course.id);
                        let courseGrades = "";
                        for (const activity of activities) {
                            const submissions = await getStudentSubmissions(auth, course.id, activity.id);
                            const graded = submissions.find(s => s.assignedGrade);
                            if (graded) courseGrades += `> • ${activity.title}: *${graded.assignedGrade}/${activity.maxPoints}*\n`;
                        }
                        if (courseGrades) response += `*📘 ${course.name}*\n${courseGrades}\n`;
                    }
                    await sock.sendMessage(from, { text: response });
                } catch (err) {
                    await sock.sendMessage(from, { text: `❌ Erro ao buscar notas: ${err.message}` });
                }
            }
        });

    } catch (err) {
        console.error('💥 Erro fatal ao iniciar o bot:', err);
    }
}

start();
