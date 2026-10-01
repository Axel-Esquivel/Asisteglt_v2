import { Request, Response } from 'express';
import { Nullable } from '@asisteglt/shared-kernel';
import { IamSettings } from '../application/iam-settings';
import { CookieJar } from '../../../common/http/cookie-jar';

/** Cookie HttpOnly del refresh token, limitada a las rutas de autenticación. */
export class RefreshCookie {
  public static readonly NAME: string = 'asisteglt_rt';
  public static readonly PATH: string = '/api/v1/auth';

  public static read(request: Request): Nullable<string> {
    return CookieJar.parse(request.header('cookie') ?? null).get(RefreshCookie.NAME);
  }

  public static write(response: Response, token: string, settings: IamSettings): void {
    response.cookie(RefreshCookie.NAME, token, {
      httpOnly: true,
      secure: settings.secureCookies,
      sameSite: 'strict',
      path: RefreshCookie.PATH,
      maxAge: settings.refreshTokenTtlMs,
    });
  }

  public static clear(response: Response, settings: IamSettings): void {
    response.clearCookie(RefreshCookie.NAME, {
      httpOnly: true,
      secure: settings.secureCookies,
      sameSite: 'strict',
      path: RefreshCookie.PATH,
    });
  }
}
