import { DeviceInfo } from '../domain/session';

export class RegisterCommand {
  public constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly displayName: string,
  ) {}
}

export class LoginCommand {
  public constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly device: DeviceInfo,
  ) {}
}
