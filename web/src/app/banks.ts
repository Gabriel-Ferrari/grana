import { Component, computed, input, signal } from '@angular/core';

/** Bancos/carteiras mais usados no Brasil: cor da marca, site (logo) e apps Android que notificam
 *  (pacotes observados no catálogo do Organizze e no celular). */
/** icon: ícone SVG do banco no CDN da Pluggy (nítido em qualquer tamanho); sem ele, favicon do site em 128px */
export interface Bank { id: string; icon?: string; name: string; color: string; domain: string; packages: string[]; match: RegExp }
export const BANKS: Bank[] = [
  { id: 'nubank', icon: '212', name: 'Nubank', color: '#820ad1', domain: 'nubank.com.br', packages: ['com.nu.production'], match: /nubank|\bnu\b|nuconta/i },
  { id: 'itau', icon: '201', name: 'Itaú', color: '#ec7000', domain: 'itau.com.br', packages: ['com.itau', 'com.itau.pers', 'com.itaucard.activity'], match: /ita[uú]|personnalit/i },
  { id: 'bradesco', icon: '203', name: 'Bradesco', color: '#cc092f', domain: 'bradesco.com.br', packages: ['com.bradesco', 'br.com.bradesco.cartoes'], match: /bradesco/i },
  { id: 'bb', icon: '211', name: 'Banco do Brasil', color: '#0038a8', domain: 'bb.com.br', packages: ['br.com.bb.android', 'br.com.bb.oewallet'], match: /banco do brasil|\bbb\b|ourocard/i },
  { id: 'caixa', icon: '219', name: 'Caixa', color: '#005ca9', domain: 'caixa.gov.br', packages: ['br.com.gabba.Caixa'], match: /caixa/i },
  { id: 'santander', icon: '208', name: 'Santander', color: '#cc0000', domain: 'santander.com.br', packages: ['br.com.santander.way', 'com.santander.app'], match: /santander/i },
  { id: 'inter', icon: '215', name: 'Inter', color: '#ff7a00', domain: 'bancointer.com.br', packages: ['br.com.intermedium'], match: /\binter\b/i },
  { id: 'c6', icon: '726', name: 'C6 Bank', color: '#242424', domain: 'c6bank.com.br', packages: ['com.c6bank.app'], match: /\bc6\b/i },
  { id: 'btg', icon: '214', name: 'BTG Pactual', color: '#0d2c54', domain: 'btgpactual.com', packages: ['com.btg.pactual'], match: /btg/i },
  { id: 'xp', icon: '202', name: 'XP', color: '#1c1c1c', domain: 'xpi.com.br', packages: ['br.com.xp.carteira'], match: /\bxp\b/i },
  { id: 'sicoob', icon: '228', name: 'Sicoob', color: '#00a091', domain: 'sicoob.com.br', packages: ['br.com.sicoobnet', 'tivit.com.cabal.sicoob.cp'], match: /sicoob/i },
  { id: 'sicredi', icon: '661', name: 'Sicredi', color: '#3fa110', domain: 'sicredi.com.br', packages: ['br.com.sicredimobi.smart', 'br.com.sicredi.app'], match: /sicredi/i },
  { id: 'picpay', icon: '651', name: 'PicPay', color: '#11c76f', domain: 'picpay.com', packages: ['com.picpay'], match: /picpay/i },
  { id: 'mercadopago', icon: '206', name: 'Mercado Pago', color: '#00b1ea', domain: 'mercadopago.com.br', packages: ['com.mercadopago.wallet'], match: /mercado ?pago/i },
  { id: 'pagbank', icon: '692', name: 'PagBank', color: '#1bb99a', domain: 'pagbank.com.br', packages: ['br.com.uol.ps.myaccount'], match: /pagbank|pagseguro/i },
  { id: 'neon', icon: '689', name: 'Neon', color: '#00a5f0', domain: 'neon.com.br', packages: ['br.com.neon'], match: /\bneon\b/i },
  { id: 'next', icon: '656', name: 'Next', color: '#00ff5f', domain: 'next.me', packages: ['br.com.bradesco.next'], match: /\bnext\b/i },
  { id: 'original', name: 'Original', color: '#00a651', domain: 'original.com.br', packages: ['br.com.original.bank'], match: /original/i },
  { id: 'banrisul', icon: '659', name: 'Banrisul', color: '#004b8d', domain: 'banrisul.com.br', packages: ['br.com.banrisul'], match: /banrisul/i },
  { id: 'brb', icon: '682', name: 'BRB', color: '#0a3b7a', domain: 'brb.com.br', packages: ['br.com.brb.digitalflamengo', 'br.com.moringadigital.cartaobrbapp'], match: /\bbrb\b/i },
  { id: 'safra', icon: '629', name: 'Safra', color: '#0e2240', domain: 'safra.com.br', packages: ['br.livetouch.safra.carteira'], match: /safra/i },
  { id: 'pan', icon: '657', name: 'Banco Pan', color: '#00aeef', domain: 'bancopan.com.br', packages: ['br.com.bancopan.cartoes'], match: /\bpan\b/i },
  { id: 'bmg', icon: '652', name: 'BMG', color: '#ff6900', domain: 'bancobmg.com.br', packages: ['br.com.bancobmg'], match: /\bbmg\b/i },
  { id: 'agibank', name: 'Agibank', color: '#0b3c8c', domain: 'agibank.com.br', packages: ['br.com.agibank'], match: /agibank/i },
  { id: 'will', name: 'Will Bank', color: '#ffd000', domain: 'willbank.com.br', packages: ['br.com.meupag'], match: /will/i },
  { id: 'porto', icon: '800', name: 'Porto Bank', color: '#0046c0', domain: 'portoseguro.com.br', packages: ['br.com.portoseguro.cartoes'], match: /porto/i },
  { id: 'nomad', name: 'Nomad', color: '#ffcc00', domain: 'nomadglobal.com', packages: ['com.nomadfintech.bank.app.android'], match: /nomad/i },
  { id: 'wise', icon: '291', name: 'Wise', color: '#9fe870', domain: 'wise.com', packages: ['com.transferwise.android'], match: /\bwise\b/i },
  { id: 'revolut', name: 'Revolut', color: '#191c1f', domain: 'revolut.com', packages: ['com.revolut'], match: /revolut/i },
  { id: 'rappi', name: 'RappiBank', color: '#ff441f', domain: 'rappi.com.br', packages: ['com.grability.rappi'], match: /rappi/i },
];

/** Bandeiras de cartão. */
export const NETWORKS = [
  { id: 'visa', name: 'Visa', domain: 'visa.com.br' },
  { id: 'mastercard', name: 'Mastercard', domain: 'mastercard.com.br' },
  { id: 'elo', name: 'Elo', domain: 'elo.com.br' },
  { id: 'amex', name: 'American Express', domain: 'americanexpress.com' },
  { id: 'hipercard', name: 'Hipercard', domain: 'hipercard.com.br' },
];
export const networkLogo = (id?: string | null) => {
  const n = NETWORKS.find((x) => x.id === id);
  return n ? `https://www.google.com/s2/favicons?domain=${n.domain}&sz=128` : null;
};
/** App do banco que notifica: para cartão, prefere o app de cartões (ex.: Bradesco Cartões). */
export const bankPackage = (b: Bank, forCard: boolean) =>
  (forCard ? b.packages.find((p) => /cart|cabal|card/i.test(p)) : undefined) ?? b.packages[0];

/** Banco da conta/cartão: o escolhido, ou o palpite pelo nome. */
export function bankOf(name?: string | null, institution?: string | null): Bank | undefined {
  return BANKS.find((b) => b.id === institution) ?? (name ? BANKS.find((b) => b.match.test(name)) : undefined);
}
export const bankByPackage = (pkg: string) => BANKS.find((b) => b.packages.includes(pkg));
export const logoUrl = (b: Bank) => (b.icon ? `https://cdn.pluggy.ai/assets/connector-icons/${b.icon}.svg` : `https://www.google.com/s2/favicons?domain=${b.domain}&sz=128`);

/** Logo do banco num quadradinho; sem banco conhecido (ou se a imagem falhar), ícone genérico. */
@Component({
  selector: 'g-bank',
  template: `
    @if (bank(); as b) {
      @if (!failed()) {
        <img [src]="logo()" [alt]="b.name" [style.width.px]="size() * (b.icon ? .92 : .62)" [style.height.px]="size() * (b.icon ? .92 : .62)" (error)="failed.set(true)" loading="lazy" referrerpolicy="no-referrer" />
      } @else { <span class="ms" [style.font-size.px]="size() * .55" [style.color]="b.color">{{ fallback() }}</span> }
    } @else { <span class="ms" [style.font-size.px]="size() * .55">{{ fallback() }}</span> }
  `,
  host: { class: 'bank-logo', '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[attr.title]': 'bank()?.name' },
})
export class BankLogo {
  name = input<string | null | undefined>('');
  institution = input<string | null | undefined>(null);
  size = input(36);
  fallback = input('account_balance');
  failed = signal(false);
  bank = computed(() => bankOf(this.name(), this.institution()));
  logo = computed(() => logoUrl(this.bank()!));
}
