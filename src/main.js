import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Network } from "@capacitor/network";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Browser } from "@capacitor/browser";
import "./styles.css";

const ADMIN_DEFAULT_PASSWORD = "Kevin83600";

const MODULES = [
  {
    id: "rapport-expertise-contextuel",
    title: "Rapport expertise contextuel",
    description:
      "Analyse de litige automobile, expertise ingénieur + analyse juridique.",
    url: "https://expertkevin06-cell.github.io/rapport-expertise-contextuel/"
  },
  {
    id: "firediag-auto",
    title: "Tech incendie",
    description:
      "NFPA 921, ASTM E2929, chimie du feu, polymères, batterie HT, cartographie de fusion.",
    url: "https://expertkevin06-cell.github.io/firediag-auto/"
  },
  {
    id: "aide-redactionnelle-technique",
    title: "Aide rédactionnelle expert",
    description:
      "Analyse technique et juridique automobile, droit français.",
    url: "https://expertkevin06-cell.github.io/aide-redactionnelle-technique/"
  },
  {
    id: "droit-jurisprudence-ai",
    title: "Droit & jurisprudence IA",
    description:
      "Fiches juridiques, conditions, effets, base légale, sources officielles.",
    url: "https://expertkevin06-cell.github.io/droit-jurisprudence-ai/"
  },
  {
    id: "auto-diagV2",
    title: "Auto Diag V2",
    description: "Diagnostic automobile nouvelle version.",
    url: "https://expertkevin06-cell.github.io/auto-diagV2/"
  },
  {
    id: "auto-diagnostic",
    title: "Auto Diagnostic Pro",
    description:
      "Marques 2017-2026, pannes, rappels, DTC, fiches expert ingénieur.",
    url: "https://expertkevin06-cell.github.io/auto-diagnostic/"
  },
  {
    id: "mon-aide-technique",
    title: "Mon aide technique",
    description: "DTC Diag Pro.",
    url: "https://expertkevin06-cell.github.io/mon-aide-technique/"
  }
];

const STATUS_LABELS = {
  pending: "En attente",
  granted: "Autorisé",
  denied: "Refusé",
  revoked: "Révoqué"
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
  tab: "modules",
  selected: null,
  prompt: "",
  aiBusy: false,
  aiResults: []
};

const app = document.getElementById("app");

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

async function notify(title, body) {
  try {
    if (!Capacitor.isNativePlatform()) return;

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
    const hash = await sha256(ADMIN_DEFAULT_PASSWORD);
    await Preferences.set({ key: "admin_hash", value: hash });
  }
}

async function getSession() {
  return getJson("session", null);
}

async function saveSession(session) {
  await setJson("session", session);
  state.session = session;
}

async function logout() {
  await Preferences.remove({ key: "session" });
  state.session = null;
  state.selected = null;
  state.tab = "modules";
  state.error = "";
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
  await setJson("tier_users", users);
  state.users = users;
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

function moduleById(id) {
  return MODULES.find((m) => m.id === id) || null;
}

function updateOnlineBadge() {
  const badge = document.getElementById("onlineBadge");
  if (!badge) return;

  badge.textContent = state.online ? "Online" : "Offline";
  badge.className = `badge ${state.online ? "online" : "offline"}`;
}

function loginView() {
  return `
    <div class="auth">
      <div class="card">
        <h1>Kevin Expert Suite</h1>
        <p class="muted">
          Expertise automobile, incendie, droit, diagnostic, IA.
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
          V1 : modules chargés en ligne. Le mode hors ligne complet sera ajouté ensuite.
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

function modulesView() {
  return `
    <section>
      <h2>Modules intégrés</h2>
      <div class="grid">
        ${MODULES.map(
          (mod) => `
            <button class="module-card" data-action="openModule" data-id="${esc(mod.id)}">
              <h3>${esc(mod.title)}</h3>
              <p>${esc(mod.description)}</p>
              <span class="mini">Ouvrir le module</span>
            </button>
          `
        ).join("")}
      </div>
    </section>
  `;
}

async function callPollinations(prompt, model) {
  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        model,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (firstError) {
    const fallback = await fetch(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}`
    );

    if (!fallback.ok) {
      throw new Error(
        `${firstError.message} / fallback HTTP ${fallback.status}`
      );
    }

    return await fallback.text();
  }
}

async function runAI() {
  const prompt = state.prompt.trim();
  if (!prompt) return;

  state.aiBusy = true;
  state.aiResults = [];
  render();

  try {
    const models = ["openai", "mistral", "llama"];

    const settled = await Promise.allSettled(
      models.map((model) => callPollinations(prompt, model))
    );

    state.aiResults = settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return {
          label: models[index],
          ok: true,
          text: result.value
        };
      }

      return {
        label: models[index],
        ok: false,
        text: String(result.reason?.message || result.reason)
      };
    });
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

function aiView() {
  return `
    <section class="panel">
      <h2>Recherche multi-IA sans clé API</h2>
      <p class="muted">
        Premier essai via endpoints publics gratuits. Ces services peuvent être
        limités, lents ou indisponibles. Pour une version professionnelle
        hors ligne, il faudra intégrer une IA locale ou auto-hébergée.
      </p>

      <form id="aiForm">
        <label>
          Question
          <textarea
            id="aiPrompt"
            placeholder="Pose une question technique, juridique, diagnostic, incendie…"
          >${esc(state.prompt)}</textarea>
        </label>

        <button type="submit" class="primary" ${state.aiBusy ? "disabled" : ""}>
          ${state.aiBusy ? "Interrogation…" : "Interroger les IA gratuites"}
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
    </section>
  `;
}

function adminView() {
  return `
    <section class="panel">
      <h2>Administration des accès tiers</h2>

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

      <h3>Informations</h3>
      <ul>
        <li>Mot de passe admin par défaut : Kevin83600.</li>
        <li>Il est stocké localement sous forme de hash SHA-256.</li>
        <li>Cette V1 gère les accès sur le même appareil.</li>
        <li>La révocation à distance multi-appareils nécessitera un backend.</li>
      </ul>
    </section>
  `;
}

function tabView() {
  if (state.tab === "ai") return aiView();
  if (state.tab === "admin" && state.session?.role === "admin") return adminView();
  return modulesView();
}

function viewerView() {
  const mod = moduleById(state.selected);
  if (!mod) return modulesView();

  return `
    <section class="viewer">
      <div class="viewer-bar">
        <button data-action="closeModule">← Retour</button>
        <strong>${esc(mod.title)}</strong>
        <button data-action="openExternal" data-url="${esc(mod.url)}">
          Navigateur
        </button>
      </div>

      <iframe
        src="${esc(mod.url)}"
        title="${esc(mod.title)}"
        allow="clipboard-write; web-share; fullscreen"
      ></iframe>
    </section>
  `;
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
        <button
          data-action="tab"
          data-tab="modules"
          class="${state.tab === "modules" ? "active" : ""}"
        >
          Projets
        </button>
        <button
          data-action="tab"
          data-tab="ai"
          class="${state.tab === "ai" ? "active" : ""}"
        >
          IA
        </button>
        ${
          state.session.role === "admin"
            ? `
              <button
                data-action="tab"
                data-tab="admin"
                class="${state.tab === "admin" ? "active" : ""}"
              >
                Admin
              </button>
            `
            : ""
        }
      </nav>

      <main class="content">
        ${tabView()}
      </main>
    </div>
  `;
}

function render() {
  if (!state.ready) {
    app.innerHTML = `<div class="center">Chargement de Kevin Expert Suite…</div>`;
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

  if (state.selected) {
    app.innerHTML = viewerView();
    return;
  }

  app.innerHTML = mainView();
}

document.addEventListener("input", (event) => {
  const id = event.target.id;

  if (id === "adminPwd") state.adminPwd = event.target.value;
  if (id === "tierName") state.tierName = event.target.value;
  if (id === "aiPrompt") state.prompt = event.target.value;
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formId = event.target.id;

  if (formId === "adminLoginForm") {
    state.error = "";

    try {
      await loginAdmin(state.adminPwd);
      state.adminPwd = "";
      state.tab = "admin";
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
      state.tab = "modules";
      render();
    } catch (error) {
      state.error = error.message || "Erreur de demande d’accès.";
      render();
    }

    return;
  }

  if (formId === "aiForm") {
    if (state.aiBusy) return;
    await runAI();
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

  if (action === "tab") {
    state.tab = button.dataset.tab;
    state.selected = null;

    if (state.tab === "admin") {
      state.users = await getUsers();
    }

    render();
    return;
  }

  if (action === "openModule") {
    state.selected = button.dataset.id;
    render();
    return;
  }

  if (action === "closeModule") {
    state.selected = null;
    render();
    return;
  }

  if (action === "openExternal") {
    const url = button.dataset.url;

    try {
      await Browser.open({ url });
    } catch {
      window.open(url, "_blank");
    }

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
