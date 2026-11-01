import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface InfoRowProps {
  label: string;
  value: string;
  emphasized?: boolean;
}

export default function InfoRow({
  label,
  value,
  emphasized = false,
}: InfoRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>

      <Text style={[styles.value, emphasized && styles.emphasized]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },

  label: {
    width: 100,
    fontSize: 16,
    fontWeight: '600',
  },

  value: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
  },

  emphasized: {
    fontWeight: '700',
  },
});