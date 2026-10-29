import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Network } from "@capacitor/network";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { FileSystem, Directory } from "@capacitor/filesystem";
import "./styles.css";

// --- CONFIGURATION STRICTE ---
const ADMIN_PASSWORD = "Kevin83600";
const BASE_URL = import.meta.env.BASE_URL || "./";
const KNOWLEDGE_PATH = `${BASE_URL}data/knowledge.json`;
const AI_ENDPOINT = "https://text.pollinations.ai/";
const AI_MODELS = ["openai", "mistral", "llama"]; 

// --- STATE GLOBAL AVEC TYPES PRIMITIFS ---
const state = {
  ready: false,
  session: null, 
  users: [],     
  online: true,
  loginMode: "admin",
  adminPwd: "",
  tierName: "",
  error: "",
  notice: "",
  
  kb: {},        
  activeTab: "dashboard",
  searchQuery: "",
  searchResults: [],
  
  analysisInput: "",
  analysisOutput: "",
  isAnalyzing: false,
  
  backgroundImageUrl: null, 
};

const app = document.getElementById("app");

// --- UTILITAIRES DE SÉCURITÉ ---

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function uid() {
  return globalThis.crypto?.randomUUID 
    ? globalThis.crypto.randomUUID() 
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getPref(key, fallback) {
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return fallback;
    return JSON.parse(value);
  } catch (e) {
    console.error(`Erreur lecture pref ${key}:`, e);
    return fallback;
  }
}

async function setPref(key, value) {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch (e) {
    console.error(`Erreur écriture pref ${key}:`, e);
  }
}

async function notify(title, body) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{ id: Math.floor(Math.random()*100000), title, body }]
    });
  } catch (e) { 
    console.warn("Notification failed:", e); 
  }
}

// --- AUTHENTIFICATION ROBUSTE ---

async function ensureAdminInit() {
  try {
    const hash = await Preferences.get({ key: "admin_hash" });
    if (!hash.value) {
      const h = await sha256(ADMIN_PASSWORD);
      await Preferences.set({ key: "admin_hash", value: h });
    }
  } catch (e) {
    console.error("Init Admin Fail:", e);
  }
}

async function loginAdmin(pwd) {
  const stored = (await Preferences.get({ key: "admin_hash" })).value;
  if (!stored) throw new Error("Initialisation admin manquante.");
  
  const inputHash = await sha256(pwd);
  if (inputHash !== stored) throw new Error("Mot de passe incorrect.");
  
  state.session = { role: "admin", name: "Administrateur" };
  await setPref("session", state.session);
}

async function loginTier(name) {
  const clean = name.trim();
  if (!clean) throw new Error("Nom requis.");
  
  let users = await getPref("tier_users", []);
  let user = users.find(u => u.name.toLowerCase() === clean.toLowerCase());
  
  if (!user) {
    user = { id: uid(), name: clean, status: "pending", createdAt: new Date().toISOString() };
    users.push(user);
    await setPref("tier_users", users);
    await notify("Demande d'accès", `${clean} demande l'accès.`);
  } else if (user.status === "revoked") {
    throw new Error("Accès révoqué. Contactez l'administrateur.");
  }

  state.session = { role: "tier", name: user.name, userId: user.id };
  await setPref("session", state.session);
  state.users = users;
}

async function logout() {
  state.session = null;
  await Preferences.remove({ key: "session" });
  render();
}

async function setUserStatus(id, status) {
  let users = await getPref("tier_users", []);
  const idx = users.findIndex(u => u.id === id);
  if (idx > -1) {
    users[idx].status = status;
    users[idx].updatedAt = new Date().toISOString();
    await setPref("tier_users", users);
    state.users = users;
    await notify("Statut changé", `${users[idx].name} : ${status}`);
    render();
  }
}

// --- CHARGEMENT BASE DE DONNÉES AVEC VALIDATION ---

async function loadKnowledge() {
  try {
    const res = await fetch(KNOWLEDGE_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const json = await res.json();
    
    // Validation structure minimale
    if (!json.technique || !json.incendie || !json.juridique) {
      console.warn("Structure KB incomplète, utilisation defaults.");
      state.kb = { technique: { dtc_codes: [], pannes_types: [] }, incendie: { patterns: [], causes_racines: [] }, juridique: { principes: [] } };
    } else {
      state.kb = json;
    }
  } catch (e) {
    console.error("Erreur chargement KB:", e);
    state.notice = "⚠️ Base locale inaccessible. Fonctionnement dégradé.";
    state.kb = { technique: {}, incendie: {}, juridique: {} };
  }
}

function performSearch(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  const results = [];

  const safeArr = (arr) => Array.isArray(arr) ? arr : [];

  // Recherche DTC
  safeArr(state.kb.technique?.dtc_codes).forEach(item => {
    if (item.code?.toLowerCase().includes(q) || item.definition?.toLowerCase().includes(q)) {
      results.push({ type: "technique", title: `DTC ${item.code}`, content: item });
    }
  });

  // Recherche Pannes
  safeArr(state.kb.technique?.pannes_types).forEach(item => {
    if (item.titre?.toLowerCase().includes(q)) {
      results.push({ type: "technique", title: item.titre, content: item });
    }
  });

  // Recherche Incendie
  safeArr(state.kb.incendie?.causes_racines).forEach(item => {
    if (item.categorie?.toLowerCase().includes(q) || item.sous_categorie?.toLowerCase().includes(q)) {
      results.push({ type: "incendie", title: `${item.categorie} - ${item.sous_categorie}`, content: item });
    }
  });

  // Recherche Juridique
  safeArr(state.kb.juridique?.principes).forEach(item => {
    if (item.titre?.toLowerCase().includes(q)) {
      results.push({ type: "juridique", title: item.titre, content: item });
    }
  });

  return results.slice(0, 20);
}

// --- ANALYSE IA AVEC GESTION ERREURS ---

function buildContextPrompt(userQuery) {
  const relevantItems = performSearch(userQuery);
  let contextBlock = "";

  if (relevantItems.length > 0) {
    contextBlock += "\n=== BASE DE CONNAISSANCES LOCALE PERTINENTE ===\n";
    relevantItems.forEach(item => {
      contextBlock += `[TYPE: ${item.type.toUpperCase()}] TITRE: ${item.title}\n`;
      contextBlock += `CONTENU: ${JSON.stringify(item.content).substring(0, 500)}...\n\n`;
    });
  } else {
    contextBlock += "\n=== AUCUNE DONNÉE LOCALE SPÉCIFIQUE TROUVÉE ===\nUtilisez vos connaissances générales d'ingénieur/expert.\n";
  }

  return `Tu es un expert automobile, ingénieur sécurité incendie et juriste spécialisé droit français.
Ta mission est d'analyser la situation décrite ci-dessous en croisant trois dimensions :
1. TECHNIQUE : Diagnostic panne, codes défaut, mécanique/élec.
2. INCENDIE : Risque de départ de feu, patterns, chimie, ASTM/NFPA.
3. JURIDIQUE : Responsabilité, vice caché, conformité, preuves.

${contextBlock}

QUESTION DE L'UTILISATEUR :
"${userQuery}"

RÉPONDS EN FRANÇAIS, STRUCTURÉ AVEC LES SECTIONS :
## 1. SYNTHÈSE TECHNIQUE
## 2. RISQUES INCENDIE & PREUVES MATÉRIELLES
## 3. IMPLICATIONS JURIDIQUES & STRATÉGIE DE DÉFENSE
## 4. RECOMMANDATIONS IMMÉDIATES
Sois précis, prudent et professionnel.`;
}

async function runAnalysis() {
  if (!state.analysisInput.trim()) return;
  
  state.isAnalyzing = true;
  state.analysisOutput = "";
  state.notice = "";
  render();

  try {
    const prompt = buildContextPrompt(state.analysisInput);
    
    const promises = AI_MODELS.map(model => 
      fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false
        })
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
    );

    const results = await Promise.allSettled(promises);
    const successRes = results.find(r => r.status === "fulfilled");
    
    if (successRes) {
      state.analysisOutput = successRes.value;
    } else {
      state.analysisOutput = "❌ Erreur : Aucun service IA disponible. Vérifiez votre connexion Internet.";
    }
  } catch (e) {
    state.analysisOutput = "❌ Exception Critique : " + e.message;
  } finally {
    state.isAnalyzing = false;
    render();
  }
}

// --- ADMIN FONCTIONNALITÉS (PHOTO DE FOND) ---

async function pickBackgroundImage() {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos
    });

    if (image.webPath) {
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        
        await FileSystem.writeFile({
          path: 'background.jpg',
          directory: Directory.Data,
          data: base64Data,
          recursive: true
        });

        applyBackgroundFromStorage();
        state.notice = "✅ Image de fond mise à jour.";
        render();
      };
      reader.readAsDataURL(blob);
    }
  } catch (e) {
    console.error(e);
    state.notice = "❌ Impossible de charger l'image : " + e.message;
    render();
  }
}

async function applyBackgroundFromStorage() {
  try {
    const file = await FileSystem.readFile({
      path: 'background.jpg',
      directory: Directory.Data
    });
    
    const dataUri = `data:image/jpeg;base64,${file.data}`;
    document.body.style.backgroundImage = `url(${dataUri})`;
    state.backgroundImageUrl = dataUri;
  } catch (e) {
    document.body.style.backgroundImage = '';
    state.backgroundImageUrl = null;
  }
}

async function removeBackground() {
  try {
    await FileSystem.deleteFile({
      path: 'background.jpg',
      directory: Directory.Data
    });
    document.body.style.backgroundImage = '';
    state.backgroundImageUrl = null;
    state.notice = "🗑️ Fond d'écran supprimé.";
    render();
  } catch (e) {
    state.notice = "Erreur suppression : " + e.message;
    render();
  }
}

// --- NETWORK HANDLING ---

async function initNetwork() {
  try {
    const status = await Network.getStatus();
    state.online = status.connected;
    
    Network.addListener('networkStatusChange', (newStatus) => {
      state.online = newStatus.connected;
      render();
    });
  } catch (e) {
    console.warn("Network plugin unavailable:", e);
  }
}

// --- RENDERING ENGINE ---

function renderLogin() {
  return `
    <div class="modal">
      <div class="modal-content card">
        <h2 class="mb-2">🔐 Kevin Expert Suite Pro V4</h2>
        <p class="text-muted mb-2">Connexion Sécurisée & Strict Mode</p>
        
        <div class="nav-tabs mb-2">
          <button class="nav-tab ${state.loginMode==='admin'?'active':''}" onclick="setLoginMode('admin')">Admin</button>
          <button class="nav-tab ${state.loginMode==='tier'?'active':''}" onclick="setLoginMode('tier')">Tiers</button>
        </div>

        ${state.error ? `<div class="result-item critique mb-2">${esc(state.error)}</div>` : ''}

        ${state.loginMode === 'admin' ? `
          <label>Mot de Passe Admin</label>
          <input type="password" id="pwdInput" placeholder="••••••••" />
          <button class="primary w-full mt-2" onclick="handleLogin()">Se Connecter</button>
        ` : `
          <label>Votre Nom / Société</label>
          <input type="text" id="nameInput" placeholder="Ex: Garage Dupont" />
          <button class="primary w-full mt-2" onclick="handleLogin()">Demander Accès</button>
        `}
      </div>
    </div>
  `;
}

function renderDashboard() {
  const isAdmin = state.session.role === 'admin';
  
  return `
    <div class="header-bar">
      <div>
        <strong>KEVIN EXPERT SUITE PRO V4</strong>
        <div class="text-muted small">${isAdmin ? 'MODE ADMINISTRATEUR' : 'MODE TIERS'} • ${state.online ? 'ONLINE' : 'OFFLINE'}</div>
      </div>
      <div class="flex align-center col-gap">
        <span class="status-badge ${state.online ? 'status-online' : 'status-offline'}">
          ${state.online ? '4G/WIFI' : 'HORS-LIGNE'}
        </span>
        <button onclick="logout()" class="danger small">Déconnexion</button>
      </div>
    </div>

    <div class="nav-tabs p-2 bg-secondary" style="margin-bottom:10px;">
      <button class="nav-tab ${state.activeTab==='analysis'?'active':''}" onclick="switchTab('analysis')">🧠 Analyse Expert</button>
      <button class="nav-tab ${state.activeTab==='search'?'active':''}" onclick="switchTab('search')">🔍 Recherche KB</button>
      ${isAdmin ? `<button class="nav-tab ${state.activeTab==='admin'?'active':''}" onclick="switchTab('admin')">⚙️ Admin</button>` : ''}
    </div>

    <main class="p-2">
      ${renderTabContent()}
    </main>
  `;
}

function renderTabContent() {
  switch(state.activeTab) {
    case 'analysis': return renderAnalysisView();
    case 'search': return renderSearchView();
    case 'admin': return renderAdminView();
    default: return renderAnalysisView();
  }
}

function renderAnalysisView() {
  return `
    <div class="card">
      <h3>🛡️ Assistant Ingénieur-Sapeur-Juriste</h3>
      <p class="text-muted mb-2">Décrivez la panne, l'incident ou le litige. L'IA croisera la base locale massive.</p>
      
      <textarea id="analysisInput" rows="6" placeholder="Ex: Tesla Model 3, voyant batterie rouge, odeur brûlée sous siège arrière...">${esc(state.analysisInput)}</textarea>
      
      <div class="mt-2 flex col-gap">
        <button class="primary" onclick="updateAnalysisInput()" ${state.isAnalyzing ? 'disabled' : ''}>
          ${state.isAnalyzing ? '⏳ Analyse en cours...' : '🚀 Lancer Analyse Multi-AI'}
        </button>
        ${state.analysisOutput ? `<button onclick="copyAnalysis()">📋 Copier Rapport</button>` : ''}
      </div>

      ${state.notice ? `<div class="result-item technique mt-2">${esc(state.notice)}</div>` : ''}

      ${state.analysisOutput ? `
        <div class="mt-2 result-item">
          <pre>${esc(state.analysisOutput)}</pre>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSearchView() {
  return `
    <div class="card">
      <h3>🔍 Recherche dans Base Locale Massive</h3>
      <input type="text" id="searchInput" placeholder="Code DTC, Type d'incendie, Article loi..." onkeyup="if(event.key==='Enter') executeSearch()" />
      <button class="primary mt-2" onclick="executeSearch()">Rechercher</button>
      
      <div class="mt-2">
        ${state.searchResults.length === 0 && state.searchQuery ? '<p class="text-muted">Aucun résultat trouvé.</p>' : ''}
        ${state.searchResults.map(r => `
          <div class="result-item ${r.type} mt-1">
            <strong>[${r.type.toUpperCase()}] ${esc(r.title)}</strong>
            <div class="small text-muted mt-1">${esc(JSON.stringify(r.content).substring(0, 150))}...</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminView() {
  const pendingUsers = state.users.filter(u => u.status === 'pending');
  const grantedUsers = state.users.filter(u => u.status === 'granted');
  const revokedUsers = state.users.filter(u => u.status === 'revoked');

  return `
    <div class="card mb-2">
      <h3>⚙️ Administration Système</h3>
      
      <div class="mt-2">
        <h4>🖼️ Personnalisation Fond d'Écran</h4>
        <p class="text-muted small">Choisissez une image depuis votre galerie. Elle sera sauvegardée localement.</p>
        <div class="flex col-gap mt-1">
          <button class="primary" onclick="pickBackgroundImage()">📸 Choisir Image</button>
          ${state.backgroundImageUrl ? `<button class="danger" onclick="removeBackground()">❌ Supprimer Fond</button>` : ''}
        </div>
        ${state.notice ? `<div class="result-item technique mt-1">${esc(state.notice)}</div>` : ''}
      </div>
    </div>

    <div class="card">
      <h3>👥 Gestion des Accès Tiers</h3>
      
      <h4 class="mt-2 text-warning">En Attente (${pendingUsers.length})</h4>
      ${pendingUsers.length === 0 ? '<p class="text-muted small">Aucune demande.</p>' : ''}
      ${pendingUsers.map(u => `
        <div class="result-item mb-1 flex justify-between align-center">
          <span>${esc(u.name)}</span>
          <div class="flex col-gap">
            <button class="success small" onclick="approveUser('${u.id}')">✅ Accorder</button>
            <button class="danger small" onclick="denyUser('${u.id}')">❌ Refuser</button>
          </div>
        </div>
      `).join('')}

      <h4 class="mt-2 text-success">Autorisés (${grantedUsers.length})</h4>
      ${grantedUsers.map(u => `
        <div class="result-item mb-1 flex justify-between align-center">
          <span>${esc(u.name)}</span>
          <button class="danger small" onclick="revokeUser('${u.id}')">🚫 Révoquer</button>
        </div>
      `).join('')}

      <h4 class="mt-2 text-danger">Révoqués (${revokedUsers.length})</h4>
      ${revokedUsers.map(u => `
        <div class="result-item mb-1 flex justify-between align-center">
          <span>${esc(u.name)}</span>
          <button class="primary small" onclick="approveUser('${u.id}')">♻️ Restaurer</button>
        </div>
      `).join('')}
    </div>
  `;
}

function render() {
  if (!state.ready) {
    app.innerHTML = `<div class="center"><h2>Chargement Strict Mode...</h2></div>`;
    return;
  }

  if (!state.session) {
    app.innerHTML = renderLogin();
    return;
  }

  app.innerHTML = renderDashboard();
  
  if (state.backgroundImageUrl) {
    document.body.style.backgroundImage = `url(${state.backgroundImageUrl})`;
  }
}

// --- EVENT LISTENERS GLOBAUX ---

window.setLoginMode = (mode) => { state.loginMode = mode; state.error = ""; render(); };
window.handleLogin = async () => {
  state.error = "";
  try {
    if (state.loginMode === 'admin') {
      const pwd = document.getElementById('pwdInput').value;
      await loginAdmin(pwd);
    } else {
      const name = document.getElementById('nameInput').value;
      await loginTier(name);
    }
    state.activeTab = 'analysis';
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
};
window.logout = logout;
window.switchTab = (tab) => { state.activeTab = tab; state.notice = ""; render(); };
window.updateAnalysisInput = () => {
  state.analysisInput = document.getElementById('analysisInput').value;
  runAnalysis();
};
window.executeSearch = () => {
  state.searchQuery = document.getElementById('searchInput').value;
  state.searchResults = performSearch(state.searchQuery);
  render();
};
window.copyAnalysis = () => {
  navigator.clipboard.writeText(state.analysisOutput);
  alert("Rapport copié !");
};
window.pickBackgroundImage = pickBackgroundImage;
window.removeBackground = removeBackground;
window.approveUser = (id) => setUserStatus(id, 'granted');
window.denyUser = (id) => setUserStatus(id, 'denied');
window.revokeUser = (id) => setUserStatus(id, 'revoked');

// --- INITIALIZATION ---

async function init() {
  await ensureAdminInit();
  await loadKnowledge();
  await initNetwork();
  
  const savedSession = await getPref("session", null);
  if (savedSession) state.session = savedSession;
  
  state.users = await getPref("tier_users", []);
  await applyBackgroundFromStorage();

  state.ready = true;
  render();
}

init();
