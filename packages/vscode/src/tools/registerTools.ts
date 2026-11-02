import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../extension/log/logService';
import { ListSkillsTool } from './listSkillsTool';
import { ListDesignSystemsTool } from './listDesignSystemsTool';
import { RecommendDesignSystemsTool } from './recommendDesignSystemsTool';
import { ScanAppTool } from './scanAppTool';
import { PrepareBriefTool } from './prepareBriefTool';
import { RegisterArtifactTool } from './registerArtifactTool';
import { GetArtifactTool } from './getArtifactTool';
import { SetActiveDesignSystemTool } from './setActiveDesignSystemTool';
import { RemixExampleTool } from './remixExampleTool';
import { CreateCustomDesignSystemTool } from './createCustomDesignSystemTool';
import { ExtractDesignSystemTool } from './extractDesignSystemTool';
import { PortToAppCodeTool } from './portToAppCodeTool';
import { PrepareComponentLibraryTool } from './prepareComponentLibraryTool';
import { ShareToCommunityTool } from './shareToCommunityTool';
import { PublishCanvaTemplateTool } from './publishCanvaTemplateTool';
import { PublishToShopTool } from './publishToShopTool';
import { PullFigmaFrameTool } from './pullFigmaFrameTool';
import { CheckArtifactTool } from './checkArtifactTool';
import { ListIntegrationsTool } from './listIntegrationsTool';
import { ListPrintHousesTool } from './listPrintHousesTool';
import { Find3dAssetsTool } from './find3dAssetsTool';
import { PushFigmaTool } from './pushFigmaTool';
import { ExportArtifactTool } from './exportArtifactTool';
import { AdaptArtifactTool } from './adaptArtifactTool';
import { AddDiagramRuntimeTool } from './addDiagramRuntimeTool';
import { CreateQrCodeTool } from './createQrCodeTool';
import { ReadSourceTool } from './readSourceTool';
import { PublishArtifactTool } from './publishArtifactTool';
import { ChooseDirectionTool, CompareExplorationTool, PrepareExplorationTool } from './explorationTools';
import { LoggingTool } from './loggingTool';

export function registerTools(
  context: vscode.ExtensionContext,
  contentIndex: ContentIndex,
  log: ILogService,
  assetsRoot: string,
  communityContentDir?: string,
): void {
  const registrations: Array<[string, vscode.LanguageModelTool<any>]> = [
    ['list_open_design_skills', new ListSkillsTool(contentIndex)],
    ['list_open_design_design_systems', new ListDesignSystemsTool(contentIndex)],
    ['recommend_open_design_design_systems', new RecommendDesignSystemsTool(contentIndex)],
    ['scan_open_design_app', new ScanAppTool(contentIndex)],
    ['read_open_design_source', new ReadSourceTool()],
    ['prepare_open_design_brief', new PrepareBriefTool(contentIndex)],
    ['prepare_open_design_exploration', new PrepareExplorationTool(contentIndex)],
    ['compare_open_design_exploration', new CompareExplorationTool(contentIndex)],
    ['choose_open_design_direction', new ChooseDirectionTool(contentIndex)],
    ['register_open_design_artifact', new RegisterArtifactTool()],
    ['get_open_design_artifact', new GetArtifactTool(contentIndex)],
    ['set_active_design_system', new SetActiveDesignSystemTool(contentIndex)],
    ['remix_open_design_example', new RemixExampleTool(contentIndex, assetsRoot, communityContentDir)],
    ['create_open_design_design_system', new CreateCustomDesignSystemTool(contentIndex)],
    ['extract_open_design_design_system', new ExtractDesignSystemTool()],
    ['port_open_design_artifact_to_app', new PortToAppCodeTool(contentIndex)],
    ['prepare_open_design_component_library', new PrepareComponentLibraryTool(contentIndex)],
    ['share_open_design_artifact_to_community', new ShareToCommunityTool()],
    ['publish_open_design_artifact_to_canva', new PublishCanvaTemplateTool()],
    ['publish_open_design_artifact_to_shop', new PublishToShopTool()],
    ['pull_open_design_figma_frame', new PullFigmaFrameTool(context)],
    ['push_open_design_artifact_to_figma', new PushFigmaTool()],
    ['export_open_design_artifact', new ExportArtifactTool(contentIndex)],
    ['check_open_design_artifact', new CheckArtifactTool(contentIndex)],
    ['list_open_design_integrations', new ListIntegrationsTool(contentIndex)],
    ['list_open_design_print_houses', new ListPrintHousesTool(contentIndex)],
    ['find_open_design_3d_assets', new Find3dAssetsTool()],
    ['adapt_open_design_artifact', new AdaptArtifactTool()],
    ['create_open_design_qr_code', new CreateQrCodeTool()],
    ['add_open_design_diagram_runtime', new AddDiagramRuntimeTool()],
    ['publish_open_design_artifact', new PublishArtifactTool()],
  ];

  for (const [name, tool] of registrations) {
    context.subscriptions.push(vscode.lm.registerTool(name, new LoggingTool(name, tool, log)));
    log.info(`Registered tool: ${name}`);
  }
}
