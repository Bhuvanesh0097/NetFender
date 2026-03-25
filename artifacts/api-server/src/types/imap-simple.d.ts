declare module "imap-simple" {
  interface ImapSimpleOptions {
    imap: {
      user: string;
      password: string;
      host: string;
      port: number;
      tls: boolean;
      tlsOptions?: Record<string, unknown>;
      authTimeout?: number;
    };
  }

  interface MessagePart {
    which: string;
    body: any;
    size?: number;
  }

  interface ImapMessage {
    parts: MessagePart[];
    attributes: {
      uid: number | string;
      date?: Date;
      flags?: string[];
      struct?: any;
    };
  }

  interface FetchOptions {
    bodies: string[];
    markSeen?: boolean;
    struct?: boolean;
  }

  interface ImapSimple {
    openBox(folder: string): Promise<void>;
    search(criteria: any[], options: FetchOptions): Promise<ImapMessage[]>;
    end(): void;
  }

  function connect(options: ImapSimpleOptions): Promise<ImapSimple>;
  function getParts(struct: any[]): any[];

  export { connect, getParts, ImapSimple, ImapMessage, ImapSimpleOptions };
  export default { connect, getParts };
}
