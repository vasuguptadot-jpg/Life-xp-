import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMeQueryKey,
  getGetProgressionSummaryQueryKey,
  useDeleteMe,
  useGetMe,
  useGetProgressionSummary,
  useLogout,
  useUpdateMe,
} from '@workspace/api-client-react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const me = useGetMe();
  const progression = useGetProgressionSummary();

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const updateMe = useUpdateMe();
  const logoutMutation = useLogout();
  const deleteMe = useDeleteMe();

  const handleSaveName = () => {
    updateMe.mutate(
      { data: { displayName: displayName.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setEditingName(false);
        },
      },
    );
  };

  const handleLogout = async () => {
    const rt = auth.refreshToken;
    if (rt) {
      logoutMutation.mutate({ data: { refreshToken: rt } });
    }
    await auth.logout();
    queryClient.clear();
    router.replace('/(auth)/login');
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (!confirm('Permanently delete your account? This cannot be undone.')) return;
      doDelete();
    } else {
      Alert.alert(
        'Delete account',
        'Permanently delete your account? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  const doDelete = async () => {
    deleteMe.mutate(
      {},
      {
        onSuccess: async () => {
          await auth.logout();
          queryClient.clear();
          router.replace('/(auth)/login');
        },
      },
    );
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  const user = me.data;
  const level = progression.data?.level;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar area */}
        <View style={styles.avatar}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(user?.displayName ?? user?.username ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {user?.displayName ?? user?.username ?? '—'}
          </Text>
          <Text style={[styles.username, { color: colors.mutedForeground }]}>
            @{user?.username ?? '—'}
          </Text>
          {level && (
            <View style={[styles.levelPill, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
              <Text style={[styles.levelPillText, { color: colors.primary }]}>
                Level {level.currentLevel} · {level.totalXp.toLocaleString()} XP
              </Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          {/* Info card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Email</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>{user?.email ?? '—'}</Text>
            </View>
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Username</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>@{user?.username ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Display name</Text>
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={[styles.nameInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    placeholderTextColor={colors.mutedForeground}
                    autoFocus
                    keyboardAppearance="dark"
                  />
                  <Pressable onPress={handleSaveName} disabled={updateMe.isPending}>
                    {updateMe.isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.saveText, { color: colors.primary }]}>Save</Text>
                    )}
                  </Pressable>
                  <Pressable onPress={() => setEditingName(false)}>
                    <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setDisplayName(user?.displayName ?? '');
                    setEditingName(true);
                  }}
                >
                  <Text style={[styles.editLink, { color: colors.primary }]}>
                    {user?.displayName ? user.displayName : 'Add name'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>SESSION</Text>
            <Pressable
              style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border }]}
              onPress={handleLogout}
            >
              <Text style={[styles.actionText, { color: colors.foreground }]}>Sign out</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleDeleteAccount}
            >
              <Text style={[styles.actionText, { color: colors.destructive }]}>Delete account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  avatar: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarInitial: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  name: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  username: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  levelPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
  },
  levelPillText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  rowValue: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    maxWidth: '55%',
    textAlign: 'right',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  nameInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    maxWidth: 140,
  },
  saveText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  editLink: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  actionRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
