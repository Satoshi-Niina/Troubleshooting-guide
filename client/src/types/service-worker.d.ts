interface ServiceWorkerRegistration {
  sync?: {
    register(tag: string): Promise<void>;
    getTags(): Promise<string[]>;
  };
}

interface WorkboxInterface {
  controller?: any;
}

declare module 'workbox-window' {
  export class Workbox implements WorkboxInterface {
    controller?: any;
    constructor(scriptURL: string, options?: any);
    register(options?: any): Promise<any>;
    addEventListener(event: string, callback: Function): void;
    removeEventListener(event: string, callback: Function): void;
  }
  
  export function messageSW(controller: any, data: any): Promise<any>;
}

interface Window {
  SyncManager?: any;
}