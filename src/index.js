const { connectToWhatsApp } = require('./modules/whatsapp');
const { authorize } = require('./modules/googleAuth');
const { checkNewContent, listCourses, getCourseWork, getStudentSubmissions } = require('./modules/classroom');
const { formatActivityMessage, formatMaterialMessage, formatReminderMessage } = require('./utils/formatter');
require('dotenv').config();

// Estado global do bot (ligado/desligado apenas para grupos)
let groupsEnabled = true;

async function start() {
    console.log('🚀 Iniciando Classroom WhatsApp Bot...');

    try {
        const auth = await authorize();
        console.log('✅ Autenticação Google Classroom OK!');

        const sock = await connectToWhatsApp();
        const ownerLid = process.env.OWNER_LID;

        console.log(`👑 Dono configurado: ${ownerLid}`);

        // Função para obter todos os grupos onde o bot está
        const getAllGroups = async () => {
            try {
                const chats = await sock.groupFetchAllParticipating();
                return Object.keys(chats);
            } catch (err) {
                console.error('⚠️ Erro ao buscar grupos:', err.message);
                return [];
            }
        };

        // Função de verificação periódica
        const performCheck = async () => {
            try {
                console.log(`🔍 [${new Date().toLocaleTimeString()}] Verificando novidades...`);
                const newItems = await checkNewContent(auth);

                if (newItems.length > 0) {
                    console.log(`📢 ${newItems.length} novas atualizações encontradas!`);
                    
                    const groups = await getAllGroups();

                    for (const item of newItems) {
                        const message = item.type === 'activity' ? formatActivityMessage(item) : formatMaterialMessage(item);
                        
                        // 1. Enviar para o Dono (Sempre com foto)
                        if (ownerLid) {
                            await sock.sendMessage(ownerLid, { 
                                text: `*🔔 NOTIFICAÇÃO PRIVADA*\n\n${message}`,
                                contextInfo: {
                                    externalAdReply: {
                                        title: item.courseName,
                                        body: `Professor(a): ${item.teacherName}`,
                                        mediaType: 1,
                                        renderLargerThumbnail: true,
                                        thumbnailUrl: item.teacherPhoto,
                                        sourceUrl: item.link
                                    }
                                }
                            });
                        }

                        // 2. Enviar para TODOS os Grupos (Se habilitado)
                        if (groupsEnabled && groups.length > 0) {
                            for (const groupId of groups) {
                                try {
                                    const groupMetadata = await sock.groupMetadata(groupId);
                                    const participants = groupMetadata.participants.map(p => p.id);

                                    await sock.sendMessage(groupId, { 
                                        text: `@todos\n\n${message}`,
                                        mentions: participants,
                                        contextInfo: {
                                            externalAdReply: {
                                                title: item.courseName,
                                                body: `Professor(a): ${item.teacherName}`,
                                                mediaType: 1,
                                                renderLargerThumbnail: true,
                                                thumbnailUrl: item.teacherPhoto,
                                                sourceUrl: item.link
                                            }
                                        }
                                    });
                                } catch (sendErr) {
                                    console.error(`⚠️ Falha ao enviar para o grupo ${groupId}:`, sendErr.message);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Erro durante a verificação:', err.message);
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
                        
                        if (groupsEnabled) {
                            const groups = await getAllGroups();
                            for (const groupId of groups) {
                                await sock.sendMessage(groupId, { text: summary });
                            }
                        }
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

                                if (groupsEnabled) {
                                    const groups = await getAllGroups();
                                    for (const groupId of groups) {
                                        try {
                                            const groupMetadata = await sock.groupMetadata(groupId);
                                            const participants = groupMetadata.participants.map(p => p.id);
                                            await sock.sendMessage(groupId, { 
                                                text: `@todos\n\n${message}`,
                                                mentions: participants
                                            });
                                        } catch (e) {}
                                    }
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
            
            // LOG DE DEPURAÇÃO
            console.log(`📩 Mensagem recebida: "${text}" de ${senderLid}`);

            // Normalizar IDs para comparação (remover @lid/@s.whatsapp.net se necessário)
            const normalizedSender = senderLid.split('@')[0];
            const normalizedOwner = ownerLid ? ownerLid.split('@')[0] : null;
            const isOwner = normalizedSender === normalizedOwner;

            if (text === '/id') {
                const isGroup = from.endsWith('@g.us');
                const response = `*🆔 INFORMAÇÕES DE IDENTIFICAÇÃO*\n\n` +
                                 `*Seu ID/LID:* \`${senderLid}\`\n` +
                                 `*ID do Chat:* \`${from}\`\n` +
                                 `*Tipo:* ${isGroup ? 'Grupo' : 'Privado'}`;
                await sock.sendMessage(from, { text: response });
                return;
            }

            if (text === '!ping') {
                await sock.sendMessage(from, { text: '🏓 *Pong!*\n\nO bot está online e monitorando o Google Classroom.' });
            }
            
            else if (text === '!help' || text === '!ajuda' || text === '!menu' || text === '/menu') {
                if (!isOwner) {
                    console.log(`🚫 Acesso negado ao menu para: ${senderLid}`);
                    return;
                }
                
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
> *!on* - Ativar notificações em TODOS os grupos
> *!off* - Pausar notificações em TODOS os grupos
> *!bc [texto]* - Aviso Geral em TODOS os grupos

*📊 STATUS DOS GRUPOS:*
> *Notificações:* ${groupsEnabled ? '🟢 ATIVAS' : '🔴 PAUSADAS'}

*──────────────────────*
_Monitorando atividades e materiais_`;

                const menuImageUrl = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663618494595/fSWSrzmMEkGGRkqE.png';

                try {
                    await sock.sendMessage(from, { 
                        image: { url: menuImageUrl },
                        caption: menuText,
                        contextInfo: {
                            externalAdReply: {
                                title: 'CLASSROOM BOT v2.7',
                                body: 'Painel de Controle Administrativo',
                                mediaType: 1,
                                thumbnailUrl: menuImageUrl,
                                sourceUrl: 'https://github.com/gustaxseven/classroom-whatsapp-bot'
                            }
                        }
                    });
                } catch (menuErr) {
                    console.error('❌ Erro ao enviar menu:', menuErr.message);
                    // Fallback para texto se a imagem falhar
                    await sock.sendMessage(from, { text: menuText });
                }
            }

            else if (text === '!on') {
                if (!isOwner) return;
                groupsEnabled = true;
                await sock.sendMessage(from, { text: '🟢 *GRUPOS ATIVADOS*\nAs notificações em todos os grupos foram retomadas.' });
            }

            else if (text === '!off') {
                if (!isOwner) return;
                groupsEnabled = false;
                await sock.sendMessage(from, { text: '🔴 *GRUPOS PAUSADOS*\nAs notificações agora serão enviadas apenas no seu PV.' });
            }

            else if (text.startsWith('!bc ')) {
                if (!isOwner) return;
                const broadcastMsg = text.replace('!bc ', '').trim();
                if (!broadcastMsg) return;
                
                const groups = await getAllGroups();
                for (const groupId of groups) {
                    await sock.sendMessage(groupId, { 
                        text: `*📢 AVISO IMPORTANTE*\n\n${broadcastMsg}\n\n_Enviado por: @${msg.key.participant?.split('@')[0] || from.split('@')[0]}_`,
                        mentions: [msg.key.participant || from]
                    });
                }
                await sock.sendMessage(from, { text: `✅ *Broadcast enviado para ${groups.length} grupos!*` });
            }

            else if (text === '!check' || text === '!verificar') {
                if (!isOwner) return;
                await sock.sendMessage(from, { text: '🔍 *Verificando Classroom...*' });
                try {
                    const newItems = await checkNewContent(auth);
                    if (newItems.length === 0) await sock.sendMessage(from, { text: '✅ Nenhuma novidade encontrada.' });
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
