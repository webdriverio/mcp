import type { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp';

type ResourceContent = { uri: string; mimeType?: string; text: string } | { uri: string; mimeType?: string; blob: string };

export interface StaticResourceDefinition {
  name: string;
  uri: string;
  description: string;
  handler: () => Promise<{ contents: ResourceContent[] }>;
}

export interface TemplateResourceDefinition {
  name: string;
  template: ResourceTemplate;
  description: string;
  handler: (uri: URL, variables: Record<string, string>) => Promise<{ contents: ResourceContent[] }>;
}

export type ResourceDefinition = StaticResourceDefinition | TemplateResourceDefinition;