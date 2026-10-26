import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Network } from "@capacitor/network";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Browser } from "@capacitor/browser";
import "./styles.css";

const ADMIN_PASSWORD = "Kevin83600";
const BASE = import.meta.env.BASE_URL || "./";
const KNOWLEDGE_URL = `${BASE}data/knowledge.json`;
const AI_ENDPOINT = "https://text.pollinations.ai/";
const AI_MODELS = ["openai", "mistral", "llama"];

const STATUS_LABELS = {
  pending: "En attente",
  granted: "Autorisé",
  denied: "Refusé",
  revoked: "Révoqué"
};

const LEGACY_MODULES = [
  {
    id: "rapport-expertise-contextuel",
    title: "Rapport expertise contextuel",
    description:
      "Analyse de litige automobile, expertise ingénieur + analyse juridique.",
    local: `${BASE}legacy/rapport-expertise-contextuel/index.html`,
    remote:
      "https://expertkevin06-cell.github.io/rapport-expertise-contextuel/"
  },
  {
    id: "firediag-auto",
    title: "Tech incendie",
    description:
      "NFPA 921, ASTM E2929, chimie du feu, polymères, batterie HT, cartographie de fusion.",
    local: `${BASE}legacy/firediag-auto/index.html`,
    remote: "https://expertkevin06-cell.github.io/firediag-auto/"
  },
  {
    id: "aide-redactionnelle-technique",
    title: "Aide rédactionnelle technique",
    description:
      "Analyse technique et juridique automobile, droit français, rédaction de rapports.",
    local: `${BASE}legacy/aide-redactionnelle-technique/index.html`,
    remote:
      "https://expertkevin06-cell.github.io/aide-redactionnelle-technique/"
  },
  {
    id: "droit-jurisprudence-ai",
    title: "Droit & jurisprudence IA",
    description:
      "Fiches juridiques, conditions, effets, base légale, sources officielles.",
    local: `${BASE}legacy/droit-jurisprudence-ai/index.html`,
    remote: "https://expertkevin06-cell.github.io/droit-jurisprudence-ai/"
  },
  {
    id: "auto-diagV2",
    title: "Auto Diag V2",
    description: "Diagnostic automobile nouvelle version.",
    local: `${BASE}legacy/auto-diagV2/index.html`,
    remote: "https://expertkevin06-cell.github.io/auto-diagV2/"
  },
  {
    id: "auto-diagnostic",
    title: "Auto Diagnostic Pro",
    description:
      "Marques 2017-2026, pannes, rappels, DTC, fiches expert ingénieur.",
    local: `${BASE}legacy/auto-diagnostic/index.html`,
    remote: "https://expertkevin06-cell.github.io/auto-diagnostic/"
  },
  {
    id: "mon-aide-technique",
    title: "Mon aide technique",
    description: "DTC Diag Pro.",
    local: `${BASE}legacy/mon-aide-technique/index.html`,
    remote: "https://expertkevin06-cell.github.io/mon-aide-technique/"
  }
];

const THEMES = [
  { id: "accueil", title: "Accueil", adminOnly: false },
  { id: "technique", title: "Technique auto", adminOnly: false },
  { id: "incendie", title: "Incendie & élec.", adminOnly: false },
  { id: "juridique", title: "Juridique", adminOnly: false },
  { id: "redaction", title: "Rédaction", adminOnly: false },
  { id: "expertise", title: "Expertise", adminOnly: false },
  { id: "ia", title: "IA", adminOnly: false },
  { id: "recherche", title: "Recherche", adminOnly: false },
  { id: "projets", title: "Anciens projets", adminOnly: false },
  { id: "admin", title: "Admin", adminOnly: true }
];

const DEFAULT_KB = {
  meta: {
    nom: "Kevin Expert Suite",
    version: "0.3.0",
    description:
      "Base locale fusionnée : technique automobile, incendie, juridique, rédaction, expertise contextuelle."
  },
  technique: {
    marques: [],
    modeles: [],
    motorisations: [],
    dtc: [],
    pannes: [],
    rappels: [],
    fichesExpert: []
  },
  incendie: {
    patterns: [],
    chimieFeu: [],
    polymere: [],
    metaux: [],
    batterieHT: [],
    sourcesDepart: [],
    fils: [],
    zones: []
  },
  juridique: {
    fiches: [],
    jurisprudences: [],
    textes: [],
    questions: [],
    formulations: []
  },
  redaction: {
    modeles: [],
    sections: [],
    formules: [],
    checklists: []
  },
  expertise: {
    grilles: [],
    scenarios: [],
    questions: [],
    conclusions: []
  },
  sources: []
};

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
  theme: "accueil",
  kb: clone(DEFAULT_KB),
  kbOverride: {},
  settings: {
    preferLocalLegacy: true
  },
  searchQuery: "",
  searchResults: [],
  aiPrompt: "",
  aiBusy: false,
  aiResults: [],
  aiHistory: [],
  expertise: {
    marque: "",
    modele: "",
    annee: "",
    km: "",
    motorisation: "",
    faits: "",
    dtc: "",
    dommages: "",
    incendie: "",
    question: "",
    assurance: ""
  },
  expertiseBusy: false,
  expertiseResult: "",
  expertiseHistory: [],
  redaction: {
    type: "constat",
    facts: ""
  },
  redactionBusy: false,
  redactionResult: "",
  selectedLegacy: null,
  legacySrc: "",
  legacyLabel: "",
  legacyBusy: false,
  exportText: "",
  importText: ""
};

const app = document.getElementById("app");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m];
  });
}

function uid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const array = Array.from(new Uint8Array(buffer));
  return array.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getJson(key, fallback) {
  const { value } = await Preferences.get({ key });
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function setJson(key, value) {
  await Preferences.set({
    key,
    value: JSON.stringify(value)
  });
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target, source) {
  const out = clone(target);
  if (!isObject(source)) return out;

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (isObject(value) && isObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = clone(value);
    }
  }

  return out;
}

async function notify(title, body) {
  try {
    if (!Capacitor.isNativePlatform()) {
      console.info("[NOTIFICATION WEB]", title, body);
      return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1000000),
          title,
          body,
          smallIcon: "ic_stat_icon_config"
        }
      ]
    });
  } catch (error) {
    console.warn("Notification locale échouée :", error);
  }
}

async function ensureNotificationPermission() {
  try {
    if (!Capacitor.isNativePlatform()) return;

    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
  } catch (error) {
    console.warn("Permission notifications indisponible :", error);
  }
}

async function ensureAdminHash() {
  const { value } = await Preferences.get({ key: "admin_hash" });
  if (!value) {
    const hash = await sha256(ADMIN_PASSWORD);
    await Preferences.set({ key: "admin_hash", value: hash });
  }
}

async function getSession() {
  return getJson("session", null);
}

async function saveSession(session) {
  state.session = session;
  await setJson("session", session);
}

async function logout() {
  await Preferences.remove({ key: "session" });
  state.session = null;
  state.theme = "accueil";
  state.selectedLegacy = null;
  state.error = "";
  state.notice = "";
  render();
}

async function loginAdmin(password) {
  const stored = (await Preferences.get({ key: "admin_hash" })).value;
  if (!stored) {
    throw new Error("Administration non initialisée.");
  }

  const hash = await sha256(password);
  if (hash !== stored) {
    throw new Error("Mot de passe administrateur incorrect.");
  }

  await saveSession({
    role: "admin",
    name: "Administrateur",
    createdAt: new Date().toISOString()
  });
}

async function getUsers() {
  return getJson("tier_users", []);
}

async function setUsers(users) {
  state.users = users;
  await setJson("tier_users", users);
}

async function loginTier(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Merci d’indiquer un nom.");
  }

  const users = await getUsers();
  let user = users.find(
    (u) => u.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (!user) {
    user = {
      id: uid(),
      name: cleanName,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(user);
    await setUsers(users);

    await notify(
      "Nouvelle demande d’accès",
      `${cleanName} demande un accès tiers.`
    );
  }

  await saveSession({
    role: "tier",
    name: user.name,
    userId: user.id
  });
}

async function setUserStatus(id, status) {
  const users = await getUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return;

  user.status = status;
  user.updatedAt = new Date().toISOString();

  await setUsers(users);

  await notify(
    "Statut d’accès mis à jour",
    `${user.name} : ${STATUS_LABELS[status]}`
  );
}

function currentTierUser() {
  if (!state.session || state.session.role !== "tier") return null;
  return state.users.find((u) => u.id === state.session.userId) || null;
}

async function loadKnowledge() {
  let base = clone(DEFAULT_KB);

  try {
    const res = await fetch(KNOWLEDGE_URL, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      base = deepMerge(base, json);
    }
  } catch (error) {
    console.warn("Base locale non chargée :", error);
  }

  state.kbOverride = await getJson("kb_override", {});
  state.kb = deepMerge(base, state.kbOverride);
}

async function saveKbOverride() {
  await setJson("kb_override", state.kbOverride);
}

function getCollections() {
  const kb = state.kb;

  return [
    ["Technique / Marques", kb.technique?.marques, "technique"],
    ["Technique / Modèles", kb.technique?.modeles, "technique"],
    ["Technique / Motorisations", kb.technique?.motorisations, "technique"],
    ["Technique / DTC", kb.technique?.dtc, "technique"],
    ["Technique / Pannes", kb.technique?.pannes, "technique"],
    ["Technique / Rappels", kb.technique?.rappels, "technique"],
    ["Technique / Fiches expert", kb.technique?.fichesExpert, "technique"],
    ["Incendie / Patterns", kb.incendie?.patterns, "incendie"],
    ["Incendie / Chimie du feu", kb.incendie?.chimieFeu, "incendie"],
    ["Incendie / Polymères", kb.incendie?.polymere, "incendie"],
    ["Incendie / Métaux", kb.incendie?.metaux, "incendie"],
    ["Incendie / Batterie HT", kb.incendie?.batterieHT, "incendie"],
    ["Incendie / Sources de départ", kb.incendie?.sourcesDepart, "incendie"],
    ["Incendie / Fils électriques", kb.incendie?.fils, "incendie"],
    ["Incendie / Zones véhicule", kb.incendie?.zones, "incendie"],
    ["Juridique / Fiches", kb.juridique?.fiches, "juridique"],
    ["Juridique / Jurisprudences", kb.juridique?.jurisprudences, "juridique"],
    ["Juridique / Textes", kb.juridique?.textes, "juridique"],
    ["Juridique / Questions", kb.juridique?.questions, "juridique"],
    ["Juridique / Formulations", kb.juridique?.formulations, "juridique"],
    ["Rédaction / Modèles", kb.redaction?.modeles, "redaction"],
    ["Rédaction / Sections", kb.redaction?.sections, "redaction"],
    ["Rédaction / Formules", kb.redaction?.formules, "redaction"],
    ["Rédaction / Checklists", kb.redaction?.checklists, "redaction"],
    ["Expertise / Grilles", kb.expertise?.grilles, "expertise"],
    ["Expertise / Scénarios", kb.expertise?.scenarios, "expertise"],
    ["Expertise / Questions", kb.expertise?.questions, "expertise"],
    ["Expertise / Conclusions", kb.expertise?.conclusions, "expertise"],
    ["Sources", kb.sources, "recherche"]
  ];
}

function getItemTitle(item) {
  return (
    item?.code ||
    item?.titre ||
    item?.title ||
    item?.nom ||
    item?.name ||
    item?.modele ||
    item?.marque ||
    item?.symptome ||
    item?.materiau ||
    item?.material ||
    item?.theme ||
    item?.question ||
    item?.gaz ||
    item?.norme ||
    item?.url ||
    "Entrée"
  );
}

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux",
  "sur", "dans", "pour", "par", "avec", "sans", "est", "sont", "a",
  "ce", "cette", "ces", "qui", "que", "quoi", "dont", "ou", "quand",
  "comment", "pourquoi", "quel", "quelle", "quels", "quelles", "mon",
  "ton", "son", "notre", "votre", "leur", "mes", "tes", "ses", "nos",
  "vos", "leurs", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles"
]);

function tokenize(text) {
  const raw = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9àâäéèêëîïôöùûüç]{2,}/g) || [];

  return Array.from(new Set(raw.filter((w) => !STOPWORDS.has(w))));
}

function searchAll(query) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const results = [];

  for (const [type, items, theme] of getCollections()) {
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const text = JSON.stringify(item).toLowerCase();
      const title = String(getItemTitle(item)).toLowerCase();

      const matchAll = terms.every((term) => text.includes(term));
      if (!matchAll) continue;

      results.push({
        type,
        theme,
        title: getItemTitle(item),
        detail: text.slice(0, 350),
        item
      });
    }
  }

  for (const mod of LEGACY_MODULES) {
    const text = `${mod.title} ${mod.description}`.toLowerCase();
    if (terms.every((term) => text.includes(term))) {
      results.push({
        type: "Ancien projet",
        theme: "projets",
        title: mod.title,
        detail: mod.description,
        action: "legacy",
        id: mod.id
      });
    }
  }

  return results.slice(0, 200);
}

function retrieveContext(prompt, limit = 10) {
  const terms = tokenize(prompt);
  if (!terms.length) return "";

  const scored = [];

  for (const [type, items, theme] of getCollections()) {
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const text = JSON.stringify(item).toLowerCase();
      const title = String(getItemTitle(item)).toLowerCase();

      let score = 0;

      for (const term of terms) {
        const occurrences = text.split(term).length - 1;
        score += occurrences;

        if (title.includes(term)) score += 5;
      }

      if (score > 0) {
        scored.push({ score, type, theme, item });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored
    .slice(0, limit)
    .map(({ type, item }) => {
      const title = getItemTitle(item);
      const detail = JSON.stringify(item).slice(0, 450);
      return `- [${type}] ${title} : ${detail}`;
    })
    .join("\n");
}

async function callModel(model, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const lastUser = messages[messages.length - 1]?.content || "";

  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.text();
  } catch (error) {
    clearTimeout(timeout);

    const fallbackUrl = `${AI_ENDPOINT}${encodeURIComponent(lastUser.slice(0, 1500))}?model=${encodeURIComponent(model)}`;
    const fallback = await fetch(fallbackUrl);

    if (!fallback.ok) {
      throw new Error(
        `${error?.message || "Erreur"} / fallback HTTP ${fallback.status}`
      );
    }

    return await fallback.text();
  }
}

function buildSystemPrompt(context) {
  return `Tu es l'assistant expert intégré de Kevin Expert Suite.
Tu combines :
- diagnostic automobile ;
- analyse incendie et électricité véhicule ;
- droit français et jurisprudence ;
- aide à la rédaction technique et juridique ;
- expertise contextuelle.

Règles :
- Réponds en français.
- Sois précis, structuré et prudent.
- Utilise prioritairement la base locale extraite ci-dessous.
- Si l'information manque, dis-le clairement.
- Ne invente pas de texte légal, de norme ou de DTC.
- Termine par des hypothèses, vérifications recommandées et limites.

Base locale extraite :
${context || "Aucune donnée locale pertinente trouvée."}`;
}

async function runAI() {
  const prompt = state.aiPrompt.trim();
  if (!prompt || state.aiBusy) return;

  state.aiBusy = true;
  state.aiResults = [];
  state.notice = "";
  render();

  try {
    const context = retrieveContext(prompt, 12);
    const messages = [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: prompt }
    ];

    const settled = await Promise.allSettled(
      AI_MODELS.map((model) => callModel(model, messages))
    );

    state.aiResults = settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return {
          label: AI_MODELS[index],
          ok: true,
          text: result.value
        };
      }

      return {
        label: AI_MODELS[index],
        ok: false,
        text: String(result.reason?.message || result.reason)
      };
    });

    state.aiHistory.unshift({
      prompt,
      date: new Date().toISOString(),
      results: state.aiResults.map((r) => ({
        model: r.label,
        ok: r.ok,
        text: r.text.slice(0, 1200)
      }))
    });

    state.aiHistory = state.aiHistory.slice(0, 50);
    await setJson("ai_history", state.aiHistory);
  } catch (error) {
    state.aiResults = [
      {
        label: "system",
        ok: false,
        text: String(error?.message || error)
      }
    ];
  } finally {
    state.aiBusy = false;
    render();
  }
}

async function generateExpertise() {
  if (state.expertiseBusy) return;

  const d = state.expertise;
  const combined = `${d.marque} ${d.modele} ${d.motorisation} ${d.faits} ${d.dtc} ${d.dommages} ${d.incendie} ${d.question} ${d.assurance}`;

  if (!combined.trim()) {
    state.notice = "Merci de renseigner au moins un champ.";
    render();
    return;
  }

  state.expertiseBusy = true;
  state.notice = "";
  render();

  try {
    const context = retrieveContext(combined, 15);

    const prompt = `Analyse contextuelle experte demandée.

Véhicule :
- Marque : ${d.marque || "non précisé"}
- Modèle : ${d.modele || "non précisé"}
- Année : ${d.annee || "non précisée"}
- Kilométrage : ${d.km || "non précisé"}
- Motorisation : ${d.motorisation || "non précisée"}

Faits :
${d.faits || "non précisés"}

DTC / codes défaut :
${d.dtc || "aucun"}

Dommages constatés :
${d.dommages || "non précisés"}

Contexte incendie / électrique :
${d.incendie || "non précisé"}

Question juridique / assurance :
${d.question || "non précisée"}

Éléments assurance / expertise :
${d.assurance || "non précisés"}

Produis une structure d'analyse experte :
1. Synthèse des faits
2. Hypothèses techniques principales
3. Hypothèses électriques / incendie si applicables
4. DTC et pannes pertinents à vérifier
5. Implications juridiques possibles
6. Éléments de preuve à réunir
7. Questions complémentaires à poser
8. Conclusion provisoire prudente
9. Plan de rédaction du rapport`;

    const messages = [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: prompt }
    ];

    const result = await callModel("openai", messages);
    state.expertiseResult = result;

    state.expertiseHistory.unshift({
      date: new Date().toISOString(),
      summary: `${d.marque} ${d.modele} - ${(d.faits || d.question || "").slice(0, 100)}`,
      result: result.slice(0, 1800)
    });

    state.expertiseHistory = state.expertiseHistory.slice(0, 30);
    await setJson("expertise_history", state.expertiseHistory);
  } catch (error) {
    state.expertiseResult =
      "Erreur IA : " + (error?.message || String(error));
  } finally {
    state.expertiseBusy = false;
    render();
  }
}

async function generateRedaction() {
  if (state.redactionBusy) return;

  const type = state.redaction.type;
  const facts = state.redaction.facts.trim();

  if (!facts) {
    state.notice = "Merci de décrire les faits ou le contexte.";
    render();
    return;
  }

  state.redactionBusy = true;
  state.notice = "";
  render();

  try {
    const context = retrieveContext(facts, 12);

    const typeLabels = {
      constat: "constat technique automobile",
      incendie: "note d'analyse incendie / électricité véhicule",
      assurance: "courrier ou note destinée à l'assurance",
      juridique: "analyse juridique préliminaire",
      expertise: "rapport d'expertise contextuel"
    };

    const prompt = `Rédige un ${typeLabels[type] || "document professionnel"}.

Faits / contexte :
${facts}

Contraintes :
- ton professionnel ;
- français clair ;
- structure en sections ;
- distinguer faits, observations, hypothèses, conclusions ;
- mentionner les vérifications nécessaires ;
- rester prudent juridiquement.`;

    const messages = [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: prompt }
    ];

    const result = await callModel("openai", messages);
    state.redactionResult = result;
  } catch (error) {
    state.redactionResult =
      "Erreur IA : " + (error?.message || String(error));
  } finally {
    state.redactionBusy = false;
    render();
  }
}

async function openLegacy(id) {
  const mod = LEGACY_MODULES.find((m) => m.id === id);
  if (!mod) return;

  state.selectedLegacy = id;
  state.legacyBusy = true;
  state.legacySrc = "";
  state.legacyLabel = "Vérification locale…";
  render();

  let src = mod.remote;
  let label = "En ligne";

  if (state.settings.preferLocalLegacy) {
    try {
      const res = await fetch(mod.local, {
        method: "HEAD",
        cache: "no-store"
      });

      if (res.ok) {
        src = mod.local;
        label = "Local";
      }
    } catch {
      // fallback remote
    }
  }

  state.legacySrc = src;
  state.legacyLabel = label;
  state.legacyBusy = false;
  render();
}

function closeLegacy() {
  state.selectedLegacy = null;
  state.legacySrc = "";
  state.legacyLabel = "";
  render();
}

async function openExternal(url) {
  try {
    await Browser.open({ url });
  } catch {
    window.open(url, "_blank");
  }
}

function countItems() {
  const collections = getCollections();
  let total = 0;

  for (const [, items] of collections) {
    if (Array.isArray(items)) total += items.length;
  }

  return total;
}

function loginView() {
  return `
    <div class="auth">
      <div class="card">
        <h1>Kevin Expert Suite</h1>
        <p class="muted">
          Application fusionnée : technique, incendie, juridique, rédaction, expertise, IA.
        </p>

        <div class="tabs">
          <button
            data-action="loginMode"
            data-mode="admin"
            class="${state.loginMode === "admin" ? "active" : ""}"
          >
            Admin
          </button>
          <button
            data-action="loginMode"
            data-mode="tier"
            class="${state.loginMode === "tier" ? "active" : ""}"
          >
            Accès tiers
          </button>
        </div>

        ${
          state.loginMode === "admin"
            ? `
              <form id="adminLoginForm">
                <label>
                  Mot de passe administrateur
                  <input
                    id="adminPwd"
                    type="password"
                    value="${esc(state.adminPwd)}"
                    placeholder="Mot de passe"
                    autocomplete="current-password"
                  />
                </label>
                <button type="submit" class="primary">
                  Connexion admin
                </button>
              </form>
            `
            : `
              <form id="tierLoginForm">
                <label>
                  Ton nom pour la demande d’accès
                  <input
                    id="tierName"
                    type="text"
                    value="${esc(state.tierName)}"
                    placeholder="Ex : Atelier Dupont"
                  />
                </label>
                <button type="submit" class="primary">
                  Demander l’accès
                </button>
              </form>
            `
        }

        <div class="error ${state.error ? "" : "hidden"}">
          ${esc(state.error)}
        </div>

        <div class="footer-note">
          V3 Fusion : une seule APK globale, base locale, IA, admin, tiers, sauvegarde.
        </div>
      </div>
    </div>
  `;
}

function tierBlockedView(user) {
  return `
    <div class="center">
      <div class="card">
        <h2>Accès tiers</h2>
        <p>Bonjour <strong>${esc(user.name)}</strong>.</p>
        <p>
          Statut actuel :
          <strong>${STATUS_LABELS[user.status]}</strong>
        </p>

        ${
          user.status === "pending"
            ? "<p>Ta demande est en attente de validation par l’administrateur.</p>"
            : ""
        }

        ${
          user.status === "denied"
            ? "<p>Ta demande a été refusée.</p>"
            : ""
        }

        ${
          user.status === "revoked"
            ? "<p>Ton accès a été révoqué.</p>"
            : ""
        }

        <button data-action="logout">Quitter</button>
      </div>
    </div>
  `;
}

function errorView(message) {
  return `
    <div class="center">
      <div class="card">
        <h2>Erreur</h2>
        <p>${esc(message)}</p>
        <button data-action="logout">Revenir à la connexion</button>
      </div>
    </div>
  `;
}

function homeView() {
  const stats = [
    { label: "Entrées base", value: countItems() },
    { label: "DTC", value: state.kb.technique?.dtc?.length || 0 },
    { label: "Pannes", value: state.kb.technique?.pannes?.length || 0 },
    { label: "Rappels", value: state.kb.technique?.rappels?.length || 0 },
    { label: "Incendie", value: (state.kb.incendie?.patterns?.length || 0) + (state.kb.incendie?.polymere?.length || 0) + (state.kb.incendie?.metaux?.length || 0) },
    { label: "Juridique", value: state.kb.juridique?.fiches?.length || 0 },
    { label: "Rédaction", value: state.kb.redaction?.modeles?.length || 0 },
    { label: "Utilisateurs tiers", value: state.users.length }
  ];

  return `
    <section class="panel">
      <h2>Tableau de bord fusionné</h2>
      <p class="muted">
        Toutes les fonctions des projets sont regroupées dans une seule application.
      </p>

      <div class="stat-grid">
        ${stats
          .map(
            (s) => `
              <div class="stat">
                <strong>${s.value}</strong>
                <span>${esc(s.label)}</span>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="row">
        <button class="primary" data-action="theme" data-theme="technique">Technique auto</button>
        <button data-action="theme" data-theme="incendie">Incendie & élec.</button>
        <button data-action="theme" data-theme="juridique">Juridique</button>
        <button data-action="theme" data-theme="redaction">Rédaction</button>
        <button data-action="theme" data-theme="expertise">Expertise</button>
        <button data-action="theme" data-theme="ia">IA</button>
        <button data-action="theme" data-theme="recherche">Recherche</button>
      </div>

      ${
        state.notice
          ? `<div class="notice">${esc(state.notice)}</div>`
          : ""
      }
    </section>
  `;
}

function listHtml(items, emptyText, renderItem) {
  if (!items || !items.length) {
    return `<p class="muted">${esc(emptyText)}</p>`;
  }

  return `<div class="list">${items.map(renderItem).join("")}</div>`;
}

function techniqueView() {
  const t = state.kb.technique || {};

  return `
    <section class="panel">
      <h2>Technique automobile</h2>

      <div class="row">
        <button class="primary" data-action="theme" data-theme="ia">Question IA technique</button>
        <button data-action="theme" data-theme="recherche">Recherche globale</button>
      </div>

      <h3 class="section-title">DTC</h3>
      ${listHtml(t.dtc, "Aucun DTC dans la base locale.", (item) => `
        <article class="entry">
          <div class="entry-head">
            <strong>${esc(item.code || "-")}</strong>
            <span class="chip">${esc(item.gravite || "info")}</span>
          </div>
          <p>${esc(item.designation || "")}</p>
          ${
            item.causes
              ? `
                <details>
                  <summary>Causes / pistes</summary>
                  <pre>${esc(Array.isArray(item.causes) ? item.causes.join("\n") : item.causes)}</pre>
                </details>
              `
              : ""
          }
          ${item.source ? `<div class="small muted">Source : ${esc(item.source)}</div>` : ""}
        </article>
      `)}

      <h3 class="section-title">Pannes</h3>
      ${listHtml(t.pannes, "Aucune panne enregistrée.", (item) => `
        <article class="entry">
          <div class="entry-head">
            <strong>${esc(item.marque || "Multimarque")} ${esc(item.modele || "")}</strong>
          </div>
          <p><strong>Symptôme :</strong> ${esc(item.symptome || "")}</p>
          <p><strong>Cause :</strong> ${esc(item.cause || "")}</p>
          <p><strong>Vérification / fix :</strong> ${esc(item.fix || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Rappels</h3>
      ${listHtml(t.rappels, "Aucun rappel enregistré.", (item) => `
        <article class="entry">
          <div class="entry-head">
            <strong>${esc(item.marque || "")} ${esc(item.modele || "")}</strong>
          </div>
          <p>${esc(item.titre || "")}</p>
          <p class="muted">${esc(item.description || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Fiches expert</h3>
      ${listHtml(t.fichesExpert, "Aucune fiche expert.", (item) => `
        <article class="entry">
          <strong>${esc(item.titre || item.title || "Fiche")}</strong>
          <p>${esc(item.conditions || "")}</p>
          <p>${esc(item.effets || "")}</p>
          <p class="muted">${esc(item.baseLegale || "")}</p>
        </article>
      `)}
    </section>
  `;
}

function incendieView() {
  const i = state.kb.incendie || {};

  return `
    <section class="panel">
      <h2>Incendie & électricité</h2>

      <div class="row">
        <button class="primary" data-action="theme" data-theme="ia">Question IA incendie</button>
        <button data-action="theme" data-theme="expertise">Analyse contextuelle</button>
      </div>

      <h3 class="section-title">Patterns</h3>
      ${listHtml(i.patterns, "Aucun pattern.", (item) => `
        <article class="entry">
          <strong>${esc(item.nom || item.name || "Pattern")}</strong>
          <p><strong>Zone :</strong> ${esc(item.zone || "")}</p>
          <p><strong>Mécanisme :</strong> ${esc(item.mecanisme || item.mechanism || "")}</p>
          ${
            item.preuves
              ? `<details><summary>Preuves</summary><pre>${esc(Array.isArray(item.preuves) ? item.preuves.join("\n") : item.preuves)}</pre></details>`
              : ""
          }
        </article>
      `)}

      <h3 class="section-title">Chimie du feu</h3>
      ${listHtml(i.chimieFeu, "Aucune donnée chimie du feu.", (item) => `
        <article class="entry">
          <strong>${esc(item.gaz || item.name || "-")}</strong>
          <p>${esc(item.source || "")}</p>
          <p class="muted">${esc(item.danger || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Polymères</h3>
      ${listHtml(i.polymere, "Aucun polymère.", (item) => `
        <article class="entry">
          <strong>${esc(item.nom || item.name || "-")}</strong>
          <p><strong>Usages :</strong> ${esc(Array.isArray(item.usages) ? item.usages.join(", ") : item.usages || "")}</p>
          <p><strong>Comportement feu :</strong> ${esc(item.feu || item.fire_behavior || "")}</p>
          <p class="muted">${esc(item.role || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Métaux / fusion</h3>
      ${listHtml(i.metaux, "Aucun métal.", (item) => `
        <article class="entry">
          <strong>${esc(item.materiau || item.material || "-")}</strong>
          <p>Fusion : ${esc(item.fusionC ?? item.melting_c ?? "-")} °C / ${esc(item.fusionF ?? item.melting_f ?? "-")} °F</p>
          <p>${esc(item.aspect || "")}</p>
          <p class="muted">${esc(item.interpretation || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Batterie HT</h3>
      ${listHtml(i.batterieHT, "Aucune donnée batterie HT.", (item) => `
        <article class="entry">
          <strong>${esc(item.theme || item.topic || "-")}</strong>
          <p>${esc(item.detail || "")}</p>
          <p><strong>Risque :</strong> ${esc(item.risk || "")}</p>
          <p><strong>Prévention :</strong> ${esc(item.prevention || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Fils électriques / ASTM</h3>
      ${listHtml(i.fils, "Aucune donnée fils.", (item) => `
        <article class="entry">
          <strong>${esc(item.norme || item.standard || "-")}</strong>
          <p>${esc(item.objet || item.purpose || "")}</p>
          <p class="muted">${esc(item.interpretation || "")}</p>
        </article>
      `)}
    </section>
  `;
}

function juridiqueView() {
  const j = state.kb.juridique || {};

  return `
    <section class="panel">
      <h2>Juridique & jurisprudence</h2>

      <div class="row">
        <button class="primary" data-action="theme" data-theme="ia">Question IA juridique</button>
        <button data-action="theme" data-theme="redaction">Rédaction juridique</button>
      </div>

      <h3 class="section-title">Fiches juridiques</h3>
      ${listHtml(j.fiches, "Aucune fiche juridique.", (item) => `
        <article class="entry">
          <strong>${esc(item.titre || item.title || "Fiche")}</strong>
          <p><strong>Conditions :</strong> ${esc(item.conditions || "")}</p>
          <p><strong>Effets :</strong> ${esc(item.effets || "")}</p>
          <p><strong>Base légale :</strong> ${esc(item.baseLegale || item.base_legale || "")}</p>
          ${item.source ? `<div class="small muted">Source : ${esc(item.source)}</div>` : ""}
        </article>
      `)}

      <h3 class="section-title">Jurisprudences</h3>
      ${listHtml(j.jurisprudences, "Aucune jurisprudence chargée.", (item) => `
        <article class="entry">
          <strong>${esc(item.titre || item.title || "Décision")}</strong>
          <p>${esc(item.resume || item.summary || "")}</p>
          <p class="muted">${esc(item.portee || item.scope || "")}</p>
        </article>
      `)}

      <h3 class="section-title">Questions types</h3>
      ${listHtml(j.questions, "Aucune question type.", (item) => `
        <article class="entry">
          <strong>${esc(item.question || item.title || "-")}</strong>
          <p class="muted">${esc(item.reponse || item.answer || "")}</p>
        </article>
      `)}
    </section>
  `;
}

function redactionView() {
  const r = state.kb.redaction || {};

  return `
    <section class="panel">
      <h2>Rédaction & analyse</h2>

      <form id="redactionForm">
        <label>
          Type de document
          <select id="redType">
            <option value="constat" ${state.redaction.type === "constat" ? "selected" : ""}>Constat technique</option>
            <option value="incendie" ${state.redaction.type === "incendie" ? "selected" : ""}>Note incendie / électricité</option>
            <option value="assurance" ${state.redaction.type === "assurance" ? "selected" : ""}>Note assurance</option>
            <option value="juridique" ${state.redaction.type === "juridique" ? "selected" : ""}>Analyse juridique</option>
            <option value="expertise" ${state.redaction.type === "expertise" ? "selected" : ""}>Rapport d’expertise</option>
          </select>
        </label>

        <label>
          Faits / contexte / éléments techniques
          <textarea
            id="redFacts"
            placeholder="Décris le véhicule, les faits, les dommages, les DTC, le contexte incendie, la demande d’assurance, etc."
          >${esc(state.redaction.facts)}</textarea>
        </label>

        <button type="submit" class="primary" ${state.redactionBusy ? "disabled" : ""}>
          ${state.redactionBusy ? "Génération…" : "Générer une proposition de rédaction"}
        </button>
      </form>

      ${
        state.redactionResult
          ? `
            <h3 class="section-title">Résultat</h3>
            <article class="result ok">
              <pre>${esc(state.redactionResult)}</pre>
            </article>
          `
          : ""
      }

      <h3 class="section-title">Modèles locaux</h3>
      ${listHtml(r.modeles, "Aucun modèle de rédaction.", (item) => `
        <article class="entry">
          <strong>${esc(item.titre || item.title || "Modèle")}</strong>
          ${
            item.sections
              ? `<details><summary>Sections</summary><pre>${esc(Array.isArray(item.sections) ? item.sections.join("\n") : item.sections)}</pre></details>`
              : ""
          }
        </article>
      `)}
    </section>
  `;
}

function expertiseView() {
  const d = state.expertise;

  return `
    <section class="panel">
      <h2>Expertise contextuelle fusionnée</h2>
      <p class="muted">
        Croise technique, incendie, juridique, DTC, dommages et demande IA.
      </p>

      <form id="expertiseForm">
        <div class="inline-inputs">
          <label>Marque<input id="expMarque" value="${esc(d.marque)}" /></label>
          <label>Modèle<input id="expModele" value="${esc(d.modele)}" /></label>
          <label>Année<input id="expAnnee" value="${esc(d.annee)}" /></label>
          <label>Km<input id="expKm" value="${esc(d.km)}" /></label>
          <label>Motorisation<input id="expMotorisation" value="${esc(d.motorisation)}" /></label>
        </div>

        <label>
          Faits
          <textarea id="expFaits">${esc(d.faits)}</textarea>
        </label>

        <div class="two-cols">
          <label>
            DTC / codes
            <textarea id="expDtc">${esc(d.dtc)}</textarea>
          </label>

          <label>
            Dommages
            <textarea id="expDommages">${esc(d.dommages)}</textarea>
          </label>
        </div>

        <div class="two-cols">
          <label>
            Contexte incendie / électrique
            <textarea id="expIncendie">${esc(d.incendie)}</textarea>
          </label>

          <label>
            Question juridique / assurance
            <textarea id="expQuestion">${esc(d.question)}</textarea>
          </label>
        </div>

        <label>
          Éléments assurance / expertise
          <textarea id="expAssurance">${esc(d.assurance)}</textarea>
        </label>

        <button type="submit" class="primary" ${state.expertiseBusy ? "disabled" : ""}>
          ${state.expertiseBusy ? "Analyse en cours…" : "Générer analyse contextuelle"}
        </button>
      </form>

      ${
        state.expertiseResult
          ? `
            <h3 class="section-title">Analyse générée</h3>
            <article class="result ok">
              <pre>${esc(state.expertiseResult)}</pre>
            </article>
          `
          : ""
      }

      <h3 class="section-title">Historique</h3>
      <div class="history">
        ${
          state.expertiseHistory.length === 0
            ? `<p class="muted">Aucun historique.</p>`
            : state.expertiseHistory
                .slice(0, 10)
                .map(
                  (h) => `
                    <article class="history-item">
                      <strong>${esc(h.summary || "Analyse")}</strong>
                      <div class="muted small">${esc(new Date(h.date).toLocaleString("fr-FR"))}</div>
                      <pre>${esc(h.result)}</pre>
                    </article>
                  `
                )
                .join("")
        }
      </div>
    </section>
  `;
}

function aiView() {
  return `
    <section class="panel">
      <h2>IA multi-modèles sans clé API</h2>
      <p class="muted">
        Interroge plusieurs modèles gratuits avec contexte issu de la base locale.
        Les services publics peuvent être lents ou limités.
      </p>

      <form id="aiForm">
        <label>
          Question technique, juridique, incendie, diagnostic, rédaction
          <textarea id="aiPrompt" placeholder="Ex : Analyse P0300 + suspicion court-circuit + conséquences juridiques vice caché.">${esc(state.aiPrompt)}</textarea>
        </label>

        <button type="submit" class="primary" ${state.aiBusy ? "disabled" : ""}>
          ${state.aiBusy ? "Interrogation…" : "Interroger les IA"}
        </button>
      </form>

      <div class="results">
        ${state.aiResults
          .map(
            (result) => `
              <article class="result ${result.ok ? "ok" : "ko"}">
                <h3>${esc(result.label)}</h3>
                <pre>${esc(result.text)}</pre>
              </article>
            `
          )
          .join("")}
      </div>

      <h3 class="section-title">Historique</h3>
      <div class="history">
        ${
          state.aiHistory.length === 0
            ? `<p class="muted">Aucun historique.</p>`
            : state.aiHistory
                .slice(0, 10)
                .map(
                  (h) => `
                    <article class="history-item">
                      <strong>${esc(h.prompt.slice(0, 140))}</strong>
                      <div class="muted small">${esc(new Date(h.date).toLocaleString("fr-FR"))}</div>
                      <pre>${esc(
                        h.results
                          .map((r) => `${r.model}: ${r.ok ? "OK" : "KO"}`)
                          .join("\n")
                      )}</pre>
                    </article>
                  `
                )
                .join("")
        }
      </div>
    </section>
  `;
}

function searchView() {
  return `
    <section class="panel">
      <h2>Recherche globale</h2>

      <form id="searchForm">
        <label>
          Rechercher dans toute la base fusionnée
          <input
            id="searchQ"
            type="text"
            value="${esc(state.searchQuery)}"
            placeholder="Ex : P0300, batterie HT, vice caché, polymère, rappel, ASTM E2929…"
          />
        </label>

        <div class="row">
          <button type="submit" class="primary">Rechercher</button>
          <button type="button" data-action="clearSearch">Effacer</button>
        </div>
      </form>

      <div class="search-results">
        ${
          state.searchResults.length === 0
            ? `<p class="muted">Aucun résultat pour le moment.</p>`
            : state.searchResults
                .map(
                  (r) => `
                    <article class="search-result">
                      <strong>${esc(r.type)}</strong> — ${esc(r.title)}
                      <pre>${esc(r.detail)}</pre>
                      <div class="row">
                        <button data-action="theme" data-theme="${esc(r.theme)}">Ouvrir le thème</button>
                        ${
                          r.action === "legacy"
                            ? `<button data-action="openLegacy" data-id="${esc(r.id)}">Ouvrir l’ancien projet</button>`
                            : ""
                        }
                      </div>
                    </article>
                  `
                )
                .join("")
        }
      </div>
    </section>
  `;
}

function projectsView() {
  return `
    <section class="panel">
      <h2>Anciens projets intégrés</h2>
      <p class="muted">
        Ces modules restent accessibles comme référence. La fusion principale se fait via les thèmes ci-dessus.
      </p>

      <label class="switch">
        <input
          id="preferLocalLegacy"
          type="checkbox"
          ${state.settings.preferLocalLegacy ? "checked" : ""}
        />
        Prioriser les versions locales si disponibles
      </label>

      <div class="grid">
        ${LEGACY_MODULES.map(
          (mod) => `
            <button class="legacy-card module-card" data-action="openLegacy" data-id="${esc(mod.id)}">
              <h3>${esc(mod.title)}</h3>
              <p>${esc(mod.description)}</p>
              <span class="mini">Ouvrir</span>
            </button>
          `
        ).join("")}
      </div>
    </section>
  `;
}

function legacyViewerView() {
  const mod = LEGACY_MODULES.find((m) => m.id === state.selectedLegacy);
  if (!mod) return projectsView();

  return `
    <section class="viewer">
      <div class="viewer-bar">
        <button data-action="closeLegacy">← Retour</button>
        <strong>${esc(mod.title)}</strong>
        <span class="source-badge ${state.legacyLabel === "Local" ? "local" : "remote"}">
          ${esc(state.legacyLabel || "…")}
        </span>
        <button data-action="openExternal" data-url="${esc(mod.remote)}">
          Navigateur
        </button>
      </div>

      ${
        state.legacyBusy
          ? `<div class="center">Chargement du module…</div>`
          : `
            <iframe
              src="${esc(state.legacySrc)}"
              title="${esc(mod.title)}"
              allow="clipboard-write; web-share; fullscreen"
            ></iframe>
          `
      }
    </section>
  `;
}

function adminView() {
  return `
    <section class="panel">
      <h2>Administration</h2>

      <h3>Accès tiers</h3>
      <div class="row">
        <button data-action="refreshUsers">Rafraîchir</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Statut</th>
            <th>Créé le</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            state.users.length === 0
              ? `
                <tr>
                  <td colspan="4">Aucune demande tiers pour le moment.</td>
                </tr>
              `
              : state.users
                  .map(
                    (user) => `
                      <tr>
                        <td>${esc(user.name)}</td>
                        <td>${STATUS_LABELS[user.status]}</td>
                        <td>${new Date(user.createdAt).toLocaleString("fr-FR")}</td>
                        <td class="row-actions">
                          <button
                            data-action="grant"
                            data-id="${esc(user.id)}"
                            ${user.status === "granted" ? "disabled" : ""}
                          >
                            Accorder
                          </button>
                          <button
                            data-action="deny"
                            data-id="${esc(user.id)}"
                            ${user.status === "denied" ? "disabled" : ""}
                          >
                            Refuser
                          </button>
                          <button
                            data-action="revoke"
                            data-id="${esc(user.id)}"
                            ${user.status === "revoked" ? "disabled" : ""}
                          >
                            Révoquer
                          </button>
                        </td>
                      </tr>
                    `
                  )
                  .join("")
          }
        </tbody>
      </table>

      <h3 class="section-title">Base locale</h3>
      <div class="stat-grid">
        <div class="stat"><strong>${countItems()}</strong><span>Entrées totales</span></div>
        <div class="stat"><strong>${state.kb.technique?.dtc?.length || 0}</strong><span>DTC</span></div>
        <div class="stat"><strong>${state.kb.juridique?.fiches?.length || 0}</strong><span>Fiches juridiques</span></div>
        <div class="stat"><strong>${state.kb.incendie?.polymere?.length || 0}</strong><span>Polymères</span></div>
      </div>

      <h3 class="section-title">Sauvegarde / import</h3>
      <div class="row">
        <button data-action="exportBackup">Générer sauvegarde JSON</button>
        <button data-action="copyExport">Copier</button>
        <button data-action="resetKb">Réinitialiser base personnalisée</button>
      </div>

      <label class="section-title">
        Sauvegarde générée
        <textarea id="exportText" readonly>${esc(state.exportText)}</textarea>
      </label>

      <form id="importForm">
        <label>
          Coller une sauvegarde JSON à importer
          <textarea id="importText" placeholder='{"users":[],"settings":{},"kbOverride":{}}'>${esc(state.importText)}</textarea>
        </label>
        <button type="submit" class="primary">Importer</button>
      </form>

      ${
        state.notice
          ? `<div class="notice">${esc(state.notice)}</div>`
          : ""
      }

      <h3 class="section-title">Informations</h3>
      <ul>
        <li>Mot de passe admin par défaut : Kevin83600.</li>
        <li>Hash SHA-256 stocké localement.</li>
        <li>Accès tiers géré localement sur l’appareil.</li>
        <li>La révocation à distance multi-appareils nécessitera un backend.</li>
      </ul>
    </section>
  `;
}

function themeView() {
  if (state.theme === "technique") return techniqueView();
  if (state.theme === "incendie") return incendieView();
  if (state.theme === "juridique") return juridiqueView();
  if (state.theme === "redaction") return redactionView();
  if (state.theme === "expertise") return expertiseView();
  if (state.theme === "ia") return aiView();
  if (state.theme === "recherche") return searchView();
  if (state.theme === "projets") return projectsView();
  if (state.theme === "admin" && state.session?.role === "admin") return adminView();
  return homeView();
}

function mainView() {
  const roleLabel =
    state.session.role === "admin"
      ? "Administrateur"
      : `Tier : ${state.session.name}`;

  return `
    <div class="shell">
      <header class="topbar">
        <div>
          <strong>Kevin Expert Suite</strong>
          <div class="muted small">${esc(roleLabel)}</div>
        </div>

        <div class="topbar-right">
          <span
            id="onlineBadge"
            class="badge ${state.online ? "online" : "offline"}"
          >
            ${state.online ? "Online" : "Offline"}
          </span>
          <button data-action="logout">Déconnexion</button>
        </div>
      </header>

      <nav class="maintabs">
        ${THEMES.filter((t) => !t.adminOnly || state.session.role === "admin")
          .map(
            (t) => `
              <button
                data-action="theme"
                data-theme="${esc(t.id)}"
                class="${state.theme === t.id ? "active" : ""}"
              >
                ${esc(t.title)}
              </button>
            `
          )
          .join("")}
      </nav>

      <main class="content">
        ${themeView()}
      </main>
    </div>
  `;
}

function render() {
  if (!state.ready) {
    app.innerHTML = `<div class="center">Chargement de Kevin Expert Suite V3…</div>`;
    return;
  }

  if (!state.session) {
    app.innerHTML = loginView();
    return;
  }

  if (state.session.role === "tier") {
    const user = currentTierUser();

    if (!user) {
      app.innerHTML = errorView("Compte tiers introuvable.");
      return;
    }

    if (user.status !== "granted") {
      app.innerHTML = tierBlockedView(user);
      return;
    }
  }

  if (state.selectedLegacy) {
    app.innerHTML = legacyViewerView();
    return;
  }

  app.innerHTML = mainView();
}

function updateOnlineBadge() {
  const badge = document.getElementById("onlineBadge");
  if (!badge) return;

  badge.textContent = state.online ? "Online" : "Offline";
  badge.className = `badge ${state.online ? "online" : "offline"}`;
}

document.addEventListener("input", (event) => {
  const id = event.target.id;

  if (id === "adminPwd") state.adminPwd = event.target.value;
  if (id === "tierName") state.tierName = event.target.value;
  if (id === "searchQ") state.searchQuery = event.target.value;
  if (id === "aiPrompt") state.aiPrompt = event.target.value;
  if (id === "importText") state.importText = event.target.value;

  if (id === "redFacts") state.redaction.facts = event.target.value;

  if (id === "expMarque") state.expertise.marque = event.target.value;
  if (id === "expModele") state.expertise.modele = event.target.value;
  if (id === "expAnnee") state.expertise.annee = event.target.value;
  if (id === "expKm") state.expertise.km = event.target.value;
  if (id === "expMotorisation") state.expertise.motorisation = event.target.value;
  if (id === "expFaits") state.expertise.faits = event.target.value;
  if (id === "expDtc") state.expertise.dtc = event.target.value;
  if (id === "expDommages") state.expertise.dommages = event.target.value;
  if (id === "expIncendie") state.expertise.incendie = event.target.value;
  if (id === "expQuestion") state.expertise.question = event.target.value;
  if (id === "expAssurance") state.expertise.assurance = event.target.value;
});

document.addEventListener("change", async (event) => {
  const id = event.target.id;

  if (id === "redType") {
    state.redaction.type = event.target.value;
  }

  if (id === "preferLocalLegacy") {
    state.settings.preferLocalLegacy = event.target.checked;
    await setJson("settings", state.settings);
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formId = event.target.id;

  if (formId === "adminLoginForm") {
    state.error = "";

    try {
      await loginAdmin(state.adminPwd);
      state.adminPwd = "";
      state.theme = "accueil";
      render();
    } catch (error) {
      state.error = error.message || "Erreur de connexion admin.";
      render();
    }

    return;
  }

  if (formId === "tierLoginForm") {
    state.error = "";

    try {
      await loginTier(state.tierName);
      state.tierName = "";
      state.theme = "accueil";
      render();
    } catch (error) {
      state.error = error.message || "Erreur de demande d’accès.";
      render();
    }

    return;
  }

  if (formId === "searchForm") {
    state.searchResults = searchAll(state.searchQuery);
    state.theme = "recherche";
    render();
    return;
  }

  if (formId === "aiForm") {
    await runAI();
    return;
  }

  if (formId === "expertiseForm") {
    await generateExpertise();
    return;
  }

  if (formId === "redactionForm") {
    await generateRedaction();
    return;
  }

  if (formId === "importForm") {
    try {
      const data = JSON.parse(state.importText);

      if (Array.isArray(data.users)) {
        await setUsers(data.users);
      }

      if (data.settings && isObject(data.settings)) {
        state.settings = { ...state.settings, ...data.settings };
        await setJson("settings", state.settings);
      }

      if (Array.isArray(data.aiHistory)) {
        state.aiHistory = data.aiHistory;
        await setJson("ai_history", state.aiHistory);
      }

      if (Array.isArray(data.expertiseHistory)) {
        state.expertiseHistory = data.expertiseHistory;
        await setJson("expertise_history", state.expertiseHistory);
      }

      if (data.kbOverride && isObject(data.kbOverride)) {
        state.kbOverride = data.kbOverride;
        await saveKbOverride();
        await loadKnowledge();
      }

      state.notice = "Sauvegarde importée avec succès.";
    } catch (error) {
      state.notice = "Import échoué : " + (error?.message || String(error));
    }

    render();
    return;
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "loginMode") {
    state.loginMode = button.dataset.mode;
    state.error = "";
    render();
    return;
  }

  if (action === "logout") {
    await logout();
    return;
  }

  if (action === "theme") {
    state.theme = button.dataset.theme;
    state.selectedLegacy = null;
    state.notice = "";

    if (state.theme === "admin") {
      state.users = await getUsers();
    }

    render();
    return;
  }

  if (action === "clearSearch") {
    state.searchQuery = "";
    state.searchResults = [];
    render();
    return;
  }

  if (action === "openLegacy") {
    await openLegacy(button.dataset.id);
    return;
  }

  if (action === "closeLegacy") {
    closeLegacy();
    return;
  }

  if (action === "openExternal") {
    await openExternal(button.dataset.url);
    return;
  }

  if (action === "refreshUsers") {
    state.users = await getUsers();
    render();
    return;
  }

  if (action === "grant") {
    await setUserStatus(button.dataset.id, "granted");
    state.users = await getUsers();
    render();
    return;
  }

  if (action === "deny") {
    await setUserStatus(button.dataset.id, "denied");
    state.users = await getUsers();
    render();
    return;
  }

  if (action === "revoke") {
    await setUserStatus(button.dataset.id, "revoked");
    state.users = await getUsers();
    render();
    return;
  }

  if (action === "exportBackup") {
    const payload = {
      app: "Kevin Expert Suite",
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      users: state.users,
      settings: state.settings,
      aiHistory: state.aiHistory,
      expertiseHistory: state.expertiseHistory,
      kbOverride: state.kbOverride
    };

    state.exportText = JSON.stringify(payload, null, 2);
    state.notice = "Sauvegarde générée. Copie-la ou importe-la sur un autre appareil.";
    render();
    return;
  }

  if (action === "copyExport") {
    try {
      await navigator.clipboard.writeText(state.exportText);
      state.notice = "JSON copié dans le presse-papiers.";
    } catch {
      state.notice = "Copie automatique indisponible. Sélectionne manuellement le texte.";
    }

    render();
    return;
  }

  if (action === "resetKb") {
    const ok = window.confirm(
      "Réinitialiser la base personnalisée importée ? La base embarquée sera restaurée."
    );

    if (!ok) return;

    state.kbOverride = {};
    await saveKbOverride();
    await loadKnowledge();
    state.notice = "Base personnalisée réinitialisée.";
    render();
    return;
  }
});

async function initNetwork() {
  try {
    const status = await Network.getStatus();
    state.online = status.connected;

    await Network.addListener("networkStatusChange", (newStatus) => {
      state.online = newStatus.connected;
      updateOnlineBadge();
    });
  } catch (error) {
    console.warn("Network plugin indisponible :", error);
  }
}

async function init() {
  try {
    await ensureAdminHash();
    await ensureNotificationPermission();

    state.session = await getSession();
    state.users = await getUsers();
    state.settings = await getJson("settings", state.settings);
    state.aiHistory = await getJson("ai_history", []);
    state.expertiseHistory = await getJson("expertise_history", []);

    await loadKnowledge();
    await initNetwork();

    state.ready = true;
    render();
  } catch (error) {
    console.error(error);
    state.ready = true;
    app.innerHTML = errorView(
      "Erreur au démarrage : " + (error?.message || String(error))
    );
  }
}

init();
