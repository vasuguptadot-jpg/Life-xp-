import { IsOptional, IsString, IsInt, IsArray, IsBoolean, Min, Max } from 'class-validator';

export class UpdateOnboardingStepDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  currentStep?: number;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @IsString()
  weightKg?: string; // sent as string for decimal

  @IsOptional()
  @IsString()
  activityLevel?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}

export class SelectGoalsDto {
  @IsArray()
  @IsString({ each: true })
  goals: string[];

  @IsOptional()
  @IsString()
  primaryGoal?: string;
}

export class SelectArchetypeDto {
  @IsString()
  archetypeId: string;
}