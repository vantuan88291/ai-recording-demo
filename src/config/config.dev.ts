/**
 * These are configuration settings for the dev environment.
 *
 * Do not include API secrets in this file or anywhere in your JS.
 *
 * https://reactnative.dev/docs/security#storing-sensitive-info
 */
import { Platform } from "react-native"

// Android emulator uses 10.0.2.2 to reach the host machine; iOS simulator uses 127.0.0.1
const host = Platform.OS === "android" ? "10.0.2.2" : "192.168.50.150"

export default {
  API_URL: `http://${host}:8000`,
  SUPABASE_URL: `http://${host}:54321`,
  SUPABASE_ANON_KEY: "",
  BACKEND_URL: `http://${host}:8000`,
}
