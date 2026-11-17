// Sound and caption checks for a film, from its source (openspec
// add-video-sound-and-captions). check_open_design_artifact reports them
// before export; the export repeats the ones it can only measure then
// (audio-clipped, caption-outside-safe-area) as warnings.
import * as path from 'node:path';
import type { Finding } from '../../poster/preflight';
import { captionCuesInHtml, captionTimingWarnings } from './captions';
import { audioTracksInHtml, readAudioDecision, resolveAudioTracks, skippedMessage } from './soundtrack';

/** True when the page carries film sound or caption markup worth checking. */
export function hasFilmSoundMarkup(html: string): boolean {
  return /<audio\b/i.test(html) || /\bdata-od-caption\b/.test(html) || readAudioDecision(html) !== undefined;
}

export async function filmSoundFindings(workspaceRoot: string, entryPath: string, html: string): Promise<Finding[]> {
  if (!hasFilmSoundMarkup(html)) return [];
  const findings: Finding[] = [];
  const relEntry = path.relative(workspaceRoot, path.resolve(workspaceRoot, entryPath)).split(path.sep).join('/');
  const { tracks, skipped } = await resolveAudioTracks({ workspaceRoot, entryDir: path.posix.dirname(relEntry), raw: audioTracksInHtml(html) });
  const decision = readAudioDecision(html);
  for (const s of skipped) findings.push({ check: 'audio-source', severity: decision === 'required' ? 'error' : 'warning', message: skippedMessage(s) });
  if (decision === 'required' && tracks.length === 0) {
    findings.push({ check: 'no-audio-track', severity: 'error', message: `The page declares od-motion-audio "required" but has no playable <audio> track${skipped.length ? ` (${skipped.map((s) => s.src).join(', ')} can't be used)` : ''}. Add a local sound file in the design's folder, or export with audio.` });
  }
  for (const w of captionTimingWarnings(captionCuesInHtml(html))) findings.push({ check: w.check, severity: 'warning', message: w.message });
  return findings;
}
