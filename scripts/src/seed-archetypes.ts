/**
 * Idempotent archetype seed.
 * Run with: pnpm --filter @workspace/scripts run seed-archetypes
 *
 * Safe to run multiple times — will not create duplicates.
 */
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { archetypesTable } from "@workspace/db/schema";

const ARCHETYPES = [
  {
    name: "The Warrior",
    description:
      "A relentless competitor driven by raw strength and endurance. Warriors push their physical limits through structured training, heavy lifting, and high-intensity cardio.",
    focusAreas: ["STRENGTH", "ENDURANCE"],
  },
  {
    name: "The Ranger",
    description:
      "An agile and mobile athlete who excels at functional fitness and outdoor challenges. Rangers prioritise mobility, flexibility, and sustained aerobic performance.",
    focusAreas: ["MOBILITY", "ENDURANCE"],
  },
  {
    name: "The Scholar",
    description:
      "A disciplined learner who optimises every aspect of health through knowledge and data. Scholars combine mental training with precise nutrition and recovery protocols.",
    focusAreas: ["KNOWLEDGE", "NUTRITION"],
  },
  {
    name: "The Guardian",
    description:
      "A recovery-focused archetype that builds resilience from the inside out. Guardians prioritise sleep, stress management, and sustainable lifestyle habits.",
    focusAreas: ["RECOVERY", "DISCIPLINE"],
  },
  {
    name: "The Monk",
    description:
      "A balanced practitioner who achieves harmony through discipline and mindfulness. Monks blend mental fortitude with physical consistency across all attributes.",
    focusAreas: ["DISCIPLINE", "KNOWLEDGE"],
  },
  {
    name: "The Alchemist",
    description:
      "A nutrition-obsessed optimiser who treats food as fuel and medicine. Alchemists experiment with diet, supplementation, and metabolic health to unlock peak performance.",
    focusAreas: ["NUTRITION", "RECOVERY"],
  },
  {
    name: "The Duelist",
    description:
      "A strength-and-mobility specialist who excels at combat sports, gymnastics, or martial arts. Duelists value explosive power and full-body control in equal measure.",
    focusAreas: ["STRENGTH", "MOBILITY"],
  },
] as const;

async function main() {
  let created = 0;
  let skipped = 0;

  for (const archetype of ARCHETYPES) {
    const [existing] = await db
      .select({ id: archetypesTable.id })
      .from(archetypesTable)
      .where(eq(archetypesTable.name, archetype.name))
      .limit(1);

    if (existing) {
      console.log(`Skipping "${archetype.name}" — already exists`);
      skipped++;
      continue;
    }

    await db.insert(archetypesTable).values({
      name: archetype.name,
      description: archetype.description,
      focusAreas: archetype.focusAreas,
    });

    console.log(`Created "${archetype.name}"`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
