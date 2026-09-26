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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const settingsRef = db.ref("donateManager/settings");
const eventsRef = db.ref("donateManager/events");
const shownCountRef = db.ref("donateManager/stats/shownCount");
const contentRef = db.ref("donateManager/content");

const DEFAULTS = {
  enabled: true,
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

/* СЮДА ДОБАВЛЯЙ НИКИ */
const DEFAULT_NAMES = [
  "DarkWolf228","TankistUA","NightRider","LuckyFox","CyberCat","SteelBear",
  "RedDragon","GhostPlayer","PixelKing","TurboHamster","VikingPro","SilentStorm",
  "NeonTiger","OldSchool","MegaDon","KotikLive","ShadowFox","FireBird",
  "ChillMan","RockyPlay","DemonTank","FrostByte","CrazyPanda","MrGoodGame"
];

/* СЮДА ДОБАВЛЯЙ СООБЩЕНИЯ */
const DEFAULT_MESSAGES = [
  "Хорошего стрима!",
  "Давай тащи катку!",
  "Красавчик, продолжай!",
  "На удачу в следующем бою.",
  "Спасибо за стрим.",
  "Лови поддержку!",
  "Стрим огонь!",
  "За красивый бой!",
  "Пусть рандом будет добрым.",
  "Покажи мастер-класс.",
  "Желаю серии побед.",
  "Вперёд к победе!"
];

let activeNames = [...DEFAULT_NAMES];
let activeMessages = [...DEFAULT_MESSAGES];

/* СЮДА ДОБАВЛЯЙ ЗВУКИ */
const SOUNDS = [
  "sounds/button-14.mp3",
  "sounds/button-24.mp3",
  "sounds/button-28.mp3",
  "sounds/sound-02.mp3",
  "sounds/sound-25.mp3",
  "sounds/sound-26.mp3",
  "sounds/sound-27.mp3",
  "sounds/sound-28.mp3",
  "sounds/sound-29.mp3",
  "sounds/sound-30.mp3",
  "sounds/sound-32.mp3",
  "sounds/sound-34.mp3",
  "sounds/sound-39.mp3",
  "sounds/sound-43.mp3",
  "sounds/sound-55.mp3",
  "sounds/sound-62.mp3",
  "sounds/sound-64.mp3"
];

/* ВИДЕОЭФФЕКТЫ ДОНАТА — зелёный фон уже удалён */
const GIFS = [
  "effects/money_rain.webm"
];

const EFFECT_SOUND = "effects/money_rain_audio.ogg";

const alertBox = document.getElementById("donateAlert");
const nameEl = document.getElementById("donateName");
const amountEl = document.getElementById("donateAmount");
const messageEl = document.getElementById("donateMessage");
const mediaBox = document.getElementById("mediaBox");
const gifEl = document.getElementById("donateGif");
const audioEl = document.getElementById("donateAudio");
const effectAudioEl = document.getElementById("effectAudio");

let settings = {...DEFAULTS};
let queue = [];
let busy = false;
let autoTimer = null;
let availableVoices = [];
let lastVoiceName = "";
const startedAt = Date.now();

// Защита персональных данных: проверяется и ник, и сообщение доната.
// Если запрещённая часть встречается хотя бы в одном из них, событие
// не попадает в очередь, не показывается в OBS и не озвучивается TTS.
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
  const text = normalizePrivacyText(`${name} ${message}`);
  if (!text) return false;
  return NORMALIZED_BLOCKED_INDIVIDUAL_PARTS.some(part => text.includes(part));
}

// В тестовой версии автоматические донаты полностью отключены.
const TEST_ONLY_MODE = true;

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  min = Math.ceil(Number(min));
  max = Math.floor(Number(max));

  if (max < min) {
    [min, max] = [max, min];
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForMediaEnd(media, fallbackMs = 9000) {
  return new Promise(resolve => {
    if (!media) {
      resolve();
      return;
    }

    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      media.removeEventListener("ended", done);
      media.removeEventListener("error", done);
      resolve();
    };

    const timer = setTimeout(done, fallbackMs);
    media.addEventListener("ended", done, {once: true});
    media.addEventListener("error", done, {once: true});

    if (media.ended) done();
  });
}

function playEffectSound() {
  if (!effectAudioEl || !EFFECT_SOUND) return Promise.resolve();

  effectAudioEl.pause();
  effectAudioEl.src = EFFECT_SOUND;
  effectAudioEl.currentTime = 0;
  effectAudioEl.volume = Math.min(
    1,
    Math.max(0, Number(settings.effectVolume ?? 70) / 100)
  );

  const playPromise = effectAudioEl.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(error => {
      console.warn("Не удалось воспроизвести звук эффекта:", error);
    });
  }

  return waitForMediaEnd(effectAudioEl, 9000);
}

function receiveDonate(data) {
  if (!data || data.type !== "donate") return;

  // Повторная проверка на стороне OBS обязательна: даже если событие
  // попало в Firebase не через нашу контрольную панель, личные данные
  // не должны попасть на экран или в TTS.
  if (containsBlockedPersonalData(data.message, data.name)) {
    console.warn("Заблокирован донат с запрещёнными персональными данными.");
    return;
  }

  queue.push(data);
  processQueue();
}

async function processQueue() {
  if (busy || queue.length === 0) return;

  busy = true;
  await showDonate(queue.shift());
  busy = false;
  processQueue();
}

async function showDonate(donate) {
  const name = String(donate.name || "Anonymous");
  const amount = Number(donate.amount || 0);
  const currency = donate.currency || settings.currency;
  const message = String(donate.message || "Спасибо за стрим!");

  nameEl.textContent = name;
  amountEl.textContent = `${amount} ${currency}`;
  messageEl.textContent = message;

  nameEl.hidden = settings.showName === false;
  amountEl.hidden = settings.showAmount === false;
  messageEl.hidden = settings.showMessage === false;

  const gifPath =
    settings.gifEnabled && GIFS.length > 0
      ? randomItem(GIFS)
      : "";

  alertBox.hidden = false;
  alertBox.classList.remove("hide");
  void alertBox.offsetWidth;
  alertBox.classList.add("show");

  let effectVideoPromise = Promise.resolve();
  let effectSoundPromise = Promise.resolve();

  /*
    ЭТАП 1:
    Сначала запускаем новый видеоэффект и отдельно извлечённый из него звук.
    Видео оставлено muted, чтобы аудио не дублировалось.
  */
  if (gifPath) {
    gifEl.src = gifPath;
    gifEl.currentTime = 0;
    mediaBox.hidden = false;

    /*
      OBS/CEF может начать декодировать WEBM не мгновенно.
      Поэтому звук больше не стартует одновременно с вызовом video.play().
      Сначала ждём реального события "playing" у видео и только тогда
      запускаем отдельную аудиодорожку с позиции 0.
    */
    effectVideoPromise = waitForMediaEnd(gifEl, 9000);

    effectSoundPromise = new Promise(resolve => {
      let soundStarted = false;

      const startSyncedSound = () => {
        if (soundStarted) return;
        soundStarted = true;

        gifEl.removeEventListener("playing", startSyncedSound);
        gifEl.removeEventListener("error", startSyncedSound);

        playEffectSound().then(resolve);
      };

      gifEl.addEventListener("playing", startSyncedSound, {once: true});
      gifEl.addEventListener("error", startSyncedSound, {once: true});

      const playPromise = gifEl.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(error => {
          console.warn("Не удалось запустить видеоэффект:", error);
          startSyncedSound();
        });
      }

      /*
        Страховка для OBS: если событие playing почему-то не пришло,
        не зависаем навсегда.
      */
      setTimeout(startSyncedSound, 1200);
    });
  } else {
    gifEl.pause();
    gifEl.removeAttribute("src");
    mediaBox.hidden = true;

    /*
      Если визуальный эффект отключён, старые случайные звуки из папки sounds
      продолжают работать как раньше.
    */
    if (settings.soundEnabled) {
      playNotificationSound();
      effectSoundPromise = waitForMediaEnd(audioEl, 9000);
    }
  }

  /*
    Ждём, пока закончатся и видеоэффект, и его отдельный звук.
    Только после этого запускается TTS.
  */
  await Promise.all([effectVideoPromise, effectSoundPromise]);

  /*
    ЭТАП 2:
    Ник -> сумма -> сообщение озвучиваются только после окончания эффекта.
  */
  if (
    settings.ttsEnabled !== false &&
    (settings.ttsReadName !== false ||
     settings.ttsReadAmount !== false ||
     settings.ttsReadMessage !== false)
  ) {
    speakDonate({name, amount, currency, message});
  }

  /*
    После запуска TTS держим сам алерт на экране согласно duration.
    Это значение больше не определяет задержку до TTS.
  */
  await wait(Math.max(3, Number(settings.duration) || 8) * 1000);

  alertBox.classList.remove("show");
  alertBox.classList.add("hide");
  await wait(500);

  alertBox.hidden = true;
  alertBox.classList.remove("hide");

  gifEl.pause();
  gifEl.currentTime = 0;

  if (effectAudioEl) {
    effectAudioEl.pause();
    effectAudioEl.currentTime = 0;
  }
}

let lastDonateSoundIndex = -1;

function playNotificationSound() {
  if (!SOUNDS.length) return;

  let index;
  if (SOUNDS.length === 1) {
    index = 0;
  } else {
    do {
      index = Math.floor(Math.random() * SOUNDS.length);
    } while (index === lastDonateSoundIndex);
  }

  lastDonateSoundIndex = index;

  audioEl.pause();
  audioEl.src = SOUNDS[index];
  audioEl.currentTime = 0;
  audioEl.volume = Math.min(
    1,
    Math.max(
      0,
      Number(settings.soundVolume ?? settings.volume ?? 70) / 100
    )
  );

  audioEl.play().catch(error => {
    console.warn("Не удалось воспроизвести звук доната:", error);
  });
}

/* Загружаем системные голоса Windows/Chromium */
function loadVoices() {
  if (!("speechSynthesis" in window)) return [];
  availableVoices = window.speechSynthesis.getVoices() || [];
  return availableVoices;
}

function voiceLang(voice) {
  return String(voice && voice.lang || "").toLowerCase().replace("_", "-");
}

function getRussianVoices() {
  const voices = loadVoices();
  const russian = voices.filter(voice => {
    const lang = voiceLang(voice);
    const label = `${voice.name || ""} ${voice.lang || ""}`;
    return lang === "ru-ru" || lang.startsWith("ru") || /russian|рус/i.test(label);
  });
  return russian.length ? russian : voices;
}

function getCisVoices() {
  const voices = loadVoices();
  // Русский + языки СНГ/ближнего региона. Набор реально доступных
  // голосов зависит от Windows/Chromium на компьютере со стримом.
  const prefixes = [
    "ru", "uk", "be", "kk", "uz", "az", "hy", "ka", "ky", "tg", "tk", "ro"
  ];
  const pool = voices.filter(voice => {
    const lang = voiceLang(voice);
    return prefixes.some(prefix => lang === prefix || lang.startsWith(prefix + "-"));
  });
  return pool.length ? pool : getRussianVoices();
}

function getFunnyVoices() {
  const voices = loadVoices();
  if (!voices.length) return [];

  // Сначала стараемся брать СНГ/соседние языки. Если их мало,
  // добавляем европейские/английские голоса — русский текст у них
  // часто звучит забавно за счёт произношения.
  const preferredPrefixes = [
    "ru", "uk", "be", "kk", "uz", "az", "hy", "ka", "ky", "tg", "tk", "ro",
    "pl", "tr", "en", "de", "fr", "it", "es", "cs", "sk", "bg", "sr"
  ];
  const preferred = voices.filter(voice => {
    const lang = voiceLang(voice);
    return preferredPrefixes.some(prefix => lang === prefix || lang.startsWith(prefix + "-"));
  });
  return preferred.length >= 2 ? preferred : voices;
}

function getVoicePool(mode) {
  if (mode === "random_all") return loadVoices();
  if (mode === "random_ru" || mode === "first") return getRussianVoices();
  if (mode === "random_cis") return getCisVoices();
  return getFunnyVoices();
}

function selectTtsVoice() {
  const mode = settings.ttsVoiceMode || "funny";
  const voices = getVoicePool(mode);
  if (!voices.length) return null;

  if (mode === "first") {
    const voice = voices[0];
    lastVoiceName = voice.name || "";
    return voice;
  }

  // Не повторяем предыдущий голос, если доступно хотя бы два.
  const candidates = voices.length > 1
    ? voices.filter(voice => (voice.name || "") !== lastVoiceName)
    : voices;

  const voice = candidates[Math.floor(Math.random() * candidates.length)] || voices[0];
  lastVoiceName = voice.name || "";
  return voice;
}

function funnyDelivery() {
  if (settings.ttsVoiceMode !== "funny") {
    return { rate: 0.96, pitch: 1.0 };
  }

  // Небольшая вариативность, чтобы речь была живее, но оставалась понятной.
  const rates = [0.84, 0.90, 0.96, 1.02, 1.08, 1.14];
  const pitches = [0.82, 0.90, 1.00, 1.08, 1.16, 1.24];
  return {
    rate: randomItem(rates),
    pitch: randomItem(pitches)
  };
}

function pluralForm(number, one, few, many) {
  const n = Math.abs(Math.trunc(Number(number) || 0));
  const n100 = n % 100;
  const n10 = n % 10;

  if (n100 >= 11 && n100 <= 14) return many;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return few;
  return many;
}

function currencyForSpeech(currency, amount) {
  const value = String(currency || "").trim().toLowerCase();
  const numericAmount = Number(String(amount ?? "").replace(/\s+/g, "").replace(",", "."));

  if (value === "₴" || value === "uah" || value.includes("грн")) {
    return pluralForm(numericAmount, "гривна", "гривны", "гривен");
  }

  if (value === "₽" || value === "rub" || value.includes("руб")) {
    return pluralForm(numericAmount, "рубль", "рубля", "рублей");
  }

  if (value === "$" || value === "usd") {
    return pluralForm(numericAmount, "доллар", "доллара", "долларов");
  }

  if (value === "€" || value === "eur") {
    return "евро";
  }

  if (value === "usdt") {
    return "USDT";
  }

  return currency || "";
}

/*
  Преобразование суммы в русские слова.
  Примеры:
  100000    -> "сто тысяч"
  1000000   -> "один миллион"
  10000000  -> "десять миллионов"
*/
function numberToRussianWords(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const number = Number(raw);

  if (!Number.isFinite(number)) {
    return String(value ?? "");
  }

  const integer = Math.trunc(Math.abs(number));

  if (integer === 0) return "ноль";

  // Для сумм донатов этого более чем достаточно: до квадриллионов.
  if (integer > 999999999999999) {
    return String(integer);
  }

  const unitsMale = [
    "", "один", "два", "три", "четыре",
    "пять", "шесть", "семь", "восемь", "девять"
  ];
  const unitsFemale = [
    "", "одна", "две", "три", "четыре",
    "пять", "шесть", "семь", "восемь", "девять"
  ];
  const teens = [
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
    "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"
  ];
  const tens = [
    "", "", "двадцать", "тридцать", "сорок",
    "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"
  ];
  const hundreds = [
    "", "сто", "двести", "триста", "четыреста",
    "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"
  ];

  const groups = [
    { one: "", few: "", many: "", female: false },
    { one: "тысяча", few: "тысячи", many: "тысяч", female: true },
    { one: "миллион", few: "миллиона", many: "миллионов", female: false },
    { one: "миллиард", few: "миллиарда", many: "миллиардов", female: false },
    { one: "триллион", few: "триллиона", many: "триллионов", female: false },
    { one: "квадриллион", few: "квадриллиона", many: "квадриллионов", female: false }
  ];

  function tripletToWords(n, female) {
    const result = [];
    const h = Math.floor(n / 100);
    const lastTwo = n % 100;
    const t = Math.floor(lastTwo / 10);
    const u = lastTwo % 10;

    if (h) result.push(hundreds[h]);

    if (lastTwo >= 10 && lastTwo <= 19) {
      result.push(teens[lastTwo - 10]);
    } else {
      if (t) result.push(tens[t]);
      if (u) result.push((female ? unitsFemale : unitsMale)[u]);
    }

    return result;
  }

  const words = [];
  let remaining = integer;
  let groupIndex = 0;

  while (remaining > 0) {
    const triplet = remaining % 1000;

    if (triplet > 0) {
      const group = groups[groupIndex];
      const part = tripletToWords(triplet, group.female);

      if (groupIndex > 0) {
        part.push(pluralForm(triplet, group.one, group.few, group.many));
      }

      words.unshift(...part);
    }

    remaining = Math.floor(remaining / 1000);
    groupIndex += 1;
  }

  if (number < 0) {
    words.unshift("минус");
  }

  return words.join(" ").replace(/\s+/g, " ").trim();
}

/*
  Ник, сумма и сообщение включаются независимо друг от друга.
  Используется стандартный системный голос браузера/Windows.
*/
function speakDonate(donate) {
  if (!("speechSynthesis" in window)) {
    console.warn("В этом браузере синтез речи недоступен.");
    return;
  }

  try {
    const synth = window.speechSynthesis;
    const parts = [];

    if (settings.ttsReadName !== false) {
      const name = String(donate.name || "").trim();
      if (name) parts.push(name);
    }

    if (settings.ttsReadAmount !== false) {
      const spokenAmount = numberToRussianWords(donate.amount);
      const spokenCurrency = currencyForSpeech(donate.currency, donate.amount);
      const amountPart = `${spokenAmount} ${spokenCurrency}`.trim();
      if (amountPart) parts.push(amountPart);
    }

    if (settings.ttsReadMessage !== false) {
      const message = String(donate.message || "").trim();
      if (message) parts.push(message);
    }

    const speechText = parts.join(". ").trim();

    // Если все три переключателя выключены — ничего не читаем.
    if (!speechText) return;

    synth.cancel();
    synth.resume();

    const utterance = new SpeechSynthesisUtterance(speechText);
    const selectedVoice = selectTtsVoice();

    const delivery = funnyDelivery();
    utterance.lang = selectedVoice && selectedVoice.lang ? selectedVoice.lang : "ru-RU";
    utterance.rate = delivery.rate;
    utterance.pitch = delivery.pitch;
    utterance.volume = Math.min(
      1,
      Math.max(0, Number(settings.volume) / 100)
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onerror = event => {
      console.warn("Ошибка озвучивания:", event.error);
    };

    /*
      В OBS/Chromium объект необходимо сохранить до конца чтения,
      иначе сборщик мусора иногда обрывает озвучку.
    */
    window.__strimkoCurrentSpeech = utterance;

    utterance.onend = () => {
      window.__strimkoCurrentSpeech = null;
    };

    synth.speak(utterance);

    /*
      Дополнительный resume исправляет ситуацию,
      когда Chromium ставит синтез речи на паузу.
    */
    setTimeout(() => {
      if (synth.paused) synth.resume();
    }, 900);
  } catch (error) {
    console.warn("Не удалось запустить озвучивание:", error);
  }
}

if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.addEventListener(
    "voiceschanged",
    loadVoices
  );
}

function stopAutomaticDonations() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
}

function scheduleNextDonate() {
  stopAutomaticDonations();

  if (TEST_ONLY_MODE || !settings.enabled) return;

  const delaySeconds = Math.max(
    5,
    randomInt(settings.minDelay, settings.maxDelay)
  );

  autoTimer = setTimeout(() => {
    if (!settings.enabled) {
      stopAutomaticDonations();
      return;
    }

    receiveDonate({
      type: "donate",
      source: "auto",
      name: randomItem(activeNames),
      amount: randomInt(settings.minAmount, settings.maxAmount),
      currency: settings.currency,
      message: randomItem(activeMessages),
      createdAt: Date.now()
    });

    scheduleNextDonate();
  }, delaySeconds * 1000);
}


function normalizeContentList(value, fallback, maxLength) {
  const list = Array.isArray(value)
    ? value
    : (value && typeof value === "object" ? Object.values(value) : []);

  const seen = new Set();
  const clean = [];

  for (const item of list) {
    const text = String(item ?? "").trim().slice(0, maxLength);
    const key = text.toLocaleLowerCase("ru");
    if (text && !seen.has(key)) {
      seen.add(key);
      clean.push(text);
    }
  }

  return clean.length ? clean : [...fallback];
}

contentRef.on("value", snapshot => {
  const content = snapshot.val() || {};
  activeNames = normalizeContentList(content.names, DEFAULT_NAMES, 32);
  activeMessages = normalizeContentList(content.messages, DEFAULT_MESSAGES, 180);
  console.log(`Загружено ${activeNames.length} ников и ${activeMessages.length} сообщений.`);
}, error => {
  console.warn("Не удалось загрузить пользовательские списки:", error);
  activeNames = [...DEFAULT_NAMES];
  activeMessages = [...DEFAULT_MESSAGES];
});

settingsRef.on("value", snapshot => {
  settings = {
    ...DEFAULTS,
    ...(snapshot.val() || {})
  };

  // В этой отдельной тестовой сборке автоматические донаты не запускаются.
  settings.enabled = false;
  stopAutomaticDonations();

  // Не удаляем тестовые события из очереди.
  queue = queue.filter(item => item && (item.source === "manual" || item.source === "test"));
});

eventsRef.limitToLast(1).on("child_added", snapshot => {
  const donate = snapshot.val();

  if (donate && !donate.source) {
    donate.source = "manual";
  }

  const createdAt = Number(donate?.createdAt || 0);

  if (createdAt && createdAt < startedAt - 5000) {
    return;
  }

  receiveDonate(donate);
});
})();
