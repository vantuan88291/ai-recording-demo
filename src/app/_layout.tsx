import { useEffect, useState, useRef } from "react"
import { Slot, SplashScreen, useRouter } from "expo-router"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { handleNotificationResponse } from "@/features/notifications/notificationNavigation"
import {
  configureNotificationHandler,
  addNotificationResponseListener,
  getInitialNotificationResponse,
} from "@/features/notifications/notifications"
import { initI18n } from "@/i18n"
import { ThemeProvider } from "@/theme/context"
import { customFontsToLoad } from "@/theme/typography"
import { loadDateFnsLocale } from "@/utils/formatDate"

SplashScreen.preventAutoHideAsync()

configureNotificationHandler()

if (__DEV__) {
  // Load Reactotron configuration in development. We don't want to
  // include this in our production bundle, so we are using `if (__DEV__)`
  // to only execute this in development.
  require("@/devtools/ReactotronConfig")
}

export default function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const router = useRouter()
  const routerReady = useRef(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  const loaded = fontsLoaded && isI18nInitialized

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
      routerReady.current = true
    }
  }, [loaded])

  // Handle notification taps while app is open
  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      handleNotificationResponse(response, router)
    })
    return () => sub.remove()
  }, [router])

  // Handle cold-start notification tap
  useEffect(() => {
    if (!loaded) return
    getInitialNotificationResponse().then((response) => {
      if (response) {
        handleNotificationResponse(response, router)
      }
    })
  }, [loaded, router])

  if (!loaded) {
    return null
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <KeyboardProvider>
          <Slot />
        </KeyboardProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
