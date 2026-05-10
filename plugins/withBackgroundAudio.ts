import {
  ConfigPlugin,
  withInfoPlist,
  withAndroidManifest,
  AndroidConfig,
} from "@expo/config-plugins"

const withBackgroundAudio: ConfigPlugin = (config) => {
  // iOS: background audio mode + microphone usage description
  config = withInfoPlist(config, (mod) => {
    const plist = mod.modResults
    if (!plist.UIBackgroundModes) {
      plist.UIBackgroundModes = []
    }
    if (!(plist.UIBackgroundModes as string[]).includes("audio")) {
      ;(plist.UIBackgroundModes as string[]).push("audio")
    }
    if (!plist.NSMicrophoneUsageDescription) {
      plist.NSMicrophoneUsageDescription =
        "This app records audio to transcribe your meetings."
    }
    if (!plist.NSUserNotificationUsageDescription) {
      plist.NSUserNotificationUsageDescription =
        "Notifications are used to alert you when your meeting transcript is ready."
    }
    return mod
  })

  // Android: permissions + foreground service
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)

    // Permissions
    const permissions = [
      "android.permission.RECORD_AUDIO",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    ]
    for (const perm of permissions) {
      AndroidConfig.Permissions.addPermission(manifest, perm)
    }

    // Foreground service for microphone
    const services = mainApplication.service ?? []
    const serviceExists = services.some(
      (s: { $: { "android:name": string } }) =>
        s.$?.["android:name"]?.includes("RecordingForegroundService"),
    )
    if (!serviceExists) {
      services.push({
        $: {
          "android:name": ".RecordingForegroundService",
          "android:foregroundServiceType": "microphone",
          "android:exported": "false",
        },
      })
    }
    mainApplication.service = services

    return mod
  })

  return config
}

export default withBackgroundAudio
