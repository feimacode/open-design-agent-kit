// Public entry point for @feimacode/open-design-agent-kit-core — every
// vscode-free module the vscode package (or a future agent-host package)
// needs. Re-exports everything rather than a curated subset: this package
// has no other consumers to protect a narrower surface against yet.

export * from './content/contentIndex';
export * from './content/exampleHtml';
export * from './content/localPrompts';

export * from './generation/composeInstructions';
export * from './generation/brandExtraction';
export * from './generation/collectionEntryPath';
export * from './generation/customDesignSystemInstructions';
export * from './generation/designSystemImport';
export * from './generation/figmaPull';
export * from './generation/githubImport';
export * from './generation/hostOverrides';
export * from './generation/portToAppInstructions';
export * from './generation/shareToCommunityInstructions';
export * from './generation/tokenExtraction';

export * from './vendored/artifactManifest';
export * from './vendored/artifactCreate';

export * from './workspace/activeDesignSystemStore';
export * from './workspace/appDetection';
export * from './workspace/artifactComments';
export * from './workspace/collectionScan';
export * from './workspace/figmaCapture';
export * from './workspace/remixExample';

export * from './export/browserDiscovery';
export * from './export/exportArtifact';
export * from './export/exportFormats';
export * from './export/exportSize';
