import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Airport } from '../../services/network';
import { airport } from '../../testing/network-fixtures';
import {
  AirportSearchComponent,
  SearchOption,
  airportOption,
  countryOption,
} from './airport-search';

const MALAGA: Airport = { ...airport('AGP', 'ES', 'Spain'), name: 'Málaga', city: 'Málaga' };
const MADRID: Airport = { ...airport('MAD', 'ES', 'Spain'), name: 'Madrid', city: 'Madrid' };
const PORTO: Airport = { ...airport('OPO', 'PT', 'Portugal'), name: 'Porto', city: 'Porto' };

const OPTIONS: SearchOption[] = [
  countryOption({ code: 'ES', name: 'Spain', airports: [MALAGA, MADRID] }),
  ...[MADRID, MALAGA, PORTO].map(airportOption),
];

describe('AirportSearchComponent', () => {
  let fixture: ComponentFixture<AirportSearchComponent>;
  let input: HTMLInputElement;
  let chosen: SearchOption[];
  let cleared: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AirportSearchComponent] }).compileComponents();
    fixture = TestBed.createComponent(AirportSearchComponent);
    fixture.componentRef.setInput('label', 'To');
    fixture.componentRef.setInput('options', OPTIONS);
    chosen = [];
    cleared = 0;
    fixture.componentInstance.chosen.subscribe((option) => chosen.push(option));
    fixture.componentInstance.cleared.subscribe(() => cleared++);
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('input');
  });

  async function type(text: string): Promise<void> {
    input.dispatchEvent(new Event('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function press(key: string): Promise<void> {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    await fixture.whenStable();
  }

  function titles(): string[] {
    return [...fixture.nativeElement.querySelectorAll('[role="option"] .title')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );
  }

  it('is labelled and starts closed', () => {
    expect(fixture.nativeElement.querySelector('label').textContent).toBe('To');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('matches without accents and puts names that start with the query first', async () => {
    await type('ma');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(titles()).toEqual(['Madrid', 'Málaga']);

    await type('malaga');
    expect(titles()).toEqual(['Málaga']);
  });

  it('matches airport codes and countries', async () => {
    await type('opo');
    expect(titles()).toEqual(['Porto']);

    await type('spain');
    expect(titles()[0]).toBe('Any airport in Spain');
  });

  it('chooses with the arrow keys and Enter', async () => {
    await type('ma');
    await press('ArrowDown');
    const active = input.getAttribute('aria-activedescendant');
    expect(fixture.nativeElement.querySelector(`#${active} .title`).textContent).toBe('Málaga');

    await press('Enter');
    expect(chosen.map((option) => option.code)).toEqual(['AGP']);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('chooses with a click', async () => {
    await type('por');
    fixture.nativeElement.querySelector('[role="option"]').click();
    expect(chosen.map((option) => option.code)).toEqual(['OPO']);
  });

  it('closes with Escape and shows the chosen value again', async () => {
    fixture.componentRef.setInput('value', airportOption(PORTO));
    await type('xyz');
    expect(fixture.nativeElement.textContent).toContain('No matching airports');

    await press('Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('Porto');
    expect(chosen).toEqual([]);
  });

  it('clears the value', async () => {
    fixture.componentRef.setInput('value', airportOption(PORTO));
    await fixture.whenStable();
    fixture.nativeElement.querySelector('[aria-label="Clear To"]').click();
    expect(cleared).toBe(1);
  });
});
