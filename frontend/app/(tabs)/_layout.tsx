
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: '#0A9569',
        tabBarInactiveTintColor: '#91A69B',

        tabBarButton: HapticTab,

        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5F0E9',
          borderTopWidth: 1,
          height: 65,
          paddingTop: 7,
          paddingBottom: 7,
          elevation: 8,
        },

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },

        tabBarHideOnKeyboard: true,
      }}
    >
      {/* UC007 - Cửa hàng đổi quà */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cửa hàng',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="gift.fill"
              color={color}
            />
          ),
        }}
      />

      {/* UC008 - Đổi quà */}
      <Tabs.Screen
        name="redeem"
        options={{
          title: 'Đổi quà',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="arrow.left.arrow.right"
              color={color}
            />
          ),
        }}
      />

      {/* UC013 - Ngân sách ESG */}
      <Tabs.Screen
        name="esg-budget"
        options={{
          title: 'Ngân sách ESG',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={24}
              name="chart.bar.fill"
              color={color}
            />
          ),
        }}
      />

      {/* Ẩn màn hình Explore mặc định */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
