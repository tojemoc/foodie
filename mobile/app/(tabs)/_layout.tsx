import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { colors } from '../../src/theme/colors';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Foodie',
          tabBarLabel: 'Inventory',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add item',
          tabBarIcon: ({ color }) => <TabBarIcon name="plus-circle" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: 'Places',
          tabBarIcon: ({ color }) => <TabBarIcon name="map-marker" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
