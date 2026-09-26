(() => {
"use strict";

const OBS_LINK_PASSWORD_HASH = "a8476735b37a541a38402a2e7037c79e2d217fe9780e5e34347156ef61eff42b";

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function unlockObsLink() {
  const gate = document.getElementById("obsLinkGate");
  const panel = document.getElementById("obsLinkPanel");
  if (gate) gate.hidden = true;
  if (panel) panel.hidden = false;
  const input = document.getElementById("obsLinkPassword");
  if (input) input.value = "";
}

async function checkObsLinkPassword(event) {
  event.preventDefault();
  const input = document.getElementById("obsLinkPassword");
  const message = document.getElementById("obsLinkPasswordMessage");
  const value = input ? input.value : "";
  if (!value) {
    if (message) message.textContent = "Введите пароль.";
    return;
  }
  try {
    const hash = await sha256Hex(value);
    if (hash === OBS_LINK_PASSWORD_HASH) {
      sessionStorage.setItem("strimkoObsLinkUnlocked", "1");
      unlockObsLink();
      return;
    }
  } catch (error) {
    console.error("Ошибка проверки пароля:", error);
  }
  if (message) message.textContent = "Неверный пароль.";
  if (input) { input.value = ""; input.focus(); }
}

const obsLinkAuthForm = document.getElementById("obsLinkAuthForm");
if (obsLinkAuthForm) obsLinkAuthForm.addEventListener("submit", checkObsLinkPassword);
try {
  if (sessionStorage.getItem("strimkoObsLinkUnlocked") === "1") unlockObsLink();
} catch (error) {}

const firebaseConfig = {
  apiKey: "AIzaSyBXxee2n1nIekTGo4onZxlTpx_CwCytrp4",
  authDomain: "strimko-676be.firebaseapp.com",
  databaseURL: "https://strimko-676be-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "strimko-676be",
  storageBucket: "strimko-676be.firebasestorage.app",
  messagingSenderId: "276012999347",
  appId: "1:276012999347:web:9f2448cf1eb53f54d5c6c6"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const db = firebase.database();
const settingsRef = db.ref("donateManager/settings");
const eventsRef = db.ref("donateManager/events");
const LOCAL_SETTINGS_KEY = "strimkoDonateManagerTestSettingsV1";
const TEST_DONATE_COOLDOWN_MS = 100000;
const testRateLimitRef = db.ref("donateManager/testRateLimit/lastSentAt");
const serverTimeOffsetRef = db.ref(".info/serverTimeOffset");
let serverTimeOffset = 0;
let testCooldownTimer = null;

serverTimeOffsetRef.on("value", snapshot => {
  serverTimeOffset = Number(snapshot.val() || 0);
  syncTestCooldownFromFirebase();
});

function getServerNow() {
  return Date.now() + serverTimeOffset;
}

const DEFAULTS = {
  enabled: false,
  minDelay: 45,
  maxDelay: 120,
  minAmount: 20,
  maxAmount: 1500,
  currency: "₴",
  duration: 8,
  soundEnabled: true,
  gifEnabled: true,
  showName: true,
  showAmount: true,
  showMessage: true,
  ttsEnabled: true,
  ttsReadName: true,
  ttsReadAmount: true,
  ttsReadMessage: true,
  ttsVoiceMode: "funny",
  volume: 70,
  soundVolume: 70,
  effectVolume: 70
};

const $ = id => document.getElementById(id);
let current = {...DEFAULTS};
let isApplyingRemoteSettings = false;
let saveInProgress = false;

function normalizeSettings(raw = {}) {
  const settings = {
    ...DEFAULTS,
    enabled: false,
    soundEnabled: raw.soundEnabled !== false,
    gifEnabled: raw.gifEnabled !== false,
    showName: raw.showName !== false,
    showAmount: raw.showAmount !== false,
    showMessage: raw.showMessage !== false,
    ttsEnabled: raw.ttsEnabled !== false,
    ttsReadName: raw.ttsReadName !== false,
    ttsReadAmount: raw.ttsReadAmount !== false,
    ttsReadMessage: raw.ttsReadMessage !== false,
    ttsVoiceMode: ["funny", "random_cis", "random_ru", "random_all", "first"].includes(raw.ttsVoiceMode)
      ? raw.ttsVoiceMode
      : DEFAULTS.ttsVoiceMode,
    volume: Math.min(100, Math.max(0, Number(raw.volume ?? DEFAULTS.volume) || 0)),
    soundVolume: Math.min(100, Math.max(0, Number(raw.soundVolume ?? DEFAULTS.soundVolume) || 0)),
    effectVolume: Math.min(100, Math.max(0, Number(raw.effectVolume ?? DEFAULTS.effectVolume) || 0))
  };
  return settings;
}


const MEDIA_PASSWORD = "12345678900";
let mediaUnlocked = false;

function setMediaUnlocked(unlocked) {
  mediaUnlocked = Boolean(unlocked);
  const body = $("mediaSettingsBody");
  if (body) body.classList.toggle("media-unlocked", mediaUnlocked);
  if (body) {
    body.querySelectorAll("input, select, button, textarea").forEach(el => {
      el.disabled = !mediaUnlocked;
    });
  }
  $("mediaUnlock").hidden = mediaUnlocked;
  $("mediaLock").hidden = !mediaUnlocked;
  $("mediaPassword").disabled = mediaUnlocked;
  $("mediaPassword").value = "";
  $("mediaLockTitle").textContent = mediaUnlocked ? "🔓 Настройки разблокированы" : "🔒 Настройки заблокированы";
  $("mediaLockHint").textContent = mediaUnlocked
    ? "Теперь можно изменять звук, эффект и озвучивание."
    : "Введите пароль, чтобы изменить звук, эффект и озвучивание.";
  $("mediaPasswordMessage").textContent = "";
}

$("mediaUnlock").addEventListener("click", () => {
  if ($("mediaPassword").value === MEDIA_PASSWORD) {
    setMediaUnlocked(true);
  } else {
    $("mediaPasswordMessage").textContent = "Неверный пароль.";
    $("mediaPasswordMessage").classList.add("error");
    $("mediaPassword").select();
  }
});

$("mediaPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") $("mediaUnlock").click();
});

$("mediaLock").addEventListener("click", () => setMediaUnlocked(false));

function normalizePrivacyText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(/і/g, "и")
    .replace(/ї/g, "и")
    .replace(/є/g, "е")
    .replace(/ґ/g, "г")
    .replace(/ъ/g, "")
    .replace(/ь/g, "")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

// Личные данные зашиты в коде. Отдельных полей в панели для них НЕТ.
// Проверяем не только точные фразы, но и комбинации частей ФИО/адреса,
// чтобы защита срабатывала при пробелах, точках, дефисах, запятых,
// разных регистрах и русско/украинских вариантах написания.
const BUILTIN_BLOCKED_VARIANTS = [
  // ФИО — полные варианты
  "Гнатюк Максим Валерійович", "Гнатюк Максим Валериевич", "Гнатюк Максим Валерьевич",
  "Максим Гнатюк Валерійович", "Максим Гнатюк Валериевич", "Максим Гнатюк Валерьевич",
  "Гнатюк Максим В", "Гнатюк М В", "Гнатюк М.В", "Максим Гнатюк", "Макс Гнатюк",
  "Hnatiuk Maksym Valeriiovych", "Hnatyuk Maksym Valeriiovych", "Gnatyuk Maksim Valerievich",
  // Адрес — полные варианты
  "Днепр Днепровская область Солонянский район село Башмачка",
  "Днепр Днепровская обл Солонянский район село Башмачка",
  "Днепропетровская область Солонянский район село Башмачка",
  "Днепропетровская обл Солонянский р-н с Башмачка",
  "Днепр Дніпровська область Солонянський район село Башмачка",
  "Дніпро Дніпровська область Солонянський район село Башмачка",
  "Дніпропетровська область Солонянський район село Башмачка",
  "Дніпропетровська обл Солонянський р-н с Башмачка",
  "Солонянский район село Башмачка", "Солонянский р-н с Башмачка",
  "Солонянський район село Башмачка", "Солонянський р-н с Башмачка",
  "село Башмачка", "с Башмачка", "с. Башмачка", "Башмачка Солонянский район",
  "Башмачка Солонянский р-н", "Башмачка Солонянський район"
];

const BLOCKED_COMBINATIONS = [
  // ФИО: минимум две характерные части вместе
  ["гнатюк", "максим"], ["гнатюк", "валер"], ["максим", "валер"],
  ["гнатюк", "мв"],
  // Адрес: характерные топонимы
  ["башмачка"], ["солонянский", "башмачка"], ["солонянський", "башмачка"],
  ["днепропетровская", "башмачка"], ["дніпропетровська", "башмачка"],
  ["днепровская", "башмачка"], ["дніпровська", "башмачка"]
];

function getBlockedPrivacyVariants() {
  return BUILTIN_BLOCKED_VARIANTS.map(normalizePrivacyText).filter(value => value.length >= 5);
}

// Дополнительная защита: запрещаем каждую характерную часть ФИО и адреса
// отдельно, а не только их комбинации. Одно и то же правило применяется
// к нику и к сообщению доната.
const BLOCKED_INDIVIDUAL_PARTS = [
  "гнатюк", "максим", "макс",
  "валерійович", "валериевич", "валерьевич",
  "hnatiuk", "hnatyuk", "gnatyuk", "maksym", "maksim", "valeriiovych", "valerievich",
  "днепр", "дніпро", "днепровская", "дніпровська",
  "днепропетровская", "дніпропетровська",
  "область", "обл", "район", "р-н",
  "солонянский", "солонянський", "село", "с", "башмачка"
];

const NORMALIZED_BLOCKED_INDIVIDUAL_PARTS = BLOCKED_INDIVIDUAL_PARTS
  .map(normalizePrivacyText)
  .filter(value => value.length >= 3);

function containsBlockedPersonalData(message, name = "") {
  const raw = `${name} ${message}`;
  const text = normalizePrivacyText(raw);
  if (!text) return false;

  // Сначала проверяем отдельные части: достаточно одного совпадения.
  if (NORMALIZED_BLOCKED_INDIVIDUAL_PARTS.some(part => text.includes(part))) return true;

  // Затем сохраняем проверку полных вариантов и комбинаций.
  if (getBlockedPrivacyVariants().some(value => text.includes(value))) return true;

  return BLOCKED_COMBINATIONS.some(parts => {
    const normalizedParts = parts.map(normalizePrivacyText).filter(Boolean);
    return normalizedParts.every(part => text.includes(part));
  });
}

function formatCooldown(seconds) {
  const sec = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return min ? `${min} мин ${String(rest).padStart(2, "0")} сек` : `${rest} сек`;
}

function setTestButtonsDisabled(disabled) {
  [$("sendManual"), $("sendTest")].forEach(button => {
    if (button) button.disabled = disabled;
  });
}

function startTestCooldown(lastSentAt) {
  clearInterval(testCooldownTimer);
  const tick = () => {
    const leftMs = TEST_DONATE_COOLDOWN_MS - (getServerNow() - Number(lastSentAt || 0));
    if (leftMs <= 0) {
      clearInterval(testCooldownTimer);
      testCooldownTimer = null;
      setTestButtonsDisabled(false);
      showMessage("Можно отправлять тестовый донат снова.");
      return;
    }
    setTestButtonsDisabled(true);
    showMessage(`⏳ Следующий тестовый донат можно отправить через ${formatCooldown(leftMs / 1000)}.`);
  };
  tick();
  testCooldownTimer = setInterval(tick, 1000);
}

async function reserveTestDonateSlot() {
  const now = getServerNow();
  const result = await testRateLimitRef.transaction(currentValue => {
    const previous = Number(currentValue || 0);
    if (previous && now - previous < TEST_DONATE_COOLDOWN_MS) return;
    return now;
  });

  if (!result.committed) {
    const lastSentAt = Number(result.snapshot.val() || now);
    startTestCooldown(lastSentAt);
    return { ok: false, lastSentAt };
  }

  startTestCooldown(now);
  return { ok: true, lastSentAt: now };
}

function syncTestCooldownFromFirebase() {
  testRateLimitRef.once("value").then(snapshot => {
    const lastSentAt = Number(snapshot.val() || 0);
    if (lastSentAt && getServerNow() - lastSentAt < TEST_DONATE_COOLDOWN_MS) {
      startTestCooldown(lastSentAt);
    } else {
      clearInterval(testCooldownTimer);
      testCooldownTimer = null;
      setTestButtonsDisabled(false);
    }
  }).catch(error => {
    console.error("Не удалось получить общий лимит тестовых донатов:", error);
  });
}

testRateLimitRef.on("value", snapshot => {
  const lastSentAt = Number(snapshot.val() || 0);
  if (lastSentAt && getServerNow() - lastSentAt < TEST_DONATE_COOLDOWN_MS) {
    startTestCooldown(lastSentAt);
  } else if (!testCooldownTimer) {
    setTestButtonsDisabled(false);
  }
});

syncTestCooldownFromFirebase();

function showMessage(text, isError = false) {
  const box = $("messageBox");
  box.textContent = text;
  box.style.color = isError ? "#ff8d9a" : "#7dffa4";
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { box.textContent = ""; }, 5000);
}

function saveLocal(settings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Не удалось сохранить локальные настройки:", error);
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : null;
  } catch (error) {
    return null;
  }
}

function applySettings(settings) {
  isApplyingRemoteSettings = true;
  current = normalizeSettings(settings);
  current.enabled = false;

  ["soundEnabled", "gifEnabled", "ttsReadName", "ttsReadAmount", "ttsReadMessage"].forEach(id => {
    $(id).checked = Boolean(current[id]);
  });

  $("volume").value = current.volume;
  $("soundVolume").value = current.soundVolume;
  $("effectVolume").value = current.effectVolume;
  $("ttsVoiceMode").value = current.ttsVoiceMode;
  $("volumeValue").textContent = `${current.volume}%`;
  $("soundVolumeValue").textContent = `${current.soundVolume}%`;
  $("effectVolumeValue").textContent = `${current.effectVolume}%`;

  requestAnimationFrame(() => { isApplyingRemoteSettings = false; });
}

function readForm() {
  const next = {
    ...current,
    enabled: false,
    soundEnabled: $("soundEnabled").checked,
    gifEnabled: $("gifEnabled").checked,
    ttsReadName: $("ttsReadName").checked,
    ttsReadAmount: $("ttsReadAmount").checked,
    ttsReadMessage: $("ttsReadMessage").checked,
    ttsEnabled: $("ttsReadName").checked || $("ttsReadAmount").checked || $("ttsReadMessage").checked,
    ttsVoiceMode: $("ttsVoiceMode").value,
    volume: $("volume").value,
    soundVolume: $("soundVolume").value,
    effectVolume: $("effectVolume").value
  };
  return normalizeSettings(next);
}

async function saveSettings(successText = "Настройка сохранена.") {
  if (saveInProgress) return;

  const next = readForm();
  current = next;
  saveLocal(next);
  saveInProgress = true;

  try {
    await settingsRef.update({
      ...next,
      enabled: false,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    showMessage(successText);
  } catch (error) {
    console.error("Ошибка сохранения настроек:", error);
    showMessage("Не удалось сохранить настройку в Firebase.", true);
  } finally {
    saveInProgress = false;
  }
}

async function emitDonate(data) {
  const name = String(data.name || "Anonymous").slice(0, 32);
  const message = String(data.message || "Спасибо за стрим!").slice(0, 180);
  if (containsBlockedPersonalData(message, name)) {
    showMessage("🔒 Тестовый донат заблокирован: сообщение или ник содержит запрещённые личные данные.", true);
    return;
  }

  try {
    const slot = await reserveTestDonateSlot();
    if (!slot.ok) {
      showMessage(`⏳ Тестовый донат уже отправлялся. Повторить можно через ${formatCooldown((TEST_DONATE_COOLDOWN_MS - (Date.now() - slot.lastSentAt)) / 1000)}.`, true);
      return;
    }

    await eventsRef.push({
      type: "donate",
      source: "test",
      name,
      amount: Math.max(1, Number(data.amount) || 1),
      currency: String(data.currency || current.currency || "₴"),
      message: String(data.message || "Спасибо за стрим!").slice(0, 180),
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    showMessage("Тестовый донат отправлен. Следующий можно отправить через 100 секунд.");
  } catch (error) {
    console.error("Ошибка отправки алерта:", error);
    // Слот не освобождаем: общий лимит должен оставаться атомарным для всех пользователей.
    // Если запись события отклонена Firebase, повторная попытка всё равно будет возможна после 100 секунд.
    showMessage("Firebase запретила отправку тестового доната. Проверь правила donateManager/events и testRateLimit.", true);
  }
}

$("sendManual").addEventListener("click", () => {
  emitDonate({
    name: $("manualName").value,
    amount: $("manualAmount").value,
    currency: $("manualCurrency").value,
    message: $("manualMessage").value
  });
});

$("sendTest").addEventListener("click", () => {
  emitDonate({
    name: "STRIMKO TEST",
    amount: 100,
    currency: $("manualCurrency").value,
    message: "Проверка работы системы."
  });
});

["soundEnabled", "gifEnabled", "ttsReadName", "ttsReadAmount", "ttsReadMessage"].forEach(id => {
  $(id).addEventListener("change", () => {
    if (isApplyingRemoteSettings || !mediaUnlocked) return;
    saveSettings("Настройка сохранена.");
  });
});

$("ttsVoiceMode").addEventListener("change", () => {
  if (isApplyingRemoteSettings || !mediaUnlocked) return;
  saveSettings("Голос TTS сохранён.");
});

["volume", "soundVolume", "effectVolume"].forEach(id => {
  $(id).addEventListener("input", () => {
    const value = Math.min(100, Math.max(0, Number($(id).value) || 0));
    const label = id === "volume" ? "volumeValue" : id === "soundVolume" ? "soundVolumeValue" : "effectVolumeValue";
    $(label).textContent = `${value}%`;
    if (!mediaUnlocked) return;
    current = {...current, [id]: value};
    saveLocal(current);
  });

  $(id).addEventListener("change", () => {
    if (isApplyingRemoteSettings || !mediaUnlocked) return;
    saveSettings("Громкость сохранена.");
  });
});

const localSettings = loadLocal();
applySettings(localSettings || DEFAULTS);
setMediaUnlocked(false);

settingsRef.on("value", snapshot => {
  if (!snapshot.exists()) return;
  applySettings(snapshot.val());
  saveLocal(current);
}, error => {
  console.error("Ошибка чтения настроек:", error);
  showMessage("Не удалось прочитать настройки Firebase.", true);
});
})();
