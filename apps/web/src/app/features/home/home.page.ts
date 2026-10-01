import { ChangeDetectionStrategy, Component, OnInit, Signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Nullable } from '@asisteglt/shared-kernel';
import { AuthSession, CurrentUser, LoadStatus, ServiceHealth, SystemStatusStore } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Tag, Button, Skeleton, Message, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  private readonly store: SystemStatusStore = inject(SystemStatusStore);

  protected readonly LoadStatus: typeof LoadStatus = LoadStatus;
  protected readonly user: Signal<Nullable<CurrentUser>> = inject(AuthSession).currentUser;
  protected readonly status: Signal<LoadStatus> = this.store.status;
  protected readonly health: Signal<Nullable<ServiceHealth>> = this.store.health;
  protected readonly errorMessage: Signal<Nullable<string>> = this.store.errorMessage;

  public ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.store.refresh().catch((): void => {
      // `refresh()` convierte todo fallo en estado FAILED.
    });
  }
}
