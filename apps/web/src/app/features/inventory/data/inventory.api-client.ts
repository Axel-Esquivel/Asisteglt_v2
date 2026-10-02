import { Injectable } from '@angular/core';
import {
  CountEntryRequest,
  CreateCountRequest,
  InventoryItemRequest,
  ParticipantDto,
  ReassignRequest,
} from '@asisteglt/shared-contracts';
import { ArrayDecoder, EmptyDecoder, FieldDecoder, Result } from '@asisteglt/shared-kernel';
import { ApiClient } from '@asisteglt/web-core';
import { CountView, MyWork, Supervision } from './inventory.model';

@Injectable({ providedIn: 'root' })
export class InventoryApiClient extends ApiClient {
  private readonly count: FieldDecoder<CountView> = CountView.decoder();
  private readonly counts: ArrayDecoder<CountView> = new ArrayDecoder<CountView>(CountView.decoder());
  private readonly work: FieldDecoder<MyWork> = MyWork.decoder();
  private readonly supervisionDecoder: FieldDecoder<Supervision> = Supervision.decoder();
  private readonly empty: EmptyDecoder = new EmptyDecoder();

  public list(projectId: string): Promise<Result<CountView[]>> {
    return this.get(InventoryApiClient.base(projectId), this.counts);
  }

  public find(projectId: string, countId: string): Promise<Result<CountView>> {
    return this.get(`${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}`, this.count);
  }

  public create(projectId: string, request: CreateCountRequest): Promise<Result<CountView>> {
    return this.post(InventoryApiClient.base(projectId), request, this.count);
  }

  public replaceItems(
    projectId: string,
    countId: string,
    items: ReadonlyArray<InventoryItemRequest>,
  ): Promise<Result<CountView>> {
    return this.put(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/items`,
      { items },
      this.count,
    );
  }

  public setParticipants(
    projectId: string,
    countId: string,
    participants: ReadonlyArray<ParticipantDto>,
  ): Promise<Result<CountView>> {
    return this.put(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/participants`,
      { participants },
      this.count,
    );
  }

  public action(
    projectId: string,
    countId: string,
    action: 'start' | 'rounds/close' | 'recount' | 'close',
  ): Promise<Result<CountView>> {
    return this.post(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/${action}`,
      null,
      this.count,
    );
  }

  public reassign(projectId: string, countId: string, request: ReassignRequest): Promise<Result<CountView>> {
    return this.post(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/reassign`,
      request,
      this.count,
    );
  }

  public myWork(projectId: string, countId: string): Promise<Result<MyWork>> {
    return this.get(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/my-work`,
      this.work,
    );
  }

  public record(projectId: string, countId: string, entry: CountEntryRequest): Promise<Result<true>> {
    return this.post(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/entries`,
      entry,
      this.empty,
    );
  }

  public supervision(projectId: string, countId: string): Promise<Result<Supervision>> {
    return this.get(
      `${InventoryApiClient.base(projectId)}/${encodeURIComponent(countId)}/supervision`,
      this.supervisionDecoder,
    );
  }

  private static base(projectId: string): string {
    return `projects/${encodeURIComponent(projectId)}/inventory/counts`;
  }
}
