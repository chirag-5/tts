const textInput = document.getElementById("textInput");
const wpmRange = document.getElementById("wpmRange");
const wpmValue = document.getElementById("wpmValue");
const speakBtn = document.getElementById("speakBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

let words = [];
let currentWordIndex = 0;
let isRunning = false;
let isPaused = false;
let nextWordTimer = null;
let currentUtterance = null;

function updateStatus(message) {
  statusEl.textContent = message;
}

function clearNextWordTimer() {
  if (nextWordTimer) {
    clearTimeout(nextWordTimer);
    nextWordTimer = null;
  }
}

function getWordIntervalMs() {
  const wpm = Number(wpmRange.value);
  return 60000 / wpm;
}

function stopAllSpeech() {
  clearNextWordTimer();
  speechSynthesis.cancel();
  currentUtterance = null;
}

function speakCurrentWord() {
  if (!isRunning || isPaused) {
    return;
  }

  if (currentWordIndex >= words.length) {
    isRunning = false;
    updateStatus("Finished");
    return;
  }

  const word = words[currentWordIndex];
  const startedAt = performance.now();
  const intervalMs = getWordIntervalMs();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.85;
  currentUtterance = utterance;

  updateStatus(
    `Speaking word ${currentWordIndex + 1} of ${words.length}: "${word}"`
  );

  utterance.onend = () => {
    if (!isRunning || isPaused) {
      return;
    }

    currentWordIndex += 1;
    const elapsed = performance.now() - startedAt;
    const delay = Math.max(0, intervalMs - elapsed);

    nextWordTimer = setTimeout(() => {
      speakCurrentWord();
    }, delay);
  };

  utterance.onerror = () => {
    isRunning = false;
    updateStatus("Speech error. Try again.");
  };

  speechSynthesis.speak(utterance);
}

function speakText() {
  const text = textInput.value.trim();

  if (!text) {
    updateStatus("Please enter some text first.");
    return;
  }

  words = text.split(/\s+/).filter(Boolean);
  currentWordIndex = 0;
  isRunning = true;
  isPaused = false;

  stopAllSpeech();
  speakCurrentWord();
}

function stopSpeech() {
  isRunning = false;
  isPaused = false;
  stopAllSpeech();
  currentWordIndex = 0;
  updateStatus("Stopped");
}

wpmRange.addEventListener("input", () => {
  wpmValue.textContent = wpmRange.value;

  if (isRunning && !isPaused) {
    updateStatus("Speed changed. Next word will use updated WPM.");
  }
});

speakBtn.addEventListener("click", speakText);
stopBtn.addEventListener("click", stopSpeech);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    if (isRunning && !isPaused) {
      event.preventDefault();
      isPaused = true;
      clearNextWordTimer();
      // Cancel current audio so resume starts from this same word.
      speechSynthesis.cancel();
      updateStatus(
        `Paused at word ${currentWordIndex + 1}. Press Enter to continue.`
      );
    }
  }

  if (event.code === "Enter") {
    if (isRunning && isPaused) {
      event.preventDefault();
      isPaused = false;
      updateStatus("Resuming...");
      speakCurrentWord();
    }
  }
});

updateStatus("Idle");
