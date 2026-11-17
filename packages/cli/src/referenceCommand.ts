import * as path from 'node:path';
import { formatReferenceFacts, inspectReferenceVideo, isVideoLink, LINK_ANSWER } from '@feimacode/open-design-agent-kit-core';
import { resolveWorkspaceRoot } from './exportCommand';

export interface ReferenceCliOptions {
  workspace?: string;
  ffmpeg?: string;
  json?: boolean;
}

/** `reference <video>`: measures a reference video (openspec add-reference-video-replication). Returns the exit code. */
export async function runReference(videoArg: string, flags: ReferenceCliOptions, cwd = process.cwd()): Promise<number> {
  if (isVideoLink(videoArg)) {
    console.error(LINK_ANSWER);
    return 1;
  }
  const workspaceRoot = await resolveWorkspaceRoot(videoArg, flags.workspace, cwd);
  const video = path.relative(workspaceRoot, path.resolve(cwd, videoArg));
  const result = await inspectReferenceVideo({ workspaceRoot, outputDir: '.open-design', video, ffmpegPath: flags.ffmpeg });
  if (!result.ok) {
    console.error(`Couldn't read the reference video (${result.code}): ${result.error}`);
    return 1;
  }
  console.log(flags.json ? JSON.stringify(result.facts, null, 2) : `${formatReferenceFacts(result.facts)}\nreferenceId: ${result.facts.referenceId}`);
  return 0;
}
