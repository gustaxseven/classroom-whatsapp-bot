const { google } = require('googleapis');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs');

// Cache para evitar notificações duplicadas (persiste em arquivo para segurança)
const CACHE_FILE = path.join(__dirname, '../../config/cache.json');
let activityCache = new Set();

if (fs.existsSync(CACHE_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE));
        activityCache = new Set(data);
    } catch (e) {
        activityCache = new Set();
    }
}

function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...activityCache]));
}

async function listCourses(auth) {
    const classroom = google.classroom({ version: 'v1', auth });
    const res = await classroom.courses.list({
        courseStates: 'ACTIVE'
    });
    return res.data.courses || [];
}

async function getCourseWork(auth, courseId) {
    const classroom = google.classroom({ version: 'v1', auth });
    const res = await classroom.courses.courseWork.list({
        courseId: courseId,
        orderBy: 'updateTime desc'
    });
    return res.data.courseWork || [];
}

async function getTeacherInfo(auth, courseId, teacherId) {
    const classroom = google.classroom({ version: 'v1', auth });
    try {
        const res = await classroom.courses.teachers.get({
            courseId: courseId,
            userId: teacherId
        });
        return res.data.profile;
    } catch (e) {
        return { name: { fullName: 'Professor' } };
    }
}

async function checkNewActivities(auth) {
    const courses = await listCourses(auth);
    const newActivities = [];

    for (const course of courses) {
        try {
            const activities = await getCourseWork(auth, course.id);
            
            for (const activity of activities) {
                // Se o ID não estiver no cache, é uma atividade nova
                if (!activityCache.has(activity.id)) {
                    const teacher = await getTeacherInfo(auth, course.id, activity.creatorUserId);
                    
                    // Normalizar a URL da foto do professor (adicionar https: se faltar)
                    let photoUrl = teacher.photoUrl;
                    if (photoUrl && photoUrl.startsWith('//')) {
                        photoUrl = 'https:' + photoUrl;
                    }

                    const formattedActivity = {
                        id: activity.id,
                        title: activity.title,
                        courseName: course.name,
                        teacherName: teacher.name.fullName,
                        teacherPhoto: photoUrl || 'https://www.gstatic.com/images/branding/product/2x/classroom_48dp.png',
                        description: activity.description || 'Sem descrição.',
                        dueDate: activity.dueDate ? `${activity.dueDate.day}/${activity.dueDate.month}/${activity.dueDate.year}` : 'Sem data de entrega',
                        link: activity.alternateLink
                    };

                    newActivities.push(formattedActivity);
                    activityCache.add(activity.id);
                }
            }
        } catch (e) {
            // Se for erro de permissão, apenas loga de forma discreta
            if (e.code === 403) {
                console.log(`⚠️ Sem permissão para acessar o curso: ${course.name}`);
            } else {
                console.error(`❌ Erro no curso ${course.name}:`, e.message);
            }
        }
    }

    if (newActivities.length > 0) {
        saveCache();
        console.log(`[Cache] Salvas ${newActivities.length} novas atividades.`);
    }

    return newActivities;
}

module.exports = { checkNewActivities, listCourses, getCourseWork };
