# Text to Speech Controller

A static, distraction-free page with two reading modes:

- Writing: one word at a time, 1–40 WPM, starting at 21 WPM.
- Listening: sentence-sized speech, 90–190 WPM, starting at 150 WPM.

Pause changes to Resume. It restarts the current word, including when you switch modes while paused. Space pauses and Enter resumes when focus is outside the text box and buttons. Speak starts the entered text from the beginning; Stop resets it.

Changing either speed while speaking pauses playback and automatically resumes at the selected speed. During a slider drag, playback resumes shortly after the final adjustment.

The small speaker icon beside Listening opens a dropdown with one Male and one Female option when the browser provides recognizable English voices. Voice names and availability vary by device; the Web Speech API has no gender field, so the page identifies these options from voice names. An unavailable option is disabled. If neither is found, the browser's default voice still reads the text. Switching voices during playback restarts at the current word.

## GitHub Pages

Place `index.html`, `style.css`, `script.js`, and `favicon.png` in the repository root. In GitHub repository Settings → Pages, select **Deploy from a branch**, your chosen branch, and **/(root)**. No build tools or server code are needed.

Speech uses the device's available browser voices. Listening WPM is a target relative to the voice's normal rate, so actual pace varies by voice. The browser's word-boundary events provide precise resume positions during natural sentence playback. If its voice does not provide those events, the page estimates the position by elapsed time; pausing within a long or irregularly spoken word may resume at a neighboring word. A browser with word-boundary support is recommended for exact word restarts in Listening mode.
