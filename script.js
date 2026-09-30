const textInput = document.getElementById("textInput");
const wpmRange = document.getElementById("wpmRange");
const wpmValue = document.getElementById("wpmValue");
const voiceSelect = document.getElementById("voiceSelect");
const speakBtn = document.getElementById("speakBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const writingMode = document.getElementById("writingMode");
const listeningMode = document.getElementById("listeningMode");
const statusEl = document.getElementById("status");

const speeds = { writing: 21, listening: 150 };
const voiceChoices = { male: null, female: null };

// The Web Speech API does not expose voice gender. Only offer voices whose
// published names contain a gender label or match a known named voice.
function voiceGender(name) {
  const normalized = name.toLowerCase();
  if (/\bfemale\b/.test(normalized) || /\b(samantha|zira|jenny|aria|ava|emma|sonia|hazel|karen|moira|tessa|victoria|susan)\b/.test(normalized)) return "female";
  if (/\bmale\b/.test(normalized) || /\b(alex|daniel|david|mark|guy|eric|andrew|brian|fred|thomas|oliver)\b/.test(normalized)) return "male";
  return null;
}
function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  const available = window.speechSynthesis.getVoices();
  const preferred = (navigator.language || "en").toLowerCase();
  for (const gender of ["male", "female"]) {
    const matches = available.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang) && voiceGender(voice.name) === gender);
    voiceChoices[gender] = matches.find(voice => voice.lang.toLowerCase() === preferred) || matches[0] || null;
    const option = voiceSelect.querySelector(`option[value="${gender}"]`);
    option.disabled = !voiceChoices[gender];
    option.textContent = voiceChoices[gender] ? `${gender === "male" ? "Male" : "Female"} — ${voiceChoices[gender].name}` : `${gender === "male" ? "Male" : "Female"} (unavailable)`;
  }
  voiceSelect.disabled = !voiceChoices.male && !voiceChoices.female;
  if (!voiceSelect.disabled && !voiceChoices[voiceSelect.value]) {
    voiceSelect.value = voiceChoices.male ? "male" : "female";
  }
  describeVoiceSelection();
}
function describeVoiceSelection() {
  const selected = voiceChoices[voiceSelect.value];
  const description = selected ? `${voiceSelect.value === "male" ? "Male" : "Female"} voice: ${selected.name}` : "Voice choices unavailable; using browser default";
  voiceSelect.title = description;
  voiceSelect.setAttribute("aria-label", `${description}. Choose voice`);
}
function applyVoice(utterance) {
  const voice = voiceChoices[voiceSelect.value];
  if (voice) utterance.voice = voice;
}
let mode = "writing";
let words = [];
let currentWordIndex = 0;
let isRunning = false;
let isPaused = false;
let nextWordTimer = null;
let speedResumeTimer = null;
let speedResumePending = false;
let activeUtterance = null;
let generation = 0;
let listeningStart = 0;
let listeningStartTime = 0;
let sawBoundary = false;

function updateStatus(message) { statusEl.textContent = message; }
function updateControls() {
  pauseBtn.disabled = !isRunning;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
}
function invalidateSpeech() {
  generation += 1;
  clearTimeout(nextWordTimer);
  nextWordTimer = null;
  clearTimeout(speedResumeTimer);
  speedResumeTimer = null;
  speedResumePending = false;
  activeUtterance = null;
  window.speechSynthesis.cancel();
}
function wordStatus(prefix) {
  updateStatus(`${prefix} word ${currentWordIndex + 1} of ${words.length}: "${words[currentWordIndex]}"`);
}
function finish() {
  isRunning = false;
  isPaused = false;
  activeUtterance = null;
  updateControls();
  updateStatus("Finished");
}

// A fresh utterance and generation on every restart prevent canceled onend/onerror
// events from advancing the position or duplicating speech after Pause.
function speakWritingWord() {
  if (!isRunning || isPaused) return;
  if (currentWordIndex >= words.length) return finish();
  const run = generation;
  const index = currentWordIndex;
  const started = performance.now();
  const utterance = new SpeechSynthesisUtterance(words[index]);
  utterance.rate = 0.85;
  applyVoice(utterance);
  activeUtterance = utterance;
  wordStatus("Speaking");
  utterance.onend = () => {
    if (run !== generation || !isRunning || isPaused) return;
    activeUtterance = null;
    currentWordIndex = index + 1;
    if (currentWordIndex >= words.length) return finish();
    const delay = Math.max(0, 60000 / Number(wpmRange.value) - (performance.now() - started));
    nextWordTimer = setTimeout(() => {
      nextWordTimer = null;
      if (run === generation) speakWritingWord();
    }, delay);
  };
  utterance.onerror = () => speechError(run);
  window.speechSynthesis.speak(utterance);
}

function speechError(run) {
  if (run !== generation || !isRunning || isPaused) return;
  invalidateSpeech();
  isRunning = false;
  updateControls();
  updateStatus("Speech error. Try again.");
}

// Group words into sentences for natural prosody. Limit very long sentences so
// a voice without boundary events still has reasonably short restart segments.
function listeningEnd(start) {
  let end = start;
  while (end < words.length && end - start < 40) {
    const word = words[end++];
    if (/[.!?]["')\]]*$/.test(word)) break;
  }
  return end;
}
function speakListeningChunk() {
  if (!isRunning || isPaused) return;
  if (currentWordIndex >= words.length) return finish();
  const run = generation;
  const start = currentWordIndex;
  const end = listeningEnd(start);
  const chunkWords = words.slice(start, end);
  const chunk = chunkWords.join(" ");
  const offsets = [];
  let position = 0;
  for (const word of chunkWords) {
    offsets.push(position);
    position += word.length + 1;
  }
  listeningStart = start;
  listeningStartTime = performance.now();
  sawBoundary = false;
  const utterance = new SpeechSynthesisUtterance(chunk);
  // SpeechSynthesis rate is voice-relative, so the displayed WPM is a target.
  utterance.rate = Number(wpmRange.value) / 150;
  applyVoice(utterance);
  activeUtterance = utterance;
  wordStatus("Speaking");
  utterance.onboundary = (event) => {
    if (run !== generation || !isRunning || isPaused || event.name !== "word") return;
    let local = 0;
    for (let i = 1; i < offsets.length && offsets[i] <= event.charIndex; i++) local = i;
    currentWordIndex = start + local;
    sawBoundary = true;
    wordStatus("Speaking");
  };
  utterance.onend = () => {
    if (run !== generation || !isRunning || isPaused) return;
    activeUtterance = null;
    currentWordIndex = end;
    speakListeningChunk();
  };
  utterance.onerror = () => speechError(run);
  window.speechSynthesis.speak(utterance);
}
function speakCurrent() {
  if (mode === "writing") speakWritingWord();
  else speakListeningChunk();
}

function pauseSpeech(wpmAtPause = speeds[mode]) {
  if (!isRunning || isPaused) return;
  // The word boundary is authoritative where supplied. If unavailable, estimate
  // the current word within this sentence from elapsed time and target WPM.
  if (mode === "listening" && activeUtterance && !sawBoundary) {
    const elapsed = performance.now() - listeningStartTime;
    const estimatedWords = Math.floor(elapsed / (60000 / wpmAtPause));
    currentWordIndex = Math.min(words.length - 1, listeningStart + Math.max(0, estimatedWords));
    currentWordIndex = Math.max(listeningStart, currentWordIndex);
  }
  isPaused = true;
  invalidateSpeech();
  updateControls();
  wordStatus("Paused at");
}
function resumeSpeech() {
  if (!isRunning || !isPaused) return;
  clearTimeout(speedResumeTimer);
  speedResumeTimer = null;
  speedResumePending = false;
  isPaused = false;
  updateControls();
  speakCurrent();
}
function startSpeech() {
  const text = textInput.value.trim();
  if (!text) { updateStatus("Please enter some text first."); return; }
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    updateStatus("Speech is unavailable in this browser.");
    return;
  }
  invalidateSpeech();
  words = text.match(/\S+/gu) || [];
  currentWordIndex = 0;
  isRunning = true;
  isPaused = false;
  updateControls();
  speakCurrent();
}
function stopSpeech() {
  invalidateSpeech();
  isRunning = false;
  isPaused = false;
  currentWordIndex = 0;
  updateControls();
  updateStatus("Stopped");
}
function setMode(next) {
  if (mode === next) return;
  clearTimeout(speedResumeTimer);
  speedResumeTimer = null;
  speedResumePending = false;
  if (isRunning) pauseSpeech();
  mode = next;
  wpmRange.min = next === "writing" ? "1" : "90";
  wpmRange.max = next === "writing" ? "40" : "190";
  wpmRange.value = String(speeds[next]);
  wpmValue.textContent = wpmRange.value;
  writingMode.classList.toggle("active", next === "writing");
  listeningMode.classList.toggle("active", next === "listening");
  writingMode.setAttribute("aria-pressed", String(next === "writing"));
  listeningMode.setAttribute("aria-pressed", String(next === "listening"));
  if (isPaused) wordStatus("Paused at");
}

wpmRange.addEventListener("input", () => {
  if (isRunning && !isPaused) {
    pauseSpeech(speeds[mode]);
    speedResumePending = true;
  }
  speeds[mode] = Number(wpmRange.value);
  wpmValue.textContent = wpmRange.value;
  if (speedResumePending) {
    clearTimeout(speedResumeTimer);
    // During a drag, wait for the final input so we do not repeatedly cut off speech.
    speedResumeTimer = setTimeout(() => {
      speedResumeTimer = null;
      speedResumePending = false;
      resumeSpeech();
    }, 220);
  }
});
voiceSelect.addEventListener("change", () => {
  describeVoiceSelection();
  if (isRunning && !isPaused) {
    pauseSpeech();
    resumeSpeech();
  }
});
if ("speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}
writingMode.addEventListener("click", () => setMode("writing"));
listeningMode.addEventListener("click", () => setMode("listening"));
speakBtn.addEventListener("click", startSpeech);
pauseBtn.addEventListener("click", () => isPaused ? resumeSpeech() : pauseSpeech());
stopBtn.addEventListener("click", stopSpeech);
document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof Element && (target.closest("textarea, input, select, button, [contenteditable]") || target.isContentEditable)) return;
  if (event.code === "Space" && isRunning && !isPaused) {
    event.preventDefault();
    pauseSpeech();
  } else if (event.code === "Enter" && isRunning && isPaused) {
    event.preventDefault();
    resumeSpeech();
  }
});
updateControls();
