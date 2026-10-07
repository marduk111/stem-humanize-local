# Stem Humanize (Local Running Version)

This is a browser-based implementation of the "Stem Humanize" effect from the plugin definition you gave me. It uses Web Audio API + AudioWorklet to run the DSP in real time.

## How to run

1. Open a terminal in this folder (or just run the Python server below).
2. Start a local server:

```bash
python -m http.server 8000
```

3. Open http://localhost:8000 in your browser (Chrome/Edge recommended).
4. Click "Start" to resume the AudioContext, then either load an audio file or use your microphone.
5. Tweak the controls. They're mapped to the same parameters (Preset, Loose, Organic, Expr, Feel, Sense, Release, Mix).

## Notes

- This is an approximation of the original graph code. The original uses specific graph nodes; here it's implemented in JS in the worklet for portability.
- Transient detection uses linked stereo level; timing is applied via a small variable delay (max ~20ms).
- If audio doesn't play, check that you clicked "Start" (browser requires user gesture).
- Mic + file at the same time is not fully wired here; loading a file will connect the file source.
- For best results use 44.1kHz/48kHz files or just try with your mic/stem.
