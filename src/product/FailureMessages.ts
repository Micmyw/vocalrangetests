const FAILURE_MESSAGES: Record<string, string> = {
  "signal-too-quiet": "Sing a little louder or move closer to your microphone.",
  "snr-below-threshold": "Sing a little louder or move closer to your microphone.",
  silence: "Sing a little louder or move closer to your microphone.",
  "input-clipping": "That was too loud for your microphone. Move back slightly and try again.",
  "no-pitch": "We couldn’t detect a clear note. Try an “ah” or “oo” sound.",
  "low-confidence": "We couldn’t detect a clear note. Try an “ah” or “oo” sound.",
  "pitch-drift": "Keep the pitch steadier and try again.",
  "post-lock-drift": "Keep the pitch steadier and try again.",
  "pitch-spread": "Keep the pitch steadier and try again.",
  "insufficient-terminal-stability": "Keep the note steady a little longer.",
  "octave-ambiguous": "We heard an unclear pitch. Try again with a steady, comfortable tone.",
  "capture-timeout": "We couldn’t lock onto a stable note. Take a breath and try again.",
  "insufficient-usable-frames": "We couldn’t lock onto a stable note. Take a breath and try again.",
};

export function failureMessageFor(reason: string | null): string {
  return FAILURE_MESSAGES[reason ?? ""] ??
    "We couldn’t lock onto a stable note. Take a breath and try again.";
}
