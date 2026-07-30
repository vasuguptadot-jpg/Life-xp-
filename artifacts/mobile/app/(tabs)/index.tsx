import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOnboardingQueryKey,
  getGetProgressionSummaryQueryKey,
  useGetMe,
  useGetOnboarding,
  useGetProgressionSummary,
} from '@workspace/api-client-react';
import LevelCard from '@/components/LevelCard';
import AttributeBar from '@/components/AttributeBar';
import { useColors } from '@/hooks/useColors';
import type { AttributeKey } from '@/constants/colors';

const VALID_ATTRIBUTES = new Set([
  'STRENGTH', 'ENDURANCE', 'MOBILITY', 'NUTRITION', 'RECOVERY', 'DISCIPLINE', 'KNOWLEDGE',
]);

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const me = useGetMe();
  const onboarding = useGetOnboarding();
  const progression = useGetProgressionSummary();

  const isOnboardingComplete = onboarding.data?.state?.isCompleted ?? true;

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetProgressionSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
  }, [queryClient]);

  const isLoading = progression.isLoading;
  const isRefreshing = progression.isRefetching;

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: botPad }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Welcome back</Text>
            <Text style={[styles.username, { color: colors.foreground }]}>
              {me.data?.displayName ?? me.data?.username ?? '—'}
            </Text>
          </View>
          <View style={[styles.levelBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
            <Text style={[styles.levelBadgeText, { color: colors.primary }]}>
              Lv {progression.data?.level?.currentLevel ?? '—'}
            </Text>
          </View>
        </View>

        {/* Onboarding prompt */}
        {!isOnboardingComplete && (
          <Pressable
            style={[styles.onboardingBanner, { backgroundColor: colors.accent + '22', borderColor: colors.accent }]}
            onPress={() => router.push('/onboarding')}
          >
            <Text style={[styles.onboardingText, { color: colors.accent }]}>
              Complete your character setup
            </Text>
            <Text style={[styles.onboardingArrow, { color: colors.accent }]}>→</Text>
          </Pressable>
        )}

        <View style={styles.body}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : progression.error ? (
            <View style={styles.errorState}>
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                Failed to load progression
              </Text>
              <Pressable onPress={() => progression.refetch()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Level card */}
              {progression.data?.level && (
                <LevelCard
                  currentLevel={progression.data.level.currentLevel}
                  totalXp={progression.data.level.totalXp}
                />
              )}

              {/* Attributes */}
              {progression.data?.attributes && progression.data.attributes.length > 0 && (
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attributes</Text>
                  <View style={styles.attrList}>
                    {progression.data.attributes
                      .filter((a) => VALID_ATTRIBUTES.has(a.attribute))
                      .map((attr, i) => (
                        <AttributeBar
                          key={attr.id}
                          attribute={attr.attribute as AttributeKey}
                          value={attr.currentValue}
                          index={i}
                        />
                      ))}
                  </View>
                </View>
              )}

              {/* Recent XP */}
              {progression.data?.recentTransactions && (
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent XP</Text>
                  {progression.data.recentTransactions.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                      No XP earned yet. Complete a quest to get started.
                    </Text>
                  ) : (
                    progression.data.recentTransactions.slice(0, 10).map((tx) => (
                      <View
                        key={tx.id}
                        style={[styles.txRow, { borderBottomColor: colors.border }]}
                      >
                        <View style={styles.txInfo}>
                          <Text style={[styles.txSource, { color: colors.foreground }]}>
                            {tx.sourceType.replace(/_/g, ' ')}
                          </Text>
                          {tx.category && (
                            <Text style={[styles.txCategory, { color: colors.mutedForeground }]}>
                              {tx.category}
                            </Text>
                          )}
                        </View>
                        <View style={styles.txRight}>
                          <Text style={[styles.txAmount, { color: colors.primary }]}>
                            +{tx.amount} XP
                          </Text>
                          <Text style={[styles.txTime, { color: colors.mutedForeground }]}>
                            {formatRelativeTime(tx.createdAt)}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },
  username: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  levelBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  levelBadgeText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  onboardingBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onboardingText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  onboardingArrow: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  body: {
    paddingHorizontal: 20,
    gap: 16,
  },
  section: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  attrList: {
    gap: 2,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txInfo: {
    flex: 1,
  },
  txSource: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  txCategory: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmount: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  txTime: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  errorState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  retryText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
