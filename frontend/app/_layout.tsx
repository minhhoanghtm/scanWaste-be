
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppSession } from '../features/auth/AuthProvider';
import { Stack } from "expo-router";
import { EcoSortProvider } from "../contexts/EcoSortContext";

export default function RootLayout() {
  return (
    <AppSession><SafeAreaProvider><SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}><View style={styles.app}><EcoSortProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </EcoSortProvider></View></SafeAreaView></SafeAreaProvider></AppSession>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, backgroundColor: "#EDF5F0" }, app: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: "#F5FBF8" } });
