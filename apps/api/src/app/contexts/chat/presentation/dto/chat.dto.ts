import { OpenDirectRequest, PostMessageRequest } from '@asisteglt/shared-contracts';
import { IsDefined, IsString, MaxLength } from 'class-validator';

export class OpenDirectRequestDto implements OpenDirectRequest {
  @IsDefined()
  @IsString()
  @MaxLength(64)
  public readonly userId!: string;
}

export class PostMessageRequestDto implements PostMessageRequest {
  @IsDefined()
  @IsString()
  @MaxLength(4000)
  public readonly text!: string;
}
