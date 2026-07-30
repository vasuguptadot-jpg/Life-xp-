import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface LevelCardProps {
  currentLevel: number;
  totalXp: number;
}

function xpForLevelStart(level: number): number {
  return (level - 1) * (level - 1) * 100;
}

function xpForLevelEnd(level: number): number {
  return level * level * 100;
}

export default function LevelCard({ currentLevel, totalXp }: LevelCardProps) {
  const colors = useColors();
  const levelStart = xpForLevelStart(currentLevel);
  const levelEnd = xpForLevelEnd(currentLevel);
  const xpInLevel = totalXp - levelStart;
  const xpNeeded = levelEnd - levelStart;
  const progress = Math.min(xpInLevel / xpNeeded, 1);

  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withTiming(progress, { duration: 900 });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>CHARACTER LEVEL</Text>
          <Text style={[styles.level, { color: colors.primary }]}>{currentLevel}</Text>
        </View>
        <View style={styles.xpBox}>
          <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>Total XP</Text>
          <Text style={[styles.xpValue, { color: colors.foreground }]}>{totalXp.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.barSection}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[styles.fill, barStyle, { backgroundColor: colors.primary }]}
          />
        </View>
        <View style={styles.barLabels}>
          <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
            {xpInLevel.toLocaleString()} / {xpNeeded.toLocaleString()} XP
          </Text>
          <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
            Lv {currentLevel + 1}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  level: {
    fontSize: 56,
    fontFamily: 'Inter_700Bold',
    lineHeight: 60,
  },
  xpBox: {
    alignItems: 'flex-end',
  },
  xpLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginBottom: 4,
  },
  xpValue: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  barSection: {
    gap: 6,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
