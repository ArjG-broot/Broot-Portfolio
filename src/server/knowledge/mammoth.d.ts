declare module "mammoth" {
  export type MammothMessage = {
    type: string;
    message: string;
  };

  export function convertToMarkdown(input: {
    path: string;
  }): Promise<{
    value: string;
    messages: MammothMessage[];
  }>;
}
