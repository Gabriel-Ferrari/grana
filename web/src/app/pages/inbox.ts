import { Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { env } from '../../env';
import { BrlPipe, Store, must, sb } from '../core';
import { TxDraft, TxForm } from '../tx-form';

interface Notif {
  id: string; package: string; title: string | null; body: string; posted_at: string; status: string; transaction_id: string | null;
  parsed: { kind: 'card' | 'expense' | 'income'; amount: number; merchant: string; last4?: string; date: string } | null;
}
interface Device { token: string; name: string; last_seen_at: string | null; created_at: string }

@Component({
  imports: [BrlPipe, DatePipe, TxForm],
  template: `
    <section class="box">
      <h3>Aguardando revisão</h3>
      @for (n of pending(); track n.id) {
        <div class="notif">
          <div class="grow">
            <small class="muted">{{ n.package }} · {{ n.posted_at | date: 'dd/MM HH:mm' }}</small>
            @if (n.title) { <div><b>{{ n.title }}</b></div> }
            <div class="pre">{{ n.body }}</div>
            @if (n.parsed; as p) { <small class="muted">entendido: {{ p.kind }} · {{ p.amount | brl }} · {{ p.merchant }} {{ p.last4 ? '· final ' + p.last4 : '' }}</small> }
            @else { <small class="muted">parser não entendeu</small> }
          </div>
          <div class="col">
            <button class="primary" (click)="review(n)">Lançar</button>
            <button (click)="setStatus(n, 'ignored')">Ignorar</button>
          </div>
        </div>
      } @empty { <p class="muted">Nada pendente. 🎉</p> }
    </section>

    <section class="box">
      <h3>Processadas recentemente</h3>
      @for (n of recent(); track n.id) {
        <div class="item"><span class="grow"><small class="muted">{{ n.posted_at | date: 'dd/MM HH:mm' }} · {{ n.package }}</small><br />{{ n.body }}</span>
          <small [class.pos]="n.status === 'done'">{{ n.status === 'done' ? 'lançado' : 'ignorado' }}</small>
          @if (n.status === 'ignored') { <button class="link" (click)="setStatus(n, 'pending')">desfazer</button> }</div>
      } @empty { <p class="muted">—</p> }
    </section>

    <section class="box">
      <h3>Celulares (coletor de notificações)</h3>
      <p class="muted">Endpoint: <code>{{ endpoint }}</code></p>
      @for (d of devices(); track d.token) {
        <div class="item"><span class="grow">{{ d.name }}<br /><small class="muted">último envio: {{ d.last_seen_at ? (d.last_seen_at | date: 'dd/MM HH:mm') : 'nunca' }}</small></span>
          <code class="token">{{ d.token }}</code>
          <button class="link" (click)="removeDevice(d.token)">✕</button></div>
      }
      <button (click)="addDevice()">+ Gerar token</button>
      <p class="muted small">No app Grana Coletor cole endpoint e token, ou configure via adb:<br />
        <code>adb shell am start -n dev.grana.coletor/.MainActivity --es endpoint {{ endpoint }} --es token SEU_TOKEN</code></p>
      <p class="muted small">Para o lançamento ser automático, informe em Ajustes o “app que notifica” da conta/cartão e o final do cartão.</p>
    </section>

    @if (draft(); as d) { <tx-form [draft]="d" (close)="done($event)" /> }
  `,
})
export class Inbox {
  store = inject(Store);
  endpoint = env.supabaseUrl + '/functions/v1/ingest';
  pending = signal<Notif[]>([]);
  recent = signal<Notif[]>([]);
  devices = signal<Device[]>([]);
  draft = signal<TxDraft | null>(null);
  reviewing: Notif | null = null;

  constructor() {
    effect(() => { this.store.version(); untracked(() => this.fetch()); });
  }

  async fetch() {
    const [p, r, d] = await Promise.all([
      must(sb.from('notifications').select('*').eq('status', 'pending').order('posted_at', { ascending: false })),
      must(sb.from('notifications').select('*').neq('status', 'pending').order('posted_at', { ascending: false }).limit(30)),
      must(sb.from('devices').select('*').order('created_at')),
    ]);
    this.pending.set(p as Notif[]);
    this.recent.set(r as Notif[]);
    this.devices.set(d as Device[]);
  }

  review(n: Notif) {
    this.reviewing = n;
    const p = n.parsed;
    const card = p?.last4 ? this.store.cards().find((c) => c.last4 === p.last4) : undefined;
    this.draft.set({
      kind: p?.kind === 'income' ? 'income' : 'expense',
      description: p?.merchant || n.title || '',
      amount: p ? (p.kind === 'income' ? p.amount : -p.amount) : undefined,
      date: p?.date ?? n.posted_at.slice(0, 10),
      card_id: card?.id ?? null,
      source: 'notification',
    });
  }

  async done(txId: string | null) {
    this.draft.set(null);
    if (txId && this.reviewing) {
      await must(sb.from('notifications').update({ status: 'done', transaction_id: txId }).eq('id', this.reviewing.id));
      await this.store.load();
    }
    this.reviewing = null;
  }

  async setStatus(n: Notif, status: string) {
    await must(sb.from('notifications').update({ status }).eq('id', n.id));
    await this.store.load();
  }

  async addDevice() {
    await must(sb.from('devices').insert({ name: 'Android' }));
    this.fetch();
  }

  async removeDevice(token: string) {
    await must(sb.from('devices').delete().eq('token', token));
    this.fetch();
  }
}
