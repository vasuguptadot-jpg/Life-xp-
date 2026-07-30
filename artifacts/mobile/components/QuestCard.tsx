import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface QuestCardProps {
  title: string;
  description: string;
  questType: string;
  category: string;
  status?: string;
  progressValue?: number;
  targetValue?: number;
  xpReward?: number;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
  disabled?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  DAILY: '#10B981',
  WEEKLY: '#3B82F6',
  MILESTONE: '#F59E0B',
  CHALLENGE: '#EF4444',
};

export default function QuestCard({
  title,
  description,
  questType,
  category,
  status,
  progressValue,
  targetValue,
  xpReward,
  onAction,
  actionLabel,
  actionLoading,
  disabled,
}: QuestCardProps) {
  const colors = useColors();
  const typeColor = TYPE_COLORS[questType] ?? colors.primary;

  const progress =
    progressValue != null && targetValue != null && targetValue > 0
      ? Math.min(Number(progressValue) / Number(targetValue), 1)
      : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={styles.meta}>
          <View style={[styles.badge, { backgroundColor: typeColor + '22' }]}>
            <Text style={[styles.badgeText, { color: typeColor }]}>{questType}</Text>
          </View>
          <Text style={[styles.category, { color: colors.mutedForeground }]}>
            {category.toUpperCase()}
          </Text>
        </View>
        {xpReward != null && (
          <Text style={[styles.xp, { color: colors.primary }]}>+{xpReward} XP</Text>
        )}
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
        {description}
      </Text>

      {progress != null && (
        <View style={styles.progressSection}>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: typeColor, width: `${progress * 100}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {Number(progressValue).toFixed(0)} / {Number(targetValue).toFixed(0)}
          </Text>
        </View>
      )}

      {status && (
        <Text style={[styles.status, { color: status === 'COMPLETED' ? '#10B981' : colors.mutedForeground }]}>
          {status}
        </Text>
      )}

      {onAction && (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: disabled ? colors.border : typeColor, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={onAction}
          disabled={disabled || actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.buttonText, { color: disabled ? colors.mutedForeground : '#0C0C0F' }]}>
              {actionLabel ?? 'Start'}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
  },
  category: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },
  xp: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  desc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  progressSection: {
    gap: 4,
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  status: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
