import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { ATTRIBUTE_COLORS, ATTRIBUTE_LABELS, type AttributeKey } from '@/constants/colors';

interface AttributeBarProps {
  attribute: AttributeKey;
  value: number;
  maxValue?: number;
  index?: number;
}

export default function AttributeBar({ attribute, value, maxValue = 1000, index = 0 }: AttributeBarProps) {
  const colors = useColors();
  const color = ATTRIBUTE_COLORS[attribute];
  const label = ATTRIBUTE_LABELS[attribute];
  const progress = Math.min(value / maxValue, 1);

  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withDelay(index * 60, withTiming(progress, { duration: 700 }));
  }, [progress, index]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.labelWrap}>
        <Text style={[styles.name, { color: colors.foreground }]}>{label}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View style={[styles.fill, barStyle, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelWrap: {
    width: 82,
  },
  name: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  value: {
    width: 36,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'right',
  },
});
