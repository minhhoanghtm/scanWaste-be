
import { Stack } from "expo-router";
import { EcoSortProvider } from "../contexts/EcoSortContext";

export default function RootLayout() {
  return (
    <EcoSortProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </EcoSortProvider>
  );
}
