import { IsNumber, Min, Max } from 'class-validator';

export class UpdateProgressDto {
  @IsNumber()
  @Min(0)
  progress: number;
}