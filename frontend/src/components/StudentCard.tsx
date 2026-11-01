import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import InfoRow from './InfoRow';

interface StudentCardProps {
  studentId: string;
  major: string;
  academicYear: string;
}

export default function StudentCard({
  studentId,
  major,
  academicYear,
}: StudentCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>THÔNG TIN SINH VIÊN</Text>

      <InfoRow
        label="Mã SV"
        value={studentId}
        emphasized
      />

      <InfoRow
        label="Ngành học"
        value={major}
      />

      <InfoRow
        label="Niên khóa"
        value={academicYear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 15,
  },

  title: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
});