function formatActivityMessage(activity) {
    return `*📚 NOVA ATIVIDADE DETECTADA!*

*📖 Matéria:* ${activity.courseName}
*👨‍🏫 Professor:* ${activity.teacherName}

*📝 Título:* ${activity.title}
*📅 Entrega:* ${activity.dueDate}

*📋 Descrição:*
${activity.description.length > 500 ? activity.description.substring(0, 500) + '...' : activity.description}

*🔗 Link para acessar:*
${activity.link}

_Bot Classroom Notifier_ 🤖`;
}

module.exports = { formatActivityMessage };
