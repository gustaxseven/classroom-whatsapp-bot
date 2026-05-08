const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Cache para evitar notificações duplicadas
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

async function getCourseMaterials(auth, courseId) {
    const classroom = google.classroom({ version: 'v1', auth });
    const res = await classroom.courses.courseWorkMaterials.list({
        courseId: courseId,
        pageSize: 10,
    });
    return res.data.courseWorkMaterial || [];
}

async function getStudentSubmissions(auth, courseId, courseWorkId) {
    const classroom = google.classroom({ version: 'v1', auth });
    const res = await classroom.courses.courseWork.studentSubmissions.list({
        courseId: courseId,
        courseWorkId: courseWorkId,
    });
    return res.data.studentSubmissions || [];
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

async function checkNewContent(auth) {
    const courses = await listCourses(auth);
    const newItems = [];

    for (const course of courses) {
        try {
            // 1. Verificar Atividades (CourseWork)
            const activities = await getCourseWork(auth, course.id);
            for (const activity of activities) {
                if (!activityCache.has(activity.id)) {
                    const teacher = await getTeacherInfo(auth, course.id, activity.creatorUserId);
                    let photoUrl = teacher.photoUrl;
                    if (photoUrl && photoUrl.startsWith('//')) photoUrl = 'https:' + photoUrl;

                    newItems.push({
                        type: 'activity',
                        id: activity.id,
                        title: activity.title,
                        courseName: course.name,
                        teacherName: teacher.name.fullName,
                        teacherPhoto: photoUrl || 'https://www.gstatic.com/images/branding/product/2x/classroom_48dp.png',
                        description: activity.description || 'Sem descrição.',
                        dueDate: activity.dueDate ? `${activity.dueDate.day}/${activity.dueDate.month}/${activity.dueDate.year}` : 'Sem data de entrega',
                        link: activity.alternateLink,
                        materials: activity.materials || []
                    });
                    activityCache.add(activity.id);
                }
            }

            // 2. Verificar Materiais (CourseWorkMaterials)
            const materials = await getCourseMaterials(auth, course.id);
            for (const material of materials) {
                if (!activityCache.has(material.id)) {
                    const teacher = await getTeacherInfo(auth, course.id, material.creatorUserId);
                    let photoUrl = teacher.photoUrl;
                    if (photoUrl && photoUrl.startsWith('//')) photoUrl = 'https:' + photoUrl;

                    newItems.push({
                        type: 'material',
                        id: material.id,
                        title: material.title,
                        courseName: course.name,
                        teacherName: teacher.name.fullName,
                        teacherPhoto: photoUrl || 'https://www.gstatic.com/images/branding/product/2x/classroom_48dp.png',
                        description: material.description || 'Sem descrição.',
                        link: material.alternateLink,
                        materials: material.materials || []
                    });
                    activityCache.add(material.id);
                }
            }
        } catch (e) {
            if (e.code !== 403) console.error(`❌ Erro no curso ${course.name}:`, e.message);
        }
    }

    if (newItems.length > 0) {
        saveCache();
    }

    return newItems;
}

module.exports = { 
    checkNewContent, 
    listCourses, 
    getCourseWork, 
    getCourseMaterials, 
    getStudentSubmissions 
};
