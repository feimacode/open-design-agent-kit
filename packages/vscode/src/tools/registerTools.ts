import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../extension/log/logService';
import { ListSkillsTool } from './listSkillsTool';
import { ListDesignSystemsTool } from './listDesignSystemsTool';
import { PrepareBriefTool } from './prepareBriefTool';
import { RegisterArtifactTool } from './registerArtifactTool';
import { GetArtifactTool } from './getArtifactTool';
import { SetActiveDesignSystemTool } from './setActiveDesignSystemTool';
import { RemixExampleTool } from './remixExampleTool';
import { CreateCustomDesignSystemTool } from './createCustomDesignSystemTool';
import { PortToAppCodeTool } from './portToAppCodeTool';
import { ShareToCommunityTool } from './shareToCommunityTool';
import { PublishCanvaTemplateTool } from './publishCanvaTemplateTool';
import { PullFigmaFrameTool } from './pullFigmaFrameTool';
import { CheckArtifactTool } from './checkArtifactTool';
import { ListIntegrationsTool } from './listIntegrationsTool';
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
    ['read_open_design_source', new ReadSourceTool()],
    ['prepare_open_design_brief', new PrepareBriefTool(contentIndex)],
    ['prepare_open_design_exploration', new PrepareExplorationTool(contentIndex)],
    ['compare_open_design_exploration', new CompareExplorationTool(contentIndex)],
    ['choose_open_design_direction', new ChooseDirectionTool(contentIndex)],
    ['register_open_design_artifact', new RegisterArtifactTool()],
    ['get_open_design_artifact', new GetArtifactTool()],
    ['set_active_design_system', new SetActiveDesignSystemTool(contentIndex)],
    ['remix_open_design_example', new RemixExampleTool(contentIndex, assetsRoot, communityContentDir)],
    ['create_open_design_design_system', new CreateCustomDesignSystemTool(contentIndex)],
    ['port_open_design_artifact_to_app', new PortToAppCodeTool()],
    ['share_open_design_artifact_to_community', new ShareToCommunityTool()],
    ['publish_open_design_artifact_to_canva', new PublishCanvaTemplateTool()],
    ['pull_open_design_figma_frame', new PullFigmaFrameTool(context)],
    ['push_open_design_artifact_to_figma', new PushFigmaTool()],
    ['export_open_design_artifact', new ExportArtifactTool(contentIndex)],
    ['check_open_design_artifact', new CheckArtifactTool(contentIndex)],
    ['list_open_design_integrations', new ListIntegrationsTool(contentIndex)],
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
