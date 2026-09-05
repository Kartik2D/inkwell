/**
 * Timeline-synced Web Audio playback for audio layers.
 */
export type PlaybackClip = {
  buffer: AudioBuffer;
  startFrame: number;
};

export class AudioPlayback {
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];

  private getCtx(): AudioContext {
    return (this.ctx ??= new AudioContext());
  }

  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.sources = [];
  }

  /** Scrub preview: play exactly one frame's worth of each clip at `frame`. */
  preview(clips: PlaybackClip[], frame: number, fps: number): void {
    this.stop();
    if (clips.length === 0 || fps <= 0) return;
    const ctx = this.getCtx();
    void ctx.resume();
    const frameSec = 1 / fps;
    for (const clip of clips) {
      const offset = (frame - clip.startFrame) / fps;
      if (offset < 0 || offset >= clip.buffer.duration) continue;
      const source = ctx.createBufferSource();
      source.buffer = clip.buffer;
      source.connect(ctx.destination);
      source.start(ctx.currentTime, offset, frameSec);
      this.sources.push(source);
    }
  }

  start(clips: PlaybackClip[], currentFrame: number, fps: number): void {
    this.stop();
    if (clips.length === 0 || fps <= 0) return;
    const ctx = this.getCtx();
    void ctx.resume();
    const now = ctx.currentTime;
    const playheadSec = currentFrame / fps;
    for (const clip of clips) {
      const startSec = clip.startFrame / fps;
      const offset = playheadSec - startSec;
      if (offset >= clip.buffer.duration) continue;
      const source = ctx.createBufferSource();
      source.buffer = clip.buffer;
      source.connect(ctx.destination);
      if (offset >= 0) {
        source.start(now, offset);
      } else {
        source.start(now - offset);
      }
      this.sources.push(source);
    }
  }
}
