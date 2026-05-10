import { Tabs } from "expo-router"

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Record" }}
      />
      <Tabs.Screen
        name="meetings"
        options={{ title: "Meetings" }}
      />
    </Tabs>
  )
}
