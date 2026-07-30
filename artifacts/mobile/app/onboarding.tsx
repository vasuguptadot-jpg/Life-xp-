import React, { useState } from 'react';
import {
  ActivityIndicator,
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
  getGetOnboardingQueryKey,
  getGetProgressionSummaryQueryKey,
  useCompleteOnboarding,
  useGetArchetypes,
  useSelectArchetype,
  useSetGoals,
  useUpdateOnboardingProfile,
  useUpdateOnboardingStep,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const TOTAL_STEPS = 5;

const GOALS = [
  { key: 'build_muscle', label: 'Build muscle' },
  { key: 'lose_weight', label: 'Lose weight' },
  { key: 'improve_endurance', label: 'Improve endurance' },
  { key: 'increase_flexibility', label: 'Increase flexibility' },
  { key: 'improve_nutrition', label: 'Improve nutrition' },
  { key: 'better_sleep', label: 'Better sleep' },
  { key: 'mental_discipline', label: 'Mental discipline' },
  { key: 'expand_knowledge', label: 'Expand knowledge' },
];

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise' },
  { key: 'light', label: 'Light', desc: '1-3 days/week' },
  { key: 'moderate', label: 'Moderate', desc: '3-5 days/week' },
  { key: 'active', label: 'Active', desc: '6-7 days/week' },
  { key: 'very_active', label: 'Very Active', desc: 'Twice per day' },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedArchetype, setSelectedArchetype] = useState('');

  const advanceStep = useUpdateOnboardingStep();
  const saveProfile = useUpdateOnboardingProfile();
  const setGoals = useSetGoals();
  const selectArchetype = useSelectArchetype();
  const completeOnboarding = useCompleteOnboarding();
  const archetypes = useGetArchetypes({ query: { enabled: step === 4 } });

  const isLoading =
    advanceStep.isPending ||
    saveProfile.isPending ||
    setGoals.isPending ||
    selectArchetype.isPending ||
    completeOnboarding.isPending;

  const toggleGoal = (key: string) => {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key],
    );
  };

  const handleNext = async () => {
    if (step === 1) {
      await advanceStep.mutateAsync({ data: { currentStep: 2 } });
      setStep(2);
    } else if (step === 2) {
      const profileData: Record<string, unknown> = {};
      if (heightCm) profileData.heightCm = Number(heightCm);
      if (weightKg) profileData.weightKg = Number(weightKg);
      if (activityLevel) profileData.activityLevel = activityLevel;
      await saveProfile.mutateAsync({ data: profileData });
      await advanceStep.mutateAsync({ data: { currentStep: 3 } });
      setStep(3);
    } else if (step === 3) {
      if (selectedGoals.length === 0) return;
      await setGoals.mutateAsync({ data: { goals: selectedGoals, primaryGoal: selectedGoals[0] } });
      await advanceStep.mutateAsync({ data: { currentStep: 4 } });
      setStep(4);
    } else if (step === 4) {
      if (!selectedArchetype) return;
      await selectArchetype.mutateAsync({ data: { archetypeId: selectedArchetype } });
      await advanceStep.mutateAsync({ data: { currentStep: 5 } });
      setStep(5);
    } else if (step === 5) {
      await completeOnboarding.mutateAsync({});
      queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProgressionSummaryQueryKey() });
      router.replace('/(tabs)');
    }
  };

  const canAdvance = () => {
    if (step === 3) return selectedGoals.length > 0;
    if (step === 4) return !!selectedArchetype;
    return true;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <View style={[styles.progressBar, { paddingTop: insets.top + 16 }]}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: colors.primary,
                width: `${(step / TOTAL_STEPS) * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
          {step} / {TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1 — Welcome */}
        {step === 1 && (
          <View style={styles.step}>
            <View style={[styles.logoMark, { backgroundColor: colors.primary }]}>
              <Text style={[styles.logoText, { color: colors.primaryForeground }]}>XP</Text>
            </View>
            <Text style={[styles.heading, { color: colors.foreground }]}>Welcome to LifeXP</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Your life is the game. Every habit, skill, and discipline earns you XP and levels you
              up. Let's build your character.
            </Text>
          </View>
        )}

        {/* Step 2 — Profile */}
        {step === 2 && (
          <View style={styles.step}>
            <Text style={[styles.heading, { color: colors.foreground }]}>Your profile</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Optional. Helps us calibrate your quests and progression.
            </Text>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Height (cm)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. 175"
                placeholderTextColor={colors.mutedForeground}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="numeric"
                keyboardAppearance="dark"
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. 75"
                placeholderTextColor={colors.mutedForeground}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
                keyboardAppearance="dark"
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Activity level</Text>
              {ACTIVITY_LEVELS.map((al) => (
                <Pressable
                  key={al.key}
                  onPress={() => setActivityLevel(al.key)}
                  style={[
                    styles.option,
                    {
                      backgroundColor:
                        activityLevel === al.key ? colors.primary + '22' : colors.card,
                      borderColor:
                        activityLevel === al.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>{al.label}</Text>
                  <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>{al.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 3 — Goals */}
        {step === 3 && (
          <View style={styles.step}>
            <Text style={[styles.heading, { color: colors.foreground }]}>Your goals</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Select everything that resonates. Your first pick is your primary goal.
            </Text>
            <View style={styles.goalGrid}>
              {GOALS.map((g) => {
                const selected = selectedGoals.includes(g.key);
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => toggleGoal(g.key)}
                    style={[
                      styles.goalChip,
                      {
                        backgroundColor: selected ? colors.primary + '22' : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.goalText,
                        { color: selected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Step 4 — Archetype */}
        {step === 4 && (
          <View style={styles.step}>
            <Text style={[styles.heading, { color: colors.foreground }]}>Choose your archetype</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              This shapes your starting attributes and quest recommendations.
            </Text>
            {archetypes.isLoading && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            )}
            {archetypes.data?.map((arch) => (
              <Pressable
                key={arch.id}
                onPress={() => setSelectedArchetype(arch.id)}
                style={[
                  styles.archetypeCard,
                  {
                    backgroundColor:
                      selectedArchetype === arch.id ? colors.primary + '18' : colors.card,
                    borderColor:
                      selectedArchetype === arch.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.archetypeName, { color: colors.foreground }]}>{arch.name}</Text>
                <Text style={[styles.archetypeDesc, { color: colors.mutedForeground }]}>
                  {arch.description}
                </Text>
                {arch.focusAreas && (
                  <View style={styles.focusRow}>
                    {(arch.focusAreas as string[]).map((fa) => (
                      <View key={fa} style={[styles.focusBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.focusBadgeText, { color: colors.primary }]}>{fa}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Step 5 — Complete */}
        {step === 5 && (
          <View style={[styles.step, styles.center]}>
            <View style={[styles.bigBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
              <Text style={[styles.bigBadgeText, { color: colors.primary }]}>LV 1</Text>
            </View>
            <Text style={[styles.heading, { color: colors.foreground }]}>You're ready.</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Your character is set. Start earning XP, completing quests, and leveling up your real
              life.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* CTA button */}
      <View
        style={[
          styles.cta,
          { paddingBottom: insets.bottom + 20, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            {
              backgroundColor: canAdvance() ? colors.primary : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleNext}
          disabled={!canAdvance() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text
              style={[
                styles.ctaText,
                { color: canAdvance() ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {step === 5 ? 'Begin your journey' : step === 2 ? 'Continue' : 'Next'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressBar: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 6,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textAlign: 'right',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  step: {
    gap: 16,
  },
  center: {
    alignItems: 'center',
    paddingTop: 40,
  },
  logoMark: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  logoText: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
  },
  heading: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  option: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  optionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  goalChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goalText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  archetypeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  archetypeName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  archetypeDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  focusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  focusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  focusBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  bigBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bigBadgeText: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
  },
  cta: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
