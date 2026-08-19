declare module "react-simple-maps" {
  import type { ComponentType, ReactNode } from "react";

  export const ComposableMap: ComponentType<any>;
  export const Geographies: ComponentType<{
    geography: string;
    children?: (props: { geographies: any[] }) => ReactNode;
  }>;
  export const Geography: ComponentType<any>;
}