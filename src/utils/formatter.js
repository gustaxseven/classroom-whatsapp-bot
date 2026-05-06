function formatActivityMessage(activity) {
    const agendaLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(activity.title)}&details=${encodeURIComponent(activity.description)}&location=${encodeURIComponent(activity.link)}`;

    return `*📚 NOVA ATIVIDADE DETECTADA!*

*📖 Matéria:* ${activity.courseName}
*👨‍🏫 Professor:* ${activity.teacherName}

*📝 Título:* ${activity.title}
*📅 Entrega:* ${activity.dueDate}

*📋 Descrição:*
${activity.description.length > 500 ? activity.description.substring(0, 500) + '...' : activity.description}

*🔗 Link para acessar:*
${activity.link}

*📅 Adicionar à Agenda:*
${agendaLink}

_Bot Classroom Notifier_ 🤖`;
}

function formatReminderMessage(activity) {
    return `*⏰ LEMBRETE DE ENTREGA (24H)*

*⚠️ ATENÇÃO:* A atividade abaixo vence em menos de 24 horas!

*📘 Matéria:* ${activity.courseName}
*📝 Atividade:* ${activity.title}
*📅 Prazo Final:* ${activity.dueDate}

*🔗 Link para não esquecer:*
${activity.link}

*💡 Dica:* Não deixe para a última hora! Boa sorte nos estudos. 🚀`;
}

module.exports = { formatActivityMessage, formatReminderMessage };
