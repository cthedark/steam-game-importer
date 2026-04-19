declare module "steam-shortcut-editor" {
  export function parseBuffer(buffer: Buffer): any;
  export function writeBuffer(data: any): Buffer;
}
