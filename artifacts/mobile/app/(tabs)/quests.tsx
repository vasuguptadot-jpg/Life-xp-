import React, { useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMyQuestsQueryKey,
  useAssignQuest,
  useCompleteQuest,
  useGetMyQuests,
  useGetQuestCatalogue,
  useGetRecommendedQuests,
} from '@workspace/api-client-react';
import QuestCard from '@/components/QuestCard';
import { useColors } from '@/hooks/useColors';

type Tab = 'active' | 'discover';

export default function QuestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const myQuests = useGetMyQuests();
  const catalogue = useGetQuestCatalogue({ query: { enabled: activeTab === 'discover' } });
  const recommended = useGetRecommendedQuests(
    { limit: 5 },
    { query: { enabled: activeTab === 'discover' } },
  );

  const assignMutation = useAssignQuest();
  const completeMutation = useCompleteQuest();

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetMyQuestsQueryKey() });
  };

  const handleAssign = (templateId: string) => {
    setAssigningId(templateId);
    assignMutation.mutate(
      { templateId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyQuestsQueryKey() });
          setActiveTab('active');
        },
        onSettled: () => setAssigningId(null),
      },
    );
  };

  const handleComplete = (questId: string) => {
    setCompletingId(questId);
    completeMutation.mutate(
      { id: questId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyQuestsQueryKey() });
        },
        onSettled: () => setCompletingId(null),
      },
    );
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  const activeQuests = (myQuests.data ?? []).filter(
    (q) => q.user_quests?.status !== 'COMPLETED' && q.user_quests?.status !== 'ABANDONED',
  );
  const completedQuests = (myQuests.data ?? []).filter(
    (q) => q.user_quests?.status === 'COMPLETED',
  );

  // IDs of templates already assigned (any status)
  const assignedTemplateIds = new Set((myQuests.data ?? []).map((q) => q.user_quests?.questTemplateId));

  const catalogueFiltered = (catalogue.data ?? []).filter(
    (t) => !assignedTemplateIds.has(t.id),
  );
  const recommendedFiltered = (recommended.data ?? []).filter(
    (t) => !assignedTemplateIds.has(t.id),
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerWrap, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Quests</Text>
        <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['active', 'discover'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              style={[
                styles.tabBtn,
                activeTab === t && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveTab(t)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === t ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {t === 'active' ? 'My Quests' : 'Discover'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: botPad, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={myQuests.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'active' && (
          <>
            {myQuests.isLoading && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            )}
            {!myQuests.isLoading && activeQuests.length === 0 && (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No active quests</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Head to Discover to assign your first quest.
                </Text>
                <Pressable onPress={() => setActiveTab('discover')}>
                  <Text style={[styles.emptyAction, { color: colors.primary }]}>Browse quests</Text>
                </Pressable>
              </View>
            )}
            {activeQuests.map(({ user_quests: uq, quest_templates: qt }) => (
              <QuestCard
                key={uq.id}
                title={qt?.title ?? 'Quest'}
                description={qt?.description ?? ''}
                questType={qt?.questType ?? 'DAILY'}
                category={qt?.category ?? ''}
                status={uq.status}
                progressValue={Number(uq.progressValue)}
                targetValue={Number(uq.targetValue)}
                xpReward={(qt?.progressionConfig as any)?.xp}
                onAction={() => handleComplete(uq.id)}
                actionLabel="Complete"
                actionLoading={completingId === uq.id}
                disabled={uq.status === 'COMPLETED'}
              />
            ))}
            {completedQuests.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  COMPLETED
                </Text>
                {completedQuests.map(({ user_quests: uq, quest_templates: qt }) => (
                  <QuestCard
                    key={uq.id}
                    title={qt?.title ?? 'Quest'}
                    description={qt?.description ?? ''}
                    questType={qt?.questType ?? 'DAILY'}
                    category={qt?.category ?? ''}
                    status={uq.status}
                    xpReward={(qt?.progressionConfig as any)?.xp}
                  />
                ))}
              </>
            )}
          </>
        )}

        {activeTab === 'discover' && (
          <>
            {(catalogue.isLoading || recommended.isLoading) && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            )}

            {recommendedFiltered.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  RECOMMENDED
                </Text>
                {recommendedFiltered.map((t) => (
                  <QuestCard
                    key={t.id}
                    title={t.title}
                    description={t.description}
                    questType={t.questType}
                    category={t.category}
                    xpReward={(t.progressionConfig as any)?.xp}
                    onAction={() => handleAssign(t.id)}
                    actionLabel="Assign"
                    actionLoading={assigningId === t.id}
                  />
                ))}
              </>
            )}

            {catalogueFiltered.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  ALL QUESTS
                </Text>
                {catalogueFiltered.map((t) => (
                  <QuestCard
                    key={t.id}
                    title={t.title}
                    description={t.description}
                    questType={t.questType}
                    category={t.category}
                    xpReward={(t.progressionConfig as any)?.xp}
                    onAction={() => handleAssign(t.id)}
                    actionLabel="Assign"
                    actionLoading={assigningId === t.id}
                  />
                ))}
              </>
            )}

            {!catalogue.isLoading && catalogueFiltered.length === 0 && recommendedFiltered.length === 0 && (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  All quests assigned
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  You've assigned every available quest.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyAction: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
});
