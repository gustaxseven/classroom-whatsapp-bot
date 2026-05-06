function formatActivityMessage(activity) {
    const agendaLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(activity.title)}&details=${encodeURIComponent(activity.description)}&location=${encodeURIComponent(activity.link)}`;

    let materialsText = "";
    if (activity.materials && activity.materials.length > 0) {
        materialsText = "\n*📂 ANEXOS ENCONTRADOS:*\n";
        activity.materials.forEach(m => {
            if (m.driveFile) materialsText += `> • 📄 ${m.driveFile.driveFile.title}\n>   🔗 ${m.driveFile.driveFile.alternateLink}\n`;
            if (m.youtubeVideo) materialsText += `> • 🎥 Vídeo: ${m.youtubeVideo.title}\n>   🔗 ${m.youtubeVideo.alternateLink}\n`;
            if (m.link) materialsText += `> • 🔗 Link: ${m.link.title}\n>   🔗 ${m.link.url}\n`;
            if (m.form) materialsText += `> • 📝 Formulário: ${m.form.title}\n>   🔗 ${m.form.formUrl}\n`;
        });
    }

    return `*📚 NOVA ATIVIDADE DETECTADA!*

*📖 Matéria:* ${activity.courseName}
*👨‍🏫 Professor:* ${activity.teacherName}

*📝 Título:* ${activity.title}
*📅 Entrega:* ${activity.dueDate}

*📋 Descrição:*
${activity.description.length > 500 ? activity.description.substring(0, 500) + '...' : activity.description}
${materialsText}
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
