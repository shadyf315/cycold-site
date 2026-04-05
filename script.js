const DEFAULT_SERVER_ADDRESS = "192.168.0.103:25565";
const DEFAULT_API_URL = "http://127.0.0.1:8787";
const STATUS_REFRESH_MS = 30000;
const ADMIN_PASSWORD = "24112013";

const STORAGE_SERVER_ADDRESS = "cycold_server_address";
const STORAGE_STATUS_ADDRESS = "cycold_status_address";
const STORAGE_API_URL = "cycold_admin_api";
const STORAGE_SITE_CAPTCHA_OK = "cycold_site_captcha_ok";
const STORAGE_ADMIN_CAPTCHA_OK = "cycold_admin_captcha_ok";

let currentServerAddress = localStorage.getItem(STORAGE_SERVER_ADDRESS) || DEFAULT_SERVER_ADDRESS;
let currentStatusAddress = localStorage.getItem(STORAGE_STATUS_ADDRESS) || currentServerAddress;
let currentApiUrl = localStorage.getItem(STORAGE_API_URL) || DEFAULT_API_URL;

let adminSessionPassword = "";
let adminAuthenticated = false;

let siteCaptchaMode = "api";
let siteCaptchaId = "";
let adminCaptchaMode = "api";
let adminCaptchaId = "";

const localCaptchaExpected = {
  site: "",
  admin: ""
};

const serverNodes = document.querySelectorAll("[data-server-address]");

const copyBtn = document.getElementById("copyIpBtn");
const copyState = document.getElementById("copyState");
const refreshStatusBtn = document.getElementById("refreshStatusBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusHint = document.getElementById("statusHint");
const playersCount = document.getElementById("playersCount");

const openAdminBtn = document.getElementById("openAdminBtn");
const adminScreen = document.getElementById("adminScreen");
const adminBackBtn = document.getElementById("adminBackBtn");
const adminGlobalStatus = document.getElementById("adminGlobalStatus");

const siteCaptchaOverlay = document.getElementById("siteCaptchaOverlay");
const siteCaptchaQuestion = document.getElementById("siteCaptchaQuestion");
const siteCaptchaAnswer = document.getElementById("siteCaptchaAnswer");
const siteCaptchaSubmit = document.getElementById("siteCaptchaSubmit");
const siteCaptchaStatus = document.getElementById("siteCaptchaStatus");

const adminCaptchaBlock = document.getElementById("adminCaptchaBlock");
const adminCaptchaQuestion = document.getElementById("adminCaptchaQuestion");
const adminCaptchaAnswer = document.getElementById("adminCaptchaAnswer");
const adminCaptchaSubmit = document.getElementById("adminCaptchaSubmit");
const adminCaptchaStatus = document.getElementById("adminCaptchaStatus");

const adminLoginBlock = document.getElementById("adminLoginBlock");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginStatus = document.getElementById("adminLoginStatus");

const adminControls = document.getElementById("adminControls");
const adminServerAddress = document.getElementById("adminServerAddress");
const adminStatusAddress = document.getElementById("adminStatusAddress");
const adminApiUrl = document.getElementById("adminApiUrl");
const saveAdminBtn = document.getElementById("saveAdminBtn");
const adminRefreshBtn = document.getElementById("adminRefreshBtn");
const logoutAdminBtn = document.getElementById("logoutAdminBtn");
const adminApiStatus = document.getElementById("adminApiStatus");

const playersTableBody = document.getElementById("playersTableBody");
const bannedPlayersBody = document.getElementById("bannedPlayersBody");
const bannedIpsBody = document.getElementById("bannedIpsBody");

const banPlayerInput = document.getElementById("banPlayerInput");
const banPlayerReasonInput = document.getElementById("banPlayerReasonInput");
const banPlayerBtn = document.getElementById("banPlayerBtn");
const banIpInput = document.getElementById("banIpInput");
const banIpReasonInput = document.getElementById("banIpReasonInput");
const banIpBtn = document.getElementById("banIpBtn");

function isPrivateHost(address) {
  const host = address.split(":")[0].toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  const parts = host.split(".");
  if (parts.length === 4 && parts[0] === "172") {
    const second = Number(parts[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) return true;
  }
  return false;
}

function isValidAddress(value) {
  return /^[a-zA-Z0-9.-]+:\d{2,5}$/.test(value.trim());
}

function isValidApiUrl(value) {
  return /^https?:\/\/[a-zA-Z0-9.-]+:\d+$/.test(value.trim());
}

function setStatus(state, text) {
  statusDot.classList.remove("online", "offline", "checking");
  statusDot.classList.add(state);
  statusText.textContent = text;
}

function renderServerAddress() {
  serverNodes.forEach((node) => {
    node.textContent = currentServerAddress;
  });

  adminServerAddress.value = currentServerAddress;
  adminStatusAddress.value = currentStatusAddress;
  adminApiUrl.value = currentApiUrl;
}

function showApiStatus(message) {
  adminApiStatus.textContent = message;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function copyServerIp() {
  try {
    await navigator.clipboard.writeText(currentServerAddress);
    copyState.textContent = "IP скопирован";
    copyBtn.textContent = "Скопировано";
  } catch {
    copyState.textContent = "Не удалось скопировать";
    copyBtn.textContent = "Скопируй вручную";
  }

  setTimeout(() => {
    copyState.textContent = "готов к запуску";
    copyBtn.textContent = "Скопировать IP";
  }, 2000);
}

async function fetchMcsrvstat(address) {
  const response = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`mcsrvstat HTTP ${response.status}`);
  const data = await response.json();
  if (data.online) {
    return { online: true, playersOnline: data.players?.online ?? 0, playersMax: data.players?.max ?? "?" };
  }
  return { online: false, playersOnline: 0, playersMax: 0 };
}

async function fetchMcstatus(address) {
  const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`mcstatus HTTP ${response.status}`);
  const data = await response.json();
  if (data.online) {
    return { online: true, playersOnline: data.players?.online ?? 0, playersMax: data.players?.max ?? "?" };
  }
  return { online: false, playersOnline: 0, playersMax: 0 };
}

async function updateServerStatus() {
  const targetAddress = currentStatusAddress || currentServerAddress;
  setStatus("checking", "Проверяем статус...");

  if (isPrivateHost(targetAddress)) {
    setStatus("offline", "Статус недоступен");
    playersCount.textContent = "— / —";
    statusHint.textContent = "Нужен публичный адрес для онлайн-статуса.";
    return;
  }

  try {
    const r1 = await fetchMcsrvstat(targetAddress);
    if (r1.online) {
      setStatus("online", "Сервер онлайн");
      playersCount.textContent = `${r1.playersOnline} / ${r1.playersMax}`;
      statusHint.textContent = `Последняя проверка: ${new Date().toLocaleTimeString()}`;
      return;
    }

    const r2 = await fetchMcstatus(targetAddress);
    if (r2.online) {
      setStatus("online", "Сервер онлайн");
      playersCount.textContent = `${r2.playersOnline} / ${r2.playersMax}`;
      statusHint.textContent = `Последняя проверка: ${new Date().toLocaleTimeString()}`;
      return;
    }

    setStatus("offline", "Сервер оффлайн");
    playersCount.textContent = "0 / 0";
    statusHint.textContent = `Последняя проверка: ${new Date().toLocaleTimeString()}`;
  } catch {
    setStatus("offline", "Статус недоступен");
    playersCount.textContent = "— / —";
    statusHint.textContent = "Не удалось получить статус с внешних API.";
  }
}

function createLocalCaptcha(scope) {
  const key = scope === "admin" ? STORAGE_ADMIN_CAPTCHA_OK : STORAGE_SITE_CAPTCHA_OK;
  if (localStorage.getItem(key) === "ok") {
    return { required: false, mode: "local", challengeId: "", question: "" };
  }

  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  localCaptchaExpected[scope] = String(a + b);

  return {
    required: true,
    mode: "local",
    challengeId: `local-${scope}`,
    question: `${a} + ${b} = ?`
  };
}

async function getCaptchaChallenge(scope) {
  const base = currentApiUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}/api/captcha/challenge?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("captcha api failed");
    const data = await response.json();
    return {
      required: Boolean(data.required),
      mode: "api",
      challengeId: data.challengeId || "",
      question: data.question || ""
    };
  } catch {
    return createLocalCaptcha(scope);
  }
}

async function verifyCaptcha(scope, mode, challengeId, answer) {
  const storageKey = scope === "admin" ? STORAGE_ADMIN_CAPTCHA_OK : STORAGE_SITE_CAPTCHA_OK;

  if (mode === "local") {
    const expected = localCaptchaExpected[scope];
    if (String(answer).trim() !== String(expected).trim()) {
      throw new Error("Неверный ответ");
    }
    localStorage.setItem(storageKey, "ok");
    return;
  }

  const base = currentApiUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/captcha/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, challengeId, answer })
  });

  if (!response.ok) {
    throw new Error("Неверный ответ");
  }

  localStorage.setItem(storageKey, "ok");
}

async function ensureSiteCaptcha() {
  const challenge = await getCaptchaChallenge("site");
  if (!challenge.required) {
    siteCaptchaOverlay.hidden = true;
    return;
  }

  siteCaptchaMode = challenge.mode;
  siteCaptchaId = challenge.challengeId;
  siteCaptchaQuestion.textContent = challenge.question;
  siteCaptchaStatus.textContent = "Реши пример для входа на сайт.";
  siteCaptchaAnswer.value = "";
  siteCaptchaOverlay.hidden = false;
}

function openAdminScreen() {
  adminScreen.hidden = false;
  document.body.classList.add("locked");
  adminGlobalStatus.textContent = "Проверяем доступ к админке...";
  prepareAdminGate();
}

function closeAdminScreen() {
  adminScreen.hidden = true;
  document.body.classList.remove("locked");
}

function showAdminBlock(mode) {
  adminCaptchaBlock.hidden = mode !== "captcha";
  adminLoginBlock.hidden = mode !== "login";
  adminControls.hidden = mode !== "controls";
}

async function prepareAdminGate() {
  if (adminAuthenticated) {
    showAdminBlock("controls");
    adminGlobalStatus.textContent = "Вход выполнен.";
    await refreshAdminData();
    return;
  }

  const challenge = await getCaptchaChallenge("admin");
  if (challenge.required) {
    adminCaptchaMode = challenge.mode;
    adminCaptchaId = challenge.challengeId;
    adminCaptchaQuestion.textContent = challenge.question;
    adminCaptchaAnswer.value = "";
    adminCaptchaStatus.textContent = "Подтверди вход в админку.";
    showAdminBlock("captcha");
    adminGlobalStatus.textContent = "Требуется капча для админки.";
    return;
  }

  showAdminBlock("login");
  adminGlobalStatus.textContent = "Введи пароль администратора.";
}

function lockAdminPanel() {
  adminAuthenticated = false;
  adminSessionPassword = "";
  adminPasswordInput.value = "";
  adminLoginStatus.textContent = "Доступ закрыт.";
  showAdminBlock("login");
  adminGlobalStatus.textContent = "Сессия завершена.";
}

function unlockAdminPanel(password) {
  adminAuthenticated = true;
  adminSessionPassword = password;
  adminLoginStatus.textContent = "Вход выполнен.";
  adminGlobalStatus.textContent = "Админка активна.";
  showAdminBlock("controls");
}

async function apiRequest(path, method = "GET", body = null) {
  if (!adminSessionPassword) {
    throw new Error("Сначала войди в админку");
  }

  const base = currentApiUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  const options = {
    method,
    headers: {}
  };

  if (method === "GET") {
    url.searchParams.set("password", adminSessionPassword);
  } else {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify({ ...(body || {}), password: adminSessionPassword });
  }

  const response = await fetch(url.toString(), options);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

function renderPlayers(players) {
  if (!players || players.length === 0) {
    playersTableBody.innerHTML = "<tr><td colspan=\"4\">Игроки не найдены</td></tr>";
    return;
  }

  playersTableBody.innerHTML = players.map((player) => {
    const nick = htmlEscape(player.name || "");
    const ip = htmlEscape(player.ip || "-");
    const online = Boolean(player.online);
    return `
      <tr>
        <td>${nick}</td>
        <td>${ip}</td>
        <td><span class="status-pill ${online ? "online" : "offline"}">${online ? "онлайн" : "оффлайн"}</span></td>
        <td>
          <button class="btn btn-ghost btn-small js-kick" data-name="${nick}">Кик</button>
          <button class="btn btn-ghost btn-small js-ban-player" data-name="${nick}">Бан ник</button>
          <button class="btn btn-ghost btn-small js-ban-ip" data-ip="${ip}">Бан IP</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderBans(data) {
  const players = data?.players || [];
  const ips = data?.ips || [];

  if (players.length === 0) {
    bannedPlayersBody.innerHTML = "<tr><td colspan=\"3\">Пусто</td></tr>";
  } else {
    bannedPlayersBody.innerHTML = players.map((entry) => {
      const name = htmlEscape(entry.name || "");
      const reason = htmlEscape(entry.reason || "");
      return `
        <tr>
          <td>${name}</td>
          <td>${reason}</td>
          <td><button class="btn btn-ghost btn-small js-unban-player" data-name="${name}">Разбан</button></td>
        </tr>
      `;
    }).join("");
  }

  if (ips.length === 0) {
    bannedIpsBody.innerHTML = "<tr><td colspan=\"3\">Пусто</td></tr>";
  } else {
    bannedIpsBody.innerHTML = ips.map((entry) => {
      const ip = htmlEscape(entry.ip || "");
      const reason = htmlEscape(entry.reason || "");
      return `
        <tr>
          <td>${ip}</td>
          <td>${reason}</td>
          <td><button class="btn btn-ghost btn-small js-unban-ip" data-ip="${ip}">Разбан</button></td>
        </tr>
      `;
    }).join("");
  }
}

async function refreshAdminData() {
  try {
    const base = currentApiUrl.replace(/\/+$/, "");
    const health = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!health.ok) throw new Error("API не отвечает");

    const players = await apiRequest("/api/players", "GET");
    const bans = await apiRequest("/api/bans", "GET");

    renderPlayers(players.players || []);
    renderBans(bans);
    showApiStatus("API подключен, данные обновлены.");
  } catch (error) {
    showApiStatus(`Ошибка API: ${error.message}`);
  }
}

function handleAdminSave() {
  const nextServer = adminServerAddress.value.trim();
  const nextStatus = adminStatusAddress.value.trim();
  const nextApi = adminApiUrl.value.trim();

  if (!isValidAddress(nextServer)) {
    adminLoginStatus.textContent = "Формат IP сервера: host:port";
    return;
  }
  if (nextStatus && !isValidAddress(nextStatus)) {
    adminLoginStatus.textContent = "Формат адреса статуса: host:port";
    return;
  }
  if (!isValidApiUrl(nextApi)) {
    adminLoginStatus.textContent = "Формат API: http://127.0.0.1:8787";
    return;
  }

  currentServerAddress = nextServer;
  currentStatusAddress = nextStatus || nextServer;
  currentApiUrl = nextApi;

  localStorage.setItem(STORAGE_SERVER_ADDRESS, currentServerAddress);
  localStorage.setItem(STORAGE_STATUS_ADDRESS, currentStatusAddress);
  localStorage.setItem(STORAGE_API_URL, currentApiUrl);

  renderServerAddress();
  adminLoginStatus.textContent = "Настройки сохранены.";
  updateServerStatus();
  refreshAdminData();
}

async function postAndRefresh(path, payload) {
  try {
    const result = await apiRequest(path, "POST", payload);
    showApiStatus(result.message || "Операция выполнена.");
    await refreshAdminData();
  } catch (error) {
    showApiStatus(`Ошибка: ${error.message}`);
  }
}

function onAdminTableClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.classList.contains("js-kick")) {
    postAndRefresh("/api/kick", { name: target.dataset.name, reason: "Kicked by admin panel" });
    return;
  }
  if (target.classList.contains("js-ban-player")) {
    postAndRefresh("/api/ban/player", { name: target.dataset.name, reason: "Banned by admin panel" });
    return;
  }
  if (target.classList.contains("js-ban-ip")) {
    const ip = target.dataset.ip;
    if (ip && ip !== "-") {
      postAndRefresh("/api/ban/ip", { ip, reason: "Banned by admin panel" });
    }
    return;
  }
  if (target.classList.contains("js-unban-player")) {
    postAndRefresh("/api/unban/player", { name: target.dataset.name });
    return;
  }
  if (target.classList.contains("js-unban-ip")) {
    postAndRefresh("/api/unban/ip", { ip: target.dataset.ip });
  }
}

async function handleSiteCaptchaSubmit() {
  const answer = siteCaptchaAnswer.value.trim();
  if (!answer) {
    siteCaptchaStatus.textContent = "Введи ответ.";
    return;
  }

  siteCaptchaStatus.textContent = "Проверяем...";

  try {
    await verifyCaptcha("site", siteCaptchaMode, siteCaptchaId, answer);
    siteCaptchaStatus.textContent = "Проверка пройдена. Добро пожаловать!";
    siteCaptchaOverlay.hidden = true;
  } catch (error) {
    const message = String(error?.message || "");
    if (siteCaptchaMode === "api") {
      const local = createLocalCaptcha("site");
      siteCaptchaMode = local.mode;
      siteCaptchaId = local.challengeId;
      siteCaptchaQuestion.textContent = local.question;
      siteCaptchaStatus.textContent = "API капчи недоступен. Реши локальную капчу.";
      siteCaptchaAnswer.value = "";
      return;
    }

    siteCaptchaStatus.textContent = message.includes("Неверный") ? "Неверный ответ, попробуй снова." : "Ошибка проверки. Попробуй снова.";
    await ensureSiteCaptcha();
  }
}

async function handleAdminCaptchaSubmit() {
  const answer = adminCaptchaAnswer.value.trim();
  if (!answer) {
    adminCaptchaStatus.textContent = "Введи ответ.";
    return;
  }

  adminCaptchaStatus.textContent = "Проверяем...";

  try {
    await verifyCaptcha("admin", adminCaptchaMode, adminCaptchaId, answer);
    adminCaptchaStatus.textContent = "Капча пройдена.";
    showAdminBlock("login");
    adminGlobalStatus.textContent = "Введи пароль администратора.";
  } catch (error) {
    const message = String(error?.message || "");
    if (adminCaptchaMode === "api") {
      const local = createLocalCaptcha("admin");
      adminCaptchaMode = local.mode;
      adminCaptchaId = local.challengeId;
      adminCaptchaQuestion.textContent = local.question;
      adminCaptchaStatus.textContent = "API капчи недоступен. Реши локальную капчу.";
      adminCaptchaAnswer.value = "";
      return;
    }

    adminCaptchaStatus.textContent = message.includes("Неверный") ? "Неверный ответ, попробуй снова." : "Ошибка проверки. Попробуй снова.";
    await prepareAdminGate();
  }
}

function handleAdminLogin(event) {
  event.preventDefault();
  const password = adminPasswordInput.value.trim();

  if (password !== ADMIN_PASSWORD) {
    adminLoginStatus.textContent = "Неверный пароль.";
    return;
  }

  unlockAdminPanel(password);
  refreshAdminData();
}

copyBtn.addEventListener("click", copyServerIp);
refreshStatusBtn.addEventListener("click", updateServerStatus);

openAdminBtn.addEventListener("click", openAdminScreen);
adminBackBtn.addEventListener("click", closeAdminScreen);

siteCaptchaSubmit.addEventListener("click", handleSiteCaptchaSubmit);
siteCaptchaAnswer.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleSiteCaptchaSubmit();
});

adminCaptchaSubmit.addEventListener("click", handleAdminCaptchaSubmit);
adminCaptchaAnswer.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleAdminCaptchaSubmit();
});

adminLoginForm.addEventListener("submit", handleAdminLogin);
saveAdminBtn.addEventListener("click", handleAdminSave);
adminRefreshBtn.addEventListener("click", refreshAdminData);
logoutAdminBtn.addEventListener("click", lockAdminPanel);

playersTableBody.addEventListener("click", onAdminTableClick);
bannedPlayersBody.addEventListener("click", onAdminTableClick);
bannedIpsBody.addEventListener("click", onAdminTableClick);

banPlayerBtn.addEventListener("click", () => {
  const name = banPlayerInput.value.trim();
  const reason = banPlayerReasonInput.value.trim();
  if (!name) {
    showApiStatus("Укажи ник для бана.");
    return;
  }
  postAndRefresh("/api/ban/player", { name, reason });
});

banIpBtn.addEventListener("click", () => {
  const ip = banIpInput.value.trim();
  const reason = banIpReasonInput.value.trim();
  if (!ip) {
    showApiStatus("Укажи IP для бана.");
    return;
  }
  postAndRefresh("/api/ban/ip", { ip, reason });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("in");
    });
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));

renderServerAddress();
showAdminBlock("login");
ensureSiteCaptcha();
updateServerStatus();
setInterval(updateServerStatus, STATUS_REFRESH_MS);
