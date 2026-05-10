export interface ConfigBaseProps {
  persistNavigation: "always" | "dev" | "prod" | "never"
  catchErrors: "always" | "dev" | "prod" | "never"
  exitRoutes: string[]
  API_URL: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  BACKEND_URL: string
}

export type PersistNavigationConfig = ConfigBaseProps["persistNavigation"]

const BaseConfig: ConfigBaseProps = {
  persistNavigation: "dev",
  catchErrors: "always",
  exitRoutes: ["Welcome"],
  API_URL: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  BACKEND_URL: "",
}

export default BaseConfig
