import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

interface CharacterIdentityProps {
  displayName: string;
  username: string;
  archetypeName: string;
  archetypeFocus: string[];
  avatarUrl?: string;
  mode?: 'compact' | 'standard' | 'expanded';
}

export const CharacterIdentity: React.FC<CharacterIdentityProps> = ({
  displayName,
  username,
  archetypeName,
  archetypeFocus,
  avatarUrl,
  mode = 'standard',
}) => {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      padding: mode === 'compact' ? 12 : 24,
      backgroundColor: colors.card,
      borderRadius: 16,
    },
    avatar: {
      width: mode === 'compact' ? 48 : 96,
      height: mode === 'compact' ? 48 : 96,
      borderRadius: 999,
      backgroundColor: colors.primary,
      marginBottom: 12,
    },
    name: {
      fontSize: mode === 'compact' ? 18 : 24,
      fontWeight: '700',
      color: colors.text,
    },
    username: {
      fontSize: mode === 'compact' ? 14 : 16,
      color: colors.muted,
      marginTop: 4,
    },
    archetype: {
      fontSize: mode === 'compact' ? 14 : 18,
      fontWeight: '600',
      color: colors.primary,
      marginTop: 12,
    },
    focus: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.avatar} />
      <Text style={styles.name}>{displayName}</Text>
      <Text style={styles.username}>@{username}</Text>
      <Text style={styles.archetype}>{archetypeName}</Text>
      {mode !== 'compact' && (
        <Text style={styles.focus}>{archetypeFocus.join(' • ')}</Text>
      )}
    </View>
  );
};