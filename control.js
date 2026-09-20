(() => {
"use strict";

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
  try {
    await eventsRef.push({
      type: "donate",
      source: "test",
      name: String(data.name || "Anonymous").slice(0, 32),
      amount: Math.max(1, Number(data.amount) || 1),
      currency: current.currency || "₴",
      message: String(data.message || "Спасибо за стрим!").slice(0, 180),
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    showMessage("Тестовый донат отправлен.");
  } catch (error) {
    console.error("Ошибка отправки алерта:", error);
    showMessage("Firebase запретила отправку тестового доната. Проверь правила donateManager/events.", true);
  }
}

$("sendManual").addEventListener("click", () => {
  emitDonate({
    name: $("manualName").value,
    amount: $("manualAmount").value,
    message: $("manualMessage").value
  });
});

$("sendTest").addEventListener("click", () => {
  emitDonate({
    name: "STRIMKO TEST",
    amount: 100,
    message: "Проверка работы системы."
  });
});

["soundEnabled", "gifEnabled", "ttsReadName", "ttsReadAmount", "ttsReadMessage"].forEach(id => {
  $(id).addEventListener("change", () => {
    if (isApplyingRemoteSettings) return;
    saveSettings("Настройка сохранена.");
  });
});

$("ttsVoiceMode").addEventListener("change", () => {
  if (isApplyingRemoteSettings) return;
  saveSettings("Голос TTS сохранён.");
});

["volume", "soundVolume", "effectVolume"].forEach(id => {
  $(id).addEventListener("input", () => {
    const value = Math.min(100, Math.max(0, Number($(id).value) || 0));
    const label = id === "volume" ? "volumeValue" : id === "soundVolume" ? "soundVolumeValue" : "effectVolumeValue";
    $(label).textContent = `${value}%`;
    current = {...current, [id]: value};
    saveLocal(current);
  });

  $(id).addEventListener("change", () => {
    if (isApplyingRemoteSettings) return;
    saveSettings("Громкость сохранена.");
  });
});

const localSettings = loadLocal();
applySettings(localSettings || DEFAULTS);

settingsRef.on("value", snapshot => {
  if (!snapshot.exists()) return;
  applySettings(snapshot.val());
  saveLocal(current);
}, error => {
  console.error("Ошибка чтения настроек:", error);
  showMessage("Не удалось прочитать настройки Firebase.", true);
});
})();
