export {};

declare module "gloomberb/plugins" {
  export function registerByokKnownService(service: {
    id: string;
    name: string;
    apiUrl: string;
    authType: "header";
    authKey: string;
    envVar: string;
    description: string;
  }): void;
}

declare module "gloomberb/types/plugin" {
  interface GloomPluginContext {
    getApiKey(serviceId: string): string | undefined;
  }
}
