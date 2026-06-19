/// <reference types="vite/client" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'cloudops-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'gateway-url'?: string;
          token?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
