// Public entry point for @feimacode/open-design-agent-kit-core — every
// vscode-free module the vscode package (or a future agent-host package)
// needs. Re-exports everything rather than a curated subset: this package
// has no other consumers to protect a narrower surface against yet.

export * from './content/contentIndex';
export * from './content/gallerySite';
export * from './content/designSystemMatching';
export * from './content/listSkillsPayload';
export * from './content/exampleHtml';
export { startStaticServer, urlForPath, type StaticServer, type StaticServerOptions } from './export/staticServer';
export * from './content/localPrompts';

export * from './generation/composeInstructions';
export * from './generation/briefDecisions';
export * from './generation/brandExtraction';
export * from './generation/collectionEntryPath';
export * from './generation/customDesignSystemInstructions';
export * from './generation/designSystemPreview';
export * from './generation/designSystemSource';
export * from './generation/designSystemTokens';
export * from './generation/designSystemVisualize';
export * from './generation/designSystemImport';
export * from './generation/claudeDesignSystem';
export * from './generation/evidenceToTokens';
export * from './generation/siteExtraction';
export * from './generation/explorationPlan';
export * from './generation/tweaks';
export * from './generation/explorationTools';
export * from './generation/publishArtifact';
export * from './generation/restoreArtifact';
export * from './generation/publishInstructions';
export * from './generation/publishProviders';
export * from './generation/structuralDirections';
export * from './generation/figmaPull';
export * from './generation/githubImport';
export * from './generation/hostOverrides';
export * from './generation/portToAppInstructions';
export * from './generation/componentLibrary';
export * from './generation/libraryThemes';
export * from './generation/publishCanvaTemplateInstructions';
export * from './generation/shopHandoff';
export * from './generation/canvaUpload';
export * from './generation/shareToCommunityInstructions';
export * from './generation/sourceBrief';
export * from './generation/sourceInstructions';
export * from './generation/sourceNumberCheck';
export * from './generation/tokenExtraction';

export * from './vendored/artifactManifest';
export * from './vendored/artifactCreate';
export * from './vendored/designDirections';
export * from './vendored/documentExtract';

export * from './setup/claudeLaunch';
export * from './workspace/activeDesignSystemStore';
export * from './workspace/appDetection';
export * from './workspace/artifactComments';
export * from './workspace/artifactSync';
export * from './workspace/collectionScan';
export * from './workspace/critique';
export * from './workspace/designHistory';
export * from './workspace/projectContext';
export * from './workspace/explorationCompare';
export * from './workspace/explorationStore';
export * from './workspace/shareRecords';
export * from './workspace/figmaCapture';
export * from './workspace/remixExample';
export * from './workspace/sourceStore';

export * from './export/browserDiscovery';

export * from './jobs/jobFile';
export * from './jobs/periodKey';
export * from './jobs/runLog';
export * from './jobs/jobChecks';
export * from './jobs/jobRun';

export * from './export/exportArtifact';
export * from './export/checkArtifact';
export * from './export/checkHistory';
export * from './export/campaignSheet';
export * from './export/webgl';
export * from './export/sceneReview';
export * from './assets/polyHaven';
export * from './export/inlineExport';
export * from './export/motion/ffmpeg';
export * from './export/motion/motionExport';
export * from './generation/diagramRuntime';
export * from './export/exportFormats';
export * from './export/exportSize';
export * from './export/packageArtifact';
export * from './export/artifactPreflight';
export * from './export/embedAssets';
export * from './export/shareDecorations';
export * from './export/siteBundle';

export * from './poster/formats';
export * from './poster/data';
export * from './poster/preflight';
export * from './poster/printPdf';
export * from './poster/printHouses';
export * from './poster/qr';
export * from './generation/adaptInstructions';
export * from './poster/shapeSheet';

export * from './integrations';
export * from './figma';

// The browser preview (openspec add-browser-preview).
export * from './preview/server/previewSession';
export { startPreviewServer, type PreviewServer, type PreviewServerOptions } from './preview/server/previewServer';
export { openPreviewWindow, defaultOpeners, PREVIEW_BROWSER_ENV, type PreviewOpenResult, type PreviewWindow } from './preview/server/openPreviewWindow';
export { loadPreviewAssets, type PreviewAssets } from './preview/server/assets';
// The preview MCP App (openspec add-mcp-app-preview).
export * from './preview/mcpApp/protocol';
export * from './preview/server/mcpApp';
export * from './preview/server/previewRevision';
export * from './preview/server/mcpAppPickers';
