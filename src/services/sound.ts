const SOUND_KEY = 'wodi-sound-v1';
type SoundCue = 'reveal' | 'turn' | 'vote' | 'eliminate' | 'result' | 'notice';

let audioContext: { currentTime: number; state: string; resume: () => Promise<void>; createOscillator: () => any; createGain: () => any; destination: any } | null = null;

export function isSoundEnabled(): boolean {
  return uni.getStorageSync(SOUND_KEY) !== false;
}

export function setSoundEnabled(enabled: boolean): void {
  uni.setStorageSync(SOUND_KEY, enabled);
}

function frequencies(cue: SoundCue): [number, number, number] {
  switch (cue) {
    case 'reveal': return [392, 523, 659];
    case 'turn': return [523, 659, 784];
    case 'vote': return [330, 392, 494];
    case 'eliminate': return [494, 392, 262];
    case 'result': return [523, 659, 784];
    default: return [440, 0, 0];
  }
}

export function playSound(cue: SoundCue): void {
  if (!isSoundEnabled()) return;
  try {
    const AudioContextCtor = typeof window !== 'undefined' ? (window as any).AudioContext || (window as any).webkitAudioContext : undefined;
    if (!AudioContextCtor) {
      // The haptic fallback gives mini program users feedback until platform audio is unlocked.
      uni.vibrateShort?.({ type: cue === 'eliminate' ? 'heavy' : 'light' });
      return;
    }
    audioContext ||= new AudioContextCtor();
    const context = audioContext!;
    if (context.state === 'suspended') void context.resume();
    const [first, second, third] = frequencies(cue);
    [first, second, third].forEach((frequency, index) => {
      if (!frequency) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.08;
      oscillator.type = cue === 'notice' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  } catch { /* Audio is an enhancement; gameplay must continue silently. */ }
}
