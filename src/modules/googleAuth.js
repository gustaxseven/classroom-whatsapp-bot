const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const TOKEN_PATH = path.join(__dirname, '../../config/token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.profile.photos',
    'https://www.googleapis.com/auth/userinfo.profile'
];

async function getOAuth2Client() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados no .env');
    }

    return new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI || 'http://localhost:3000'
    );
}

async function authorize() {
    const oAuth2Client = await getOAuth2Client();

    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    }

    return getNewToken(oAuth2Client);
}

async function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });

    console.log('\n--- AUTENTICAÇÃO GOOGLE ---');
    console.log('Autorize este app acessando este link:');
    console.log(authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('\nInsira o código da página de redirecionamento (ou a URL completa): ', async (code) => {
            rl.close();
            try {
                // Se o usuário colar a URL completa, extrair o código
                if (code.includes('code=')) {
                    const url = new URL(code);
                    code = url.searchParams.get('code');
                }

                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                
                // Salvar o token para uso futuro
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                console.log('Token armazenado em', TOKEN_PATH);
                resolve(oAuth2Client);
            } catch (err) {
                console.error('Erro ao recuperar o token de acesso', err);
                reject(err);
            }
        });
    });
}

module.exports = { authorize };
